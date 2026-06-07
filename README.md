# SaintapediaSort

A [MediaWiki](https://www.mediawiki.org/) extension that modernises the faceted-search UI of the [Cargo](https://www.mediawiki.org/wiki/Extension:Cargo) extension's `Special:Drilldown` page for [Saintapedia](https://saintapedia.org).

## Features

| Feature | Description |
|---------|-------------|
| **Sidebar layout** | Filter panel moves to a fixed-width left sidebar; the results area expands to fill the remaining width. |
| **Sticky filters** | The sidebar scrolls independently, staying visible as the user scrolls through long result sets. |
| **Active-filter chips** | Removable tags appear above results showing every currently-applied filter. A *Clear all filters* link appears when more than one filter is active. |
| **Mobile toggle** | Below the configurable breakpoint the layout stacks vertically (results on top, filters below a *Show/Hide filters* button). |
| **Zero core changes** | Works entirely via JavaScript DOM-wrapping and scoped CSS — no Cargo or MediaWiki core files are modified. |

---

## Screenshots

> *(Add before/after screenshots here once deployed.)*

---

## Dependencies

| Dependency | Minimum version | Notes |
|------------|-----------------|-------|
| [MediaWiki](https://www.mediawiki.org/wiki/Download) | **1.39** | Uses constructor dependency injection for hooks |
| [Cargo](https://www.mediawiki.org/wiki/Extension:Cargo) | any | Provides `Special:Drilldown` and the `.drilldown-filters-wrapper` / `.drilldown-results` DOM elements this extension targets |
| PHP | **7.4+** | Compatible with PHP 7.4 and 8.x |

> **Skin compatibility** — tested against Vector (legacy) and Vector 2022. Should work with any skin because the extension locates Cargo's elements by class name rather than a fixed DOM path.

---

## Installation

### 1 — Download the extension

**Option A — Git clone (recommended)**

```bash
cd /path/to/your/wiki/extensions
git clone https://github.com/Saintapedia/SaintapediaSearch.git SaintapediaSort
```

**Option B — Download ZIP**

Download from GitHub and extract so the folder is named `SaintapediaSort` inside `extensions/`.

### 2 — Register the extension

Add the following line to `LocalSettings.php` **after** the Cargo `wfLoadExtension` call:

```php
wfLoadExtension( 'SaintapediaSort' );
```

### 3 — Clear caches

```bash
php maintenance/update.php
# Or on newer MediaWiki:
php maintenance/run.php update
```

No database schema changes are made; this step simply clears the ResourceLoader cache.

### 4 — Remove conflicting CSS (Saintapedia-specific)

The old drilldown block in `MediaWiki:Common.css` targeted `.mw-parser-output`, which is **never present** on special pages and therefore never fired. Remove or comment it out to avoid conflicts:

```css
/* REMOVE — superseded by SaintapediaSort extension */
body.special-SpecialDrilldown #bodyContent > .mw-parser-output { … }
body.special-SpecialDrilldown .drilldown-filters-wrapper { … }
body.special-SpecialDrilldown .drilldown-results { … }
/* … and the rest of the old block … */
```

---

## Configuration

All variables can be set in `LocalSettings.php` after `wfLoadExtension( 'SaintapediaSort' );`.

### `$wgSaintapediaSortSidebarEnabled`

| Type | Default |
|------|---------|
| `bool` | `true` |

Master switch. Set to `false` to completely disable the extension without removing it.

```php
$wgSaintapediaSortSidebarEnabled = true;
```

---

### `$wgSaintapediaSortSidebarWidth`

| Type | Default |
|------|---------|
| `int` (pixels) | `280` |

Width of the filter sidebar on desktop viewports. The results area automatically fills the remaining space.

```php
$wgSaintapediaSortSidebarWidth = 300;
```

You can also override this with a CSS custom property in `MediaWiki:Common.css` without touching PHP:

```css
.cargo-drilldown-layout {
    --cargo-sidebar-width: 320px;
}
```

---

### `$wgSaintapediaSortShowFilterChips`

| Type | Default |
|------|---------|
| `bool` | `true` |

When enabled, a row of removable "chip" tags appears above the results listing every active URL filter. Each chip has an `×` link that removes only that filter. When more than one filter is active a *Clear all filters* link appears at the right.

```php
$wgSaintapediaSortShowFilterChips = true;
```

---

### `$wgSaintapediaSortStickyFilters`

| Type | Default |
|------|---------|
| `bool` | `true` |

When enabled the sidebar scrolls independently of the results column using `position: sticky`, keeping filters visible at all times on desktop.

```php
$wgSaintapediaSortStickyFilters = true;
```

---

### `$wgSaintapediaSortMobileBreakpoint`

| Type | Default |
|------|---------|
| `int` (pixels) | `720` |

Viewport width below which the layout switches from side-by-side to stacked. At narrow widths the results move to the top and the filter sidebar is hidden behind a *Show filters* toggle button.

```php
$wgSaintapediaSortMobileBreakpoint = 720;
```

---

## How It Works

### PHP — `includes/Hooks.php`

Implements `BeforePageDisplay`. On any `Special:Drilldown` or `Special:Drilldown/*` request it:

1. Reads the PHP configuration variables.
2. Forwards them to the browser as `mw.config` values.
3. Queues the `ext.SaintapediaSort` ResourceLoader module.

The module is **only loaded on drilldown pages**, keeping its footprint zero on all other pages.

### JavaScript — `modules/ext.SaintapediaSort.js`

Runs after content is ready via `mw.hook('wikipage.content')`.

1. **Flex wrapper** — Locates `.drilldown-filters-wrapper` and `.drilldown-results`. If they share a parent it wraps them in a new `<div class="cargo-drilldown-layout">` flex container; otherwise it falls back to adding the class to their nearest common ancestor.

2. **Filter chips** — Parses `window.location.search`, skips internal pagination/display params (`_offset`, `_limit`, `_format`, etc.), and renders a labelled chip for every remaining key-value pair. Clicking `×` on a chip rebuilds the URL with that parameter removed and navigates.

3. **Mobile toggle** — Inserts a `<button class="cargo-filters-toggle">` directly before the sidebar. Hidden on wide viewports via a CSS `@media` rule; shown below the breakpoint. Toggles the `cargo-filters-collapsed` class on the sidebar.

### CSS — `modules/ext.SaintapediaSort.css`

All selectors are scoped to `.cargo-drilldown-layout`, so **no other wiki page is affected**.

- CSS custom properties (`--cargo-sidebar-width`, `--cargo-filter-bg`, etc.) allow visual tweaks from `MediaWiki:Common.css` without editing extension files.
- `position: sticky` is applied via the `.cargo-filters-sticky` class (added by JS when `$wgSaintapediaSortStickyFilters = true`).
- A `@media (max-width: 719px)` block reverses the layout, reorders results above filters, and shows the toggle button.

---

## Customisation

### Changing colours

Override CSS custom properties in `MediaWiki:Common.css`:

```css
.cargo-drilldown-layout {
    --cargo-filter-bg:      #f0f4f8;   /* sidebar background */
    --cargo-filter-border:  #c8d0d8;   /* sidebar border */
    --cargo-chip-bg:        #ffffff;   /* chip background */
    --cargo-chip-border:    #5b8dbe;   /* chip border */
    --cargo-chip-text:      #0645ad;   /* chip link colour */
    --cargo-toggle-bg:      #2a6496;   /* mobile button background */
    --cargo-active-bar-bg:  #ddeeff;   /* chips bar background */
}
```

### Per-table sidebar width

```css
body.special-SpecialDrilldown .cargo-drilldown-layout {
    --cargo-sidebar-width: 340px;
}
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Sidebar doesn't appear; filters still above results | `.cargo-drilldown-layout` not added | Open DevTools → Elements; confirm `.drilldown-filters-wrapper` is in the DOM. |
| Layout unchanged despite extension loading | Old drilldown CSS block still in `MediaWiki:Common.css` | Remove the `#bodyContent > .mw-parser-output` block (Installation step 4). |
| Filter chips not showing | No active URL filters | Click a filter value on the drilldown; chips appear once filters are applied. |
| Extension module not loading | `wfLoadExtension` missing or wrong order | Confirm `LocalSettings.php` edit; Cargo must load before SaintapediaSort. |
| Sticky sidebar overlaps wiki header | Skin has a sticky top bar (e.g. Vector 2022) | Add to `MediaWiki:Common.css`: `.drilldown-filters-wrapper.cargo-filters-sticky { top: 3.5em; }` |

---

## Contributing

Pull requests and issues are welcome at [github.com/Saintapedia/SaintapediaSearch](https://github.com/Saintapedia/SaintapediaSearch).

When submitting a PR please:
- Keep all CSS rules scoped to `.cargo-drilldown-layout`.
- Test on at least one desktop and one mobile viewport.
- Update this README if you add or change a `$wg*` variable.

---

## License

[MIT](LICENSE) — same license as the Cargo extension.
