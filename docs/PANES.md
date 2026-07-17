# PxD — Pane Library Reference (PANES.md)

A **pane** is a card/section rendered inside a page's grid. Every pane entry
in `room.json` has the shape:

```jsonc
{ "type": "<pane-type>", "width": "full|two-thirds|half|third", "config": { /* type-specific */ } }
```

`width` defaults to `"full"` if omitted. Panes stack top-to-bottom in array
order and reflow responsively — `two-thirds` and `third` promote to full
width at tablet size, everything stacks to full width at phone size.

## Shipped pane types

| Type | Purpose | Multi-instance? |
|---|---|---|
| `content` | Static HTML block (hero images, custom text/markup) | Yes |
| `game-control` | Mode select, checklist, start/solve/fail, time adjust, emergency actions | No — reads global `PxD.config.gameControl` |
| `time-lights` | **Time & Lights** — clock adjust + light scenes (no emergency button) | No — reads global `PxD.config.timeLights` |
| `hints` | Hint dropdown + free-text send | No — reads global `PxD.config.hints` |
| `system` | Connection/warning status bar + watch zones | No — reads global `PxD.config.system` |
| `widget-grid` | Grid of MQTT-bound prop/puzzle widget tiles | **Yes** — each instance has its own widget set |
| `camera-view` | go2rtc live camera stream viewer (MSE) | **Yes** — each instance has its own camera list |
| `nav` | Auto-built links to every page in the current site | Yes (rarely needed more than once) |
| `divider` | Not a visual card — starts a new collapsible section | N/A |

`game-control`, `time-lights`, `hints`, and `system` are legacy-style panes
that read their settings from the matching top-level `room.json` key
(`gameControl`, `timeLights`, etc.) rather than their own `config` object —
their own `config` is typically `{}`. This is unchanged from PxD v1 and lets
one room reuse the same settings across multiple pages/sites without
repeating them. `widget-grid` and `camera-view` are true multi-instance
panes: all of their configuration lives in the pane's own `config`.

**Time & Lights / Emergency split:** The `time-lights` pane title is
**Time & Lights** (clock adjust + light scenes only). Emergency Controls live
only on `game-control` (header button + modal). `game-control` also includes
an Adjust Time row that publishes `{ command: "adjustTime", seconds }` to the
game commands topic.

### `content`

```jsonc
{ "type": "content", "width": "full", "config": {
  "html": "<img class=\"pxd-hero-banner\" src=\"media/hero.jpg\" alt=\"My Room\">"
} }
```

Renders `config.html` verbatim inside the pane. Used for hero banners
(`pxd-hero-banner` CSS class handles responsive sizing) and any other
static content. This is also the reference implementation to copy when
writing a new pane type — see below.

### `widget-grid`

```jsonc
{ "type": "widget-grid", "width": "full", "config": {
  "title": "Props & Puzzles",
  "widgets": [
    { "id": "front-door", "name": "Front Door", "shown": true },
    { "id": "bomb-timer", "shown": false }
  ]
} }
```

- `widgets[].id` must match a folder in the room's `pxd/widgets/` directory
  (`widgets/<id>/widget.js` [+ optional `widget.css`]).
- `shown: false` (or omitted) hides the widget by default; the pane's gear
  menu ("Widget visibility") can reveal any configured widget instantly —
  every configured widget is always loaded, just not always displayed.
- A page may contain multiple `widget-grid` panes (e.g. one per puzzle
  category); each is independent. See `docs/WIDGETS.md` for how to author a
  widget.

### `camera-view`

```jsonc
{ "type": "camera-view", "width": "half", "config": {
  "layout": 3,
  "sidebarPosition": "right",
  "defaultViewMode": "multi",
  "cameras": [
    { "id": "study",  "label": "Study",  "wsUrl": "/go2rtc/api/ws?src=study", "main": true },
    { "id": "vault",  "label": "Vault",  "wsUrl": "/go2rtc/api/ws?src=vault" },
    { "id": "mirror", "label": "Mirror", "wsUrl": "/go2rtc/api/ws?src=mirror" }
  ]
} }
```

- `layout`: number of camera slots (1-5).
- `sidebarPosition`: `left|right|top|bottom`, only relevant when `layout > 1`.
- `defaultViewMode`: `"multi"` (grid) or `"single"` (one large view); the
  pane's own Single/Multi toggle is session-only and always resets to this
  on reload.
- `cameras[].main: true` marks the initially-focused camera in single view.
- `cameras[].transform`: optional `{ rotate: 90|180|270 }` for physically
  rotated cameras.
- **`wsUrl` preferred form:** path-absolute `/go2rtc/api/ws?src=<stream>` —
  nginx proxies `/go2rtc/` to the room's go2rtc on `:1984`, and
  `camera-view.js` resolves the path to `ws(s)://<page-host>/go2rtc/...`.
  That works for LAN and Tailscale (same host as the HTML). Absolute
  `ws://<ip>:1984/...` still works for direct access.
  **New machine install:** see [GO2RTC.md](GO2RTC.md) (binary, systemd,
  nginx proxy, Amcrest NVR URL pattern).
- Camera URL overrides: a room-local `pxd/camera-view.local.json` (packaged
  alongside `room.json`) can override `wsUrl` per camera id without editing
  `room.json` — see the file header comment in
  `assets/js/panes/camera-view.js` for the exact format. A pane's gear icon
  also allows session-only (non-persisted) URL overrides for testing.
- A page may contain multiple `camera-view` panes; each is fully independent.

### `nav`

```jsonc
{ "type": "nav", "width": "full", "config": {} }
```

Auto-lists every page in the current site as a link (current page
highlighted). Typically placed in a site's `header` or as the first pane on
each page when a site has more than one page.

### `divider`

```jsonc
{ "type": "divider", "config": { "title": "Advanced", "collapsible": true, "collapsed": false, "align": "left" } }
```

Not rendered as its own card. Starts a new section: every pane after this
divider (until the next divider, or the end of the page) is grouped under
this heading. If `collapsible: true`, the whole section can be toggled
closed; `collapsed: true` starts it closed.

## Adding a new pane type

1. Copy `assets/js/panes/content.js` as a starting point (it's kept simple
   specifically to serve as the reference example).
2. Register your type:
   ```js
   (function () {
     'use strict';
     function factory(config, ctx) {
       // config = this pane entry's own `config` object
       // ctx = { mqtt, config: PxD.config (whole room.json), site, page, utils }
       return {
         mount: function (el) { /* build DOM into el, wire ctx.mqtt.subscribe/publish */ },
         unmount: function () { /* tear down subscriptions, timers, etc. */ }
       };
     }
     PxD.panes.registerType('my-pane', factory);
   })();
   ```
3. Save it as `assets/js/panes/my-pane.js` in the framework (available to
   every room) or in a room's own `pxd/panes/my-pane.js` (room-local
   override/addition — checked by the packager before the framework copy).
4. Reference it from `room.json`: `{ "type": "my-pane", "width": "half", "config": {...} }`.
5. `mount`/`unmount` must be idempotent and fully clean up on `unmount` —
   pages can be re-rendered (e.g. during development) without a full reload.
