/**
 * SaintapediaDrilldown — JavaScript module
 *
 * 1. Wraps .drilldown-filters-wrapper + .drilldown-results in a flex
 *    container. If they do not share a parent the layout and toggle are
 *    skipped gracefully; chips are still rendered above .drilldown-results.
 * 2. Renders active-filter chips using pure URL helpers (testable, no globals).
 * 3. Adds a mobile toggle whose state is persisted via mw.storage and only
 *    written on explicit user action.
 * 4. Uses matchMedia to own toggle open/closed state and the
 *    .cargo-mobile-layout class; PHP/CSS own the visual @media rules.
 */
( function () {
	'use strict';

	var cfg = {
		sidebarWidth:  mw.config.get( 'saintapediaDrilldownSidebarWidth',    280 ),
		showChips:     mw.config.get( 'saintapediaDrilldownShowFilterChips',  true ),
		stickyFilters: mw.config.get( 'saintapediaDrilldownStickyFilters',    true ),
		mobileBreak:   mw.config.get( 'saintapediaDrilldownMobileBreakpoint', 720 )
	};

	// Namespace the key per wiki so wikifarm installs don't share state.
	var STORAGE_KEY = 'saintapediadrilldown-filters-open-' + ( mw.config.get( 'wgWikiID' ) || '' );
	var storage     = mw.storage;

	/* -- Pure URL / filter helpers (no globals; exported for unit tests) -- */

	var RESERVED = [
		'title', 'action', 'uselang', 'useskin', 'useformat',
		'debug', 'safemode', 'printable', 'variant', 'oldid',
		'curid', 'redirect', 'veaction', 'mobileaction'
	];

	// Params with these prefixes are user-applied filters, not Cargo internals.
	var FILTER_PREFIXES = [ '_search_' ];

	function isInternalParam( key ) {
		var i;
		for ( i = 0; i < FILTER_PREFIXES.length; i++ ) {
			if ( key.indexOf( FILTER_PREFIXES[ i ] ) === 0 ) { return false; }
		}
		return key.charAt( 0 ) === '_' || RESERVED.indexOf( key ) !== -1;
	}

	/**
	 * Returns filter objects for every non-internal URL param.
	 * Bracket-indexed params (e.g. Date[0]/Date[1]) are collapsed into one
	 * entry with isFamily:true and a joined value ("2020 → 2021").
	 * Params matching FILTER_PREFIXES (e.g. _search_Name) appear as chips
	 * labelled "Name (search)".
	 *
	 * @param {string} search  window.location.search or a bare query string
	 * @return {Array.<{key:string,label:string,value:string,isFamily:boolean}>}
	 */
	function getActiveFilters( search ) {
		var params   = new URLSearchParams( search );
		var filters  = [];
		var families = {};

		params.forEach( function ( val, key ) {
			if ( isInternalParam( key ) ) { return; }

			// Group bracket-indexed params (Date[0], Date[1], …) by base key.
			var bm = key.match( /^(.+)\[\d+\]$/ );
			if ( bm ) {
				var base = bm[ 1 ];
				if ( !families[ base ] ) { families[ base ] = []; }
				families[ base ].push( { key: key, value: val } );
				return;
			}

			// _search_X → label "X (search)" via i18n
			var sm = key.match( /^_search_(.+)$/ );
			var label = sm
				? mw.msg( 'saintapediadrilldown-search-filter-label', sm[ 1 ].replace( /_/g, ' ' ) )
				: key.replace( /_/g, ' ' );
			filters.push( { key: key, label: label, value: val } );
		} );

		// Emit one chip per bracket family (appended after scalar filters).
		Object.keys( families ).forEach( function ( base ) {
			var members = families[ base ];
			members.sort( function ( a, b ) {
				var am = a.key.match( /\[(\d+)\]$/ );
				var bm = b.key.match( /\[(\d+)\]$/ );
				return ( am ? parseInt( am[ 1 ], 10 ) : NaN ) -
				       ( bm ? parseInt( bm[ 1 ], 10 ) : NaN );
			} );
			filters.push( {
				key:        base,
				label:      base.replace( /_/g, ' ' ),
				isFamily:   true,
				familyKeys: members.map( function ( m ) { return m.key; } ),
				value:      members.length === 2
				? mw.msg( 'saintapediadrilldown-range-value', members[ 0 ].value, members[ 1 ].value )
				: members.map( function ( m ) { return m.value; } ).join( ', ' )
			} );
		} );

		return filters;
	}

	/**
	 * Returns a query string with one value removed from key and _offset reset.
	 * Uses URLSearchParams round-trip so repeated/bracketed keys are preserved
	 * byte-for-byte without jQuery array serialization artefacts.
	 *
	 * @param {string} search
	 * @param {string} key
	 * @param {string} value
	 * @return {string}  query string (no leading '?')
	 */
	function buildRemoveSearch( search, key, value ) {
		var params = new URLSearchParams( search );
		var kept   = params.getAll( key ).filter( function ( v ) { return v !== value; } );
		params.delete( key );
		kept.forEach( function ( v ) { params.append( key, v ); } );
		params.delete( '_offset' );
		return params.toString();
	}

	/**
	 * Returns a query string with all members of a bracket family removed
	 * (baseKey, baseKey[0], baseKey[1], …) and _offset reset.
	 *
	 * @param {string} search
	 * @param {string} baseKey  base name, e.g. "Date" removes Date[0], Date[1]
	 * @return {string}  query string (no leading '?')
	 */
	function buildRemoveFamilySearch( search, baseKey ) {
		var params   = new URLSearchParams( search );
		var prefix   = baseKey + '[';
		var toDelete = [];
		params.forEach( function ( v, k ) {
			if ( k === baseKey || k.indexOf( prefix ) === 0 ) {
				toDelete.push( k );
			}
		} );
		toDelete.forEach( function ( k ) { params.delete( k ); } );
		params.delete( '_offset' );
		return params.toString();
	}

	/**
	 * Returns a query string that keeps only internal display params and
	 * reserved MW params, dropping all filter params and resetting _offset.
	 *
	 * @param {string} search
	 * @return {string}  query string (no leading '?')
	 */
	function buildClearSearch( search ) {
		var params = new URLSearchParams( search );
		var kept   = new URLSearchParams();
		params.forEach( function ( v, k ) {
			var i;
			// Drop user-applied filter-prefix params (e.g. _search_*).
			for ( i = 0; i < FILTER_PREFIXES.length; i++ ) {
				if ( k.indexOf( FILTER_PREFIXES[ i ] ) === 0 ) { return; }
			}
			if ( ( k.charAt( 0 ) === '_' && k !== '_offset' ) ||
					RESERVED.indexOf( k ) !== -1 ) {
				kept.append( k, v );
			}
		} );
		return kept.toString();
	}

	/* -- DOM helper ---------------------------------------------------- */

	function el( tag, cls, text ) {
		var node = document.createElement( tag );
		if ( cls ) {
			// The following CSS classes are used here:
			// * cargo-drilldown-layout
			// * cargo-drilldown-table-tabs
			// * cargo-active-filters
			// * cargo-filter-chip
			// * cargo-chip-label
			// * cargo-chip-remove
			// * cargo-clear-all
			// * cargo-filters-toggle
			node.className = cls;
		}
		if ( text ) { node.textContent = text; }
		return node;
	}

	/* -- Feature: flex layout wrapper ---------------------------------- */

	/**
	 * Cargo 3.x DOM structure (verified against saintapedia.org / Cargo 3.5.1):
	 *
	 *   #mw-content-text
	 *     └── div.drilldown-results
	 *           └── div.mw-spcontent                          (intermediate wrapper)
	 *                 ├── div#drilldown-tables-tabs-wrapper   (table selector tabs)
	 *                 ├── div#drilldown-header
	 *                 └── div.drilldown-filters-wrapper
	 *
	 * We restructure mw-spcontent in place to:
	 *
	 *   #mw-content-text
	 *     └── div.drilldown-results
	 *           └── div.mw-spcontent
	 *                 ├── div.cargo-drilldown-table-tabs  (tabs, full-width above layout)
	 *                 └── div.cargo-drilldown-layout      (new flex wrapper)
	 *                       ├── div.drilldown-filters-wrapper
	 *                       └── div#drilldown-header + results content
	 *
	 * Key insight: insertBefore only works on a node's direct parent. Since
	 * filtersEl is a child of mw-spcontent (not #mw-content-text), all DOM
	 * mutations must operate on mw-spcontent as the reference parent.
	 */
	function applyFlexLayout( filtersEl, resultsEl, contentEl ) {
		if ( !contentEl ) {
			mw.log.warn( 'SaintapediaDrilldown: content element not found; sidebar layout skipped.' );
			return null;
		}

		// The shared parent of both tabs and filters is mw-spcontent (inside resultsEl).
		// Fall back to resultsEl itself if mw-spcontent is absent.
		var spContent = resultsEl.querySelector( '.mw-spcontent' ) || resultsEl;

		// Hoist the table-tabs wrapper to the top of spContent so it stays full-width.
		// Add a class so CSS can target it without an ID selector.
		var tabsEl = spContent.querySelector( '#drilldown-tables-tabs-wrapper' );
		if ( tabsEl ) {
			tabsEl.classList.add( 'cargo-drilldown-table-tabs' );
			spContent.insertBefore( tabsEl, spContent.firstChild );
		}

		// Build the flex wrapper as the next sibling of the hoisted tabs.
		var wrapper = el( 'div', 'cargo-drilldown-layout' );
		// Insert wrapper after tabsEl (or at top if no tabs).
		var insertRef = tabsEl ? tabsEl.nextSibling : spContent.firstChild;
		spContent.insertBefore( wrapper, insertRef );

		// Move filters and the rest of spContent's children into the flex wrapper.
		// filtersEl goes first (left sidebar), then everything else (results column).
		wrapper.appendChild( filtersEl );
		var resultsContent = el( 'div', 'drilldown-results-content' );
		// Drain remaining children (header, results list, pagination) into results col.
		while ( spContent.firstChild && spContent.firstChild !== wrapper ) {
			resultsContent.appendChild( spContent.firstChild );
		}
		// Append any children added after wrapper too (pagination etc. at end).
		while ( wrapper.nextSibling ) {
			resultsContent.appendChild( wrapper.nextSibling );
		}
		wrapper.appendChild( resultsContent );
		return wrapper;
	}

	/* -- Feature: active-filter chips ---------------------------------- */

	function renderFilterChips( resultsEl ) {
		var filters = getActiveFilters( window.location.search );
		if ( !filters.length ) { return; }

		var bar = el( 'div', 'cargo-active-filters' );
		bar.setAttribute( 'role', 'region' );
		bar.setAttribute( 'aria-label', mw.msg( 'saintapediadrilldown-active-filters' ) );

		filters.forEach( function ( f ) {
			var chip   = el( 'span', 'cargo-filter-chip' );
			var text   = el( 'span', 'cargo-chip-label',
				mw.msg( 'saintapediadrilldown-chip-text', f.label, f.value ) );
			var qs     = f.isFamily
				? buildRemoveFamilySearch( window.location.search, f.key )
				: buildRemoveSearch( window.location.search, f.key, f.value );
			var remove = el( 'a', 'cargo-chip-remove', '×' );
			remove.href  = window.location.pathname + ( qs ? '?' + qs : '' );
			remove.title = mw.msg( 'saintapediadrilldown-remove-filter' );
			remove.setAttribute( 'aria-label',
				mw.msg( 'saintapediadrilldown-remove-filter-aria', f.label, f.value ) );
			chip.appendChild( text );
			chip.appendChild( remove );
			bar.appendChild( chip );
		} );

		if ( filters.length > 1 ) {
			var clearWrap = el( 'span', 'cargo-clear-all' );
			var clearLink = el( 'a', '', mw.msg( 'saintapediadrilldown-clear-filters' ) );
			var cqs       = buildClearSearch( window.location.search );
			clearLink.href = window.location.pathname + ( cqs ? '?' + cqs : '' );
			clearWrap.appendChild( clearLink );
			bar.appendChild( clearWrap );
		}

		resultsEl.insertBefore( bar, resultsEl.firstChild );
	}

	/* -- Feature: mobile toggle ---------------------------------------- */

	/**
	 * Creates the Show/Hide filters button and returns { setOpen }.
	 *
	 * setOpen( open )        — updates state and persists to mw.storage.
	 * setOpen( open, false ) — updates visual state only (breakpoint-watcher
	 *                          path; never overwrites the user's stored choice).
	 *
	 * The button starts in an indeterminate visual state; the first
	 * onBreakpoint(mq) call in initBreakpointWatcher sets everything.
	 */
	function addMobileToggle( filtersEl ) {
		var btn    = el( 'button', 'cargo-filters-toggle' );
		btn.type   = 'button';
		var isOpen = false;

		function setOpen( open, persist ) {
			isOpen = open;
			btn.textContent = isOpen
				? mw.msg( 'saintapediadrilldown-hide-filters' )
				: mw.msg( 'saintapediadrilldown-show-filters' );
			btn.setAttribute( 'aria-expanded', isOpen ? 'true' : 'false' );
			filtersEl.classList.toggle( 'cargo-filters-collapsed', !isOpen );
			if ( persist !== false ) {
				storage.set( STORAGE_KEY, isOpen ? '1' : '0' );
			}
		}

		if ( !filtersEl.id ) {
			filtersEl.id = document.getElementById( 'cargo-filter-sidebar' ) === null
				? 'cargo-filter-sidebar'
				: 'cargo-filter-sidebar-' + Date.now();
		}
		btn.setAttribute( 'aria-controls', filtersEl.id );

		btn.addEventListener( 'click', function () { setOpen( !isOpen ); } );
		filtersEl.parentElement.insertBefore( btn, filtersEl );

		return { setOpen: setOpen };
	}

	/* -- Feature: config-driven mobile breakpoint ---------------------- */

	/**
	 * Drives layout class and toggle state via matchMedia.
	 * This is the sole authority for the initial toggle state; addMobileToggle
	 * does not read storage or call setOpen — the first onBreakpoint(mq) does.
	 */
	function initBreakpointWatcher( layoutEl, filtersEl, toggle ) {
		var mq = window.matchMedia( '(max-width: ' + ( cfg.mobileBreak - 1 ) + 'px)' );

		function onBreakpoint( e ) {
			layoutEl.classList.toggle( 'cargo-mobile-layout', e.matches );
			if ( !e.matches ) {
				// Desktop: always show the sidebar; do not overwrite stored preference.
				toggle.setOpen( true, false );
			} else {
				// Mobile: restore the user's last explicit choice.
				toggle.setOpen( storage.get( STORAGE_KEY ) === '1', false );
			}
		}

		if ( mq.addEventListener ) {
			mq.addEventListener( 'change', onBreakpoint );
		} else {
			mq.addListener( onBreakpoint );
		}
		onBreakpoint( mq );
	}

	/* -- Main init ----------------------------------------------------- */

	function init() {
		var contentEl = document.querySelector( '#mw-content-text' );
		// Cargo 3.x nests .drilldown-filters-wrapper inside .drilldown-results;
		// search the whole content area, not just immediate children.
		var resultsEl = contentEl ? contentEl.querySelector( '.drilldown-results' ) : null;
		var filtersEl = contentEl ? contentEl.querySelector( '.drilldown-filters-wrapper' ) : null;
		if ( !resultsEl ) {
			mw.log.warn( 'SaintapediaDrilldown: .drilldown-results not found; layout skipped.' );
			return;
		}
		if ( !filtersEl ) {
			mw.log.warn( 'SaintapediaDrilldown: .drilldown-filters-wrapper not found; layout skipped.' );
			return;
		}
		if ( resultsEl.dataset.saintapediadrilldownInit ) { return; }
		resultsEl.dataset.saintapediadrilldownInit = '1';

		var layoutEl = applyFlexLayout( filtersEl, resultsEl, contentEl );

		// Layout wrapper required for sidebar width, sticky, and toggle.
		if ( !layoutEl ) { return; }

		// Chips go into the results content column JS created inside the flex layout.
		var resultsContentEl = layoutEl.querySelector( '.drilldown-results-content' );
		if ( cfg.showChips && resultsContentEl ) { renderFilterChips( resultsContentEl ); }

		layoutEl.style.setProperty( '--cargo-sidebar-width', cfg.sidebarWidth + 'px' );
		if ( cfg.stickyFilters ) { filtersEl.classList.add( 'cargo-filters-sticky' ); }

		var toggle = addMobileToggle( filtersEl );
		initBreakpointWatcher( layoutEl, filtersEl, toggle );
	}

	mw.hook( 'wikipage.content' ).add( function () {
		init();
	} );

	// Export pure helpers for unit testing; no-op in MediaWiki environment.
	if ( typeof module !== 'undefined' && module.exports ) {
		module.exports = {
			getActiveFilters:        getActiveFilters,
			buildRemoveSearch:       buildRemoveSearch,
			buildRemoveFamilySearch: buildRemoveFamilySearch,
			buildClearSearch:        buildClearSearch
		};
	}

}() );
