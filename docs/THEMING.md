# PxD Theming Reference (THEMING.md)

PxD uses CSS custom properties (design tokens) applied to `:root` at boot
time by `pxd.js`, from a flat token object resolved at **package time** by
`scripts/package.js` from `room.json → theme`.

## Named themes

`theme` is either a string naming a shipped theme, or an object:

```jsonc
"theme": "midnight-teal"
// or, with overrides and custom fonts:
"theme": {
  "base": "midnight-teal",
  "overrides": { "accent": "#44e0cc" },
  "fonts": [ { "family": "MyFont", "src": "fonts/MyFont.woff2" } ]
}
```

Shipped themes live in `apps/PxD/themes/<name>/theme.json`, each a flat
`{ "tokens": { ...all fields from the table below... } }` object:

| Theme | Style |
|---|---|
| `midnight-teal` | Cool dark blue/teal — general-purpose default |
| `haunted-manor` | Dark maroon/gold — gothic/horror rooms |
| `crimson-gold` | Deep red/gold — heist/adventure rooms |
| `parchment-light` | Warm light parchment — bright/vintage-paper rooms |
| `moscow-burgundy` | SpyCatcher Moscow — burgundy/black, parchment forms, Russo One + Special Elite |

## Theme Viewer

Compare shipped themes in the browser:

```bash
cd /opt/paradox/apps/PxD
python3 -m http.server 9090
# open http://<host>:9090/tools/theme-viewer.html
# or  http://<host>:9090/tools/theme-viewer.html?theme=haunted-manor
```

The dropdown switches `themes/<name>/theme.json` core + chrome tokens (and fonts).
A **Fonts** panel near the top shows `fontTitle` / `fontBody` / `fontMono` samples
and per-theme font-pair cards (first card = shipped default; alternates are free
OFL/Apache faces under `tools/theme-viewer-fonts/`).

Chrome tokens (alerts, buttons, forms, emergency, status) ship in each
`theme.json`. Emergency and game-status palettes are intentionally the same
across all shipped themes.

If `theme` is omitted, `base` is unrecognized, or plain per-token values are
given directly as the `theme` object (legacy v1 style, no `base`), the
packager falls back to PxD's built-in defaults (the "Default" column below)
merged with whatever tokens were supplied.

**Accessibility rule:** every theme (shipped or custom) must keep `ink`
text readable against `panel`/`bgColor*` (WCAG AA, ≥4.5:1 for body text),
and keep `warn` and `danger` each ≥3:1 against the background AND clearly
distinguishable from each other (don't rely on hue alone — verify via a
contrast-ratio calculation, not just visual judgment). All 4 shipped themes
were verified this way.

## Token reference

| Token | CSS property | room.json field | Default |
|---|---|---|---|
| `--pxd-bg-1` | background 1 | `bgColor1` | `#0c0c0e` |
| `--pxd-bg-2` | background 2 | `bgColor2` | `#1a1a20` |
| `--pxd-bg-3` | background 3 (page gradient base) | `bgColor3` | `#252530` |
| `--pxd-panel` | panel background | `panel` | `rgba(20,20,28,0.85)` |
| `--pxd-panel-border` | panel border colour | `panelBorder` | `rgba(200,200,220,0.20)` |
| `--pxd-ink` | primary text colour | `ink` | `#e8e8f0` |
| `--pxd-ink-soft` | secondary text colour | `inkSoft` | `#a0a0b8` |
| `--pxd-accent` | primary accent (buttons, focus rings) | `accent` | `#6f99c8` |
| `--pxd-accent-alt` | secondary accent | `accentAlt` | `#7dc989` |
| `--pxd-warn` | warning colour | `warn` | `#f5c842` |
| `--pxd-danger` | danger colour | `danger` | `#e06060` |
| `--pxd-radius` | panel border-radius | `radius` | `14px` |
| `--pxd-shadow` | panel box-shadow | `shadow` | `0 12px 28px rgba(0,0,0,0.35)` |
| `--pxd-font-title` | title/heading font stack (panel titles, h1-h5) | `fontTitle` | `Arial, sans-serif` |
| `--pxd-font-body` | body font stack (everything else: labels, buttons, inputs) | `fontBody` | `Arial, sans-serif` |
| `--pxd-font-mono` | plain system-monospace fallback, error/debug text only | `fontMono` | `'Courier New', monospace` |
| `--pxd-bg-glow-1` | first background radial glow colour | `bgGlow1` | `transparent` |
| `--pxd-bg-glow-2` | second background radial glow colour | `bgGlow2` | `transparent` |

`bgGlow1` and `bgGlow2` should be full `rgba()` strings — they are used directly as colour stops in the
page background radial gradients and the hero glow. Example values:

