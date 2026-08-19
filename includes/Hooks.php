<?php
/**
 * SaintapediaDrilldown – Hooks.php
 *
 * Loads the UI-improvement ResourceLoader module on Special:Drilldown
 * (and all sub-pages like Special:Drilldown/Saints).
 */

declare( strict_types = 1 );

namespace MediaWiki\Extension\SaintapediaDrilldown;

use CargoUtils;
use ExtensionRegistry;
use MediaWiki\Hook\BeforePageDisplayHook;
use MediaWiki\Logger\LoggerFactory;
use MediaWiki\MediaWikiServices;

class Hooks implements BeforePageDisplayHook {

	private const HIDDEN_TABLES_CACHE_TTL = 300;

	/**
	 * @param \OutputPage $out
	 * @param \Skin $skin
	 */
	public function onBeforePageDisplay( $out, $skin ): void {
		if ( !ExtensionRegistry::getInstance()->isLoaded( 'Cargo' ) ) {
			LoggerFactory::getInstance( 'SaintapediaDrilldown' )->warning(
				'Cargo is not loaded; enable Cargo before SaintapediaDrilldown.'
			);
			return;
		}

		$title = $out->getTitle();
		if ( $title === null || !$title->isSpecial( 'Drilldown' ) ) {
			return;
		}

		// Redirect away from calendar URLs whose formatBy field is absent from
		// the current table, preventing a PHP Warning in CargoDrilldownPage.php.
		// Runs before the enabled check — this is a bug fix, not a UI feature.
		// Cargo bug; guard lives here until fixed upstream.
		if ( $this->guardCalendarFormat( $out, $title ) ) {
			return;
		}

		$configService = new SaintapediaDrilldownConfigService();
		$cfg = $configService->getConfig( $out );

		if ( !$cfg['enabled'] ) {
			return;
		}

		$hiddenTables = $this->getHiddenTables( $cfg['hiddenTableCategory'] );

		// Cargo defaults a bare Special:Drilldown request to its first table;
		// if that table is hidden, its tab disappears but its data still loads.
		// Redirect to the first non-hidden table so "hidden" is actually hidden.
		if ( $this->guardHiddenDefaultTable( $out, $title, $hiddenTables ) ) {
			return;
		}

		$sidebarWidth = $cfg['sidebarWidth'];
		$mobileBreak = $cfg['mobileBreakpoint'];

		$out->addJsConfigVars( [
			'saintapediaDrilldownSidebarWidth' => $sidebarWidth,
			'saintapediaDrilldownShowFilterChips' => $cfg['showFilterChips'],
			'saintapediaDrilldownStickyFilters' => $cfg['stickyFilters'],
			'saintapediaDrilldownStickyChips' => $cfg['stickyChips'],
			'saintapediaDrilldownPillChips' => $cfg['pillChips'],
			'saintapediaDrilldownCollapsibleSections' => $cfg['collapsibleSections'],
			'saintapediaDrilldownSectionsStartCollapsed' => $cfg['sectionsStartCollapsed'],
			'saintapediaDrilldownLargeHeadings' => $cfg['largeHeadings'],
			'saintapediaDrilldownMobileBreakpoint' => $mobileBreak,
			'saintapediaDrilldownTheme' => $cfg['theme'],
			'saintapediaDrilldownHiddenTables' => $hiddenTables,
		] );

		// Styles loaded render-blocking to avoid a style pop when JS applies the flex layout.
		$out->addModuleStyles( 'ext.SaintapediaDrilldown.styles' );
		$out->addModules( 'ext.SaintapediaDrilldown' );

		// Theme tokens + mobile breakpoint (CSS-only fallback before JS).
		// hiddenTabsCss hides the tabs bar until JS removes the flagged tabs and
		// reveals it (see ext.SaintapediaDrilldown.js:hideConfiguredTabs), so a
		// soon-to-be-removed tab never flashes on screen. Trade-off: if the JS
		// module fails to load, the whole tabs bar stays hidden rather than
		// showing everything unfiltered — same render-blocking-first philosophy
		// as the sidebar layout styles above.
		$out->addInlineStyle(
			$this->themeCss( $cfg['themeVars'] ) .
			$this->mobileBreakpointCss( $mobileBreak ) .
			$this->hiddenTabsCss( $hiddenTables )
		);
	}

