<?php
/**
 * Loads SaintapediaDrilldown UX options from MediaWiki:SaintapediaDrilldown-config
 * (JSON) with LocalSettings ($wg*) fallbacks.
 *
 * Wiki config can override layout knobs and theme tokens without redeploying.
 *
 * @file
 */

declare( strict_types = 1 );

namespace MediaWiki\Extension\SaintapediaDrilldown;

use IContextSource;
use IDBAccessObject;
use MediaWiki\MediaWikiServices;
use MediaWiki\Revision\SlotRecord;
use MediaWiki\Title\Title;

/**
 * Resolves layout and polish settings for Special:Drilldown.
 */
class SaintapediaDrilldownConfigService {

	private const CACHE_VERSION = 2;
	private const CACHE_TTL = 300;

	/** @var array<string,mixed>|null */
	private ?array $resolvedConfig = null;

	/**
	 * Built-in theme token sets. Wiki `themeVars` overlay these.
	 *
	 * @var array<string,array<string,string>>
	 */
	private const THEME_PRESETS = [
		'default' => [
			'gap' => '1.5em',
			'radius' => '6px',
			'filterBg' => '#f8f9fa',
			'filterBorder' => '#c8ccd1',
			'chipBg' => '#ffffff',
			'chipBorder' => '#72a0c1',
			'chipText' => '#0645ad',
			'toggleBg' => '#36c',
			'toggleText' => '#ffffff',
			'activeBarBg' => '#eaf3fb',
			'stickyTop' => '0.75em',
		],
		'soft' => [
			'gap' => '1.25em',
			'radius' => '10px',
			'filterBg' => '#f4f7fb',
			'filterBorder' => '#d0d7de',
			'chipBg' => '#ffffff',
			'chipBorder' => '#96b4d4',
			'chipText' => '#0b3d91',
			'toggleBg' => '#4a7ab5',
			'toggleText' => '#ffffff',
			'activeBarBg' => '#eef4fa',
			'stickyTop' => '0.75em',
		],
		'compact' => [
			'gap' => '1em',
			'radius' => '4px',
			'filterBg' => '#f8f9fa',
			'filterBorder' => '#a2a9b1',
			'chipBg' => '#ffffff',
			'chipBorder' => '#72a0c1',
			'chipText' => '#0645ad',
			'toggleBg' => '#3680b0',
			'toggleText' => '#ffffff',
			'activeBarBg' => '#eaf3fb',
			'stickyTop' => '0.5em',
		],
	];

	/**
	 * @return array{
	 *   enabled:bool,
	 *   sidebarWidth:int,
	 *   showFilterChips:bool,
	 *   stickyFilters:bool,
	 *   stickyChips:bool,
	 *   pillChips:bool,
	 *   mobileBreakpoint:int,
	 *   theme:string,
	 *   themeVars:array<string,string>
	 * }
	 */
	public function getConfig( IContextSource $context ): array {
		if ( $this->resolvedConfig !== null ) {
			return $this->resolvedConfig;
		}

		$main = $context->getConfig();
		$wiki = $this->getResolvedWikiOverlay( $context );

		$enabled = (bool)$main->get( 'SaintapediaDrilldownSidebarEnabled' );
		$sidebarWidth = (int)$main->get( 'SaintapediaDrilldownSidebarWidth' );
		$showChips = (bool)$main->get( 'SaintapediaDrilldownShowFilterChips' );
		$stickyFilters = (bool)$main->get( 'SaintapediaDrilldownStickyFilters' );
		$stickyChips = (bool)$main->get( 'SaintapediaDrilldownStickyChips' );
		$pillChips = (bool)$main->get( 'SaintapediaDrilldownPillChips' );
		$mobileBreak = (int)$main->get( 'SaintapediaDrilldownMobileBreakpoint' );
		$theme = (string)$main->get( 'SaintapediaDrilldownTheme' );

		if ( is_array( $wiki ) ) {
			if ( array_key_exists( 'enabled', $wiki ) ) {
				$enabled = (bool)$wiki['enabled'];
			}
			if ( isset( $wiki['sidebarWidth'] ) ) {
				$sidebarWidth = (int)$wiki['sidebarWidth'];
			}
			if ( array_key_exists( 'showFilterChips', $wiki ) ) {
				$showChips = (bool)$wiki['showFilterChips'];
			}
			if ( array_key_exists( 'stickyFilters', $wiki ) ) {
				$stickyFilters = (bool)$wiki['stickyFilters'];
			}
			if ( array_key_exists( 'stickyChips', $wiki ) ) {
				$stickyChips = (bool)$wiki['stickyChips'];
			}
			if ( array_key_exists( 'pillChips', $wiki ) ) {
				$pillChips = (bool)$wiki['pillChips'];
			}
			if ( isset( $wiki['mobileBreakpoint'] ) ) {
				$mobileBreak = (int)$wiki['mobileBreakpoint'];
			}
			if ( isset( $wiki['theme'] ) && is_string( $wiki['theme'] ) && $wiki['theme'] !== '' ) {
				$theme = $wiki['theme'];
			}
		}

		$sidebarWidth = max( 120, min( 800, $sidebarWidth ) );
		$mobileBreak = max( 320, min( 1600, $mobileBreak ) );
		$theme = $this->normalizeThemeName( $theme );
		$themeVars = $this->resolveThemeVars( $theme, is_array( $wiki ) ? ( $wiki['themeVars'] ?? null ) : null );

		$this->resolvedConfig = [
			'enabled' => $enabled,
			'sidebarWidth' => $sidebarWidth,
			'showFilterChips' => $showChips,
			'stickyFilters' => $stickyFilters,
			'stickyChips' => $stickyChips,
			'pillChips' => $pillChips,
			'mobileBreakpoint' => $mobileBreak,
			'theme' => $theme,
			'themeVars' => $themeVars,
		];

		return $this->resolvedConfig;
	}

