# PxD Widget System

Widgets are small, embeddable UI cards that display real-time game prop state.
Unlike the four legacy-style panes (game-control, time-lights, hints, system),
widgets are room-specific, loaded dynamically, and sized as tiles within a
`widget-grid` pane (see `docs/PANES.md`). A page may contain multiple
`widget-grid` panes, each with its own independent widget set.

---

## Widget source tiers

Widgets come from three tiers, each with a different authoring contract.

| Tier | Location | JS code | Per-instance file | Viewer editable |
|---|---|---|---|---|
| **Template** | `apps/PxD/templates/widgets/base/<name>/` | Shared factory, never copied | `config.json` only | All schema-declared fields |
| **Example** | `apps/PxD/templates/widgets/examples/<name>/` | Self-contained IIFE, copy and optionally extend | Copied `widget.js` + optional `config.json` | Schema-declared fields only |
| **Custom** | Room `pxd/widgets/<id>/widget.js` | Arbitrary JS | `widget.js` + optional `config.json` | Schema-declared fields if schema present; MQTT simulation otherwise |

### Template tier

A template is a **shared factory**: its JS is loaded once per widget type and
instantiated once per widget instance with that instance's `config.json`. You
never copy a template's JS file. A template instance directory contains only:

```
pxd/widgets/front-door/
  config.json          ← required: at minimum sets PROP_TOPIC
  open.gif             ← optional: local assets referenced by filename in config.json
  closed.gif
```

### Example tier

An example is a fully-working IIFE that you **copy once and optionally extend**.
It ships with a `schema` array that tells the viewer which CONFIG fields are
safe to edit without opening `widget.js`. Fields outside the schema require
hand-editing the JS.

```
pxd/widgets/vault-timer/
  widget.js            ← copied from examples/, optionally modified
  config.json          ← optional: overrides internal CONFIG defaults
  assets/
    tick.mp3
```

### Custom tier

A custom widget is arbitrary JS with no structural constraints. If its
`PxD.widgets.register()` call includes a `schema` array, the viewer surfaces
a schema-driven edit form. If not, the viewer provides MQTT simulation only.

---

## Widget instance directory layout

Every widget instance — regardless of tier — lives in its own directory under
`pxd/widgets/<id>/`. The `id` must match the directory name exactly.

```
pxd/widgets/
  front-door/          ← template instance
    config.json
  back-door/           ← template instance with local icon assets
    config.json
    open.gif
    closed.gif
  vault-timer/         ← example instance
    widget.js
    config.json
  master-lock/         ← custom widget
    widget.js
    widget.css
```

Local image files placed in the instance directory can be referenced in
`config.json` by filename only (e.g. `"icon": "open.gif"`). The packager
copies the directory verbatim and the loader resolves filenames relative to
the instance directory at runtime.

---

## Declaring widgets in a `widget-grid` pane

```jsonc
{ "type": "widget-grid", "width": "full", "config": {
  "widgets": [
    { "id": "bomb-timer",  "type": "countdown",   "name": "Bomb Timer", "shown": true },
    { "id": "front-door",  "type": "binary-door", "name": "Front Door", "shown": true },
    { "id": "vault-lock",  "type": "binary-lock", "shown": false }
  ]
} }
```

