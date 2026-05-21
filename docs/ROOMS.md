# PxD — Room Configuration Guide (ROOMS.md)

Each room has a `pxd/` folder inside its repo root:

```
rooms/<game>/pxd/
  room.json      # required
  media/         # optional — hero, favicon, images
  fonts/         # optional — web font files
  panels/        # optional — room-local or override panels
  widgets/       # optional, Phase 3
```

### Room-local panels (`panels/`)

Place custom panel JS files here. The packager checks this directory **before**
the framework panels directory, so:

- A file named `time-lights.js` here replaces the framework `time-lights.js`
  for this room only.
- A file with a new name (e.g. `header.js`) adds a new panel; it must also
  appear in `panels.include` and have a matching `data-slot` in the layout.

See [USERS_GUIDE.md § Creating custom and room-local panels](USERS_GUIDE.md)
for a full walkthrough.

---

## room.json structure

```jsonc
{
  // Required
  "pxdVersion": "1",
  "layout": "default-dashboard",
  "title": "Agent 22",
  "topicRoot": "paradox/agent22",

  // MQTT connection settings
  "mqtt": {
    "broker": "auto",       // "auto" = window.location.hostname
    "port": "auto",         // "auto" = window.location.port  
    "wsPath": "/mqtt",      // WebSocket path (Nginx proxy)
    "clientIdPrefix": "agent22_ui_"  // optional, default "pxd_"
  },

  // Visual theme
  "theme": {
    "bgColor1":   "#041320",
    "bgColor2":   "#0a2d46",
    "bgColor3":   "#133c5a",
    "panel":      "rgba(8, 23, 36, 0.85)",
    "panelBorder":"rgba(108, 223, 255, 0.28)",
    "ink":        "#d8f4ff",
    "inkSoft":    "#9ad5ea",
    "accent":     "#44e0cc",
    "accentAlt":  "#6de79a",
    "warn":       "#ffcc66",
    "danger":     "#ff7272",
    "radius":     "14px",
    "shadow":     "0 12px 28px rgba(0,0,0,0.35)",
    "fontBody":   "TypewriterBold, Courier New, monospace",
    "fontMono":   "CursedTimer, Courier New, monospace",
    "fonts": [
      { "family": "TypewriterBold", "src": "fonts/TypewriterBold.ttf", "weight": "normal", "style": "normal" },
      { "family": "CursedTimer",    "src": "fonts/CursedTimer.ttf",    "weight": "normal", "style": "normal" }
    ]
  },

  // Media assets (paths relative to packager output root)
  "media": {
    "hero":    "media/hero.jpg",
    "favicon": "media/favicon.ico"
  },

  // Panels to include (ordered — determines load and mount order)
  "panels": {
    "include": ["game-control", "time-lights", "hints", "system"]
  },

  // Panel-specific overrides (each key matches a panel id)
  "gameControl": {
    "checklistStateTopic":  "paradox/agent22s-challenge/checklist/state",
    "heartbeatTimeoutMs":   3000
  },

  "timeLights": {
    "lightsScenesTopicRoot": "paradox/agent22/lights",
    "clockStateTopic":       "paradox/agent22/clock/state",
    "tvStateTopic":          "paradox/agent22/tv/state"
  },

  "hints": {
    "hintTopic": "paradox/agent22/hints"
  },

  "system": {
    "warningTopics": [
      "paradox/agent22/warnings",
      "paradox/agent22/+/warnings"
    ],
    "watchZones": [
      { "id": "pfxService", "label": "Paradox Fx", "topic": "paradox/agent22/tv/state",        "timeoutMs": 12000 },
      { "id": "tv",         "label": "TV",          "topic": "paradox/agent22/tv/state",        "timeoutMs": 12000 },
      { "id": "wallclock",  "label": "Wallclock",   "topic": "paradox/agent22/wallclock/state", "timeoutMs": 15000 },
      { "id": "suitcase",   "label": "Suitcase",    "topic": "paradox/agent22/suitcase/state",  "timeoutMs": 15000 }
    ]
  }
}
```

---

## room.json field reference

### Top level

| Field | Type | Default | Description |
|---|---|---|---|
| `pxdVersion` | string | **required** | Schema version; currently `"1"` |
| `layout` | string | `"default-dashboard"` | Layout id |
| `title` | string | `"PxD"` | Page title and header text |
| `topicRoot` | string | **required** | Root MQTT topic prefix |

