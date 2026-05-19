# PxD Widget System (WIDGETS.md)

> **Status: Phase 3 — Not yet implemented.**

This document describes the planned widget API for Phase 3.

## What widgets are

Widgets are small, embeddable UI cards that display real-time game prop state.
Unlike the four primary panels (game-control, time-lights, hints, system),
widgets are:

- Declared in `room.json → widgets` (array)
- Loaded from `rooms/<game>/pxd/widgets/<id>.js`
- Mounted into a named **widget slot** — either the central widgets grid
  (default) or a `data-widget-slot` anchor inside any panel

## Declaring widgets in room.json

```json
"widgets": [
  {
    "id":     "bomb-timer",
    "type":   "countdown",
    "topic":  "paradox/agent22/bomb/state",
    "label":  "Bomb Timer"
  },
  {
    "id":     "front-door",
    "type":   "binary-input",
    "topic":  "paradox/agent22/doors/state",
    "label":  "Front Door",
    "target": "game-control"
  }
]
```

### The `target` field

`target` is optional. It specifies which panel slot the widget card mounts into.

| Value | Behaviour |
|---|---|
| *(omitted)* | Mounts in the central `[data-slot="widgets"]` grid |
| `"game-control"` | Mounts inside the game-control panel's widget anchor |
| `"time-lights"` | Mounts inside the time-lights panel's widget anchor |
| `"hints"` | Mounts inside the hints panel's widget anchor |
| `"header"` | Mounts inside a custom header panel's widget anchor |
| *(any slot id)* | Mounts inside that panel's `data-widget-slot` element |

If the named panel does not contain a `data-widget-slot` element, the widget
falls back silently to the central widgets grid and a console warning is emitted.

### Panel widget anchors

For a panel to accept widgets, its injected HTML must contain:

```html
<div data-widget-slot></div>
```

The widget loader appends widget cards to this element. The default framework
panels (game-control, time-lights, hints, system) will expose an optional
`data-widget-slot` container at the bottom of their card in Phase 3.

**Example — clock widget in the header panel:**

A custom `header.js` room-local panel renders the hero image alongside a
`data-widget-slot` container. A countdown widget with `"target": "header"`
mounts its card there rather than in the widgets grid.

```
┌──────────────────────────────────────────┐
│  [Hero image / logo]     [Bomb: 47:22]   │  ← header panel with widget slot
└──────────────────────────────────────────┘
│  game-control  │  time-lights  │  hints  │
└────────────────┴───────────────┴─────────┘
```

---

## Widget JS API

Widget JS files call `PxD.widgets.register()` (same IIFE pattern as panels):

```js
(function () {
    PxD.widgets.register('bomb-timer', {
        mount:   function (cardEl) { /* inject card content */ },
        unmount: function ()       { /* teardown */ }
    });
})();
```

`mount(cardEl)` receives the wrapping `.widget-card` element already injected
into the correct slot. The widget injects its own content inside it.

---

## Built-in widget templates (Phase 3)

Phase 3 ships four base templates in `apps/PxD/templates/widgets/base/`:

| Template | Purpose |
|---|---|
| `binary-input/` | Single true/false indicator (locked/unlocked, open/closed) |
| `countdown/` | Countdown clock with warn threshold |
| `text-display/` | Arbitrary text field from a state message |
| `numeric-gauge/` | Numeric value with warn and danger thresholds |

---

*Phase 3 design proposals live in [docs/proposals/](proposals/) when created.*
