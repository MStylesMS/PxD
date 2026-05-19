# PxD Theming Reference (THEMING.md)

PxD uses CSS custom properties (design tokens) applied to `:root` at boot time by `pxd.js` from `room.json → theme`.

## Token reference

> **Note:** The current fallback values in `pxd-base.css` are Agent22-specific.
> They will be replaced with neutral dark-theme defaults before Phase 2 (Houdini
> migration). Room themes fully override these at runtime, so the defaults only
> affect the pre-load flash and development without a `room.json`.

| Token | CSS property | room.json field | Default |
|---|---|---|---|
| `--pxd-bg-1` | background 1 | `bgColor1` | `#041320` |
| `--pxd-bg-2` | background 2 | `bgColor2` | `#0a2d46` |
| `--pxd-bg-3` | background 3 (page gradient base) | `bgColor3` | `#133c5a` |
| `--pxd-panel` | panel background | `panel` | `rgba(8,23,36,0.85)` |
| `--pxd-panel-border` | panel border colour | `panelBorder` | `rgba(108,223,255,0.28)` |
| `--pxd-ink` | primary text colour | `ink` | `#d8f4ff` |
| `--pxd-ink-soft` | secondary text colour | `inkSoft` | `#9ad5ea` |
| `--pxd-accent` | primary accent | `accent` | `#44e0cc` |
| `--pxd-accent-alt` | secondary accent | `accentAlt` | `#6de79a` |
| `--pxd-warn` | warning colour | `warn` | `#ffcc66` |
| `--pxd-danger` | danger colour | `danger` | `#ff7272` |
| `--pxd-radius` | panel border-radius | `radius` | `14px` |
| `--pxd-shadow` | panel box-shadow | `shadow` | `0 12px 28px rgba(0,0,0,0.35)` |
| `--pxd-font-body` | body font stack | `fontBody` | `TypewriterBold, Courier New, monospace` |
| `--pxd-font-mono` | mono font stack | `fontMono` | `CursedTimer, Courier New, monospace` |

Defaults in `pxd-base.css` are the Agent 22 values. Override any subset in `room.json → theme`.

## Custom web fonts

Declare fonts in `room.json → theme.fonts`:

```json
"fonts": [
  {
    "family": "TypewriterBold",
    "src": "fonts/TypewriterBold.ttf",
    "weight": "normal",
    "style": "normal"
  }
]
```

`pxd.js` injects a `<style>` tag with `@font-face` rules at boot. `src` is relative to the packager output root.

Font files must be placed in `rooms/<game>/pxd/fonts/` and will be copied to the output `fonts/` directory.

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
```

## Contrast helper

`PxD.utils.getContrastColor(hexColor)` returns `"#000000"` or `"#ffffff"` based on the perceived luminance of `hexColor`. Useful for setting text colour on dynamically coloured buttons (lighting scenes).