### mqtt

| Field | Default | Description |
|---|---|---|
| `broker` | `"auto"` | Hostname / IP or `"auto"` for `window.location.hostname` |
| `port` | `"auto"` | Port or `"auto"` for page port |
| `wsPath` | `"/mqtt"` | Nginx WebSocket proxy path |
| `clientIdPrefix` | `"pxd_"` | MQTT client ID prefix; random suffix appended |

### theme

All fields are optional. Unmapped fields fall back to the defaults in `pxd-base.css`.

See [THEMING.md](THEMING.md) for the full token reference.

### panels.include

Ordered list of panel IDs. Panels are loaded and mounted in this order. Unknown IDs produce a build warning but do not fail the packager.

### gameControl

| Field | Default | Description |
|---|---|---|
| `commandTopic` | `topicRoot/commands` | Game command publish topic |
| `stateTopic` | `topicRoot/state` | Game state subscribe topic |
| `configTopic` | `topicRoot/config` | Game config subscribe topic |
| `checklistStateTopic` | `topicRoot/checklist/state` | Room checklist state topic |
| `heartbeatTimeoutMs` | `3000` | State heartbeat watchdog timeout |

### timeLights

| Field | Default | Description |
|---|---|---|
| `commandTopic` | `topicRoot/commands` | Time adjust command topic |
| `lightsCommandTopic` | `topicRoot/lights/commands` | Lights command topic |
| `lightsStateTopic` | `topicRoot/lights/state` | Lights state subscribe topic |
| `lightsScenesTopicRoot` | — | If set, subscribes to `<value>/scenes` for dynamic scene list |
| `clockStateTopic` | `topicRoot/clock/state` | Clock visibility state topic |
| `tvStateTopic` | `topicRoot/tv/state` | TV/browser state topic |

### hints

| Field | Default | Description |
|---|---|---|
| `hintTopic` | `topicRoot/hints` | Topic to publish hints to |

### system.watchZones

Array of zone objects:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `label` | string | Display label in warning bar |
| `topic` | string | MQTT topic to watch (any message resets timer) |
| `timeoutMs` | number | Milliseconds without a message before marking Down |

---

## Packaging

```bash
# From apps/PxD/
node scripts/package.js \
  --room-dir ../../rooms/<game>/pxd \
  --out      ../../rooms/<game>/html
```

Or use the npm script:

```bash
npm run package:<game>
```

---

## Adding a new room

For a guided walkthrough see [QUICK_START.md](QUICK_START.md).  The condensed
steps are:

1. Create the source folder and copy the starter template:

```bash
GAME=myroom
mkdir -p rooms/$GAME/pxd/{media,fonts}
cp apps/PxD/templates/rooms/_starter/room.json rooms/$GAME/pxd/room.json
```

2. Edit `room.json` **in this order** (each step builds on the last):

| # | Field(s) | What to set |
|---|---|---|
| 1 | `title` | Display name in the browser tab |
| 2 | `topicRoot` | Root MQTT prefix (e.g. `paradox/myroom`) |
| 3 | `mqtt.*` | Leave `"auto"` for same-host Pi; set explicit values for remote broker |
| 4 | `theme.*` | Colours, fonts, radius — see [THEMING.md](THEMING.md) |
| 5 | `media.hero` / `media.favicon` | Drop files in `pxd/media/` first |
| 6 | `panels.include` | Ordered list of panels to mount |
| 7 | Panel sections | `gameControl`, `timeLights`, `hints`, `system` — topic overrides |
| 8 | `widgets[]` | One entry per prop widget; add `"widgets"` to `panels.include` |

3. Add a package shorthand to `apps/PxD/package.json`:

```jsonc
"package:myroom": "node scripts/package.js --room-dir ../../rooms/myroom/pxd --out ../../rooms/myroom/html"
```

4. Run the packager and serve locally to verify:

```bash
cd apps/PxD
npm run package:myroom
python3 -m http.server 9090 --directory ../../rooms/myroom/html
```

5. Deploy to a Pi:

```bash
scripts/deploy.sh --room myroom --host <pi-hostname>
```

→ See [PACKAGER.md](PACKAGER.md) for packager options and the full `deploy.sh` reference.
→ See [QUICKREF.md](QUICKREF.md) for one-liner cheat-sheet.