| Field | Required | Description |
|---|---|---|
| `id` | ✓ | Directory name under `pxd/widgets/`. Unique within the room. |
| `type` | ✓ | Template or example name. Used at runtime to load the shared factory for **template-tier** widgets; informational for example/custom. |
| `name` | | Card header label. Falls back to `DISPLAY_NAME` in `config.json`, then `id`. |
| `shown` | | `true` to show by default; `false` or omitted starts hidden (still loaded — revealable instantly via the pane's gear menu). |

Each entry lives in a `widget-grid` pane's own `config.widgets[]` array in
`room.json` (see `docs/PANES.md § widget-grid`) — there is no separate
"include" list or panel-slot targeting; placing a widget in a different
location on the page means adding it to a different `widget-grid` pane
instance (a page can have as many as it needs).

---

## Tile sizing

Widgets live in a CSS flex tile grid. One height unit is
`var(--pxd-widget-unit, 100px)` (cards add a small header, so `1x1`
min-height is ~110px). The loader sets `data-size` on the card
element; `pxd-base.css` maps `data-size` to width/height rules.

| `SIZE` | Approx width | Approx height | Bootstrap-ish |
|---|---|---|---|
| `"1x1"` | ~16.7 % (6/row) | 110 px | col-2 |
| `"3x1"` | 25 % (4/row) | 110 px | col-3 |
| `"2x1"` | 50 % | 110 px | col-6 |
| `"2x2"` | 50 % | 220 px | col-6 |
| `"4x1"` | 100 % | 110 px | col-12 |
| `"4x2"` | 100 % | 220 px | col-12 |

---

## Card controls — the ⋯ menu

Every widget card has a `⋯` button in its header. Clicking it (or
right-clicking the card) opens a Bootstrap Dropdown:

| Item | Action |
|---|---|
| **Enable** | Publishes `{"command":"enable"}` to the resolved command topic |
| **Disable** | Publishes `{"command":"disable"}` to the resolved command topic |
| **Hide** | Removes the card from the grid until page reload |

The card's visual state updates only when the prop echoes state back via its
state topic — never optimistically. Passive widgets (`COMMAND_TOPIC: null`)
show Enable/Disable greyed out; Hide is always available.

---

## Passive vs active widgets

| Type | `INTERACTIVE` | Behaviour |
|---|---|---|
| **Passive** | `false` | Display-only; subscribes to state topic; no click handler |
| **Active** | `true` | Full card area is a click target; publishes toggle command |

Active widgets use `cursor: pointer` and a hover state. The ⋯ menu is
available on both types.

---

## Topic model

Widget state subscriptions are resolved from three config keys:

| Key | Default | Description |
|---|---|---|
| `BASE_TOPIC` | Room's `baseTopic` from `room.json` | Game/room prefix |
| `PROP_TOPIC` | *(required, no default)* | Prop-specific path segment |
| `SUFFIX_TOPIC` | `"state"` | Appended last; set to `""` to omit entirely |

The resolved topic is assembled as:

```
BASE_TOPIC/PROP_TOPIC/SUFFIX_TOPIC   (all three present)
BASE_TOPIC/PROP_TOPIC                (SUFFIX_TOPIC is "")
PROP_TOPIC/SUFFIX_TOPIC              (BASE_TOPIC is "")
PROP_TOPIC                           (both BASE_TOPIC and SUFFIX_TOPIC are "")
```

No trailing `/` is ever appended. No doubled `/` is inserted.

Command topics follow the same model, replacing `SUFFIX_TOPIC` with
`CMD_SUFFIX_TOPIC` (default `"commands"`).

### Override with STATE_TOPIC

If `STATE_TOPIC` (or `COMMAND_TOPIC`) is provided in `config.json`, it
overrides the three-part derivation entirely and is used as the literal
subscription path. PxD logs a **console warning** on first load when either
override is present, because full hardcoded paths are fragile if the game's
topic structure changes.

```json
{ "STATE_TOPIC": "vendor/sensor/42/status" }
```

### Common suffix values

| Vendor / system | Typical `SUFFIX_TOPIC` |
|---|---|
| Paradox PFx / PxO | `"state"` or `"events"` |
| Node-RED | `"status"` or `"out"` |
| Home Assistant | `"state"` |
| Shelly / raw value | `""` (topic carries the value directly) |
| Custom / legacy | set explicitly |

---

## State mapping

State mapping translates an inbound MQTT payload into a display state.
The `STATE_MAP` object is the single mechanism for all widgets that display
discrete states. It replaces the earlier per-key `OPEN_VALUE` / `OPEN_COLOR`
pattern.

### STATE_MAP object

Each key in `STATE_MAP` is a **state name** (used in logs and editor labels).
The value is a state definition object:

```json
"STATE_MAP": {
    "open": {
        "values":  ["open", "1", "HIGH", "true", "opened"],
        "label":   "OPEN",
        "color":   "#dc3545",
        "bg":      "#3d1117",
        "icon":    "open.gif"
    },
    "closed": {
        "values":  ["closed", "0", "LOW", "false"],
        "label":   "CLOSED",
        "color":   "#198754",
        "bg":      "#0d2818",
        "icon":    "closed.gif"
    },
    "fault": {
        "label":   "FAULT",
        "color":   "#ffc107",
        "bg":      "#332701"
    },
    "*": {
        "label":   "?",
        "color":   "#6c757d"
    }
}
```

**State definition fields:**

| Field | Type | Description |
|---|---|---|
| `values` | string array | MQTT values that trigger this state. If absent, the state name key itself is the only match. |
| `label` | string | Text displayed on the card. |
| `color` | CSS color | Icon and label foreground color. |
| `bg` | CSS color \| `null` | Card body background. `null` = transparent (uses theme default). |
| `icon` | string \| `null` | Icon for this state. Accepts inline SVG, file path (relative to instance directory), or Material Symbols ligature name. `null` = use template default. |

### Match logic

1. For each STATE_MAP key (except `"*"`), check whether the received value
   appears in that state's `values` array (case-insensitive by default).
   If `values` is absent, compare directly against the key string.
2. First match wins; order of keys is preserved.
3. If no key matches, check for `"*"` (catch-all).
4. If `"*"` is also absent, the card retains its last rendered state silently.

### Case sensitivity

Matching is **case-insensitive by default**. The received value is lowercased
before lookup. Set `"CASE_SENSITIVE": true` in `config.json` to require exact
case.

### STATE_FIELD

`STATE_FIELD` names the JSON field extracted from the payload before STATE_MAP
lookup:

```json
{ "STATE_FIELD": "state"  }   // extracts payload.state
{ "STATE_FIELD": "door"   }   // extracts payload.door
{ "STATE_FIELD": null     }   // treats the raw payload string as the value
```

`STATE_FIELD: null` skips JSON parsing entirely. Use this for props that
publish plain values (`1`, `0`, `HIGH`, `LOW`) with no JSON wrapper. If the
payload fails JSON.parse for any reason, the raw string is used automatically
as a fallback regardless of `STATE_FIELD`.

---

## config.json

`config.json` is the per-instance override file. It contains only the keys
that differ from the template defaults. Unknown keys are ignored with a console
warning.

**Minimum viable config for a template instance:**

```json
{
    "PROP_TOPIC": "houdini/front-door"
}
```

**Full example:**

```json
{
    "DISPLAY_NAME":  "Front Door",
    "PROP_TOPIC":    "houdini/front-door",
    "SUFFIX_TOPIC":  "state",
    "STATE_FIELD":   "state",
    "CASE_SENSITIVE": false,
    "SIZE":          "1x1",
    "HEARTBEAT_TIMEOUT_MS": 30000,
    "STATE_MAP": {
        "open": {
            "values": ["open", "1", "HIGH"],
            "label":  "OPEN",
            "color":  "#dc3545",
            "bg":     "#3d1117",
            "icon":   "open.gif"
        },
        "closed": {
            "label":  "CLOSED",
            "color":  "#198754",
            "bg":     "#0d2818"
        },
        "*": {
            "label":  "?",
            "color":  "#6c757d"
        }
    }
}
```

For **example and custom** tier instances, `config.json` is optional. When
present, its values are merged over the widget's internal `CONFIG` object
before `mount()` is called. Keys that appear in the widget's `schema` array
can be edited via the widget viewer without opening `widget.js`.

---

## Widget factory API (template tier)

Template factories are registered with `PxD.widgetTypes.register()`.
This call lives in the shared template JS and is never copied per instance.

```js
PxD.widgetTypes.register('binary-door', {

    // Default CONFIG values — any key may be overridden by instance config.json.
    defaults: {
        PROP_TOPIC:           '',           // required — no default
        SUFFIX_TOPIC:         'state',
        CMD_SUFFIX_TOPIC:     'commands',
        STATE_FIELD:          'state',
        CASE_SENSITIVE:       false,
        INTERACTIVE:          false,
        COMMAND_TOPIC:        null,         // explicit override; use sparingly
        HEARTBEAT_TIMEOUT_MS: 30000,
        SIZE:                 '1x1',
        STATE_MAP: {
            'open':   { values: ['open','1','true'],   label: 'OPEN',   color: '#dc3545' },
            'closed': { values: ['closed','0','false'], label: 'CLOSED', color: '#198754' },
            '*':      {                                 label: '?',      color: '#6c757d' }
        },
    },

    // Schema — declares which config.json keys the widget viewer may edit.
    schema: [
        { key: 'PROP_TOPIC',           type: 'mqtt-topic', label: 'Prop topic',      required: true },
        { key: 'SUFFIX_TOPIC',         type: 'string',     label: 'State suffix'                    },
        { key: 'STATE_FIELD',          type: 'string',     label: 'State field',     nullable: true  },
        { key: 'CASE_SENSITIVE',       type: 'boolean',    label: 'Case-sensitive'                   },
        { key: 'STATE_MAP',            type: 'state-map',  label: 'State mapping'                   },
        { key: 'SIZE',                 type: 'select',     label: 'Tile size',
          options: ['1x1','3x1','2x1','2x2','4x1','4x2']                                                   },
        { key: 'HEARTBEAT_TIMEOUT_MS', type: 'number',     label: 'Heartbeat (ms)',  min: 0          },
    ],

    // Factory function — called once per widget instance.
    // cfg = factory defaults merged with instance config.json.
    // Must return { mount(bodyEl), unmount() }.
    create(cfg) {
        // ... implementation ...
        return { mount, unmount };
    },
});
```

The loader calls `PxD.widgetTypes.get(type).create(mergedCfg)` and passes the
returned `{ mount, unmount }` to the card lifecycle. `create()` receives the
fully merged config — it never reads `config.json` directly.

---

## Widget IIFE API (example and custom tiers)

Example and custom widgets are self-contained IIFEs that call
`PxD.widgets.register()`. The `schema` array is optional but enables the
viewer's edit form.

```js
(function () {

    // ── CONFIG ──────────────────────────────────────────────────────────────
    const CONFIG = {
        PROP_TOPIC:           '',
        SUFFIX_TOPIC:         'state',
        STATE_FIELD:          'state',
        CASE_SENSITIVE:       false,
        INTERACTIVE:          false,
        COMMAND_TOPIC:        null,
        HEARTBEAT_TIMEOUT_MS: 30000,
        SIZE:                 '1x1',
        STATE_MAP:            { /* ... */ },
    };
    // ── END CONFIG ───────────────────────────────────────────────────────────

    // ... implementation ...

    PxD.widgets.register({
        size:                CONFIG.SIZE,
        interactive:         CONFIG.INTERACTIVE,
        heartbeatTimeoutMs:  CONFIG.HEARTBEAT_TIMEOUT_MS,

        // Optional: enables the viewer's edit form for schema-declared keys.
        schema: [
            { key: 'PROP_TOPIC',   type: 'mqtt-topic', label: 'Prop topic', required: true },
            { key: 'SUFFIX_TOPIC', type: 'string',     label: 'State suffix'               },
            { key: 'STATE_MAP',    type: 'state-map',  label: 'State mapping'               },
        ],

        mount(bodyEl) {
            // Read merged config from CONFIG (already patched from config.json
            // by the loader before mount() is called).
            // Inject HTML into bodyEl; subscribe to MQTT.
        },

        unmount() {
            // Unsubscribe; release timers and DOM references.
        },
    });

}());
```

`PxD.widgets.register()` takes **no `id` argument** — the loader assigns the
id from `room.json`. `mount(bodyEl)` receives the card's inner content `<div>`
(below the header).

---

## Schema field types

The `schema` array (in both factory and IIFE registrations) uses the following
`type` values:

| `type` | Editor control | Extra options |
|---|---|---|
| `mqtt-topic` | Text input | `required: true` |
| `string` | Text input | `nullable: true` — adds a ∅ toggle for `null` |
| `color` | Color picker (`<input type="color">`) | — |
| `icon` | Three-tab picker: SVG preview / file path / ligature | — |
| `number` | Number input | `min`, `max` |
| `boolean` | Toggle | — |
| `select` | Dropdown | `options: ['a', 'b', …]` |
| `state-map` | Per-state tab editor | — |

The `state-map` editor renders one tab per STATE_MAP key. Each tab exposes
`label`, `color`, `bg`, and `icon` controls, plus an editable tag list for the
`values` array. New state keys and the `"*"` catch-all can be added or removed.

---

## Widget CSS

Each widget may include an optional `widget.css` alongside `widget.js`
(example/custom tier) or as a declared asset of the template factory. The
loader injects it as a `<link>` before calling `mount()`. CSS classes use a
`wd-<template>-*` prefix to avoid collisions across widget types.

---

## Available base templates

Templates live in `apps/PxD/templates/widgets/base/`. Copy a template directory
to `rooms/<game>/pxd/widgets/<your-id>/`, edit the CONFIG block, and run the
packager. A starter scaffold (`_starter/`) is provided for custom widgets.

| Template | Default size | Type | Description |
|---|---|---|---|
| `_starter` | `2x1` | — | Blank scaffold; starting point for custom widgets |
| `binary-door` | `1x1` | Passive | Door open / closed indicator with icon |
| `binary-light` | `1x1` | Passive | Coloured indicator dot (CSS only) |
| `binary-lock` | `1x1` | Active | Lock icon; click publishes lock/unlock command |
| `binary-switch` | `1x1` | Active | Power/device switch; click publishes allOn/allOff |
| `countdown` | `2x1` | Passive | Countdown clock with warn/danger colour bands |
| `bomb-timer` | `3x1` | Passive | Suitcase/bomb countdown with gameState colour + battery glyph |
| `lights-control` | `1x1` | Active | Colour scene picker + brightness; glyph tinted by scene×brightness |
| `troffer-control` | `3x1` | Active | Paradox Troffer (white on/off, RGB, brightness, UV) |
| `text-display` | `4x1` | Passive | Arbitrary text field from payload |
| `numeric-gauge` | `2x2` | Passive | Numeric value + threshold colour bands |

### binary-switch

Active on/off control for props that accept `allOn` / `allOff` (or custom)
commands. Copy from `templates/widgets/base/binary-switch/`.

| Key | Default | Notes |
|---|---|---|
| `GLYPH` | `"plug"` | Built-in SVG pair: `plug` \| `fan` \| `bulb` \| `tv` |
| `ON_COMMAND` | `"allOn"` | Published as `{ command: "allOn" }` (object, not stringified) |
| `OFF_COMMAND` | `"allOff"` | Published as `{ command: "allOff" }` |
| `ON_VALUE` | `"on"` | State-field value that means on |
| `ICON_ON` / `ICON_OFF` | `null` | Optional overrides; when set, replace the glyph pair |

Glyph summary: **plug** / **fan** / **tv** use a filled icon for ON and the same
icon with a circle+slash for OFF; **bulb** uses a solid bulb with rays for ON
and an outline bulb (no rays) for OFF. **tv** is a classic CRT set with
rabbit-ear antennas.

### lights-control

Active lighting control for PxB (or compatible) light topics. Copy from
`templates/widgets/base/lights-control/`. Publishes `{ command: "setColorScene",
scene }` and `{ command: "setBrightness", brightness }` as objects. Scene list
comes from `SCENES_TOPIC` when available; otherwise uses the same hardcoded
colour scenes as the **Time & Lights** pane.

| Key | Default | Notes |
|---|---|---|
| `STATE_TOPIC` | `REPLACE/…/lights/state` | Reads `scene` / `activeScene` / `lighting.activeScene`, optional `brightness` |
| `SCENES_TOPIC` | `REPLACE/…/lights/scenes` | `{ scenes: [{ id, label, swatch }] }` |
| `COMMAND_TOPIC` | `REPLACE/…/lights/commands` | Target for setColorScene / setBrightness |
| `GLYPH` | `"bulb"` | `ceiling` \| `desk` \| `spotlight` \| `bulb` |
| `SIZE` | `"1x1"` | Prefer `1x1` (compact) or `3x1` |

### troffer-control

Active control for MQTT-native Paradox Troffer / px-wifi-light fixtures
(white on/off, RGB colour + brightness, independent UV). Copy from
`templates/widgets/base/troffer-control/`. UV slider is **0–255** (device
native units). White ON uses scene `white`; White OFF restores current RGB via
`setColor` (or `off` when RGB is black).

| Key | Default | Notes |
|---|---|---|
| `STATE_TOPIC` | `REPLACE/…/state` | Reads `on`, `white`, `r`/`g`/`b`, `brightness`, `uv`, `scene` |
| `COMMAND_TOPIC` | `REPLACE/…/commands` | `setColorScene` / `setColor` / `setBrightness` / `setUV` / `off` |
| `SIZE` | `"3x1"` | Compact operator tile |

### bomb-timer

Passive suitcase/bomb display: mm:ss + `gameState` text colour (+ blink when
paused) + battery glyph. Copy from `templates/widgets/base/bomb-timer/`.
px-wifi-v1 states: `ready`, `not_ready`, `countdown`, `paused`, `defused`,
`detonated` (aliases `running`/`solved`/`failed` also accepted). Cutoff % is
not in the state payload — use CONFIG `BATTERY_LOW_PCT` / `BATTERY_CUTOFF_PCT`
(firmware defaults 40 / 20).

| Key | Default | Notes |
|---|---|---|
| `STATE_TOPIC` | `REPLACE/…/suitcase/state` | `timeRemaining`, `gameState`, `battery`, `lowBattery`, `batteryState` |
| `SIZE` | `"3x1"` | ~25% width |
| `BATTERY_LOW_PCT` | `40` | Yellow / warn when at or below (or `lowBattery`) |
| `BATTERY_CUTOFF_PCT` | `20` | Red when within 5% of cutoff (`≤ cutoff+5`) |

Examples live in `apps/PxD/templates/widgets/examples/`.

---

## Authoring a widget instance

### Path A — from a base template (copy, edit CONFIG)

1. Copy `apps/PxD/templates/widgets/base/<name>/` to
   `rooms/<game>/pxd/widgets/<your-id>/`.
2. Edit only the CONFIG block near the top of `widget.js` — `STATE_TOPIC` is
   required; all other keys have sensible defaults.
3. Place any local icon/image assets in the same directory and reference them
   by filename in the CONFIG block.
4. Add `{ "id": "<your-id>", "type": "<template>", "name": "Label", "shown": true }`
   to a `widget-grid` pane's `config.widgets[]` in `room.json` (see
   `docs/PANES.md § widget-grid`).
