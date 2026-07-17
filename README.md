# SaintapediaDrilldown

A [MediaWiki](https://www.mediawiki.org/) extension that modernises the faceted-search UI of the [Cargo](https://www.mediawiki.org/wiki/Extension:Cargo) extension's `Special:Drilldown` page for [Saintapedia](https://saintapedia.org).

## Features

| Feature | Description |
|---------|-------------|
| **Sidebar layout** | Filter panel moves to a fixed-width left sidebar; the results area expands to fill the remaining width. |
| **Sticky filters** | The sidebar scrolls independently, staying visible as the user scrolls through long result sets. |
| **Active-filter chips** | Removable tags appear above results showing every currently-applied filter. A *Clear all filters* link appears when more than one filter is active. |
| **Mobile toggle** | Below the configurable breakpoint the layout stacks vertically (results on top, filters below a *Show/Hide filters* button). |
| **Wiki config** | Admins can tune layout and theme from `MediaWiki:SaintapediaDrilldown-config` (JSON) without redeploying PHP. |
| **Themes** | Built-in `default` / `soft` / `compact` presets, plus per-token colour overrides. |
| **Zero core changes** | Works entirely via JavaScript DOM-wrapping and scoped CSS — no Cargo or MediaWiki core files are modified. |

---

## Screenshots

> *(Add before/after screenshots here once deployed.)*

---

## Dependencies

| Dependency | Minimum version | Notes |
|------------|-----------------|-------|
| [MediaWiki](https://www.mediawiki.org/wiki/Download) | **1.39** | Uses `HookHandlers` registration; config is read via `OutputPage::getConfig()` so no service wiring is required |
| [Cargo](https://www.mediawiki.org/wiki/Extension:Cargo) | **>= 3.0** | Provides `Special:Drilldown` and the `.drilldown-filters` / `.drilldown-results` DOM class names this extension targets. These are an undocumented contract; a browser console warning identifies missing selectors if Cargo changes them. |
| PHP | **7.4+** | Compatible with PHP 7.4 and 8.x |

> **Skin compatibility** — tested against Vector (legacy) and Vector 2022. Should work with any skin because the extension locates Cargo's elements by class name rather than a fixed DOM path.

---

## Installation

### 1 — Download the extension

**Option A — Git clone (recommended)**

```bash
cd /path/to/your/wiki/extensions
git clone https://github.com/Saintapedia/SaintapediaDrilldown.git SaintapediaDrilldown
```

**Option B — Download ZIP**

Download from GitHub and extract so the folder is named `SaintapediaDrilldown` inside `extensions/`.

### 2 — Register the extension

Add the following line to `LocalSettings.php` **after** the Cargo `wfLoadExtension` call:

```php
wfLoadExtension( 'SaintapediaDrilldown' );
```

> **Canasta users (user-extensions):** Do not edit `LocalSettings.php` inside the
> container. This extension is a [user extension](https://canasta.wiki/wiki/Help:Extensions_and_skins#Adding_extensions_not_bundled_with_Canasta):
>
> 1. Clone or copy into your instance's host `extensions/SaintapediaDrilldown/`
> 2. Enable Cargo first: `canasta extension enable Cargo`
> 3. Create `config/settings/global/SaintapediaDrilldown.php`:
>    ```php
>    <?php
>    wfLoadExtension( 'SaintapediaDrilldown' );
>    ```
> 4. `canasta restart`
>
> To disable: remove that settings file and restart. Optional: `install.sh` automates the same steps.

### 3 — Clear caches

```bash
php maintenance/update.php
# Or on newer MediaWiki:
php maintenance/run.php update
```

This step is optional — no database schema changes are made and ResourceLoader picks up new modules automatically — but it is harmless and clears any stale caches.

---

## Configuration

Settings resolve in this order:

1. **`MediaWiki:SaintapediaDrilldown-config`** (JSON on the wiki) — preferred for day-to-day polish
2. **`$wg*` in `LocalSettings.php`** — defaults and server-side lock-in
3. Extension defaults

### Wiki config page (recommended)

Create or edit `MediaWiki:SaintapediaDrilldown-config` with a JSON object. Example:

```json
{
  "sidebarWidth": 300,
  "showFilterChips": true,
  "stickyFilters": true,
  "stickyChips": true,
  "pillChips": true,
  "mobileBreakpoint": 720,
  "theme": "soft",
  "themeVars": {
    "stickyTop": "3.5em",
    "radius": "10px",
    "filterBg": "#f4f7fb"
  }
}
```

| Key | Type | Notes |
|-----|------|--------|
| `enabled` | bool | Master switch (same as `$wgSaintapediaDrilldownSidebarEnabled`) |
| `sidebarWidth` | int | 120–800 px |
| `showFilterChips` | bool | Active-filter chips |
| `stickyFilters` | bool | Sticky sidebar |
| `stickyChips` | bool | Sticky chips bar (desktop) |
| `pillChips` | bool | Pill-shaped chips |
| `mobileBreakpoint` | int | 320–1600 px |
| `theme` | string | `default`, `soft`, or `compact` |
| `themeVars` | object | Optional CSS tokens: `gap`, `radius`, `filterBg`, `filterBorder`, `chipBg`, `chipBorder`, `chipText`, `toggleBg`, `toggleText`, `activeBarBg`, `stickyTop` |

A sample file ships at `config/example-SaintapediaDrilldown-config.json`.

You can wrap the JSON in `<pre>` or `<nowiki>` if preferred; the extension extracts the first `{…}` object.

Disable wiki overrides with:

```php
$wgSaintapediaDrilldownConfigPage = '';
```

---

### `$wgSaintapediaDrilldownSidebarEnabled`

| Type | Default |
|------|---------|
| `bool` | `true` |

Master switch. Set to `false` to completely disable the extension without removing it.

```php
$wgSaintapediaDrilldownSidebarEnabled = true;
```

---

### `$wgSaintapediaDrilldownSidebarWidth`

| Type | Default | Valid range |
|------|---------|-------------|
| `int` (pixels) | `280` | `120`–`800` |

Width of the filter sidebar on desktop viewports. Values outside the valid range are clamped and a warning is written to the MediaWiki log. The results area automatically fills the remaining space.

```php
$wgSaintapediaDrilldownSidebarWidth = 300;
```

You can also override this with a CSS custom property in `MediaWiki:Common.css` without touching PHP:

```css
.cargo-drilldown-layout {
    --cargo-sidebar-width: 320px;
}
```

---

### `$wgSaintapediaDrilldownShowFilterChips`

| Type | Default |
|------|---------|
| `bool` | `true` |

When enabled, a row of removable "chip" tags appears above the results listing every active URL filter. Each chip has an `×` link that removes only that filter. When more than one filter is active a *Clear all filters* link appears at the right.

```php
$wgSaintapediaDrilldownShowFilterChips = true;
```

---

### `$wgSaintapediaDrilldownStickyFilters`

| Type | Default |
|------|---------|
| `bool` | `true` |

When enabled the sidebar scrolls independently of the results column using `position: sticky`, keeping filters visible at all times on desktop.

```php
$wgSaintapediaDrilldownStickyFilters = true;
```

---

### `$wgSaintapediaDrilldownMobileBreakpoint`

| Type | Default | Valid range |
|------|---------|-------------|
| `int` (pixels) | `720` | `320`–`1600` |

Viewport width below which the layout switches from side-by-side to stacked. Values outside the valid range are clamped and a warning is written to the MediaWiki log. At narrow widths the results move to the top and the filter sidebar is hidden behind a *Show filters* toggle button.

**Pre-JS stacking fallback:** At the default 720 px breakpoint, the stylesheet includes a static `@media (max-width: 719px)` block that forces block layout on Cargo's pre-JS markup, reducing the layout flash before JavaScript runs. This fallback applies **only at 720 px**; wikis that set a custom breakpoint rely on the PHP inline `@media` block emitted after the JS flex wrapper is created. In both cases the *results-first* visual ordering is only established once JS runs — DOM order before that may differ briefly.

```php
$wgSaintapediaDrilldownMobileBreakpoint = 720;
```

---

### `$wgSaintapediaDrilldownStickyChips` / `$wgSaintapediaDrilldownPillChips`

| Variable | Default |
|----------|---------|
| `$wgSaintapediaDrilldownStickyChips` | `true` |
| `$wgSaintapediaDrilldownPillChips` | `true` |

Sticky chips keep the active-filter bar visible while scrolling results (desktop). Pill chips use a fully rounded chip shape.

---

### `$wgSaintapediaDrilldownTheme`

| Type | Default | Values |
|------|---------|--------|
| `string` | `default` | `default`, `soft`, `compact` |

```php
$wgSaintapediaDrilldownTheme = 'soft';
```

---

### `$wgSaintapediaDrilldownConfigPage`

| Type | Default |
|------|---------|
| `string` | `SaintapediaDrilldown-config` |

MediaWiki-namespace page title (without the `MediaWiki:` prefix) that holds JSON overrides. Set to `''` to ignore wiki config.

---

## How It Works

### PHP — `includes/Hooks.php` + `SaintapediaDrilldownConfigService`

Implements `BeforePageDisplay`. On any `Special:Drilldown` or `Special:Drilldown/*` request it:

1. Merges wiki JSON config with `$wg*` defaults (WAN-cached by page revid).
2. Forwards layout options to the browser as `mw.config` values.
3. Emits theme CSS custom properties and the mobile `@media` breakpoint inline.
4. Queues the `ext.SaintapediaDrilldown` ResourceLoader module.

The module is **only loaded on drilldown pages**, keeping its footprint zero on all other pages.

### JavaScript — `modules/ext.SaintapediaDrilldown.js`

Runs after content is ready via `mw.hook('wikipage.content')`.

1. **Flex wrapper** — Locates `.drilldown-filters` and `.drilldown-results` inside `#mw-content-text`. Cargo nests `.drilldown-filters` inside `.drilldown-results`; the extension extracts it and builds a new `<div class="cargo-drilldown-layout">` flex container with the filters as a sidebar and the remaining results content in a `.drilldown-results-content` column. If either element is missing, the module returns early: sidebar layout, mobile toggle, and filter chips are all skipped (a console warning identifies the problem).

2. **Filter chips** — Only runs after a successful flex layout. Parses `window.location.search` and renders a labelled chip for every user-applied filter into `.drilldown-results-content`. Cargo-internal params (those beginning with `_`) and a reserved list of MediaWiki params (`title`, `action`, `uselang`, `useskin`, `debug`, …) are skipped — with one exception: `_search_*` text-search params **do** render as chips ("Name (search)"). Bracket-indexed range params (`Date[0]`/`Date[1]`) are grouped into a single chip ("Date: 2020 → 2021") whose `×` removes all bounds. Chip URLs are rebuilt with a `URLSearchParams` round-trip, which preserves repeated and bracketed keys byte-for-byte and works on both short-URL and `index.php?title=` wikis; removing or clearing filters also resets `_offset` so pagination never points at an empty page.

3. **Mobile toggle** — Inserts a `<button class="cargo-filters-toggle">` directly before the sidebar. Hidden by default in CSS; shown at mobile breakpoints via PHP inline `@media` once the flex wrapper exists. Toggles the `cargo-filters-collapsed` class on the sidebar. The `.cargo-mobile-layout` class (added by the JS `matchMedia` watcher) owns toggle *state* and suppresses sticky positioning on mobile — it is not the source of toggle visibility. State is persisted via `mw.storage` under a key namespaced by wiki ID (safe on wiki farms), and **only when the user explicitly clicks the button**; the breakpoint watcher never overwrites the stored preference.

### CSS — `modules/ext.SaintapediaDrilldown.css`

Layout and toggle selectors are scoped to `.cargo-drilldown-layout`; chip selectors are scoped to `.drilldown-results-content` (the JS-created results column inside the flex layout). When layout cannot be created the module returns early and chips are not rendered either. **No other wiki page is affected.**

- CSS custom properties (`--cargo-sidebar-width`, `--cargo-filter-bg`, etc.) allow visual tweaks from `MediaWiki:Common.css` without editing extension files.
- `position: sticky` is applied via the `.cargo-filters-sticky` class (added by JS when `$wgSaintapediaDrilldownStickyFilters = true`), and is only active when the `.cargo-mobile-layout` class is absent.
- Mobile visual layout is driven by a PHP inline `@media` block (always emitted) and, at the default 720 px breakpoint, a static pre-JS `@media` block in the stylesheet that stacks Cargo's raw elements before JS runs. The `.cargo-mobile-layout` class (toggled by the JS `matchMedia` watcher) owns toggle state and suppresses sticky positioning on mobile; it is not the source of visual stacking rules. **Full results-first ordering requires JavaScript.**

---

## Customisation

### Changing colours

Prefer `theme` / `themeVars` in `MediaWiki:SaintapediaDrilldown-config`. You can still override CSS custom properties in `MediaWiki:Common.css`:

```css
.cargo-drilldown-layout {
    --cargo-filter-bg:      #f0f4f8;   /* sidebar background */
    --cargo-filter-border:  #c8d0d8;   /* sidebar border */
    --cargo-chip-bg:        #ffffff;   /* chip background */
    --cargo-chip-border:    #5b8dbe;   /* chip border */
    --cargo-chip-text:      #0645ad;   /* chip link colour */
    --cargo-toggle-bg:      #2a6496;   /* mobile button background */
    --cargo-active-bar-bg:  #ddeeff;   /* chips bar background */
    --cargo-radius:         8px;       /* corners */
    --cargo-sticky-top:     3.5em;     /* Vector 2022 sticky header offset */
}
```

### Changing the sidebar width without PHP

```css
body.special-SpecialDrilldown .cargo-drilldown-layout {
    --cargo-sidebar-width: 340px;
}
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Sidebar doesn't appear; filters still above results | Cargo selectors not matching | Open DevTools → Console; a `SaintapediaDrilldown:` warning will name the missing selector if the elements were not found. |
| Table tabs become a vertical list | Cargo 3.x nests the tabs inside `.drilldown-results`; extension restructures the DOM at runtime to hoist tabs above the flex container. Ensure you are running v0.4+. | `git pull` in the extension directory and restart containers. |
| Layout unchanged despite extension loading | Custom drilldown CSS in `MediaWiki:Common.css` conflicting with the extension's styles | Remove or comment out any old rules targeting `.drilldown-filters` / `.drilldown-results`. |
| Filter chips not showing | No active URL filters | Click a filter value on the drilldown; chips appear once filters are applied. |
| Extension module not loading | `wfLoadExtension` missing or wrong order | Confirm `LocalSettings.php` edit; Cargo must load before SaintapediaDrilldown. |
| Sticky sidebar overlaps wiki header | Skin has a sticky top bar (e.g. Vector 2022) | Add to `MediaWiki:Common.css`: `.drilldown-filters.cargo-filters-sticky { top: 3.5em; }` |

---

## Contributing

Pull requests and issues are welcome at [github.com/Saintapedia/SaintapediaDrilldown](https://github.com/Saintapedia/SaintapediaDrilldown).

When submitting a PR please:
- Keep all CSS rules scoped to `.cargo-drilldown-layout`.
- Test on at least one desktop and one mobile viewport.
- Update this README if you add or change a `$wg*` variable.

---

## License

[MIT](LICENSE)
