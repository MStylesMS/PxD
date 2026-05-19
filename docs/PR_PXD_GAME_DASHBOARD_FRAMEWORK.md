# Plan: PxD — Paradox Dashboard Framework

> **Scope:** Cross-repo. This document supersedes `rooms/agent22/docs/PR_PUI.md`
> (archived in place as a historical pointer to this file). Precursor task:
> `portfolio/PR_PROP_WIDGETS.md` must ship first; PxD absorbs its widget loader
> unchanged.

## Name

**PxD** — Paradox Dashboard. Consistent with the Px-prefix family (PxO, PxC,
PxT, PxB). "Dashboard" is the operator's mental model: a single-page control
surface for one game room.

*Alternative rejected:* PUI (too generic; clashes with common "Page UI" usage).

---

## Problem statement

Agent22 and Houdini share ~85–90 % of their Web UI code. Every new game
currently starts from a manual copy of one of those pages, diverges immediately,
and becomes impossible to update from a shared baseline.

| Problem | Impact |
|---|---|
| Duplicated HTML/JS/CSS across rooms | Bug fixes must be applied manually to every deployed UI |
| No widget system | Per-prop monitoring cards are hand-coded inline, not reusable |
| Styling embedded in rules | Changing a theme requires editing CSS rules, not just values |
| No upgrade path | Base UI improvements cannot reach deployed rooms without a full rewrite |
| High barrier for new games | Starting a room UI requires cloning and understanding a large page |

---

## Design principles

1. **No build step to develop or run.** Vanilla HTML + CSS + JS (Bootstrap 5,
   jQuery, Paho MQTT). Operators work in plain files. The packager is a copy/prune
   helper, not a bundler.
2. **One file to customize.** Everything room-specific lives in `room.json`.
   Theming is data, not code.
3. **Widgets inherit, then override.** Widget cards are ordinary DOM children of
   the parent page and inherit all CSS custom properties automatically. A widget
   only declares what differs.
4. **Two widget template tiers.** A `base/` library ships with PxD (generic,
   developer-maintained). A `custom/` library accumulates room-specific widgets
   that have been promoted as reusable references (operator-maintained).
5. **Upgradeable in place.** Framework files (panels, runtime JS, base CSS) are
   referenced by rooms, not copied into them. Pulling a new PxD version and
   re-running the packager updates the deployed output without touching `room.json`
   or any widget files.

---

## Mental model

