/**
 * SaintapediaSort — JavaScript module
 *
 * 1. Wraps .drilldown-filters-wrapper + .drilldown-results in a flex
 *    container. If they do not share a parent the layout step is skipped
 *    gracefully; chip and toggle are not created in that case.
 * 2. Renders active-filter chips using pure URL helpers (testable, no globals).
 * 3. Adds a mobile toggle whose state is persisted via mw.storage and only
 *    written on explicit user action.
 * 4. Uses matchMedia as the single source of truth for the configured
 *    breakpoint; static CSS @media covers the no-JS fallback.
 */
( function () {
	'use strict';

	var cfg = {
		sidebarWidth:  mw.config.get( 'saintapediaSortSidebarWidth',    280 ),
		showChips:     mw.config.get( 'saintapediaSortShowFilterChips',  true ),
		stickyFilters: mw.config.get( 'saintapediaSortStickyFilters',    true ),
		mobileBreak:   mw.config.get( 'saintapediaSortMobileBreakpoint', 720 )
	};

	// Namespace the key per wiki so wikifarm installs don't share state.
	var STORAGE_KEY = 'saintapediasort-filters-open-' + ( mw.config.get( 'wgWikiID' ) || '' );
	var storage     = mw.storage;

	/* -- Pure URL / filter helpers (no globals; exported for unit tests) -- */

	var RESERVED = [
		'title', 'action', 'uselang', 'useskin', 'useformat',
		'debug', 'safemode', 'printable', 'variant', 'oldid',
		'curid', 'redirect', 'veaction', 'mobileaction'
	];

	function isInternalParam( key ) {
		return key.charAt( 0 ) === '_' || RESERVED.indexOf( key ) !== -1;
	}

	/**
	 * Returns filter objects for every non-internal URL param.
	 *
	 * @param {string} search  window.location.search or a bare query string
	 * @return {Array.<{key:string, label:string, value:string}>}
	 */
	function getActiveFilters( search ) {
		var params  = new URLSearchParams( search );
		var filters = [];
		params.forEach( function ( val, key ) {
			if ( isInternalParam( key ) ) { return; }
			var label = key
				.replace( /\[([^\]]+)\]$/, ' ($1)' )
				.replace( /_/g, ' ' );
			filters.push( { key: key, label: label, value: val } );
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
		if ( cls )  { node.className = cls; }
		if ( text ) { node.textContent = text; }
		return node;
	}

	/* -- Feature: flex layout wrapper ---------------------------------- */

	function applyFlexLayout( filtersEl, resultsEl ) {
		var parent = filtersEl.parentElement;
		if ( resultsEl.parentElement !== parent ) {
			mw.log.warn( 'SaintapediaSort: filters and results do not share a parent; sidebar layout skipped.' );
			return null;
		}
		var wrapper = el( 'div', 'cargo-drilldown-layout' );
		parent.insertBefore( wrapper, filtersEl );
		wrapper.appendChild( filtersEl );
		wrapper.appendChild( resultsEl );
		return wrapper;
	}

	/* -- Feature: active-filter chips ---------------------------------- */

	function renderFilterChips( resultsEl ) {
		var filters = getActiveFilters( window.location.search );
		if ( !filters.length ) { return; }

		var bar = el( 'div', 'cargo-active-filters' );
		bar.setAttribute( 'role', 'region' );
		bar.setAttribute( 'aria-label', mw.msg( 'saintapediasort-active-filters' ) );

		filters.forEach( function ( f ) {
			var chip   = el( 'span', 'cargo-filter-chip' );
			var text   = el( 'span', 'cargo-chip-label',
				mw.msg( 'saintapediasort-chip-text', f.label, f.value ) );
			var qs     = buildRemoveSearch( window.location.search, f.key, f.value );
			var remove = el( 'a', 'cargo-chip-remove', '×' );
			remove.href  = window.location.pathname + ( qs ? '?' + qs : '' );
			remove.title = mw.msg( 'saintapediasort-remove-filter' );
			remove.setAttribute( 'aria-label',
				mw.msg( 'saintapediasort-remove-filter-aria', f.label, f.value ) );
			chip.appendChild( text );
			chip.appendChild( remove );
			bar.appendChild( chip );
		} );

		if ( filters.length > 1 ) {
			var clearWrap = el( 'span', 'cargo-clear-all' );
			var clearLink = el( 'a', '', mw.msg( 'saintapediasort-clear-filters' ) );
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
		var isOpen = false;

		function setOpen( open, persist ) {
			isOpen = open;
			btn.textContent = isOpen
				? mw.msg( 'saintapediasort-hide-filters' )
				: mw.msg( 'saintapediasort-show-filters' );
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
		var filtersEl = document.querySelector( '.drilldown-filters-wrapper' );
		var resultsEl = document.querySelector( '.drilldown-results' );
		if ( !filtersEl || !resultsEl ) {
			mw.log.warn( 'SaintapediaSort: Cargo selectors not found (' +
				( filtersEl ? '' : '.drilldown-filters-wrapper ' ) +
				( resultsEl ? '' : '.drilldown-results' ) + 'missing).' );
			return;
		}
		if ( filtersEl.dataset.saintapediasortInit ) { return; }
		filtersEl.dataset.saintapediasortInit = '1';

		var layoutEl = applyFlexLayout( filtersEl, resultsEl );
		if ( !layoutEl ) { return; }

		layoutEl.style.setProperty( '--cargo-sidebar-width', cfg.sidebarWidth + 'px' );
		if ( cfg.stickyFilters ) { filtersEl.classList.add( 'cargo-filters-sticky' ); }
		if ( cfg.showChips )     { renderFilterChips( resultsEl ); }

		var toggle = addMobileToggle( filtersEl );
		initBreakpointWatcher( layoutEl, filtersEl, toggle );
	}

	mw.hook( 'wikipage.content' ).add( function () {
		init();
	} );

	// Export pure helpers for unit testing; no-op in MediaWiki environment.
	if ( typeof module !== 'undefined' && module.exports ) {
		module.exports = {
			getActiveFilters: getActiveFilters,
			buildRemoveSearch: buildRemoveSearch,
			buildClearSearch: buildClearSearch
		};
	}

}() );
