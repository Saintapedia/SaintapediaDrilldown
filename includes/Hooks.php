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
			'saintapediaDrilldownHiddenTables' => $this->getHiddenTables( $cfg['hiddenTableCategory'] ),
		] );

		// Styles loaded render-blocking to avoid a style pop when JS applies the flex layout.
		$out->addModuleStyles( 'ext.SaintapediaDrilldown.styles' );
		$out->addModules( 'ext.SaintapediaDrilldown' );

		// Theme tokens + mobile breakpoint (CSS-only fallback before JS).
		$out->addInlineStyle(
			$this->themeCss( $cfg['themeVars'] ) .
			$this->mobileBreakpointCss( $mobileBreak )
		);
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
	 * Cached briefly since it costs one query per known Cargo table.
	 *
	 * @param string $categoryName Empty string disables the feature.
	 * @return string[]
	 */
	private function getHiddenTables( string $categoryName ): array {
		if ( $categoryName === '' ) {
			return [];
		}

		$categoryTitle = \Title::makeTitleSafe( NS_CATEGORY, $categoryName );
		if ( $categoryTitle === null ) {
			return [];
		}

		$cache = MediaWikiServices::getInstance()->getMainWANObjectCache();
		$key = $cache->makeKey( 'saintapediadrilldown-hidden-tables', 1, $categoryTitle->getDBkey() );

		return $cache->getWithSetCallback(
			$key,
			self::HIDDEN_TABLES_CACHE_TTL,
			function () use ( $categoryTitle ) {
				$targetCat = $categoryTitle->getPrefixedDBkey();
				$hidden = [];
				foreach ( CargoUtils::getTables() as $tableName ) {
					$templatePageId = CargoUtils::getTemplateIDForDBTable( $tableName );
					if ( !$templatePageId ) {
						continue;
					}
					$templateTitle = \Title::newFromID( $templatePageId );
					if ( $templateTitle === null ) {
						continue;
					}
					if ( array_key_exists( $targetCat, $templateTitle->getParentCategories() ) ) {
						$hidden[] = $tableName;
					}
				}
				return $hidden;
			}
		);
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
