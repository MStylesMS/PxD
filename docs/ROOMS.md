# PxD — Room Configuration Guide (ROOMS.md)

PxD builds one or more **sites** for a room from a single `room.json` config
file. See `docs/PANES.md` for the pane library reference and how to add new
pane types, and `docs/THEMING.md` for the theme/token reference.

## Glossary

| Term | Definition |
|---|---|
| **Site** | A deployable UI variant for a game. The designer picks its `id` (used as the output subfolder name) and title freely — there is no default/reserved site name. A site is `pxd` (PxD-generated), `external` (a link to an off-PxD URL), or `manual` (an operator-maintained subfolder PxD never writes to or deletes). |
| **Page** | One generated HTML file within a `pxd` site (`<pageId>.html`; the site's first page is also aliased `index.html`). Scrolls vertically. Multiple pages in a site are navigated via an auto-built `nav` pane. Scrolling panes and navigable pages are independent — freely combine both. |
| **Pane** | A card/section within a page, instantiated from the pane library by `type`. Config order = on-screen order. Each pane has a configurable `width` and, if its type declares one, a gear-icon settings menu (session-only, never persisted). |
| **Section / Divider** | A `divider` pane entry starts a collapsible section (title, alignment, collapse toggle). The section owns every pane after it until the next divider, the footer, or the frozen footer. |
| **Pane library** | The fixed set of pane types PxD ships (see `docs/PANES.md`). Config selects and configures instances; new pane types can be added by developers. |
| **Widget** | An MQTT-bound prop/puzzle tile. Widgets live inside a `widget-grid` pane. A page may contain multiple `widget-grid` panes, each with its own widget set. |
| **Theme** | A named bundle of visual design tokens. Rooms reference a theme by name and may override individual tokens. See `docs/THEMING.md`. |
| **Header / Footer** | Optional site-level sticky regions, each holding one pane. Applied to every page in the site. |
| **Landing page** | The always-generated `/html/index.html`. A single-site room redirects straight into it; a multi-site room shows the room logo and a link to every site (including `external` and `manual` sites). |

## Room source layout

```
rooms/<game>/pxd/
  room.json                    # required
  media/                       # hero image, favicon, other images
  fonts/                       # web font files referenced by theme.fonts
  panes/                       # optional — room-local pane overrides
  widgets/                     # widget instance sources (see docs/WIDGETS.md)
  camera-view.local.json       # optional — operator-maintained camera URL overrides
```

### Room-local panes (`panes/`)

Place custom pane JS files here. The packager checks this directory **before**
the framework's `assets/js/panes/`, so a file named `time-lights.js` here
replaces the framework `time-lights.js` for this room only. See
`docs/PANES.md § Adding a new pane type` for the authoring contract.

## room.json structure

```jsonc
{
  "pxdVersion": "2",
  "title": "My Room",
  "topicRoot": "paradox/myroom",

  "mqtt": {
    "broker": "auto",       // "auto" = window.location.hostname
    "port": "auto",         // "auto" = window.location.port
    "wsPath": "/mqtt",      // WebSocket path (Nginx proxy)
    "clientIdPrefix": "myroom_ui_"
  },

  // Named theme + optional per-token overrides + optional custom fonts.
  // Grid breakpoint for narrowWidth / narrowOrder (default 992).
  // (Top-level `layout` remains the optional HTML shell name, e.g. "default-dashboard".)
  "grid": {
    "narrowBreakpointPx": 992
  },

  "theme": {
    "base": "midnight-teal",
    "overrides": { "accent": "#44e0cc" },
    "fonts": [
      { "family": "MyFont", "src": "fonts/MyFont.woff2", "weight": "normal", "style": "normal" }
    ]
  },

  "media": {
    "hero": "media/hero.jpg",       // used via a content pane, see below
    "favicon": "media/favicon.ico"
  },

  // Panel-specific settings, unchanged from earlier PxD versions. These are
  // read directly by game-control/game-status/game-actions/time-lights/hints/system
  // — their pane `config` entry is typically left as `{}` since they read from here.
  "gameControl": { "heartbeatTimeoutMs": 3000 },
  "timeLights":  { "lightsScenesTopicRoot": "paradox/myroom/lights" },
  "hints":       { "hintTopic": "paradox/myroom/hints" },
  "system":      { "watchZones": [ /* ... */ ] },

  "sites": [
    {
      "id": "simple",
      "title": "Simple",
      "description": "Core operator dashboard",
      "type": "pxd",
      "header": null,
      "footer": null,
      "pages": [
        {
          "id": "main",
          "title": "My Room",
          "panes": [
            { "type": "content", "width": "full", "config": { "html": "<img class=\"pxd-hero-banner\" src=\"media/hero.jpg\">" } },
            { "type": "game-control", "width": "full", "config": {} },
            { "type": "time-lights", "width": "half", "config": {} },
            { "type": "hints", "width": "half", "config": {} },
            { "type": "widget-grid", "width": "full", "config": { "widgets": [ { "id": "front-door", "name": "Front Door", "shown": true } ] } },
            { "type": "system", "width": "full", "config": {} }
          ]
        }
      ]
    }
  ]
}
```

If `sites` is omitted entirely, PxD synthesizes a single `pxd` site with id
`control` and a `panes` list read from a top-level `panes` array (useful for
the very simplest single-page rooms) — but declaring `sites` explicitly is
recommended for anything beyond a quick prototype.

## Field reference

### Top level

| Field | Type | Default | Description |
|---|---|---|---|
| `pxdVersion` | string | **required**, must be `"2"` | Schema version |
| `title` | string | `"PxD"` | Default page title, landing-page heading |
| `topicRoot` | string | **required** | Root MQTT topic prefix |
| `layout` | string | `"default-dashboard"` | HTML shell name under `layouts/` (packager) |
| `grid` | object | `{ narrowBreakpointPx: 992 }` | Grid narrow-mode breakpoint (see below) |
| `sites` | array | synthesized single `control` site | See `sites[]` below |

### grid

| Field | Default | Description |
|---|---|---|
| `narrowBreakpointPx` | `992` | Viewport width (px) at which panes switch from `width`/`order` to `narrowWidth`/`narrowOrder`. Phone stacking at `<480px` is fixed in CSS. Agent 22 Live uses `700`. |

Pane entries may also set `order`, `narrowWidth`, and `narrowOrder` — see
`docs/PANES.md`. Example Live top row: wide = status\|logo\|actions; below
the breakpoint = logo full on top, then status\|actions half+half.

### mqtt

| Field | Default | Description |
|---|---|---|
| `broker` | `"auto"` | Hostname/IP or `"auto"` for `window.location.hostname` |
| `port` | `"auto"` | Port or `"auto"` for page port |
| `wsPath` | `"/mqtt"` | Nginx WebSocket proxy path |
| `clientIdPrefix` | `"pxd_"` | MQTT client ID prefix; random suffix appended |

### theme

`theme` is `"<name>"` or `{ base, overrides, fonts }`. See `docs/THEMING.md`
for the full token list, the shipped theme catalog, and the accessibility
rule every theme must satisfy.

### sites[]

| Field | Required | Description |
|---|---|---|
| `id` | ✓ | Designer-chosen. Output subfolder name for `pxd` sites; also used to build the landing-page link for `manual` sites. |
| `title` | | Display name (landing-page link text, page `<title>` fallback) |
| `description` | | Shown as the landing-page link's hover tooltip |
| `type` | | `"pxd"` (default), `"external"`, or `"manual"` |
| `url` | `external` only | Target URL for the landing-page link |
| `header` | | One pane entry `{ type, config }`, sticky to the top of every page in this site |
| `footer` | | One pane entry `{ type, config }`, sticky to the bottom of every page in this site |
| `pages` | `pxd` sites | Array of page objects (see below) |

The starter template includes an optional external site **System Health** (`url: "/health/"`)
pointing at Paradox Health Monitor (PxH). Remove it from `sites` if the host does not run PxH;
or use `http://<host>:19090/ui/` when nginx `/health/` is not configured.

### pages[]

| Field | Required | Description |
|---|---|---|
| `id` | ✓ | Becomes `<pageId>.html`. The first page in the array is also aliased `index.html`. |
| `title` | | Page `<title>` and nav link label |
| `panes` | ✓ | Ordered array of pane entries — see `docs/PANES.md` |

### gameControl

| Field | Default | Description |
|---|---|---|
| `commandTopic` | `topicRoot/commands` | Game command publish topic |
| `stateTopic` | `topicRoot/state` | Game state subscribe topic |
| `configTopic` | `topicRoot/config` | Game config subscribe topic |
| `checklistStateTopic` | `topicRoot/checklist/state` | Room checklist state topic |
| `heartbeatTimeoutMs` | `3000` | State heartbeat watchdog timeout |
| `emergencyActions` | `[]` | Array of `{ label, command, param? }` quick-action buttons |

### timeLights

| Field | Default | Description |
|---|---|---|
| `commandTopic` | `topicRoot/commands` | Time adjust command topic |
| `lightsCommandTopic` | `topicRoot/lights/commands` | Lights command topic |
| `lightsStateTopic` | `topicRoot/lights/state` | Lights state subscribe topic |
| `lightsScenesTopicRoot` | — | If set, subscribes to `<value>/scenes` for a dynamic scene list |
| `clockStateTopic` | `topicRoot/clock/state` | Clock visibility state topic |
| `tvStateTopic` | `topicRoot/tv/state` | TV/browser state topic |

### hints

| Field | Default | Description |
|---|---|---|
| `hintTopic` | `topicRoot/hints` | Topic to publish hints to |

### system.warningTopics

Array of MQTT topic strings (wildcards allowed) whose payloads appear in the
**System Warnings** pane. When omitted, the UI falls back to
`[topicRoot/warnings, topicRoot/+/warnings, paradox/+/system/alerts]`.

Suite MQTT rules (game vs host): see
[`apps/PxH/docs/standards/MQTT-CONTRACT.md`](../../PxH/docs/standards/MQTT-CONTRACT.md).

Recommended starter set:

| Topic | Source |
|---|---|
| `paradox/<room>/warnings` | Room / game engine warnings (PxO) |
| `paradox/<room>/+/warnings` | Per-zone or per-app warnings (PFx, PxO, …) |
| `paradox/+/system/alerts` | **PxH host** alerts (disk, UPS, required services, prune) — **not** game warnings. Machine id is `[machine] id` in `pxh.ini` (often matches a host nickname such as `houdini` or `agent22`, but the topic is still host-scoped). |

Payloads with a `message` field are shown as text; otherwise the JSON is stringified.

### system.watchZones

Array of zone objects:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `label` | string | Display label in warning bar |
| `topic` | string | MQTT topic to watch (any message resets timer) |
| `timeoutMs` | number | Milliseconds without a message before marking Down |

## Packaging

```bash
# From apps/PxD/
node scripts/package.js \
  --room-dir ../../rooms/<game>/pxd \
  --out      ../../rooms/<game>/html
```

`<out>` is the room's `/html/` root, not a single site. Every `pxd` site in
`sites[]` builds into its own `<out>/<siteId>/` subfolder (cleaned and
rebuilt each run — see the safety note below); `<out>/index.html` (the
landing page) is always regenerated.

**Safety:** a `pxd` site's output subfolder is only ever deleted and rebuilt
if it doesn't already exist, or if it contains a `.pxd-generated` marker
file from a previous run of this packager. An existing folder *without*
that marker is left completely untouched and that site's build fails loudly
— this is what protects `manual` sites (and any other hand-placed content)
from ever being silently deleted. Never bulk-delete a room's `html/`
directory by hand before repackaging — check `git status` on it first, as
it may contain legacy files that predate PxD and aren't packager output.

## Adding a new room

1. Create the source folder and copy the starter template:
   ```bash
   GAME=myroom
   mkdir -p rooms/$GAME/pxd/{media,fonts}
   cp apps/PxD/templates/rooms/_starter/room.json rooms/$GAME/pxd/room.json
   ```
2. Edit `room.json`: `title`, `topicRoot`, `theme`, `media`, the panel-settings
   sections (`gameControl`/`timeLights`/`hints`/`system`), then define at
   least one site with at least one page and its `panes` list.
3. Package and serve locally to verify:
   ```bash
   cd apps/PxD
   node scripts/package.js --room-dir ../../rooms/$GAME/pxd --out ../../rooms/$GAME/html
   python3 -m http.server 9090 --directory ../../rooms/$GAME/html
   ```
4. Deploy the room's `html/` directory as usual (Nginx serves it as static
   files; no server-side changes required).
