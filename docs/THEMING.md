# PxD Theming Reference (THEMING.md)

PxD uses CSS custom properties (design tokens) applied to `:root` at boot time by `pxd.js` from `room.json → theme`.

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
| `--pxd-font-body` | body font stack | `fontBody` | `Arial, sans-serif` |
| `--pxd-font-mono` | mono font stack | `fontMono` | `'Courier New', monospace` |
| `--pxd-bg-glow-1` | first background radial glow colour | `bgGlow1` | `transparent` |
| `--pxd-bg-glow-2` | second background radial glow colour | `bgGlow2` | `transparent` |

`bgGlow1` and `bgGlow2` should be full `rgba()` strings — they are used directly as colour stops in the
page background radial gradients and the hero glow. Example values:

```json
"bgGlow1": "rgba(68, 224, 204, 0.20)",
"bgGlow2": "rgba(109, 231, 154, 0.17)"
```

Leave them unset (or omit) if you want a flat gradient background with no ambient glow.

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
