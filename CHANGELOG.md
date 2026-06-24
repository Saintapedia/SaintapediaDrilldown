# Changelog

All notable changes are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.5.0] — 2026-06-24

### Fixed

- **`insertBefore` parent mismatch (sidebar never rendered)** — `applyFlexLayout()`
  was calling `contentEl.insertBefore(filtersEl, resultsEl)` where `contentEl` is
  `#mw-content-text`, but `filtersEl.parentElement` is `div.mw-spcontent` (a
  grandchild of `#mw-content-text`). Browsers silently ignore `insertBefore` when
  the reference node is not a direct child of the target parent, so the sidebar flex
  wrapper was never created. Fix: operate on `mw-spcontent` as the reference parent —
  hoist tabs and insert the flex wrapper inside it, then drain its remaining children
  into a new `.drilldown-results-content` div. All CSS and mobile PHP selectors
  updated from `.drilldown-results` to `.drilldown-results-content` accordingly.

## [0.4.0] — 2026-06-24

### Fixed

- **Cargo 3.x DOM compatibility** — Cargo 3.5.x nests `.drilldown-filters-wrapper`
  *inside* `.drilldown-results` rather than alongside it, so `applyFlexLayout()`
  always bailed (sibling check failed) and no sidebar ever appeared. The init
  function now extracts the filters wrapper out of results, hoists the
  `#drilldown-tables-tabs-wrapper` above the flex container (fixes tabs → vertical
  list regression), and builds the sidebar layout correctly on the real Cargo DOM.
- **Canasta boot-time 500 fix** — removed the hard `"Cargo": ">= 3.0"` requirement
  from `extension.json`; replaced with a runtime `ExtensionRegistry::isLoaded()`
  check that logs a warning instead of fataling when Canasta's settings-file load
  order places SaintapediaDrilldown before Cargo.

## [0.3.0] — 2026-06-22

### Fixed

- **README corrections** — six claims described code that 0.2.0 had replaced:
  constructor DI (removed; config read via `$out->getConfig()`), a no-JS 720px
  CSS fallback (mobile layout is JS-driven), chip URLs via `mw.util.getUrl()`
  (now `URLSearchParams` round-trip; `_search_*` and bracket-range behaviour now
  documented), state in raw localStorage (now `mw.storage`, wiki-namespaced),
  chips/toggle rendering after layout failure (extension backs off entirely),
  and "same license as Cargo" (Cargo is GPL-2.0+; this extension is MIT).
  Saintapedia-specific old-CSS removal section dropped from Installation.

### Changed

- **Extension renamed SaintapediaSort → SaintapediaDrilldown** (better describes
  what it does). Breaking for any existing install: PHP namespace, module names
  (`ext.SaintapediaDrilldown*`), all `$wgSaintapediaDrilldown*` config variables,
  i18n message keys, and the `wfLoadExtension( 'SaintapediaDrilldown' )` entry
  point all change; the extension directory must be named `SaintapediaDrilldown`.
  No install existed before the rename, so no migration path is provided.

- **CSS linting migrated from grunt-stylelint to the stylelint CLI**
  (`npm run lint:css`), unblocking the `stylelint-config-wikimedia`
  0.16 → 0.19.2 bump (stylelint 17.6). grunt-stylelint 0.19 cannot load ESM
  stylelint from CJS; 0.21 can (via `require(esm)`, Node ≥ 20.19.5) but
  peer-pins exactly `stylelint 17.x` — dropping the plugin removes the
  coupling entirely
- **CI Node bumped 20 → 22**: Node 20 reached end-of-life in April 2026
- Dependabot: stylelint ignore rules removed — the ignore on
  `stylelint-config-wikimedia` made Dependabot propose `grunt-stylelint` 0.21
  alone, an unresolvable combination (0.21 requires stylelint 17; config 0.16
  ships a stylelint-17-incompatible plugin). grunt-eslint major ignore
  re-documented — the actual blocker is that `eslint-config-wikimedia` has no
  ESLint 9-compatible release yet (latest 0.32.4 peers on eslint ^8.57.0)

## [0.2.1] — 2026-06-12

### Fixed

- **phpcs violations in Hooks.php:** extra space after comma in `min()` call and
  aligned double-spacing in `@param`/`@return` docblock (PHPCS
  `Universal.WhiteSpace.CommaSpacing` and `MediaWiki.Commenting.FunctionComment`)
- **Deprecated CSS property:** `word-break: break-word` replaced with
  `overflow-wrap: break-word` (standard property, flagged by stylelint ≥ 0.17)
- **i18n:** `_search_*` chip label and range joiner (`→`) now use `mw.msg()` rather
  than hardcoded English strings; new messages `saintapediasort-search-filter-label`
  and `saintapediasort-range-value`
- **Dead `mediawiki.util` dependency** removed from `ResourceModules`

### Changed

- GitHub Actions pinned to commit SHAs (`actions/checkout` v6, `actions/setup-node` v6)
- Dependabot groups for eslint and stylelint ecosystems; ignore rules for
  `grunt-eslint` major (ESLint 9 flat-config migration needed) and
  `stylelint-config-wikimedia` minor/major (blocked until grunt-stylelint supports ESM)
- npm dependencies bumped: `eslint-config-wikimedia` 0.27→0.32.4,
  `grunt-banana-checker` 0.11→0.13.0, `grunt-jsonlint` 1.1→3.0.0

## [0.2.0] — 2026-06-10

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
- **CI never green:** ESLint `mediawiki/class-doc` error resolved (class-doc comment
  added to DOM helper listing all seven `cargo-*` classes); 39 Stylelint errors
  resolved (duplicate selector merged, single-line blocks expanded, `border:0`, short
  hex colours); `npm test` now uses `node --test` without the directory argument
  that errors on Node ≥ 22
- **`_search_*` text-filter params invisible and unclearable:** params like
  `_search_Name` now render as chips ("Name (search)") and are dropped by "Clear all
  filters"; the `FILTER_PREFIXES` constant extends this to any future Cargo
  filter-like underscore prefix
- **Bracket-range params chip individually:** `Date[0]`/`Date[1]` are now grouped into
  one chip ("Date: 2020 → 2021"); removing it drops all bound params and resets
  `_offset`
- **Dead `@media(max-width:719px)` block removed:** every selector in that block was
  scoped under `.cargo-drilldown-layout` (a JS-created class), so the block could
  never fire without JS; mobile layout is entirely JS-driven via `.cargo-mobile-layout`
- **Layout FOUC:** styles are now loaded render-blocking via `addModuleStyles` to
  avoid a visible pop when JS applies the flex layout
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
- `buildRemoveFamilySearch` helper for removing all params of a bracket family
- Unit tests for all URL-manipulation helpers (`tests/url-helpers.test.js`, 18 cases)
- `SECURITY.md` with vulnerability-reporting contact
- `CHANGELOG.md` (this file)
- Focus-visible ring on mobile toggle button

## [0.1.1] — 2026-06-10

### Fixed

- Added missing `MessagesDirs` to `extension.json` (all i18n messages were broken
  on every install)
- Fixed `title=` param appearing as a filter chip on non-short-URL wikis
- Fixed broken chip navigation on non-short-URL wikis; chip URLs were temporarily
  built using `mw.util.getUrl()` (superseded by `URLSearchParams` round-trip in 0.2.0)
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
