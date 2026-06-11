# Changelog

All notable changes are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.2.0] — Unreleased

### Fixed

- **Fatal error on MW 1.39/1.40:** `MediaWiki\Config\Config` constructor injection
  replaced with `$out->getConfig()` (works on all supported MW versions)
- **Chip-removal corrupts multi-value filters:** URL rebuilding now uses
  `URLSearchParams` round-trip instead of jQuery `$.param` object serialization,
  which was renaming `key=a&key=b` to `key[]=a&key[]=b`
- **Stale `_offset` on filter change:** pagination offset is now reset whenever a
  filter is added, removed, or cleared, preventing empty result pages
- **MW reserved params chipped and destroyed:** `uselang`, `useskin`, `debug`,
  `safemode`, `printable`, `variant`, and other MW params are never rendered as
  chips and are always passed through in rebuilt URLs
- **Layout FOUC / CSS-only JS failure:** styles are now loaded render-blocking via
  `addModuleStyles`; a static `@media (max-width: 719px)` fallback restores mobile
  layout when JS is absent or fails
- **Mobile toggle created on layout failure:** toggle and breakpoint watcher are now
  only created when the flex wrapper succeeds
- **Toggle initial state set during construction:** initial state is now driven by the
  first `onBreakpoint(mq)` tick so no stale `aria-expanded` value is briefly set
- **Duplicate-ID risk:** `filtersEl.id` assignment now checks for existing elements
  before using the default ID
- **Config values trusted blindly:** `SidebarWidth` is clamped to `[120, 800]` and
  `MobileBreakpoint` to `[320, 1600]`; `wfLogWarning` is emitted on clamp
- **Chip text hard-codes English punctuation:** display text and aria-labels now use
  parameterized `mw.msg()` calls (`$1: $2`) so translators control ordering
- **`margin-left` on chips bar:** replaced with `margin-inline-start` for RTL support
- **Raw `localStorage`:** replaced with `mw.storage` for quota/availability handling;
  storage key is namespaced by `wgWikiID` to prevent cross-wiki collisions on farms

### Added

- `package-lock.json` committed; CI now uses `npm ci`
- Dependabot configuration for npm and GitHub Actions ecosystems
- Unit tests for all URL-manipulation helpers (`tests/url-helpers.test.js`, 14 cases)
- `SECURITY.md` with vulnerability-reporting contact
- `CHANGELOG.md` (this file)
- Focus-visible ring on mobile toggle button

## [0.1.1] — 2026-06-10

### Fixed

- Added missing `MessagesDirs` to `extension.json` (all i18n messages were broken
  on every install)
- Fixed `title=` param appearing as a filter chip on non-short-URL wikis
- Fixed broken chip navigation on non-short-URL wikis; switched to `mw.util.getUrl()`
- Fixed breakpoint watcher overwriting stored mobile preference on desktop loads
- Removed `applyFlexLayout` ancestor-walk fallback that could flex unrelated content
- Special-page detection uses `Title::isSpecial()` instead of fragile string compare
- Removed hardcoded CSS `@media` block; JS became single source of truth (reverted in 0.2.0)
- Fixed accessibility: chip aria-labels, chips bar region/landmark, `100vh` dvh fallback
- Removed deprecated `use OutputPage` / `use Skin` root-namespace imports
- Removed deprecated `targets` ResourceLoader key
- Pinned Cargo dependency to `>= 3.0`

### Added

- Toolchain: ESLint, Stylelint, banana-checker, phpcs, GitHub Actions CI
- `.gitignore`

## [0.1.0] — 2026-06-08

### Added

- Initial release: sidebar layout, sticky filters, active-filter chips, mobile toggle