5. Run the packager.

### Path B — from an example (copy, configure, optionally extend)

1. Copy `apps/PxD/templates/widgets/examples/<name>/` to
   `rooms/<game>/pxd/widgets/<your-id>/`.
2. Use the widget viewer to edit schema-declared fields, **or** hand-edit the
   CONFIG block in `widget.js` for fields outside the schema.
3. Optionally add a `config.json` with overrides — these merge over the
   internal CONFIG without touching the JS.
4. Add to a `widget-grid` pane's `config.widgets[]` and run the packager.

### Path C — custom widget (from scratch)

1. Create `rooms/<game>/pxd/widgets/<your-id>/widget.js`.
2. Implement the IIFE pattern (see Widget IIFE API above).
3. Add a `schema` array to `PxD.widgets.register()` if viewer edit support is
   wanted.
4. Optionally add `widget.css` for widget-scoped styles.
5. Add to a `widget-grid` pane's `config.widgets[]` and run the packager.

---

## Offline assets

> **Hard requirement**: PxD runs on Raspberry Pi kiosks that may have no
> internet access at runtime. All assets referenced by widgets — icons, fonts,
> images, scripts — **must be available locally**. Never add a CDN URL,
> `fonts.googleapis.com` link, or any other external `http://` reference to a
> widget intended for production deployment.

### Compliant asset formats

| Asset type | Recommended approach |
|---|---|
| Icon glyphs | Inline SVG string in STATE_MAP (`fill="currentColor"`) |
| Icon images | File in instance directory, referenced by filename in `config.json` |
| Icon font (optional) | Vendor WOFF2 + CSS under `assets/fonts/`; point font href to local path |
| Background images | Relative path to file in packaged output |
| Third-party JS/CSS | Copy into `assets/` — no remote `<script src>` or `<link href>` |

### Checking compliance

```bash
# Quick audit: list any external http references in widget files
grep -r 'https\?://' rooms/*/pxd/widgets/
```

All base templates ship with inline SVG defaults so they pass this check
out of the box.

---

*Design proposals for future widget types live in [docs/proposals/](proposals/).*