	/**
	 * Redirects a bare Special:Drilldown request (no table subpage) away from
	 * a hidden default table to the first non-hidden one, preserving other
	 * query params. Cargo picks CargoUtils::getTables()[0] as the default when
	 * no subpage is given; without this, that table's data still renders even
	 * though its tab was removed from the chooser.
	 *
	 * Returns true when a redirect has been queued (caller should return early).
	 *
	 * @param \OutputPage $out
	 * @param \Title $title Already-verified Drilldown special-page title.
	 * @param string[] $hiddenTables
	 * @return bool
	 */
	private function guardHiddenDefaultTable( \OutputPage $out, \Title $title, array $hiddenTables ): bool {
		if ( !$hiddenTables ) {
			return false;
		}

		// Title text is "Drilldown/TableName"; a non-empty subpage means the
		// user (or a link) explicitly picked a table, so leave it alone.
		$parts = explode( '/', $title->getText(), 2 );
		if ( ( $parts[1] ?? '' ) !== '' ) {
			return false;
		}

		try {
			$tableNames = CargoUtils::getTables();
		} catch ( \Throwable $e ) {
			// Cargo API unavailable or changed; let Cargo handle it.
			return false;
		}

		if ( !$tableNames || !in_array( $tableNames[0], $hiddenTables, true ) ) {
			// Default table isn't hidden; nothing to do.
			return false;
		}

		foreach ( $tableNames as $tableName ) {
			if ( in_array( $tableName, $hiddenTables, true ) ) {
				continue;
			}
			$params = $out->getRequest()->getQueryValues();
			unset( $params['title'] );
			$out->redirect( \SpecialPage::getTitleFor( 'Drilldown', $tableName )->getLocalURL( $params ) );
			return true;
		}

		// Every table is hidden; nothing sane to redirect to.
		return false;
	}

	/**
	 * Guard against a Cargo bug (CargoDrilldownPage.php:2212) where accessing
	 * a formatBy field that does not exist on the drilldown table causes a PHP
	 * Warning. When the field is absent we redirect to the same URL without
	 * the format/formatBy params so the page renders safely.
	 *
	 * Returns true when a redirect has been queued (caller should return early).
	 *
	 * @param \OutputPage $out
	 * @param \Title $title Already-verified Drilldown special-page title.
	 * @return bool
	 */
	private function guardCalendarFormat( \OutputPage $out, \Title $title ): bool {
		$request = $out->getRequest();

		if ( $request->getText( 'format' ) !== 'calendar' ) {
			return false;
		}
		$formatBy = $request->getText( 'formatBy' );
		if ( $formatBy === '' ) {
			return false;
		}

		// Title text is "Drilldown/TableName"; extract the table part.
		$parts     = explode( '/', $title->getText(), 2 );
		$tableName = $parts[1] ?? '';
		if ( $tableName === '' ) {
			return false;
		}

		try {
			$tableSchemas = CargoUtils::getTableSchemas( [ $tableName ] );
		} catch ( \Throwable $e ) {
			// Cargo API unavailable or changed; let Cargo handle it.
			return false;
		}

		if ( !isset( $tableSchemas[$tableName] ) ) {
			// Table unknown to Cargo; let Cargo render its own error.
			return false;
		}

		$fields = $tableSchemas[$tableName]->mFieldDescriptions ?? [];
		if ( isset( $fields[$formatBy] ) ) {
			// Field is valid; nothing to do.
			return false;
		}

		// Field missing from this table: strip format + formatBy and redirect.
		// OutputPage::redirect() sets $mRedirect; output() honours it after the
		// hook returns — it does not fire immediately.
		$params = $request->getQueryValues();
		unset( $params['format'], $params['formatBy'], $params['title'] );
		$out->redirect( $title->getLocalURL( $params ) );
		return true;
	}

	/**
	 * Names of Cargo tables whose declaring template (the page that calls
	 * #cargo_declare) is in $categoryName. Those tables' tabs are stripped
	 * from the Special:Drilldown table chooser client-side.
	 *
	 * Cargo has no built-in "hide from drilldown" flag, so this is our own
	 * convention: an editor puts the table's declaring template in a
	 * category, and we cross-reference Cargo's own table→template mapping
	 * (page_props: CargoTableName) against that category's membership.
	 * Two queries total regardless of table count (category members, then
	 * one page_props batch read) — cached briefly on top of that.
	 *
	 * @param string $categoryName Empty string disables the feature.
	 * @return string[]
	 */
	private function getHiddenTables( string $categoryName ): array {
		if ( $categoryName === '' ) {
			return [];
		}

		// newFromText (not makeTitleSafe) so a categoryName that already
		// includes "Category:" (easy to paste from a URL) isn't double-prefixed
		// into an unmatchable "Category:Category:…" title.
		$categoryTitle = \Title::newFromText( $categoryName, NS_CATEGORY );
		if ( $categoryTitle === null || $categoryTitle->getNamespace() !== NS_CATEGORY ) {
			LoggerFactory::getInstance( 'SaintapediaDrilldown' )->warning(
				'hiddenTableCategory {name} is not a valid category name; no tables will be hidden.',
				[ 'name' => $categoryName ]
			);
			return [];
		}

		$cache = MediaWikiServices::getInstance()->getMainWANObjectCache();
		$key = $cache->makeKey( 'saintapediadrilldown-hidden-tables', 2, $categoryTitle->getDBkey() );

		return $cache->getWithSetCallback(
			$key,
			self::HIDDEN_TABLES_CACHE_TTL,
			function () use ( $categoryTitle ) {
				try {
					return $this->computeHiddenTables( $categoryTitle );
				} catch ( \Throwable $e ) {
					LoggerFactory::getInstance( 'SaintapediaDrilldown' )->warning(
						'getHiddenTables failed: {msg}', [ 'msg' => $e->getMessage() ]
					);
					return [];
				}
			}
		);
	}

