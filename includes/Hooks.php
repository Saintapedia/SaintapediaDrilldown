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

		$config = $out->getConfig();

		if ( !$config->get( 'SaintapediaDrilldownSidebarEnabled' ) ) {
			return;
		}

		$title = $out->getTitle();
		if ( $title === null || !$title->isSpecial( 'Drilldown' ) ) {
			return;
		}

		// Clamp config values to documented valid ranges.
		$rawWidth      = (int)$config->get( 'SaintapediaDrilldownSidebarWidth' );
		$rawBreakpoint = (int)$config->get( 'SaintapediaDrilldownMobileBreakpoint' );
		$sidebarWidth  = max( 120, min( 800, $rawWidth ) );
		$mobileBreak   = max( 320, min( 1600, $rawBreakpoint ) );
		$logger = LoggerFactory::getInstance( 'SaintapediaDrilldown' );
		if ( $sidebarWidth !== $rawWidth ) {
			$logger->warning( 'SaintapediaDrilldownSidebarWidth value {value} is out of range [120, 800]; clamped to {clamped}.', [
				'value' => $rawWidth, 'clamped' => $sidebarWidth,
			] );
		}
		if ( $mobileBreak !== $rawBreakpoint ) {
			$logger->warning( 'SaintapediaDrilldownMobileBreakpoint value {value} is out of range [320, 1600]; clamped to {clamped}.', [
				'value' => $rawBreakpoint, 'clamped' => $mobileBreak,
			] );
		}

		$out->addJsConfigVars( [
			'saintapediaDrilldownSidebarWidth'     => $sidebarWidth,
			'saintapediaDrilldownShowFilterChips'  => (bool)$config->get( 'SaintapediaDrilldownShowFilterChips' ),
			'saintapediaDrilldownStickyFilters'    => (bool)$config->get( 'SaintapediaDrilldownStickyFilters' ),
			'saintapediaDrilldownMobileBreakpoint' => $mobileBreak,
		] );

		// Styles loaded render-blocking to avoid a style pop when JS applies the flex layout.
		$out->addModuleStyles( 'ext.SaintapediaDrilldown.styles' );
		$out->addModules( 'ext.SaintapediaDrilldown' );

		// Always emit the @media block so the default 720px breakpoint
		// gets a CSS-only fallback (avoids FOUC before JS runs).
		$out->addInlineStyle( $this->mobileBreakpointCss( $mobileBreak ) );
	}

	/**
	 * @param int $bp Configured mobile breakpoint in pixels (already clamped).
	 * @return string Inline CSS @media block for the configured breakpoint.
	 */
	private function mobileBreakpointCss( int $bp ): string {
		$mobileCss =
			'.cargo-drilldown-layout{flex-direction:column}' .
			'.cargo-drilldown-layout .drilldown-results-content{order:1;width:100%}' .
			'.cargo-drilldown-layout .drilldown-filters-wrapper' .
				'{order:2;flex:none;width:100%;max-width:none;position:static;max-height:none;overflow:visible}' .
			'.cargo-drilldown-layout .drilldown-filters-wrapper.cargo-filters-collapsed{display:none}' .
			'.cargo-drilldown-layout .cargo-filters-toggle{display:block;order:2;margin-top:0.5em}';

		return '@media(max-width:' . ( $bp - 1 ) . 'px){' . $mobileCss . '}';
	}
}
