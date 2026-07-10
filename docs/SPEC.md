# PxD Functional Specification

**Version**: 1.0 (Phase 1)  
**Status**: Active

> **v2 note**: This document predates the "Flexible Sites, Pages & Panes"
> redesign (`pxdVersion: "2"`). Some examples below (single `panels.include`
> list, `pxdVersion: "1"`) describe the original v1 model. For the current
> schema, see [ROOMS.md](ROOMS.md) (fields), [PANES.md](PANES.md) (pane
> library), [THEMING.md](THEMING.md) (named themes), and
> [PR_FLEXIBLE_SITES_AND_PANES.md](PR_FLEXIBLE_SITES_AND_PANES.md) (the
> v2 design rationale). This file is kept for historical/background
> context on PxD's original goals, which still hold in v2.

---

## 1. Purpose

PxD is a static-site framework for Paradox escape-room operator control pages. Each room's control page is assembled by the PxD packager from:

- Shared framework assets (CSS, JS, vendor libs)
- A named layout (HTML shell, structural CSS)
- Room configuration (`room.json`)
- Room-specific assets (media, fonts)
- Panel JS modules (selected via `room.json → panels.include`)

The packager output is a self-contained directory served by Nginx. No internet access is required at runtime.

---

## 2. Framework versioning

`room.json` declares `pxdVersion` (string). The packager validates this field is present. Currently only `"1"` is defined.

---

## 3. Runtime lifecycle

```
Browser loads index.html
  └─ <head> loads Bootstrap CSS, pxd-base.css
  └─ <body> has empty [data-slot] elements + PxD script tags

pxd.js runs on DOMContentLoaded:
  1. fetch('room.json')
  2. Apply theme tokens (CSS custom properties on :root)
  3. Inject @font-face from theme.fonts
  4. Update <title> and hero image
  5. Load panel scripts sequentially (panels.include order)
  6. Connect Paho MQTT using mqtt config
  7. On MQTT connect: call panel.mount(slotEl) for each panel
```

MQTT reconnects automatically with 2s delay on connection loss.

---

## 4. MQTT behaviour

- Broker: `window.location.hostname` when `mqtt.broker === "auto"` (default)
- Port: page's port when `mqtt.port === "auto"` (default); Nginx proxies `/mqtt` to ws://localhost:1884
- SSL: auto-detected from `window.location.protocol === "https:"`
- Message format: JSON only; non-JSON messages are silently discarded

### Subscription routing

`PxD.mqtt.subscribe(topic, callback)` supports MQTT wildcard patterns (`+`, `#`). Multiple callbacks may be registered for the same pattern. Messages are dispatched to all matching callbacks.

---

## 5. Panel system

### Contract

Each panel file is a self-contained IIFE that:
1. Reads `window.PxD.config` and `window.PxD.mqtt`
2. Calls `PxD.panels.register(id, { mount, unmount })`

`mount(slotEl)` — called by pxd.js after MQTT connects. Injects panel HTML into `slotEl`.  
`unmount()` — called if the panel is unloaded (reserved for future use).

### Modals

Panels inject Bootstrap modal HTML into `<div id="pxd-modals">` (a page-level portal). This ensures modals are not clipped by grid-item overflow rules.

### Cross-panel communication

Panels communicate via browser CustomEvents on `document`:

| Event | Published by | Consumed by |
|---|---|---|
| `pxd:gameChanged` | game-control | hints |
| `pxd:clockVisibilityChanged` | time-lights | hints |
| `pxd:hintTopicChanged` | game-control | hints |

---

## 6. Packager behaviour

`scripts/package.js` accepts `--room-dir` and `--out` arguments.

Steps:
1. Validate `room.json` (exists, valid JSON, has `pxdVersion`)
2. Copy `assets/css/` (framework CSS + vendor Bootstrap CSS)
3. Copy `assets/js/` core files (pxd.js, jquery, paho-mqtt, bootstrap.bundle)
4. Copy panel JS files listed in `panels.include`
5. Copy layout CSS/JS (if present)
6. Generate `index.html` from `layout.html` template (substitutes `{{PXD_TITLE}}`)
7. Copy `room.json` verbatim
8. Copy `media/`, `fonts/`, `widgets/` (if present)

---

## 7. Design constraints

- No build step at runtime (vanilla JS, no transpiler)
- No CDN dependencies; all vendor files are vendored locally
- Bootstrap 5.3.3 (CSS + JS bundle)
- MQTT via Eclipse Paho WebSocket client
- jQuery available but usage is minimal (hint textarea handler only)
- No module bundler; panels loaded as sequential `<script>` tags