	/**
	 * @param \Title $categoryTitle
	 * @return string[]
	 */
	private function computeHiddenTables( \Title $categoryTitle ): array {
		// One query: page IDs of every page in the flagged category.
		$memberPageIds = [];
		foreach ( \Category::newFromTitle( $categoryTitle )->getMembers() as $memberTitle ) {
			$memberPageIds[ $memberTitle->getArticleID() ] = true;
		}
		if ( !$memberPageIds ) {
			return [];
		}

		// One query: every Cargo table's declaring-template page ID, in bulk
		// (CargoUtils only offers this per-table, which would be N+1 here).
		$res = CargoUtils::getMainDBForRead()->newSelectQueryBuilder()
			->select( [ 'pp_page', 'pp_value' ] )
			->from( 'page_props' )
			->where( [ 'pp_propname' => 'CargoTableName' ] )
			->caller( __METHOD__ )
			->fetchResultSet();

		$hidden = [];
		foreach ( $res as $row ) {
			if ( isset( $memberPageIds[ (int)$row->pp_page ] ) ) {
				$hidden[] = (string)$row->pp_value;
			}
		}
		return $hidden;
	}

	/**
	 * @param string[] $hiddenTables
	 * @return string CSS hiding the tabs bar until JS filters and reveals it;
	 *   empty string (no CSS emitted) when nothing is configured to hide.
	 */
	private function hiddenTabsCss( array $hiddenTables ): string {
		if ( !$hiddenTables ) {
			return '';
		}
		return '#drilldown-tables-tabs-wrapper{visibility:hidden}';
	}

	/**
	 * Emit CSS custom properties for theme tokens on the layout root.
	 *
	 * @param array<string,string> $vars
	 */
	private function themeCss( array $vars ): string {
		$map = [
			'gap' => '--cargo-gap',
			'radius' => '--cargo-radius',
			'filterBg' => '--cargo-filter-bg',
			'filterBorder' => '--cargo-filter-border',
			'chipBg' => '--cargo-chip-bg',
			'chipBorder' => '--cargo-chip-border',
			'chipText' => '--cargo-chip-text',
			'toggleBg' => '--cargo-toggle-bg',
			'toggleText' => '--cargo-toggle-text',
			'activeBarBg' => '--cargo-active-bar-bg',
			'stickyTop' => '--cargo-sticky-top',
		];

		$decls = [];
		foreach ( $map as $key => $cssVar ) {
			if ( !isset( $vars[$key] ) ) {
				continue;
			}
			// Values already validated in the config service.
			$decls[] = $cssVar . ':' . $vars[$key];
		}

		if ( $decls === [] ) {
			return '';
		}

		// Layout + table-pill bar (tabs sit outside the flex layout).
		return '.cargo-drilldown-layout,.cargo-drilldown-table-tabs{' .
			implode( ';', $decls ) . '}';
	}

	/**
	 * @param int $bp Configured mobile breakpoint in pixels (already clamped).
	 * @return string Inline CSS @media block for the configured breakpoint.
	 */
	private function mobileBreakpointCss( int $bp ): string {
		$mobileCss =
			'.cargo-drilldown-layout{flex-direction:column}' .
			'.cargo-drilldown-layout .drilldown-results-content{order:1;width:100%}' .
			'.cargo-drilldown-layout .drilldown-filters,' .
			'.cargo-drilldown-layout .drilldown-filters-wrapper' .
				'{order:2;flex:none;width:100%;max-width:none;position:static;max-height:none;overflow:visible}' .
			'.cargo-drilldown-layout .drilldown-filters.cargo-filters-collapsed,' .
			'.cargo-drilldown-layout .drilldown-filters-wrapper.cargo-filters-collapsed{display:none}' .
			'.cargo-drilldown-layout .cargo-filters-toggle{display:block;order:2;margin-top:0.5em}' .
			'.cargo-drilldown-layout .cargo-active-filters.cargo-chips-sticky{position:static}';

		return '@media(max-width:' . ( $bp - 1 ) . 'px){' . $mobileCss . '}';
	}
}