| Concern | Lives in | Owned by | Examples |
|---|---|---|---|
| **Layout** — page skeleton, slot set, panel order, structural CSS | `apps/PxD/layouts/<layout>/` | Developer | `default-dashboard`, `compact-dashboard` |
| **Room** — theme values, MQTT topics, strings, widget manifest | `rooms/<game>/pxd/` (game's own repo) | Operator / game owner | `agent22`, `houdini`, future rooms |
| **Widget** — pluggable per-prop monitor card | `rooms/<game>/pxd/widgets/<id>/` | Operator / game owner | `front-door`, `bomb-timer` |
| **Base templates** — generic copy-to-start scaffolds | `apps/PxD/templates/widgets/base/` | Developer (versioned with PxD) | binary-input, countdown, text-display, numeric-gauge |
| **Custom templates** — promoted room widgets | `apps/PxD/templates/widgets/custom/` | Developer-curated (informal) | Any widget used in 2+ rooms; listed in `custom/README.md` |
| **Example room** — reference implementation shipped with PxD | `apps/PxD/rooms/_example/` | Developer | Single demo room used for testing the packager and as a copy-source |

---

## Directory structure

### PxD framework repo (paradox monorepo)

```
apps/PxD/
  README.md
  CHANGELOG.md
  package.json                        # metadata + packager entry point

  assets/
    css/
      pxd-base.css                    # design tokens (CSS custom properties only — no hardcoded colours)
      bootstrap.min.css               # vendored Bootstrap 5
    js/
      paho-mqtt.js
      jquery.min.js
      pxd.js                          # core: load room.json, resolve layout, mount panels
      panels/
        game-control.js
        time-lights.js
        hints.js
        widgets.js                    # widget loader (absorbed from PR_PROP_WIDGETS.md)
        system.js
    fonts/                            # baseline fonts (rooms can override)

  layouts/
    default-dashboard/
      layout.json                     # slot list, required vs optional, default order
      layout.html                     # skeleton with <div data-slot="…"> insertion points
      layout.css                      # structural CSS (grid, column widths, sizing)
      layout.js                       # optional layout-level behaviour
      README.md                       # slot contract for room authors
    _template/                        # starter for authoring a new layout

  rooms/
    _example/                         # reference room for testing the packager and CI
      room.json
      media/
      widgets/

  templates/
    layouts/
      _starter/
    rooms/
      _starter/                       # copy this folder into your game repo as <game>/pxd/
        room.json                     # commented placeholder values
        media/.gitkeep
        widgets/.gitkeep
        README.md                     # "edit these things in this order"
    widgets/
      base/                           # versioned with PxD; do not edit per-room
        _starter/                     # minimal widget scaffold
        binary-input/                 # reference: single true/false indicator
        countdown/                    # reference: countdown clock
        text-display/                 # reference: arbitrary text field from state message
        numeric-gauge/                # reference: numeric value + threshold alert
      custom/                         # promoted room widgets; entries listed in README.md
        README.md                     # canonical list of available custom templates

  scripts/
    package.js
    package.test.js

  docs/
    SPEC.md                           # full specification (formalised from this document)
    LAYOUTS.md                        # how to author a new layout
    ROOMS.md                          # how to configure a room (operator guide)
    WIDGETS.md                        # widget author contract
    PACKAGER.md                       # packager usage and output structure
    THEMING.md                        # CSS custom-property catalogue
    MIGRATIONS.md                     # breaking-change migration checklists
    config.schema.json                # JSON Schema for room.json (editor autocomplete)
```

### Game repo layout (per game)

Each game repo owns its PxD configuration in a `pxd/` subdirectory, alongside the
existing PxO/PFx config and gameplay media. The framework repo never holds
game-specific files (other than the `_example` reference).

```
rooms/agent22/
  pxd/                                # PxD config for this game — owned by the game repo
    room.json
    media/                            # PxD UI media (hero, favicon, alert sounds, hint audio)
    fonts/                            # optional per-room custom fonts
    widgets/
      front-door/
        widget.html
        widget.js
        widget.css
        media/                        # widget-specific media (sounds, icons)
      bomb-timer/
        widget.html
        widget.js
        media/
  html/                               # packager output (was hand-coded; becomes generated)
  config/                             # PxO + PFx config (unchanged)
  media/                              # PFx gameplay media — videos, scene audio (unchanged)
```

**Multi-room games** (e.g. SpyCatcher with Moscow and Washington) nest each room
under a `rooms/<room>/` directory:

```
rooms/spycatcher/
  moscow/
    pxd/
      room.json
      media/
      widgets/
  washington/
    pxd/
      room.json
      media/
      widgets/
  config/                             # shared PxO/PFx config
  media/                              # shared gameplay media
```

### Where rooms physically live

| Path | Role |
|---|---|
| `rooms/<game>/pxd/` (game repo) | **Working / canonical source.** What the operator edits. |
| `rooms/<game>/html/` (game repo) | **Packager output.** Slim, self-contained shippable copy produced by `package.js`. Not edited directly. |
| `/opt/paradox/html/<game>` | **Nginx-served symlink.** Points at the working source during development (`rooms/<game>/pxd/` with an `index.html` symlink to the framework loader); swung to packager output for production. |

The existing hand-coded `rooms/<game>/html/` directories become generated
artifacts after migration. Their contents are removed during the per-room
adoption (Phases 2–3).

---

## `room.json` schema

```jsonc
{
  "$schema": "../../docs/config.schema.json",
  "pxdVersion": "1",

  "layout": "default-dashboard",

  "title": "Agent 22",
  "topicRoot": "paradox/agent22",

  "mqtt": {
    "broker": "localhost",
    "port": 9001,
    "wsPath": "/mqtt"
  },

  "theme": {
    "primary":      "#1f6feb",
    "accent":       "#7ed4ff",
    "muted":        "#5b6675",
    "ink":          "#d8f4ff",
    "inkSoft":      "#9ad5ea",
    "panel":        "rgba(8,23,36,0.85)",
    "panelBorder":  "rgba(108,223,255,0.28)",
    "warn":         "#ffcc66",
    "danger":       "#ff7272",
    "fontHeading":  "TypewriterBold",
    "fontMono":     "CursedTimer",
    "bgGradient":   "linear-gradient(140deg, #041320 0%, #0a2d46 55%, #133c5a 100%)"
  },

  "media": {
    "hero":         "media/header.png",
    "favicon":      "media/favicon.ico",
    "warning":      "media/warning.mp3",
    "hintDefault":  "media/hint-default.mp3"
  },

  "panels": {
    "include": ["game-control", "time-lights", "hints", "widgets", "system"],
    "exclude": []
  },

  "gameControl": {
    "actions": ["start", "solve", "fail"],
    "checklist": { "topic": "paradox/agent22/checklist/state" },
    "emergency": [
      { "id": "abortGame",        "label": "Abort Current Game",       "style": "abort" },
      { "id": "propsSleep",       "label": "Put Props to Sleep",       "style": "sleep" },
      { "id": "propsWake",        "label": "Wake Props Up",            "style": "wake" },
      { "id": "restartAdapters",  "label": "Restart Props Adapters",   "style": "restart-adapters" },
      { "id": "softwareRestart",  "label": "Restart Software",         "style": "restart-software" },
      { "id": "softwareShutdown", "label": "Shutdown Software",        "style": "shutdown-software" },
      { "id": "machineReboot",    "label": "Reboot Room Controller",   "style": "reboot-controller" },
      { "id": "machineShutdown",  "label": "Shutdown Room Controller", "style": "shutdown-controller" }
    ]
  },

  "timeLights": {
    "lightsTopic": "paradox/agent22/lights",
    "clockTopic":  "paradox/agent22/clock"
  },

  "hints": {
    "presets": [
      { "id": "hint1", "label": "Hint 1", "file": "hint1.mp3" },
      { "id": "hint2", "label": "Hint 2", "file": "hint2.mp3" }
    ],
    "audioTopic":  "paradox/agent22/audio/commands",
    "hintsTopic":  "paradox/agent22/hints/commands"
  },

  "widgets": [
    { "id": "front-door", "label": "Front Door" },
    { "id": "bomb-timer", "label": "Bomb Timer" }
  ],

  "system": {
    "statusTopic":  "paradox/agent22/system/state",
    "commandTopic": "paradox/agent22/system/commands"
  }
}
```

**Schema notes:**
- `pxdVersion` — used by the packager to detect breaking-change mismatches and
  print the appropriate migration checklist.
- `layout` — must match a directory name under `layouts/`; missing layout is a
  hard error at boot.
- `topicRoot` — default prefix; any specific topic field (e.g. `audioTopic`) may
  use a fully-qualified path to override.
- `panels.include` — preferred order; layouts may declare required panels. Rooms
  may omit optional panels. `panels.exclude` removes panels from the layout's
  default order without listing all includes.
- `widgets` — replaces the separate `manifest.json` from PR_PROP_WIDGETS.md. The
  `widgets/<id>/` folder structure is identical.

---

## Layouts

Each layout is a small bundle:

| File | Purpose |
|---|---|
| `layout.json` | Declares panel slots: name, required/optional, default order, min viewport |
| `layout.html` | Page skeleton with `<div data-slot="…">` insertion points |
| `layout.css` | Structural CSS (grid, widths, sizing) — reads paint from CSS custom properties |
| `layout.js` | Optional layout-level behaviour (most layouts omit this) |
| `README.md` | Slot contract and requirements for room authors |

`default-dashboard` mirrors the current Agent22/Houdini single-column panel
layout. Adopting a different layout for a room is a one-line change in
`room.json`. New layouts are a pure developer task; they never require changes
to `room.json` beyond the `layout` key.

---

## CSS theming and widget inheritance

`pxd-base.css` defines all design tokens as CSS custom properties on `:root`
with neutral fallback values. `pxd.js` reads `room.json → theme` at boot and
writes the room's values as an inline `<style>` block before any widget renders.
Rooms never write CSS rules; theming is data. The full catalogue of tokens is
documented in `docs/THEMING.md`.

Widget cards are ordinary DOM children of the page and inherit every token
automatically. A widget that needs to override one token scopes the override to
its own card:

```css
/* widget.css — only affects this widget's card */
#front-door-card { --pxd-accent: #ff4444; }
```

No widget needs to re-declare layout, typography, or color rules that match the
room theme.

---

## MQTT plumbing

A single Paho WebSocket client lives in `pxd.js` and is exposed globally:

```js
window.PxD = {
  config,          // parsed room.json (read-only)
  mqtt: {
    subscribe(topic, handler),
    publish(topic, payload),
    unsubscribe(topic, handler)
  },
  widgets: {       // absorbed from PR_PROP_WIDGETS.md — contract identical
    register({ id, stateTopic, commandTopic, heartbeatTimeoutMs, onMessage })
  }
};
```

The widget API namespace changes from `window.PFx.widgets` (Agent22 interim
implementation) to `window.PxD.widgets`. No backward-compat alias is provided
— widget call sites are updated as part of the per-room migration.

---

## Widget author contract (summary — full detail in `docs/WIDGETS.md`)

- **HTML:** content for the inside of the card body only. The loader supplies
  the header, three-dot menu, and lifecycle chrome.
- **IDs and classes:** must be prefixed with the widget's folder name / `id`
  (e.g. `front-door-led`, `.front-door-status`). The loader does not rewrite
  them.
- **Media paths:** hard-coded relative paths from the page root:
  `widgets/<id>/media/<file>`.
- **Settings block:** all tunable values (MQTT topics, timeouts, field names,
  sounds, thresholds, labels) declared as named constants in a clearly marked
  `// ---- Settings ----` block at the top of `widget.js`.
- **JS shape:** IIFE, registers via `PxD.widgets.register({…})`. Must not
  pollute globals beyond the register call.
- **`onMessage(payload)`:** parses the prop's state message and returns
  `{ state: 'enabled' | 'disabled' }` so the loader can update the card visual.
  Returning `undefined` leaves the visual unchanged.
- **No new MQTT connections.** Widgets use the shared `PxD.mqtt` API only.
- **Built-in card visuals** (header, three-dot menu, disabled/disconnected
  styling) are loader-supplied. Widgets must not reimplement them.

### Widget lifecycle states (supplied by loader — not implemented per widget)

| State | Visual | How it enters |
|---|---|---|
| **enabled** | Full color, matches sibling panels | `onMessage` returns `{ state: 'enabled' }` |
| **disabled** | Muted/greyed | `onMessage` returns `{ state: 'disabled' }` |
| **disconnected** | Enabled color + red border / "Disconnected" badge | No state message within `heartbeatTimeoutMs`; clears on next message |

---

## Widget template tiers

### Base (`templates/widgets/base/`)
Generic, game-agnostic widgets shipped and versioned with PxD. These are the
starting point for all room-specific widgets.

| Template | What it models |
|---|---|
| `_starter` | Minimal scaffold — no specific UI, just the contract skeleton |
| `binary-input` | Single true/false state indicator (open/closed, high/low) |
| `countdown` | Countdown clock driven by a numeric state field |
| `text-display` | Displays an arbitrary text field from the prop's state message |
| `numeric-gauge` | Numeric value with configurable threshold alert |

### Custom (`templates/widgets/custom/`)
Widgets promoted from room use when a second room needs the same shape. Not
guaranteed to stay generic; documented but not versioned with the framework.

**Promotion criterion:** any widget used in two or more rooms qualifies. The
operator copies it to `custom/`, strips room-specific IDs and settings values,
and adds a one-line description to `custom/README.md`.

---

## The packager

```bash
# Common case: package a game's pxd config into the same repo's html/ output
node apps/PxD/scripts/package.js \
  --room-dir /opt/paradox/rooms/agent22/pxd \
  --out      /opt/paradox/rooms/agent22/html

# Dry-run
node apps/PxD/scripts/package.js \
  --room-dir /opt/paradox/rooms/agent22/pxd \
  --out      /opt/paradox/rooms/agent22/html \
  --dry-run

# Built-in example room (used in CI)
node apps/PxD/scripts/package.js --example --out /tmp/pxd-example-out
```

**What it does:**
1. Reads `<room-dir>/room.json`.
2. Resolves the referenced layout from `apps/PxD/layouts/<layout>/`.
3. Resolves each widget folder from `<room-dir>/widgets/<id>/`.
4. Computes the minimal file set: framework assets (including vendored Bootstrap),
   layout files, panels listed in `panels.include`, room `media/` and `fonts/`,
   widget folders.
5. Copies the file set to `--out`. Writes a `manifest.json` (asset list +
   version stamp + source SHA) to the output directory for auditing.

**What it does not do:** transpile, minify, bundle, or modify any source file.

**On `--dry-run`:** prints the file list without copying anything.

**On `pxdVersion` mismatch:** prints the migration checklist from
`docs/MIGRATIONS.md` and exits non-zero. The operator addresses each step and
bumps `pxdVersion` in `room.json` before re-running.

---

## Workflow: new game from scratch

1. **Copy the room starter template into the game repo:**
   ```bash
   cp -r /opt/paradox/apps/PxD/templates/rooms/_starter/ \
         /opt/paradox/rooms/my-game/pxd/
   ```

2. **Edit `pxd/room.json`** (15–30 minutes): fill in `title`, `topicRoot`,
   `mqtt`, `theme` (10–12 color + font values), `media` file references,
   `hints.presets`, and the `emergency` button list.

3. **Drop media files into `pxd/media/`** using the conventional filenames listed
   in `templates/rooms/_starter/README.md` (or override paths in `room.json`).

4. **Open the page in a browser** via the Nginx dev symlink at
   `/opt/paradox/html/my-game` (pointed at `rooms/my-game/pxd/`). The page
   renders with the chosen theme and the default-dashboard layout. MQTT
   connects; all stock panels are functional.

5. **Add widgets incrementally** as props come online:
   ```bash
   cp -r /opt/paradox/apps/PxD/templates/widgets/base/binary-input/ \
         /opt/paradox/rooms/my-game/pxd/widgets/front-door/
   ```
   - Rename all `binary-input-` ID/class prefixes to `front-door-`.
   - Fill in the settings block in `widget.js` (topic, field name, labels, alert sound).
   - Add `{ "id": "front-door" }` to `widgets` in `room.json`.

6. **Package for deployment** when stable:
   ```bash
   node /opt/paradox/apps/PxD/scripts/package.js \
     --room-dir /opt/paradox/rooms/my-game/pxd \
     --out      /opt/paradox/rooms/my-game/html
   ```
   Repoint the Nginx symlink to the output directory.

---

## Workflow: upgrading a deployed room after framework changes

### Impact table

| Change type | Operator action required |
|---|---|
| Panel bug fix | None — next `package.js` run picks it up |
| New panel feature | None — rooms ignore unknown `room.json` keys; new feature is opt-in |
| New base widget template | None — rooms are unaffected until they copy the template |
| CSS token added | None — rooms use only tokens they reference in `room.json` |
| CSS token renamed (deprecated) | Packager warns; old name works for one major version |
| `room.json` key renamed | Packager warns; old key accepted for one major version |
| Layout slot renamed | Only affects rooms using that specific slot; documented in CHANGELOG |
| Breaking change (`pxdVersion` bumped) | Packager prints migration checklist and refuses to package until acknowledged |

### Non-breaking update (most updates)

```bash
git pull          # update PxD
node apps/PxD/scripts/package.js --room my-game --dry-run   # review
node apps/PxD/scripts/package.js --room my-game             # rebuild
# repoint Nginx symlink (or rsync output to Pi)
```

`room.json` and all widget files are **never touched by the packager**. Only the
framework runtime files in the output directory are updated.

### Breaking update

1. The packager detects a `pxdVersion` mismatch and prints the per-version
   migration checklist from `docs/MIGRATIONS.md`.
2. Operator updates `room.json` per the checklist (typically: rename a key, add
   a new required key with its default value).
3. Operator bumps `pxdVersion` in `room.json`.
4. Re-run the packager.

Breaking changes are announced one major version in advance and always provide a
deprecated alias for one version before hard removal.

---

## Phased delivery

| Phase | Deliverable | Gate |
|---|---|---|
| 1 | `apps/PxD/` scaffolded; `default-dashboard` layout; Agent22 migrated and deployed | — |
| 2 | Houdini migrated and deployed; both rooms confirmed working in production | Phase 1 complete |
| 3 | Widget loader (`widgets.js`); base template library; Agent22 first widgets | **Both** Phase 1 and Phase 2 rooms confirmed deployed |
| 4 | Packager + Nginx deploy workflow documented and tested end-to-end | Phase 3 done |
| 5 | SpyCatcher uses PxD from day one (two rooms: `moscow`, `washington`) | Phase 4 done |

---

## Resolved decisions

- **Repo boundary:** `apps/PxD/` lives in the paradox monorepo, consistent with
  PxO / PxC / PxT / PxB.
- **Game repos own their PxD config:** room sources live in
  `rooms/<game>/pxd/`, not under `apps/PxD/`. Only `apps/PxD/rooms/_example/`
  exists in the framework repo, as a reference / CI fixture.
- **Bootstrap is vendored.** The packager always copies `bootstrap.min.css` into
  the output. Pi deployments work fully offline. No CDN dependency at runtime.
- **SpyCatcher shape:** `rooms/spycatcher/moscow/pxd/` and
  `rooms/spycatcher/washington/pxd/`. Each room is fully independent; widget
  templates are pulled from `apps/PxD/templates/widgets/`.
- **Custom widget promotion:** informal. Any widget used in 2+ rooms can be
  copied to `apps/PxD/templates/widgets/custom/<name>/` by whoever does the
  work. **Convention:** every entry in `custom/` must be listed (one line each)
  in `apps/PxD/templates/widgets/custom/README.md`. That list is the canonical
  index of available custom templates.

---

## Relationship to prior documents

| Document | Status |
|---|---|
| `portfolio/PR_PROP_WIDGETS.md` | **Design reference.** Specifies the widget loader contract and widget author API. PxD implements this design directly in Phase 3; no separate pre-implementation step. |
| `rooms/agent22/docs/PR_PUI.md` | **Superseded by this document.** File updated to point here; do not edit it further. |
| `rooms/agent22/docs/PR_PROP_WIDGETS.md` | **Moved to `portfolio/PR_PROP_WIDGETS.md`.** |
