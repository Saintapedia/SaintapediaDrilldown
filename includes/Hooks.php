<?php
/**
 * SaintapediaDrilldown – Hooks.php
 *
 * Loads the UI-improvement ResourceLoader module on Special:Drilldown
 * (and all sub-pages like Special:Drilldown/Saints).
 */

declare( strict_types = 1 );

namespace MediaWiki\Extension\SaintapediaDrilldown;

use ExtensionRegistry;
use MediaWiki\Hook\BeforePageDisplayHook;
use MediaWiki\Logger\LoggerFactory;

class Hooks implements BeforePageDisplayHook {

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

		$configService = new SaintapediaDrilldownConfigService();
		$cfg = $configService->getConfig( $out );

		if ( !$cfg['enabled'] ) {
			return;
		}

		$title = $out->getTitle();
		if ( $title === null || !$title->isSpecial( 'Drilldown' ) ) {
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
