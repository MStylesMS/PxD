# PxD — Pane Library Reference (PANES.md)

A **pane** is a card/section rendered inside a page's grid. Every pane entry
in `room.json` has the shape:

```jsonc
{ "type": "<pane-type>", "width": "full|three-quarters|two-thirds|half|third|quarter",
  "order": 1, "narrowWidth": "full", "narrowOrder": 2,
  "config": { /* type-specific */ } }
```

`width` defaults to `"full"` if omitted. Panes flow left-to-right in a
12-column grid and wrap. Optional layout fields:

| Field | Description |
|---|---|
| `order` | CSS grid order at wide viewports. When any pane in a row sets `order`/`narrowOrder`, panes without one sort after (auto 100+). |
| `narrowWidth` | Width token used when the viewport is below `grid.narrowBreakpointPx` (default 992) |
| `narrowOrder` | Grid order used in that narrow mode |

Default narrow promotions (when `narrowWidth` is omitted): `quarter`→half,
`third`→half, `two-thirds`/`three-quarters`→full. Phone (`<480px`) stacks
everything full-width. See `docs/ROOMS.md` § grid.

## Shipped pane types

| Type | Purpose | Multi-instance? |
|---|---|---|
| `content` | Static HTML block (hero images, custom text/markup) | Yes |
| `game-control` | Full control card: status, mode, checklist, start/solve/fail, time adjust, emergency | No — reads global `PxD.config.gameControl` |
| `game-status` | Large time/status pill only (no title) | No — same `gameControl` config |
| `game-actions` | Mode, Main Action, End Game + `⋯` menu (adjust time / checklist / emergency) | No — same `gameControl` config |
| `time-lights` | **Time & Lights** — clock adjust + light scenes (no emergency button) | No — reads global `PxD.config.timeLights` |
| `hints` | Hint dropdown + free-text send | No — reads global `PxD.config.hints` |
| `system` | Connection/warning status bar + watch zones | No — reads global `PxD.config.system` |
| `widget-grid` | Grid of MQTT-bound prop/puzzle widget tiles | **Yes** — each instance has its own widget set |
| `camera-view` | go2rtc live camera stream viewer (MSE) | **Yes** — each instance has its own camera list |
| `pxt-chat` | Operator ↔ PxT terminal chat window | **Yes** — each instance has its own topic root |
| `nav` | Auto-built links to every page in the current site | Yes (rarely needed more than once) |
| `divider` | Not a visual card — starts a new collapsible section | N/A |

`game-control`, `game-status`, `game-actions`, `time-lights`, `hints`, and
`system` are legacy-style panes that read their settings from the matching
top-level `room.json` key (`gameControl`, `timeLights`, etc.) rather than
their own `config` object — their own `config` is typically `{}`. This is
unchanged from PxD v1 and lets one room reuse the same settings across
multiple pages/sites without repeating them. `widget-grid`, `camera-view`,
and `pxt-chat` are true multi-instance panes: all of their configuration
lives in the pane's own `config`.

**Do not** place `game-control` on the same page as `game-status` /
`game-actions` — pick one control surface. A common Live layout is
`game-status` (quarter) + logo `content` (half) + `game-actions` (quarter)
with `order` / `narrowOrder` so wide = status\|logo\|actions and narrow =
logo on top, then status\|actions.

**Time & Lights / Emergency split:** The `time-lights` pane title is
**Time & Lights** (clock adjust + light scenes only). Emergency Controls live
on `game-control` (header button) or `game-actions` (`⋯` menu). Both publish
`{ command: "adjustTime", seconds }` for time changes.

### `content`

```jsonc
{ "type": "content", "width": "half", "config": {
  "aspectRatio": "4.6",
  "forceFit": true,
  "backgroundColor": "#1C4875",
  "html": "<img class=\"pxd-hero-banner\" src=\"media/hero-alpha.png\" alt=\"My Room\">"
} }
```

Renders `config.html` verbatim inside the pane (or structured `items`).
Used for hero banners (`pxd-hero-banner`) and any other static content.

| Config | Description |
|---|---|
| `aspectRatio` | Ideal box ratio as `"4.6"` or `"23 / 5"`. **Ideal logo ratio** beside `game-status` + `game-actions` (half-width ≈743px at the 1500px shell, compact control panes ≈160px tall): **4.6:1**. Used as the pane's intrinsic aspect when not stretched by siblings. |
| `forceFit` | When `true`, the image fills the pane with `object-fit: contain` (never skewed): letterbox (empty top/bottom) when the image is too wide for the pane, pillarbox (empty sides) when too tall, edge-to-edge when ratios match. Transparent image pixels show `backgroundColor` (or the theme panel color). |
| `backgroundColor` | Optional pane fill (`#rgb` / `#rrggbb` / `rgb()` / `rgba()` / named CSS color). Typical use: the original logo background so an alpha PNG blends cleanly. |

This is also the reference implementation to copy when writing a new pane
type — see below.

### `game-status`

```jsonc
{ "type": "game-status", "width": "quarter", "config": {} }
```

Title-less card with a large status/time pill (Ready / Time left / Paused /
etc.). Pair with `game-actions`.

### `game-actions`

```jsonc
{ "type": "game-actions", "width": "quarter", "config": {} }
```

Compact Mode / Main Action / End Game controls. Top-right `⋯` opens Adjust
Time, Checklist, and Emergency Controls (same MQTT commands and checklist
stub as `game-control`).

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

### `pxt-chat`

```jsonc
{ "type": "pxt-chat", "width": "half", "narrowWidth": "full", "config": {
  "topicRoot": "paradox/spycatcher/terminal",
  "operatorAuthor": "operator",
  "maxMessages": 200,
  "title": "Terminal Chat",
  "ai": { "enabled": false, "author": "agent", "mode": "assist" }
} }
```

Operator chat window for a Paradox Terminal (PxT) kiosk. Looks like a
normal text chat (scrollable transcript + compose box).

| Config | Description |
|---|---|
| `topicRoot` | PxT base topic (required). Topics become `{topicRoot}/chat/to-players` and `…/from-players`. |
| `toPlayersTopic` / `fromPlayersTopic` | Optional full-topic overrides. |
| `operatorAuthor` | `author` field on outbound messages (default `operator`). |
| `maxMessages` | In-memory transcript cap (default 200). |
| `title` | Panel title (default `Terminal Chat`). |
| `chime` | Play a short Web Audio chime on player messages (default `true`). Operators can also mute via the **MUTE** header button (persisted in `localStorage`). |
| `ai` | **Reserved** for a future SLM agent (`enabled`, `author`, `mode`). Ignored in v1. |

**Width allow-list:** `full` \| `three-quarters` \| `two-thirds` \| `half`
only (do not use `third` / `quarter`). Typical layouts: half-width on the
simple site after `hints`; full-width on live immediately under
`camera-view`.

Payload shape (both directions): `{ "ts"?: number, "author": string, "message": string }`.
See `apps/PxT/docs/MQTT_API.md` and `docs/PR_PXT_CHAT_PANE.md`.

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
