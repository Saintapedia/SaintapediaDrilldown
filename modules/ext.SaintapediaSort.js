/**
 * SaintapediaSort — JavaScript module
 *
 * 1. Wraps .drilldown-filters-wrapper + .drilldown-results in a flex
 *    container so the sidebar layout works regardless of which skin or
 *    DOM parent Cargo places them in.
 * 2. Renders active-filter "chips" above the results for quick removal.
 * 3. Adds a mobile toggle button that shows/hides the filter sidebar.
 *    Toggle state is persisted in localStorage.
 * 4. Uses matchMedia to drive mobile layout from cfg.mobileBreak so the
 *    JS-configurable breakpoint and the CSS breakpoint stay in sync.
 */
( function () {
	'use strict';

	var cfg = {
		sidebarWidth:  mw.config.get( 'saintapediaSortSidebarWidth',    280 ),
		showChips:     mw.config.get( 'saintapediaSortShowFilterChips',  true ),
		stickyFilters: mw.config.get( 'saintapediaSortStickyFilters',    true ),
		mobileBreak:   mw.config.get( 'saintapediaSortMobileBreakpoint', 720 )
	};

	var STORAGE_KEY = 'saintapedia-sort-filters-open';

	/* -- URL / filter helpers ------------------------------------------ */

	var SKIP_PARAMS = new Set( [
		'_offset', '_limit', '_order', '_format',
		'_displayformat', '_tab', '_group'
	] );

	function getActiveFilters() {
		var params  = new URLSearchParams( window.location.search );
		var filters = [];
		params.forEach( function ( val, key ) {
			if ( SKIP_PARAMS.has( key ) ) { return; }
			var label = key
				.replace( /\[([^\]]+)\]$/, ' ($1)' )
				.replace( /_/g, ' ' );
			filters.push( { key: key, label: label, value: val } );
		} );
		return filters;
	}

	function buildRemoveUrl( key, value ) {
		var params = new URLSearchParams( window.location.search );
		var kept   = params.getAll( key ).filter( function ( v ) { return v !== value; } );
		params.delete( key );
		kept.forEach( function ( v ) { params.append( key, v ); } );
		var qs = params.toString();
		return window.location.pathname + ( qs ? '?' + qs : '' );
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
		if ( resultsEl.parentElement === parent ) {
			var wrapper = el( 'div', 'cargo-drilldown-layout' );
			parent.insertBefore( wrapper, filtersEl );
			wrapper.appendChild( filtersEl );
			wrapper.appendChild( resultsEl );
			return wrapper;
		}
		var ancestor = filtersEl.parentElement;
		while ( ancestor && !ancestor.contains( resultsEl ) ) {
			ancestor = ancestor.parentElement;
		}
		if ( ancestor ) { ancestor.classList.add( 'cargo-drilldown-layout' ); }
		return ancestor || document.body;
	}

	/* -- Feature: active-filter chips ---------------------------------- */

	function renderFilterChips( resultsEl ) {
		var filters = getActiveFilters();
		if ( !filters.length ) { return; }

		var bar = el( 'div', 'cargo-active-filters' );
		filters.forEach( function ( f ) {
			var chip   = el( 'span', 'cargo-filter-chip' );
			var label  = el( 'span', 'cargo-chip-label', f.label + ': ' + f.value );
			var remove = el( 'a', 'cargo-chip-remove', '×' );
			remove.href  = buildRemoveUrl( f.key, f.value );
			remove.title = mw.msg( 'saintapediasort-remove-filter' );
			remove.setAttribute( 'aria-label',
				mw.msg( 'saintapediasort-remove-filter' ) + ': ' + f.label );
			chip.appendChild( label );
			chip.appendChild( remove );
			bar.appendChild( chip );
		} );

		if ( filters.length > 1 ) {
			var clearWrap = el( 'span', 'cargo-clear-all' );
			var clearLink = el( 'a', '', mw.msg( 'saintapediasort-clear-filters' ) );
			clearLink.href = window.location.pathname;
			clearWrap.appendChild( clearLink );
			bar.appendChild( clearWrap );
		}

		resultsEl.insertBefore( bar, resultsEl.firstChild );
	}

	/* -- Feature: mobile toggle ---------------------------------------- */

	/**
	 * Creates the Show/Hide filters button. Returns { setOpen } so the
	 * breakpoint watcher can force the sidebar open when switching to desktop.
	 *
	 * Toggle state is persisted in localStorage so returning visitors see
	 * the same sidebar state they left.
	 */
	function addMobileToggle( filtersEl ) {
		var btn    = el( 'button', 'cargo-filters-toggle' );
		var isOpen = false;

		function setOpen( open ) {
			isOpen = open;
			btn.textContent = isOpen
				? mw.msg( 'saintapediasort-hide-filters' )
				: mw.msg( 'saintapediasort-show-filters' );
			btn.setAttribute( 'aria-expanded', isOpen ? 'true' : 'false' );
			filtersEl.classList.toggle( 'cargo-filters-collapsed', !isOpen );
			try { localStorage.setItem( STORAGE_KEY, isOpen ? '1' : '0' ); } catch ( e ) {}
		}

		filtersEl.id = 'cargo-filter-sidebar';
		btn.setAttribute( 'aria-controls', 'cargo-filter-sidebar' );

		// Restore previous state from localStorage
		var stored;
		try { stored = localStorage.getItem( STORAGE_KEY ); } catch ( e ) {}
		setOpen( stored === '1' );

		btn.addEventListener( 'click', function () { setOpen( !isOpen ); } );
		filtersEl.parentElement.insertBefore( btn, filtersEl );

		return { setOpen: setOpen };
	}

	/* -- Feature: config-driven mobile breakpoint ---------------------- */

	/**
	 * Uses matchMedia so cfg.mobileBreak actually controls the layout switch,
	 * instead of relying solely on the CSS @media fallback (which is fixed at
	 * the default 720px).
	 */
	function initBreakpointWatcher( layoutEl, filtersEl, toggle ) {
		var mq = window.matchMedia( '(max-width: ' + ( cfg.mobileBreak - 1 ) + 'px)' );

		function onBreakpoint( e ) {
			layoutEl.classList.toggle( 'cargo-mobile-layout', e.matches );
			if ( !e.matches ) {
				// Switching to desktop: always show the sidebar
				filtersEl.classList.remove( 'cargo-filters-collapsed' );
				toggle.setOpen( false );
			}
		}

		// Support both the modern addEventListener and legacy addListener (Safari < 14)
		if ( mq.addEventListener ) {
			mq.addEventListener( 'change', onBreakpoint );
		} else {
			mq.addListener( onBreakpoint );
		}
		onBreakpoint( mq ); // apply immediately on load
	}

	/* -- Main init ----------------------------------------------------- */

	function init() {
		var filtersEl = document.querySelector( '.drilldown-filters-wrapper' );
		var resultsEl = document.querySelector( '.drilldown-results' );
		if ( !filtersEl || !resultsEl ) { return; }

		var layoutEl = applyFlexLayout( filtersEl, resultsEl );
		layoutEl.style.setProperty( '--cargo-sidebar-width', cfg.sidebarWidth + 'px' );

		if ( cfg.stickyFilters ) { filtersEl.classList.add( 'cargo-filters-sticky' ); }
		if ( cfg.showChips )     { renderFilterChips( resultsEl ); }

		var toggle = addMobileToggle( filtersEl );
		initBreakpointWatcher( layoutEl, filtersEl, toggle );
	}

	mw.hook( 'wikipage.content' ).add( function () {
		if ( document.querySelector( '.cargo-drilldown-layout' ) ) { return; }
		init();
	} );

}() );
