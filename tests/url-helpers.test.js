'use strict';

const { test } = require( 'node:test' );
const assert   = require( 'node:assert/strict' );

// Minimal stubs so the IIFE runs without a browser or MediaWiki.
global.mw = {
	hook:    function () { return { add: function () {} }; },
	config:  { get: function () { return null; } },
	log:     { warn: function () {} },
	msg:     function ( key, a, b ) {
		if ( key === 'saintapediadrilldown-search-filter-label' ) { return a + ' (search)'; }
		if ( key === 'saintapediadrilldown-range-value' ) { return a + ' → ' + b; }
		return '';
	},
	storage: { get: function () { return null; }, set: function () {} }
};
global.window = {
	location: { search: '', pathname: '/wiki/Special:Drilldown' },
	matchMedia: function () {
		return { addEventListener: function () {}, addListener: function () {}, matches: false };
	}
};
global.document = {
	querySelector:   function () { return null; },
	getElementById:  function () { return null; },
	createElement:   function () {
		return {
			className: '', textContent: '', id: '', dataset: {},
			style:      { setProperty: function () {} },
			setAttribute:  function () {},
			addEventListener: function () {},
			appendChild:   function () { return this; },
			insertBefore:  function () { return this; },
			classList:     { add: function () {}, toggle: function () {}, remove: function () {} },
			parentElement: null, firstChild: null
		};
	}
};

const { getActiveFilters, buildRemoveSearch, buildRemoveFamilySearch, buildClearSearch } =
	require( '../modules/ext.SaintapediaDrilldown.js' );

/* ---- getActiveFilters ------------------------------------------------- */

test( 'getActiveFilters: empty search returns no filters', function () {
	assert.deepEqual( getActiveFilters( '' ), [] );
} );

test( 'getActiveFilters: skips _ params', function () {
	const filters = getActiveFilters( '?_offset=20&_limit=50&Category=Martyrs' );
	assert.equal( filters.length, 1 );
	assert.equal( filters[ 0 ].key, 'Category' );
	assert.equal( filters[ 0 ].value, 'Martyrs' );
} );

test( 'getActiveFilters: skips title and all RESERVED params', function () {
	const filters = getActiveFilters(
		'?title=Special%3ADrilldown%2FSaints&uselang=fr&useskin=vector&Category=Martyrs'
	);
	assert.equal( filters.length, 1 );
	assert.equal( filters[ 0 ].key, 'Category' );
} );

test( 'getActiveFilters: returns both entries for a repeated key', function () {
	const filters = getActiveFilters( '?Category=Martyrs&Category=Virgins' );
	assert.equal( filters.length, 2 );
	assert.equal( filters[ 0 ].value, 'Martyrs' );
	assert.equal( filters[ 1 ].value, 'Virgins' );
} );

/* ---- buildRemoveSearch ------------------------------------------------ */

test( 'buildRemoveSearch: removes one value without corrupting repeated key', function () {
	const result = buildRemoveSearch( '?Category=Martyrs&Category=Virgins', 'Category', 'Martyrs' );
	const params = new URLSearchParams( result );
	assert.deepEqual( params.getAll( 'Category' ), [ 'Virgins' ] );
	assert.ok(
		!result.includes( 'Category%5B%5D' ) && !result.includes( 'Category[]' ),
		'must not produce jQuery-style array key[]'
	);
} );

test( 'buildRemoveSearch: resets _offset', function () {
	const result = buildRemoveSearch( '?Category=Martyrs&_offset=100', 'Category', 'Martyrs' );
	assert.ok( !new URLSearchParams( result ).has( '_offset' ) );
} );

test( 'buildRemoveSearch: preserves title param (non-short-URL wikis)', function () {
	const result = buildRemoveSearch(
		'?title=Special%3ADrilldown%2FSaints&Category=Martyrs', 'Category', 'Martyrs'
	);
	assert.equal( new URLSearchParams( result ).get( 'title' ), 'Special:Drilldown/Saints' );
} );

test( 'buildRemoveSearch: preserves reserved param uselang', function () {
	const result = buildRemoveSearch( '?uselang=fr&Category=Martyrs', 'Category', 'Martyrs' );
	assert.equal( new URLSearchParams( result ).get( 'uselang' ), 'fr' );
} );

test( 'buildRemoveSearch: preserves Cargo date-range bracket params', function () {
	const result = buildRemoveSearch(
		'?Date%5B0%5D=2020&Date%5B1%5D=2021&Category=Martyrs', 'Category', 'Martyrs'
	);
	const params = new URLSearchParams( result );
	assert.equal( params.get( 'Date[0]' ), '2020' );
	assert.equal( params.get( 'Date[1]' ), '2021' );
} );

test( 'buildRemoveSearch: preserves display params _limit and _format', function () {
	const result = buildRemoveSearch(
		'?Category=Martyrs&_limit=50&_format=table', 'Category', 'Martyrs'
	);
	const params = new URLSearchParams( result );
	assert.equal( params.get( '_limit' ), '50' );
	assert.equal( params.get( '_format' ), 'table' );
} );