```json
"bgGlow1": "rgba(68, 224, 204, 0.20)",
"bgGlow2": "rgba(109, 231, 154, 0.17)"
```

Leave them unset (or omit) if you want a flat gradient background with no ambient glow.

## The 2-font rule

By design, a theme should declare **at most two custom display faces**:

- **`fontTitle`** — used for panel titles (`.panel-title`) and heading tags
  (`h1`-`h5`). Pick something with presence/character — this is where a
  theme's "vibe" shows most.
- **`fontBody`** — used for everything else: body text, form labels, button
  labels, inputs. Should stay readable at small sizes since it carries most
  of the UI's actual text.

Any "in-between" element (subheadings, `h6`, small print) intentionally has
no font-family rule of its own and inherits `fontBody` from `body` — reuse
one of the two rather than introducing a third face. `fontMono` is a plain
system-monospace fallback used only for the rare pane-load-error placeholder;
it isn't part of this budget and rarely needs a custom face.

## Custom web fonts — packaged with the theme

A named theme can ship its own font **files**, not just font-family names.
Put them in `apps/PxD/themes/<name>/fonts/`, and declare them in
`themes/<name>/theme.json` alongside `tokens`:

```jsonc
{
  "name": "haunted-manor",
  "tokens": {
    "fontTitle": "URWAlgerian, Georgia, serif",
    "fontBody": "AlmendraSC, Georgia, serif",
    ...
  },
  "fonts": [
    { "family": "URWAlgerian", "src": "fonts/URWAlgerian.ttf", "weight": "normal", "style": "normal" },
    { "family": "AlmendraSC", "src": "fonts/AlmendraSC-Regular.woff2", "weight": "normal", "style": "normal" }
  ]
}
```

The packager copies `themes/<name>/fonts/*` into every site that uses this
theme, and merges the theme's `fonts[]` into the room's own
`room.json → theme.fonts` (matched by `family` — a room can add an extra
face or override a theme font's `src` without losing the theme's fonts).
Always declare a plausible **system-font fallback** after the custom family
(`, Georgia, serif` etc.) in the token value itself, in case the font file
fails to load. `pxd.js` injects a `<style>` tag with `@font-face` rules at
boot from the merged font list; `src` is relative to the site's output root.

A room can still declare its own one-off fonts (not tied to any shipped
theme) in `room.json → theme.fonts`, with matching files in
`rooms/<game>/pxd/fonts/` — these are copied to the output `fonts/`
directory the same way, and layer on top of the theme's own fonts.

## Applying tokens in CSS

All structural CSS in `pxd-base.css` references tokens. Custom panel CSS should also use tokens:

```css
.my-panel {
  background: var(--pxd-panel);
  border: 1px solid var(--pxd-panel-border);
  border-radius: var(--pxd-radius);
  color: var(--pxd-ink);
  font-family: var(--pxd-font-body);
}
.my-panel-title {
  font-family: var(--pxd-font-title);
}
```

## Contrast helper

`PxD.utils.getContrastColor(hexColor)` returns `"#000000"` or `"#ffffff"` based on the perceived luminance of `hexColor`. Useful for setting text colour on dynamically coloured buttons (lighting scenes).


## Extended chrome tokens (v2)

In addition to the core palette above, themes may (and shipped themes do)
set chrome tokens consumed by `pxd-base.css` and pane scripts:

| Group | Examples | Notes |
|---|---|---|
| Accent text | `accentInk` | Ink on primary buttons |
| Forms | `formBg`, `formInk`, `formPlaceholder`, `formBorder`, `formBgFocus`, `formBgDisabled`, `formInkDisabled` | Inputs/selects/textareas |
| Disabled game select | `selectDisabledBg`, `selectDisabledInk`, `selectDisabledBorder` | `#gameSelect:disabled` |
| Alerts | `alertInfo*`, `alertWarning*`, `alertSuccess*`, `alertDanger*`, `alertSecondary*` | Each has Bg/Border/Ink |
| Warnings log | `warningsBg`, `warningsBorder`, `warningsInk`, `warningsActiveBg`, `warningsActiveInk`, `zoneUp`, `zoneDown` | System pane |
| Buttons | `btnSuccess*`, `btnDanger*`, `btnInfo*`, `btnWarning*`, `btnSecondary*` | Danger matches alert-danger; Warning matches emergency Restart Software |
| Hint caution | `hintWarnBg`, `hintWarnInk` | Send Hint flash when clock visibility unknown |
| Emergency (standard) | `emerAbort*`, `emerSleep*`, … | Same values in every shipped theme |
| Game status (standard) | `statusReady*`, `statusFailed*`, … | Same values in every shipped theme |

Use `tools/theme-viewer.html` to compare themes and try alternate free font pairs.
