# PxD — User Guide

PxD is the operator-control UI framework for Paradox escape rooms. This guide
walks through everything from creating your first room to writing custom layouts,
themes, and widgets.

> **v2 note**: This guide predates the "Flexible Sites, Pages & Panes"
> redesign (`pxdVersion: "2"`). Several sections below (`panels.include`,
> `pxdVersion: "1"`, room-local `pxd/panels/<id>.js`) describe the original
> v1 model, which is no longer supported by the packager. For the current
> schema and authoring model, use [ROOMS.md](ROOMS.md) (fields),
> [PANES.md](PANES.md) (pane library + "add a new pane type" guide), and
> [THEMING.md](THEMING.md) (named themes) as the authoritative references;
> treat this guide's narrative/conceptual sections as still broadly correct,
> but its exact field names and code snippets as historical.

**Faster path**: If you just want to get something running, start with
[QUICK_START.md](QUICK_START.md) and come back here when you want to understand
the full picture.

---

## Contents

1. [How PxD works](#1-how-pxd-works)
2. [Room sources — the pxd/ folder](#2-room-sources--the-pxd-folder)
3. [Running the packager](#3-running-the-packager)
4. [Configuring room.json](#4-configuring-roomjson)
5. [Theming your room](#5-theming-your-room)
6. [Swapping logos and images](#6-swapping-logos-and-images)
7. [Custom web fonts](#7-custom-web-fonts)
8. [Panels — what each one does](#8-panels--what-each-one-does)
9. [Creating custom and room-local panels](#9-creating-custom-and-room-local-panels)
10. [Using a different layout](#10-using-a-different-layout)
11. [Creating a new layout](#11-creating-a-new-layout)
12. [Widgets (Phase 3)](#12-widgets-phase-3)
13. [Deploying to Nginx](#13-deploying-to-nginx)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. How PxD works

PxD is a **static-site assembly system**. There is no server-side code at
runtime — the packager runs once and produces a plain directory of HTML, CSS,
and JavaScript that Nginx serves as files.

### The three inputs

```
apps/PxD/assets/        Framework CSS, JavaScript, and vendor libraries
apps/PxD/layouts/       HTML page shells (one per layout style)
rooms/<game>/pxd/       Your room sources (room.json, media, fonts)
```

### What the packager produces

```
rooms/<game>/html/          Self-contained output directory
  index.html                Generated from the chosen layout template
  room.json                 Copied verbatim; read by pxd.js at runtime
  assets/css/               Framework CSS (Bootstrap + pxd-base.css)
  assets/js/                Framework JS (pxd.js, panels, vendor libs)
  media/                    Your hero image, favicon, and other media
  fonts/                    Your custom web fonts
```

Nginx serves the `html/` directory. No internet access is required at runtime.

### What happens in the browser

```
1. Browser loads index.html
2. Bootstrap CSS and pxd-base.css load in <head> — page is styled immediately
3. pxd.js runs on DOMContentLoaded:
     a. Fetches room.json
     b. Applies theme tokens as CSS custom properties on :root
     c. Injects @font-face declarations from theme.fonts
     d. Updates <title> and the hero image
     e. Loads panel scripts in the order listed in panels.include
     f. Connects to the MQTT broker (Paho WebSocket client)
     g. On MQTT connect — mounts each panel into its slot element
4. Panels subscribe to their MQTT topics and begin rendering live data
```

MQTT reconnects automatically on connection loss.

---

## 2. Room sources — the pxd/ folder

Every room has a `pxd/` folder alongside its HTML output:

```
rooms/<game>/
  pxd/                    Room sources (checked into git)
    room.json             Required — all configuration lives here
    media/                Hero image, favicon, and any room images
    fonts/                Web font files (.ttf, .woff2, etc.)
    widgets/              Widget sources — Phase 3, optional
  html/                   Packager output (can be gitignored or committed)
```

`room.json` is the single configuration file for the room. Everything — theme,
MQTT topics, panel options, widget list — is declared here. The packager copies
it verbatim into the output; `pxd.js` reads it at runtime.

---

## 3. Running the packager

```bash
# From apps/PxD/
node scripts/package.js \
  --room-dir ../../rooms/<game>/pxd \
  --out      ../../rooms/<game>/html
```

Add an npm script for convenience:

```json
// apps/PxD/package.json
"scripts": {
  "package:myroom": "node scripts/package.js --room-dir ../../rooms/myroom/pxd --out ../../rooms/myroom/html"
}
```

```bash
npm run package:myroom
```

**Re-run the packager whenever you change:**
- `room.json`
- Files in `pxd/media/` or `pxd/fonts/`
- Framework assets in `apps/PxD/assets/`
- The layout HTML

Browser-cached assets are served with a long `Cache-Control` header by Nginx,
so do a hard refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`) after repackaging.

---

## 4. Configuring room.json

The starter template at `apps/PxD/templates/rooms/_starter/room.json` contains
every supported field with comments. Below is a summary. For the full field
reference, see [ROOMS.md](ROOMS.md).

### Required fields

```jsonc
{
  "pxdVersion": "1",               // schema version — must be "1"
  "layout": "default-dashboard",   // layout to use (see section 9)
  "title": "Agent 22",             // browser tab title and page header
  "topicRoot": "paradox/agent22"   // all default MQTT topics derive from this
}
```

### MQTT connection

```jsonc
"mqtt": {
  "broker":         "auto",      // "auto" = window.location.hostname
  "port":           "auto",      // "auto" = page port (80 or 443)
  "wsPath":         "/mqtt",     // Nginx WebSocket proxy path
  "clientIdPrefix": "pxd_"       // random suffix appended automatically
}
```

`"auto"` for broker and port means the UI connects to whatever hostname and port
the browser used to load the page. This is the correct setting for nearly all
deployments — the MQTT broker runs on the same Pi that serves the page.

### Topic defaults

When not overridden in panel config, all MQTT topics are derived from
`topicRoot`:

| Purpose | Default topic |
|---|---|
| Game commands | `topicRoot/commands` |
| Game state | `topicRoot/state` |
| Game config | `topicRoot/config` |
| Hints | `topicRoot/hints` |
| Checklist state | `topicRoot/checklist/state` |
| Lights commands | `topicRoot/lights/commands` |
| Lights state | `topicRoot/lights/state` |
| Clock state | `topicRoot/clock/state` |
| TV / browser state | `topicRoot/tv/state` |

If your game uses non-standard topics, override them in the relevant panel
config block. See [ROOMS.md](ROOMS.md) for per-panel override fields.

---

## 5. Theming your room

PxD uses CSS custom properties (design tokens). The theme is applied at boot
time by `pxd.js`, so the full token set is available to every panel and widget.

### Changing the theme

Edit `room.json → theme`. You only need to include the fields you want to
change — anything omitted falls back to the built-in defaults:

```jsonc
"theme": {
  "bgColor1":    "#1a0a00",   // page background (darkest)
  "bgColor2":    "#3a1a00",   // page background (mid)
  "bgColor3":    "#5a2a00",   // gradient base
  "accent":      "#e87040",   // buttons, focus rings, highlights
  "accentAlt":   "#f0a860",   // secondary accent (success states)
  "ink":         "#ffe8d0",   // primary text
  "inkSoft":     "#c09070"    // secondary text / labels
}
```

Repackage and hard-refresh to see the change.

### Full token reference

See [THEMING.md](THEMING.md) for the complete token table, colour tips, and
the `PxD.utils.getContrastColor()` helper.

---

## 6. Swapping logos and images

### Hero image (page banner)

The hero is the wide banner across the top of the page. Place your image in
`pxd/media/` and update `room.json`:

```jsonc
"media": {
  "hero": "media/my-banner.jpg"
}
```

**Sizing guidance:**
- Landscape orientation — the image is displayed full-width with
  `object-fit: cover`, so wider is always better than taller.
- Around 1200 × 300 px is a good target.
- Use `jpg` or `webp` for photos; `png` for graphics with transparency.
- Keep file size under 500 KB to avoid a slow initial paint.

### Favicon

```jsonc
"media": {
  "favicon": "media/favicon.ico"
}
```

A 32 × 32 `.ico` works universally. Modern browsers also accept `.png`.

### Removing the hero

If your theme uses a solid background and you don't want a hero image, set
`"hero": ""` and the element will be hidden at runtime.

---

## 7. Custom web fonts

Place font files in `pxd/fonts/` and declare them in `room.json → theme.fonts`:

```jsonc
"theme": {
  "fontBody": "MyFont, Arial, sans-serif",
  "fonts": [
    {
      "family": "MyFont",
      "src":    "fonts/MyFont-Regular.woff2",
      "weight": "normal",
      "style":  "normal"
    },
    {
      "family": "MyFont",
      "src":    "fonts/MyFont-Bold.woff2",
      "weight": "700",
      "style":  "normal"
    }
  ]
}
```

`pxd.js` injects `@font-face` rules into the page at boot. `src` is relative to
the packager output root (i.e., the `html/` directory). The packager copies
everything in `pxd/fonts/` to `html/fonts/` automatically.

**Font format tips:**
- `woff2` has the best compression and browser support for modern Chromium
  (which is what PxD pages run in on a Pi).
- `ttf` also works and is common for operator/display fonts.

---

## 8. Panels — what each one does

Panels are the four functional blocks of the default dashboard. Each is a
self-contained JavaScript module that mounts into a named slot in the layout.

### game-control

The primary game management panel.

- **Mode selector** — populated from the game's MQTT config message; changing
  the selection sends a `setGameMode` command.
- **Main action button** — changes label and colour based on game state:
  Start / Pause / Resume / Abort / Reset.
- **Solve / Fail buttons** — force the game to a terminal state.
- **Checklist button** — opens a modal showing the room reset checklist from
  MQTT.
- **Emergency button** — opens a modal with quick-action commands
  (alarm, lockdown, unlock doors, etc.) as defined in `room.json →
  gameControl.emergencyActions`.
- **Heartbeat watchdog** — disables controls and shows a warning if no game
  state message arrives within `heartbeatTimeoutMs` (default 3000 ms).

**Key room.json fields** (`gameControl` block):

| Field | Default | Effect |
|---|---|---|
| `stateTopic` | `topicRoot/state` | Game state subscription |
| `configTopic` | `topicRoot/config` | Mode list subscription |
| `commandTopic` | `topicRoot/commands` | Where commands are sent |
| `checklistStateTopic` | `topicRoot/checklist/state` | Checklist data |
| `heartbeatTimeoutMs` | `3000` | Controls-disable timeout |
| `emergencyActions` | `[]` | Array of `{label, command, param}` objects |

### time-lights

Clock adjustment and lighting control.

- **Time controls** — ±10 s, ±1 min, ±5 min buttons send time-adjust commands.
- **Lighting scene dropdown** — populated from the lights MQTT scene list;
  selecting a scene sends a `setScene` command.
- **Clock visibility indicator** — shows whether the in-room clock display is
  currently visible or hidden (driven by MQTT state).
- **TV/browser state** — shows whether the in-room browser/TV display is active.
- **Emergency button** — delegates to the game-control panel's emergency modal
  (shared between panels).

**Key room.json fields** (`timeLights` block):

| Field | Default | Effect |
|---|---|---|
| `lightsStateTopic` | `topicRoot/lights/state` | Scene/state subscription |
| `lightsScenesTopicRoot` | — | If set, subscribes here for dynamic scene list |
| `clockStateTopic` | `topicRoot/clock/state` | Clock visibility subscription |
| `tvStateTopic` | `topicRoot/tv/state` | TV/browser state subscription |

### hints

Hint delivery to players.

- **Hint selector** — dropdown populated from the game config; supports
  audio, video, text, and mixed hint types.
- **Text field** — shown for editable text hints; pre-populated from config,
  editable before sending.
- **Clock-visibility gate** — send button is disabled when the clock is hidden
  (configurable behaviour to prevent accidental spoilers).
- **Send button** — publishes the hint payload to the hint topic.

**Key room.json fields** (`hints` block):

| Field | Default | Effect |
|---|---|---|
| `hintTopic` | `topicRoot/hints` | Where hints are published |

### system

Background system health monitoring.

- **Warning log** — displays MQTT warning messages with timestamps; entries
  older than 10 minutes are automatically removed.
- **Zone heartbeat bar** — a row of status indicators, one per watched zone.
  Each zone goes from "Connected" to "Disconnected" after `timeoutMs`
  milliseconds without a message on its topic.

**Key room.json fields** (`system` block):

| Field | Default | Effect |
|---|---|---|
| `warningTopics` | `[topicRoot/warnings]` | Topics whose messages appear in the log |
| `watchZones` | `[]` | Array of `{id, label, topic, timeoutMs}` zone objects |

---

## 9. Creating custom and room-local panels

The four default panels (game-control, time-lights, hints, system) cover the
standard Paradox room control surface. For anything outside that set — a combined
logo-and-clock header, a custom prop status display, a room-specific countdown —
you create your own panel.

### How the panel contract works

A panel is a single JavaScript file containing a self-executing function that
calls `PxD.panels.register()`. That's the entire contract:

```js
// rooms/myroom/pxd/panels/header.js
(function () {
    PxD.panels.register('header', {
        mount: function (slotEl) {
            // slotEl is the <div data-slot="header"> element in the layout.
            // Inject your HTML here. Subscribe to MQTT topics. Start timers.
            slotEl.innerHTML = '<div class="pxd-card">...</div>';
        },
        unmount: function () {
            // Clean up subscriptions and timers.
        }
    });
})();
```

The panel ID passed to `register()` must match the `data-slot` attribute in
the layout and the entry in `room.json → panels.include`.

### Room-local panels

Put custom panel files in `rooms/<game>/pxd/panels/`. The packager checks this
directory **before** the framework panels directory, so a room-local panel with
the same name as a framework panel replaces it in the output. Room-local panels
that don't match any framework name are simply new panels.

```
rooms/<game>/pxd/
  panels/
    header.js         ← new panel — must have a matching slot in the layout
    time-lights.js    ← overrides the framework time-lights panel for this room
```

The packager log shows how many panels were room-local:

```
  [panels] 5 panel(s) copied (2 room-local)
```

### Adding a custom panel to a room

1. Write `rooms/<game>/pxd/panels/<name>.js` following the contract above.
2. Add `"<name>"` to `panels.include` in `room.json`.
3. Add `<div data-slot="<name>"></div>` to the layout HTML (or use a custom
   layout — see section 11).
4. Repackage.

### Example — combined logo + clock header panel

A common request is to show the hero image and a live countdown clock in the
same panel at the top of the page. With room-local panels this is straightforward:

**Layout** — add a `header` slot above the existing grid:
```html
<div data-slot="header"></div>
<div data-slot="game-control"></div>
<!-- ... -->
```

**Room-local panel** — `rooms/myroom/pxd/panels/header.js`:
```js
(function () {
    PxD.panels.register('header', {
        mount: function (slotEl) {
            var cfg    = window.PxD.config;
            var heroSrc = (cfg.media && cfg.media.hero) || '';
            slotEl.innerHTML =
                '<div class="pxd-header-panel">' +
                  '<img src="' + heroSrc + '" class="pxd-hero" alt="">' +
                  '<div id="header-clock" class="pxd-header-clock">--:--</div>' +
                '</div>';

            window.PxD.mqtt.subscribe(
                (cfg.topicRoot || '') + '/clock/state',
                function (msg) {
                    var el = slotEl.querySelector('#header-clock');
                    if (el && msg.display) el.textContent = msg.display;
                }
            );
        },
        unmount: function () {}
    });
})();
```

**room.json** — include the new panel and remove the hero from the media block
if you are rendering it inside the panel instead:
```jsonc
"panels": {
    "include": ["header", "game-control", "time-lights", "hints", "system"]
}
```

In Phase 3, a widget with `"target": "header"` can mount directly into a
`data-widget-slot` inside this panel. See [WIDGETS.md](WIDGETS.md).

---

## 10. Using a different layout

The `layout` field in `room.json` selects which HTML shell the packager uses:

```jsonc
"layout": "default-dashboard"
```

Currently one layout ships with PxD:

| Layout | Description |
|---|---|
| `default-dashboard` | Four-panel single-column operator view |

Additional layouts will be added in future phases. To use a custom layout you
create yourself, see section 10.

---

## 11. Creating a new layout

A layout is a named folder under `apps/PxD/layouts/` containing at minimum a
`layout.html` file.

### Minimum file set

```
apps/PxD/layouts/my-layout/
  layout.html     required — HTML shell template
  layout.css      optional — layout-specific structural CSS
  README.md       recommended — documents the slots and their purpose
```

### layout.html requirements

The HTML shell must:

1. Load the framework scripts in this order:
   ```html
   <link rel="stylesheet" href="assets/css/bootstrap.min.css">
   <link rel="stylesheet" href="assets/css/pxd-base.css">
   ```
   ```html
   <script src="assets/js/jquery.min.js"></script>
   <script src="assets/js/paho-mqtt.js"></script>
   <script src="assets/js/bootstrap.bundle.min.js"></script>
   <script src="assets/js/pxd.js"></script>
   ```

2. Include the two framework portals:
   ```html
   <div id="pxd-modals"></div>
   <div id="pxd-toast-container"></div>
   ```

3. Declare panel slot elements using `data-slot`:
   ```html
   <div data-slot="game-control"></div>
   <div data-slot="time-lights"></div>
   <div data-slot="hints"></div>
   <div data-slot="system"></div>
   ```

4. Use `{{PXD_TITLE}}` where the room title should appear (the packager
   substitutes this at build time):
   ```html
   <title>{{PXD_TITLE}}</title>
   ```

### Panel slot rules

- A slot element must have `data-slot="<panelId>"` matching a panel ID in
  `panels.include`.
- Slots not listed in `panels.include` are silently ignored.
- Panels listed in `panels.include` with no matching slot produce a warning but
  do not fail startup.
- Slots may be placed anywhere in the layout — full-width rows, sidebar columns,
  or nested grids.

### Layout-specific CSS

Put structural CSS (grid definitions, column widths, breakpoints) in
`layout.css`. Paint comes from `pxd-base.css` tokens. Reference tokens the
same way panels do:

```css
.my-grid {
    display: grid;
    gap: 1rem;
    background: var(--pxd-bg-2);
}
```

The packager automatically copies `layout.css` to the output if it exists.

### Registering the layout

No registration step is needed. The packager looks up `layouts/<name>/` by the
value of `room.json → layout`. Set `"layout": "my-layout"` in `room.json` and
repackage.

---

## 12. Widgets (Phase 3)

> Widgets are not yet implemented. This section describes the planned design.

Widgets are small prop-status cards that appear in a scrollable grid inside the
`widgets` panel slot. Each widget subscribes to one or more MQTT topics and
displays real-time data (countdown timers, door status, lock state, etc.).

### Declaring widgets in room.json

```jsonc
"widgets": [
  {
    "id":    "bomb-timer",
    "type":  "countdown",
    "topic": "paradox/agent22/bomb/state",
    "label": "Bomb Timer"
  },
  {
    "id":    "front-door",
    "type":  "binary-input",
    "topic": "paradox/agent22/doors/state",
    "label": "Front Door"
  }
]
```

### Widget source files

Widget JS files live in `rooms/<game>/pxd/widgets/` and follow the same IIFE
pattern as panels, calling `PxD.widgets.register()` instead of
`PxD.panels.register()`.

### Built-in widget templates (Phase 3)

Phase 3 will ship four base templates in
`apps/PxD/templates/widgets/base/`:

| Template | Purpose |
|---|---|
| `binary-input/` | Single true/false indicator (locked/unlocked, open/closed) |
| `countdown/` | Countdown clock with configurable warn threshold |
| `text-display/` | Arbitrary text field from a state message |
| `numeric-gauge/` | Numeric value with warn and danger thresholds |

For the full widget API, see [WIDGETS.md](WIDGETS.md).

---

## 13. Deploying to Nginx

### Symlink setup

```bash
ln -s /opt/paradox/rooms/<game>/html /opt/paradox/html/<game>
```

### Nginx location block

```nginx
location /mygame/ {
    alias /opt/paradox/html/mygame/;
    index index.html;
    try_files $uri $uri/ /mygame/index.html;

    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
}
```

### MQTT WebSocket proxy

PxD connects to MQTT via WebSocket at `/mqtt` on the page's host and port.
Your Nginx config must proxy that path to Mosquitto's WebSocket listener:

```nginx
location /mqtt {
    proxy_pass http://127.0.0.1:1884/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```

This block only needs to appear once in the server context (it is not per-room).

---

## 14. Troubleshooting

### Page loads but panels are blank

- Open the browser console (F12). Look for `room.json fetch failed` or
  `MQTT connect failed` errors.
- Confirm the packager ran successfully and `room.json` exists in the output
  directory.
- Check that `room.json → topicRoot` is correct.

### MQTT not connecting

- Confirm Mosquitto is running: `sudo systemctl status mosquitto`
- Confirm the Nginx `/mqtt` proxy block is active:
  `grep -r "proxy_pass.*1884" /etc/nginx/`
- Open the browser Network tab and look for a WebSocket request to `/mqtt`.
  A `101 Switching Protocols` response means the connection succeeded.

### Zone heartbeat shows Disconnected for everything

- The MQTT connection itself is working (otherwise panels would not render).
- Check that `room.json → system.watchZones[*].topic` values match the
  topics your game services actually publish to.
- Increase `timeoutMs` values if services publish infrequently.

### Fonts not loading / wrong font

- Confirm font files are in `pxd/fonts/` before packaging (not in `html/fonts/`
  directly — that is an output directory).
- Check the `family` name in `theme.fonts` exactly matches the value in
  `fontBody` or `fontMono`.
- Use the browser Network tab to confirm the font file is being requested and
  returning 200.

### After repackaging, changes don't appear

Do a hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac).
Nginx serves assets with a one-year `Cache-Control` header for performance.