/* ---- buildClearSearch ------------------------------------------------- */

test( 'buildClearSearch: removes all filter params', function () {
	const result = buildClearSearch( '?Category=Martyrs&Country=Italy' );
	const params = new URLSearchParams( result );
	assert.ok( !params.has( 'Category' ) );
	assert.ok( !params.has( 'Country' ) );
} );

test( 'buildClearSearch: drops _offset but keeps _limit and _format', function () {
	const result = buildClearSearch(
		'?Category=Martyrs&_limit=50&_offset=100&_format=table'
	);
	const params = new URLSearchParams( result );
	assert.ok( !params.has( '_offset' ), '_offset must be dropped' );
	assert.equal( params.get( '_limit' ), '50' );
	assert.equal( params.get( '_format' ), 'table' );
} );

test( 'buildClearSearch: preserves reserved params uselang and useskin', function () {
	const result = buildClearSearch( '?uselang=fr&useskin=vector&Category=Martyrs' );
	const params = new URLSearchParams( result );
	assert.equal( params.get( 'uselang' ), 'fr' );
	assert.equal( params.get( 'useskin' ), 'vector' );
} );

test( 'buildClearSearch: preserves title on non-short-URL wiki', function () {
	const result = buildClearSearch(
		'?title=Special%3ADrilldown%2FSaints&Category=Martyrs'
	);
	assert.equal(
		new URLSearchParams( result ).get( 'title' ), 'Special:Drilldown/Saints'
	);
} );

/* ---- getActiveFilters: _search_* (U2) --------------------------------- */

test( 'getActiveFilters: renders _search_Name as chip labelled "Name (search)"', function () {
	const filters = getActiveFilters( '?_search_Name=greg&Category=Martyrs' );
	const hit = filters.filter( function ( f ) { return f.key === '_search_Name'; } );
	assert.equal( hit.length, 1, '_search_Name must produce a chip' );
	assert.equal( hit[ 0 ].label, 'Name (search)' );
	assert.equal( hit[ 0 ].value, 'greg' );
} );

test( 'buildClearSearch: drops _search_* but keeps _limit and title', function () {
	const result = buildClearSearch(
		'?_search_Name=greg&Category=Martyrs&_limit=50&title=Special%3ADrilldown%2FSaints'
	);
	const params = new URLSearchParams( result );
	assert.ok( !params.has( '_search_Name' ), '_search_Name must be dropped' );
	assert.ok( !params.has( 'Category' ), 'Category must be dropped' );
	assert.equal( params.get( '_limit' ), '50' );
	assert.equal( params.get( 'title' ), 'Special:Drilldown/Saints' );
} );

/* ---- bracket-family params (U3) --------------------------------------- */

test( 'getActiveFilters: groups Date[0]/Date[1] into one chip', function () {
	const filters = getActiveFilters( '?Date%5B0%5D=2020&Date%5B1%5D=2021' );
	assert.equal( filters.length, 1 );
	assert.equal( filters[ 0 ].key, 'Date' );
	assert.ok( filters[ 0 ].isFamily, 'isFamily must be true' );
	assert.ok(
		filters[ 0 ].value.includes( '2020' ) && filters[ 0 ].value.includes( '2021' ),
		'value must include both years'
	);
} );

test( 'buildRemoveFamilySearch: removes all Date[*] params and resets _offset', function () {
	const result = buildRemoveFamilySearch(
		'?Date%5B0%5D=2020&Date%5B1%5D=2021&Category=Martyrs&_offset=20',
		'Date'
	);
	const params = new URLSearchParams( result );
	assert.ok( !params.has( 'Date[0]' ), 'Date[0] must be removed' );
	assert.ok( !params.has( 'Date[1]' ), 'Date[1] must be removed' );
	assert.ok( !params.has( '_offset' ), '_offset must be reset' );
	assert.equal( params.get( 'Category' ), 'Martyrs' );
} );

/* ---- buildRemoveSearch: _search_* param (Issue 6) --------------------- */

test( 'buildRemoveSearch: removes a _search_* chip param', function () {
	const result = buildRemoveSearch( '?_search_Name=greg&Category=Martyrs', '_search_Name', 'greg' );
	const params = new URLSearchParams( result );
	assert.ok( !params.has( '_search_Name' ), '_search_Name must be removed' );
	assert.equal( params.get( 'Category' ), 'Martyrs', 'Category must be preserved' );
} );

/* ---- buildClearSearch: bracket-family params (Issue 6) ---------------- */

test( 'buildClearSearch: drops bracket-family params Date[0] and Date[1]', function () {
	const result = buildClearSearch(
		'?Date%5B0%5D=2020&Date%5B1%5D=2021&Category=Martyrs&_limit=50'
	);
	const params = new URLSearchParams( result );
	assert.ok( !params.has( 'Date[0]' ), 'Date[0] must be dropped' );
	assert.ok( !params.has( 'Date[1]' ), 'Date[1] must be dropped' );
	assert.ok( !params.has( 'Category' ), 'Category must be dropped' );
	assert.equal( params.get( '_limit' ), '50', '_limit must be preserved' );
} );
