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

1. Create `rooms/<game>/pxd/room.json` (see template above)
2. Add media files to `rooms/<game>/pxd/media/`
3. Add font files to `rooms/<game>/pxd/fonts/` (if custom fonts needed)
4. Add npm script: `"package:<game>": "node scripts/package.js --room-dir ../../rooms/<game>/pxd --out ../../rooms/<game>/html"`
5. Run the packager and verify the output