	/**
	 * @param IContextSource $context
	 * @return array<string,mixed>|null
	 */
	private function getResolvedWikiOverlay( IContextSource $context ): ?array {
		$pageName = (string)$context->getConfig()->get( 'SaintapediaDrilldownConfigPage' );
		if ( $pageName === '' ) {
			return null;
		}

		$title = Title::makeTitleSafe( NS_MEDIAWIKI, $pageName );
		if ( $title === null ) {
			return null;
		}

		// READ_LATEST avoids stale LinkCache/APCu page_latest after config edits
		// (other PHP-FPM workers can otherwise serve the previous revid for a while).
		$revId = (int)$title->getLatestRevID( IDBAccessObject::READ_LATEST );
		if ( $revId <= 0 ) {
			return null;
		}

		$cache = MediaWikiServices::getInstance()->getMainWANObjectCache();
		$key = $cache->makeKey(
			'saintapediadrilldown-wiki-overlay',
			self::CACHE_VERSION,
			$revId
		);

		/** @var array<string,mixed>|false $overlay */
		$overlay = $cache->getWithSetCallback(
			$key,
			self::CACHE_TTL,
			function () use ( $title, $revId ) {
				$revLookup = MediaWikiServices::getInstance()->getRevisionLookup();
				$revision = $revLookup->getRevisionById( $revId, IDBAccessObject::READ_LATEST )
					?? $revLookup->getRevisionByTitle( $title, 0, IDBAccessObject::READ_LATEST );
				if ( $revision === null ) {
					// false = do not cache a negative result under this revid
					return false;
				}

				$content = $revision->getContent( SlotRecord::MAIN );
				if ( $content === null ) {
					return false;
				}

				$parsed = $this->parseJsonConfig( $content->getText() );
				// Cache an empty array for invalid JSON so we don't re-parse every request;
				// caller treats [] as "no overlay".
				return $parsed ?? [];
			}
		);

		if ( !is_array( $overlay ) || $overlay === [] ) {
			return null;
		}

		return $overlay;
	}

	/**
	 * @param string $text
	 * @return array<string,mixed>|null
	 * @internal For unit tests
	 */
	public function parseJsonConfig( string $text ): ?array {
		$text = trim( $text );
		if ( $text === '' ) {
			return null;
		}

		// Allow wikitext wrappers (<pre>, nowiki) — extract the JSON object.
		if ( preg_match( '/\{.*\}/s', $text, $matches ) ) {
			$text = $matches[0];
		}

		$decoded = json_decode( $text, true );
		if ( !is_array( $decoded ) ) {
			wfDebugLog( 'SaintapediaDrilldown', 'Failed to parse MediaWiki:SaintapediaDrilldown-config as JSON.' );
			return null;
		}

		return $decoded;
	}

	private function normalizeThemeName( string $theme ): string {
		$theme = strtolower( trim( $theme ) );
		if ( $theme === '' || !isset( self::THEME_PRESETS[$theme] ) ) {
			return 'default';
		}
		return $theme;
	}

	/**
	 * @param string $theme
	 * @param mixed $wikiVars
	 * @return array<string,string>
	 */
	private function resolveThemeVars( string $theme, $wikiVars ): array {
		$base = self::THEME_PRESETS[$theme] ?? self::THEME_PRESETS['default'];
		if ( !is_array( $wikiVars ) ) {
			return $base;
		}

		$allowed = [
			'gap', 'radius', 'filterBg', 'filterBorder', 'chipBg', 'chipBorder',
			'chipText', 'toggleBg', 'toggleText', 'activeBarBg', 'stickyTop',
		];

		foreach ( $allowed as $key ) {
			if ( !isset( $wikiVars[$key] ) ) {
				continue;
			}
			$value = trim( (string)$wikiVars[$key] );
			if ( $value === '' || !$this->isSafeCssValue( $value ) ) {
				continue;
			}
			$base[$key] = $value;
		}

		return $base;
	}

	/**
	 * Reject values that could break out of a CSS declaration.
	 */
	private function isSafeCssValue( string $value ): bool {
		if ( strlen( $value ) > 64 ) {
			return false;
		}
		// Allow hex colours, rgb/rgba, simple lengths, and keyword-like tokens.
		return (bool)preg_match(
			'/^(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[0-9.]+(?:px|em|rem|%)?|[a-zA-Z][a-zA-Z0-9_-]*)$/',
			$value
		);
	}
}
