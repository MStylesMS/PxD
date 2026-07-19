# Plan: Paradox User Interface (PUI) — shared web UI framework with layouts and rooms

## TL;DR
Extract the ~85–90 % of code shared between the Agent22 and Houdini's-Challenge web UIs into a new `apps/PUI/` app, organised around two concepts:

- **Layouts** (developer-authored, under `apps/PUI/layouts/<layout>/`) — define page structure, panel set, panel ordering, CSS skeleton, and the widget-extension contract. Layouts are designed to be reusable across any game or theme.
- **Rooms** (end-user-configurable, under `apps/PUI/rooms/<room>/`) — pick a layout and supply everything room-specific in a single `room.json` plus the room's `widgets/`, `media/`, and `fonts/`. A room *is* the theme — there is no separate theme concept.

A small **packager** script (`apps/PUI/scripts/package.js`) reads a room, resolves its layout, and exports a self-contained directory containing only the files needed for that room — no PUI app code, no other rooms — ready to drop under Nginx for a customer.

**Architecture: vanilla DOM, no build step required to develop or run** (jQuery + Paho MQTT + Bootstrap 5, served as static HTML). The packager is the only "build-ish" step and is optional during development.

**Format: JSON** for `room.json` (browser parses natively; arrays/nested objects first-class).

This is a follow-on to the widgets PR ([PR_PROP_WIDGETS.md](PR_PROP_WIDGETS.md)); that PR ships first into Agent22's existing UI, and PUI absorbs its loader.

## Mental model

| Concern | Lives in | Owned by | Examples |
|---|---|---|---|
| **Layout** — page structure, panel set, panel ordering, CSS skeleton, slot contract | `apps/PUI/layouts/<layout>/` | Developer | `default-dashboard`, `compact-dashboard`, eventually `kiosk-portrait` |
| **Room** — concrete game configuration (paint + topics + strings + widgets + media) | `apps/PUI/rooms/<room>/` | End user (operator) | `agent22`, `houdini`, future rooms |
| **Widget** — pluggable per-prop monitor card | `apps/PUI/rooms/<room>/widgets/<id>/` | End user (copies + edits a template) | `front-door`, `bomb-timer` |
| **Templates** — copy-to-start scaffolds | `apps/PUI/templates/{layouts,rooms,widgets}/` | Developer ships, end user copies | starter layout, starter room, starter widgets |

**Workflow when adopting PUI for a new game:**
1. End user copies `apps/PUI/templates/rooms/_starter/` → `apps/PUI/rooms/<new-room>/`.
2. Edits `room.json` (layout reference, title, MQTT topics, colors, fonts, hint presets, widget manifest).
3. Drops media into `media/` (conventional filenames or override paths in `room.json`).
4. Copies any needed widgets from `apps/PUI/templates/widgets/` into the room's `widgets/<id>/`, edits the settings block at the top of each `widget.js`.
5. While developing, points the Nginx symlink (`/opt/paradox/html/<room>`) at `apps/PUI/rooms/<room>/`.
6. Once stable, runs the packager → drops a slim production copy at `/opt/paradox/rooms/<room>/html/`, repoints the symlink there.

## Why a single `room.json` (no separate theme file)

Themes only ever apply to a specific game; there is no library of "Halloween themes" that get mixed and matched across rooms. Splitting room config into `room.json` + `theme.json` + `widgets.json` would have been three files describing one logical bundle. A single `room.json` is the simplest expression of "everything room-specific". Sub-objects within it (`theme`, `widgets`, `panels`, `system`, etc.) keep concerns visually separated.

## DOM vs React (decision recap)

**Locked: vanilla DOM, no build/bundler step required to develop or run.**

- Design philosophy: "copy a folder, edit one file, no toolchain" for end users.
- Pages are small (one screen per room). React's component/state machinery solves problems we don't have at this scale.
- The widget loader from PR_PROP_WIDGETS.md is already a tiny component system; keeping it framework-free means a non-developer with HTML+JS basics can ship a new widget.
- Modularisation via ES modules / IIFEs and CSS custom properties; no build needed.
- The packager is *not* a bundler — it copies and prunes; it does not transpile or minify in v1.
- **Escape hatch:** if a future panel ever needs React-grade interactivity, embed a built React widget inside a layout slot as a leaf (same pattern PxC uses). The shell stays vanilla.

## Architecture overview

```
apps/PUI/
  README.md
  CHANGELOG.md
  package.json                       # metadata + packager script entry
  index.html                         # generic loader; reads ?room= or path-derived room id
  assets/
    css/
      pui-base.css                   # design tokens, CSS custom properties
      bootstrap.min.css              # vendored
    js/
      paho-mqtt.js
      jquery.min.js
      pui.js                         # core: load room.json, resolve layout, mount panels
      panels/                        # stock panel implementations (mounted by layouts)
        game-control.js
        time-lights.js
        hints.js
        widgets.js                   # the loader from PR_PROP_WIDGETS.md
        system.js
    fonts/                           # baseline fonts (rooms can override)
  layouts/
    default-dashboard/
      layout.json                    # panel slot list + metadata
      layout.html                    # skeleton with <div data-slot="..."> insertion points
      layout.css                     # layout-specific CSS rules
      layout.js                      # optional layout-level behavior
      README.md
    _template/                       # starter for authoring a new layout
  rooms/
    agent22/
      room.json                      # layout ref + paint + topics + strings + widget manifest
      media/                         # conventional filenames (header.png, warning.mp3, ...)
      fonts/                         # optional per-room fonts
      widgets/                       # copies of templates, edited for this room
        front-door/
          widget.html
          widget.js
          widget.css                 # optional
          media/
        bomb-timer/
          ...
    houdini/
      room.json
      media/
      fonts/
      widgets/
  templates/
    layouts/
      _starter/                      # starter layout (developer-facing)
    rooms/
      _starter/                      # starter room (end-user-facing)
        room.json                    # commented placeholder values
        media/.gitkeep
        widgets/.gitkeep
        README.md                    # "edit these things in this order"
    widgets/
      _starter/                      # starter widget (matches the one in PR_PROP_WIDGETS.md)
      front-door/                    # canonical reference widget — binary input
      bomb-timer/                    # canonical reference widget — countdown clock
  scripts/
    package.js                       # the packager
    package.test.js                  # smoke test
  docs/
    SPEC.md                          # full spec (this doc, formalised)
    LAYOUTS.md                       # how to author a new layout
    ROOMS.md                         # how to configure a room (end-user)
    WIDGETS.md                       # how to author a widget (template + contract)
    PACKAGER.md                      # packager usage and output structure
    THEMING.md                       # CSS custom-property catalogue
    config.schema.json               # JSON-Schema for room.json (editor autocomplete)
```

### Where rooms physically live

| Path | Role |
|---|---|
| `apps/PUI/rooms/<room>/` | **Working / canonical source** for the room's config, widgets, media. This is what the developer/operator edits. |
| `/opt/paradox/rooms/<room>/html/` | **Packager output** — slim, self-contained shippable copy produced by `package.js`. Not edited directly. |
| `/opt/paradox/html/<room>` | **Nginx-served symlink.** Operator-managed: points at `apps/PUI/rooms/<room>/` while developing, swung to `/opt/paradox/rooms/<room>/html/` after packaging. |

This means `/opt/paradox/rooms/<room>/html/` (where the legacy hand-coded UI currently lives) becomes a **generated artifact** under PUI. The hand-coded contents are removed during the per-room migration (see Phase 4 / 5).

## `room.json` schema (initial draft)

```jsonc
{
  "$schema": "../../docs/config.schema.json",

  "layout": "default-dashboard",

  "title": "Agent 22",
  "topicRoot": "paradox/agent22",

  "theme": {
    "primary":      "#1f6feb",
    "accent":       "#7ed4ff",
    "muted":        "#5b6675",
    "fontHeading":  "Typewriter",
    "fontMono":     "CursedTimer",
    "heroTint":     "rgba(0,0,0,0.35)"
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
      { "id": "abortGame",        "label": "Abort Current Game",      "style": "abort" },
      { "id": "propsSleep",       "label": "Put Props to Sleep",      "style": "sleep" },
      { "id": "propsWake",        "label": "Wake Props Up",           "style": "wake" },
      { "id": "restartAdapters",  "label": "Restart Props Adapters",  "style": "restart-adapters" },
      { "id": "softwareRestart",  "label": "Restart Software",        "style": "restart-software" },
      { "id": "softwareShutdown", "label": "Shutdown Software",       "style": "shutdown-software" },
      { "id": "machineReboot",    "label": "Reboot Room Controller",  "style": "reboot-controller" },
      { "id": "machineShutdown",  "label": "Shutdown Room Controller","style": "shutdown-controller" }
    ]
  },

  "timeLights": {
    "lightsTopic":  "paradox/agent22/lights",
    "clockTopic":   "paradox/agent22/clock"
  },

  "hints": {
    "presets": [
      { "id": "tv",    "label": "TV",    "emoji": "📺",
        "target": "paradox/agent22/tv/commands" },
      { "id": "radio", "label": "Radio", "emoji": "📻",
        "target": "paradox/agent22/radio/commands" }
    ],
    "maxLength": 160
  },

  "system": {
    "warnings": [
      { "id": "pfxServiceWarn", "label": "Paradox Fx Down",
        "topic": "paradox/agent22/pfx/heartbeat", "heartbeatTimeoutMs": 5000 },
      { "id": "tvWarn",   "label": "TV Disconnected",
        "topic": "paradox/agent22/tv/state",   "heartbeatTimeoutMs": 15000 },
      { "id": "bombWarn", "label": "Bomb Disconnected",
        "topic": "paradox/agent22/bomb/state", "heartbeatTimeoutMs": 15000 }
    ]
  },

  "widgets": [
    { "id": "front-door", "label": "Front Door" },
    { "id": "bomb-timer", "label": "Bomb Timer" }
  ]
}
```

Notes:
- `layout` is the canonical bind point — naming a layout that doesn't exist is a hard error at boot.
- `panels.include` is the room's preferred order. Layouts may declare *required* panels; rooms can omit *optional* panels. `panels.exclude` is a convenience for "use the layout default order minus these".
- `topicRoot` is the default; any specific topic field can override with a fully-qualified topic.
- `widgets` replaces the manifest file from PR_PROP_WIDGETS.md. The folder layout under `widgets/<id>/` is unchanged.

## Layouts

A layout is a small bundle:

- **`layout.json`** — declares which panel slots the layout supports, which are required vs optional, the default order, and any layout-level metadata (e.g. minimum viewport width).
- **`layout.html`** — page skeleton with `<div data-slot="game-control">` etc. as insertion points. PUI's core mounts the appropriate panel implementation into each slot present in the layout AND included by the room.
- **`layout.css`** — layout-specific structural CSS (grid, column widths, panel sizing). Reads CSS custom properties from `pui-base.css` for paint.
- **`layout.js`** — optional. Most layouts won't need any JS.
- **`README.md`** — describes the slots and any room-side requirements.

`apps/PUI/layouts/default-dashboard/` is the v1 layout that mirrors the current Agent22/Houdini look. Adding a new layout (e.g. `compact-dashboard`, `kiosk-portrait`) is a pure-developer task; rooms can adopt it by changing one line in `room.json`.

## CSS theming

`apps/PUI/assets/css/pui-base.css` defines a catalogue of CSS custom properties at `:root`:
```
:root {
  --pui-primary:      #1f6feb;
  --pui-accent:       #7ed4ff;
  --pui-muted:        #5b6675;
  --pui-bg-panel:     #1b1f2a;
  --pui-font-heading: "Typewriter", system-ui, sans-serif;
  --pui-font-mono:    "CursedTimer", ui-monospace, monospace;
  /* ... */
}
```
`pui.js` injects an inline `<style>` block on boot that overrides these from `room.theme.*`. Rooms do not write CSS; theming is data. Catalogue is documented in `docs/THEMING.md`.

## MQTT plumbing

A single Paho client lives in `pui.js`, exposed as:
```js
window.PUI = {
  config,                                    // parsed room.json
  layout,                                    // resolved layout descriptor
  mqtt:    { client, publish, subscribe },
  panels,                                    // registry of mounted panels
  widgets: { register, getState, ... }       // unchanged from PR_PROP_WIDGETS.md
};
```

PUI re-uses the widget loader from PR_PROP_WIDGETS.md verbatim; only the API namespace changes (`window.PFx.widgets` → `window.PUI.widgets`). Because nothing has shipped to customers, there is **no backward-compat alias** — call sites are updated as part of the migration.

## The packager

`apps/PUI/scripts/package.js` (Node script — uses Node only because `package.json` already implies Node tooling; not part of any runtime path):

**Usage:**
```
node apps/PUI/scripts/package.js \
  --room agent22 \
  --out  /opt/paradox/rooms/agent22/html
```

**What it does:**
1. Reads `apps/PUI/rooms/<room>/room.json`.
2. Resolves the referenced layout from `apps/PUI/layouts/<layout>/`.
3. Reads the widget list and resolves each `widgets/<id>/` folder.
4. Computes the minimal file set:
   - PUI core JS (`pui.js`, `panels/*.js` for included panels only), CSS (`pui-base.css`, layout's `layout.css`).
   - Vendored libs (Paho, jQuery, Bootstrap).
   - Layout's `layout.html` rendered with theme-injection inline.
   - Room's `room.json`, `media/`, `fonts/`, and only the `widgets/<id>/` subfolders that are listed in the manifest.
5. Copies that file set to `--out`, preserving relative paths.
6. Writes a small `pui-package-manifest.json` at the output root listing what was included and the source git commit (for traceability when shipping to a customer).
7. Emits an `index.html` at the output root that is a flattened version of the layout — no parent-directory references back into `apps/PUI/`. The packaged dir is fully self-contained.

**Out of scope for the packager (v1):** minification, JS/CSS concatenation, transpilation, hashing/cache-busting. Those can be added later without changing the v1 output contract.

**Verification rule:** for any room, opening `apps/PUI/rooms/<room>/index.html` (which is a thin loader) and opening `<package-out>/index.html` produces visually identical pages and identical MQTT traffic during a full game cycle.

## Symlinks and operator workflow

- `apps/PUI/rooms/<room>/index.html` is a thin generic loader (vendored from `apps/PUI/index.html` with the room id baked in, or via `<base>` + a path-derived id resolver). Either way, it is the dev-time entry point.
- `/opt/paradox/html/<room>` is the operator-controlled symlink Nginx serves. Operator points it at:
  - `apps/PUI/rooms/<room>/` while iterating.
  - `/opt/paradox/rooms/<room>/html/` after running the packager — this is the slim copy that ships.
- `/opt/paradox/rooms/<room>/html/` is now a **generated** directory (output of the packager). The legacy hand-coded version is removed when the room migrates to PUI.

## Steps

1. **Phase 0 — Diff & extract**
   1.1 Generate a side-by-side diff of the two existing `index.html` files and the two `scripts.js` files; produce a definitive list of every literal/value that differs.
   1.2 Categorise each diff item as: *room field*, *theme variable*, *media file*, or *bug to fix in place*.
   1.3 Lock the v1 `room.json` schema and ship `docs/config.schema.json` for editor autocomplete.
2. **Phase 1 — PUI skeleton + default layout**
   2.1 Create `apps/PUI/` with `index.html`, `assets/`, `layouts/default-dashboard/`, `docs/`, `package.json`, `README.md`, `CHANGELOG.md`.
   2.2 Author `default-dashboard` layout matching the current Agent22/Houdini look (panel slots: `game-control`, `time-lights`, `hints`, `widgets`, `system`).
   2.3 Implement `pui.js` core: load `room.json`, resolve layout, mount panels into slots, inject theme variables.
3. **Phase 2 — Stock panels**
   3.1 Implement `panels/{game-control,time-lights,hints,system,widgets}.js` against a documented panel contract (`mount(rootEl, roomConfig, mqtt)`).
   3.2 Port the widget loader from PR_PROP_WIDGETS.md into `panels/widgets.js`. Rename `PFx.widgets` → `PUI.widgets` (no alias).
4. **Phase 3 — Templates**
   4.1 `templates/layouts/_starter/`, `templates/rooms/_starter/`, `templates/widgets/_starter/`.
   4.2 Move the canonical `front-door` and `bomb-timer` from PR_PROP_WIDGETS.md into `templates/widgets/` as named (non-`_starter`) reference templates.
   4.3 Author `docs/LAYOUTS.md`, `docs/ROOMS.md`, `docs/WIDGETS.md`.
5. **Phase 4 — Pilot in Agent22 (working copy)**
   5.1 Author `apps/PUI/rooms/agent22/room.json`.
   5.2 Copy media into conventional filenames under `apps/PUI/rooms/agent22/media/`.
   5.3 Copy widget folders (the ones built in PR_PROP_WIDGETS.md) into `apps/PUI/rooms/agent22/widgets/`.
   5.4 Operator points `/opt/paradox/html/agent22` at `apps/PUI/rooms/agent22/`. Run a full game cycle for regression check.
6. **Phase 5 — Packager**
   6.1 Implement `scripts/package.js` per the spec above.
   6.2 Run packager for Agent22 → output at `/opt/paradox/rooms/agent22/html/` (replacing the legacy hand-coded directory).
   6.3 Operator swings `/opt/paradox/html/agent22` to the packaged output. Re-run the regression cycle.
   6.4 Document the packager workflow in `docs/PACKAGER.md`.
7. **Phase 6 — Migrate Houdini's-Challenge**
   7.1 Author `apps/PUI/rooms/houdini/room.json`.
   7.2 Copy media + widgets into `apps/PUI/rooms/houdini/`.
   7.3 Run packager → `/opt/paradox/rooms/houdinis-challenge/html/`.
   7.4 Resolve the `paradox/agent22s-challenge/checklist/state` topic-naming inconsistency as part of this phase (or document explicit override in `room.json`).
   7.5 Same regression-test protocol as Agent22.
8. **Phase 7 — Documentation**
   8.1 Update `apps/PUI/docs/{SPEC,LAYOUTS,ROOMS,WIDGETS,PACKAGER,THEMING}.md`, `apps/PUI/README.md`.
   8.2 Update both rooms' `README.md` and `AI-DETAILED-OVERVIEW.md`.
   8.3 Update `/opt/paradox/AGENTS.md` and `/opt/paradox/AI-INSTRUCTIONS.md` to reference PUI.

## Relevant files (created/changed)

- `apps/PUI/` — entire new tree (created).
- `apps/PUI/layouts/default-dashboard/` — first layout, mirrors current look.
- `apps/PUI/rooms/agent22/` — Agent22 working source under PUI.
- `apps/PUI/rooms/houdini/` — Houdini working source under PUI.
- `apps/PUI/scripts/package.js` — the packager.
- `apps/PUI/templates/{layouts,rooms,widgets}/` — starter scaffolds + reference widgets.
- `/opt/paradox/rooms/agent22/html/` — replaced by packager output (legacy hand-coded contents removed during Phase 5).
- `/opt/paradox/rooms/houdinis-challenge/html/` — replaced by packager output (Phase 6).
- `/opt/paradox/html/<room>` — operator-controlled symlink, repointed during cutover.
- `/opt/paradox/SYMLINKS_IN_GIT.md` — note any new symlinks committed to the repo.

## Verification

1. **Pixel parity (Phase 2 exit):** screenshot diff of PUI Agent22 (working copy) vs the legacy Agent22 page at 1280, 1920, and 2560 px widths shows no meaningful differences.
2. **MQTT parity:** mosquitto trace of all subscribed topics + all published messages during a full game cycle (start → hints → solve and start → fail) is identical between legacy and PUI.
3. **Layout swap:** create a stub second layout (`compact-dashboard`) and change `room.json`'s `layout` field; reload; confirm the page reflows to the new layout without any other config changes.
4. **Room-only customisation:** create a fake third-room directory under `apps/PUI/rooms/`; supply a `room.json` and minimal media; confirm the dashboard renders with the new title/theme/topics and that publishing test messages updates the right widgets — all without touching `apps/PUI/layouts/` or `apps/PUI/assets/`.
5. **Theme override:** changing `room.theme.primary` in `room.json` and reloading visibly recolours accents without any CSS edits.
6. **Missing-asset handling:** rename `media/header.png` to a different name; PUI logs a clear warning and falls back to a placeholder rather than rendering a broken image.
7. **Widget portability:** the `front-door` and `bomb-timer` widgets work without code edits under PUI (`window.PUI.widgets` API, verified via DevTools console).
8. **Packager output is self-contained:** the packaged Agent22 output, copied to a clean machine with only Nginx + mosquitto, runs identically to the working copy.
9. **Packager prunes correctly:** widgets not listed in `room.widgets` do not appear in the packaged output; layouts other than the room's chosen one do not appear; no path in the output references `apps/PUI/`.
10. **Game cycle on hardware:** full game on the Agent22 Pi5, then on the Houdini Pi, with `paradox-control.sh` restart and `journalctl -u pfx -f` clean.
11. **Operator dry-run:** an operator who hasn't read the PUI docs can change the room title and accent colour given only `docs/ROOMS.md`.

## Decisions & assumptions (locked)

- **Architecture:** vanilla DOM, no build step required for development or runtime. The packager is the only optional "build-ish" step.
- **Config format:** JSON. One `room.json` per room (no separate theme file).
- **Location:** `apps/PUI/` (peer to PFx, PxO, PxC, PxT, Pio, PxB).
- **Two-layer model:** developer-authored **layouts** + end-user-configurable **rooms**. No separate "theme" concept — themes only exist as part of a room.
- **Room file layout:** `apps/PUI/rooms/<room>/{room.json, media/, fonts/, widgets/}`. Widgets ship with the room (each is a hand-edited copy of a template).
- **Templates:** `apps/PUI/templates/{layouts,rooms,widgets}/`. The canonical `front-door` and `bomb-timer` widgets live in `templates/widgets/`.
- **Working source vs shipped artifact:** `apps/PUI/rooms/<room>/` is the canonical edit-time source. `/opt/paradox/rooms/<room>/html/` is the **packager output** — slim, self-contained, what ships. Operator-controlled `/opt/paradox/html/<room>` symlink picks which one Nginx serves at any moment.
- **Packager output:** a single self-contained directory. No minification or concatenation in v1 — just copy + prune. Includes a `pui-package-manifest.json` listing source commit + included files for traceability.
- **Stock panels in v1:** Game Control, Time/Lighting/Safety, Hint Delivery, Widgets, System Warnings. Custom panels are a v1.1 feature; the layout slot mechanism reserves the door for them.
- **MQTT:** single shared Paho client in `pui.js`, exposed as `window.PUI.mqtt`. The widget loader becomes `window.PUI.widgets`. **No `PFx.widgets` alias** — nothing has shipped that depends on the old name.
- **Ordering:** PR_PROP_WIDGETS.md ships first into Agent22's existing UI; PUI ships after and absorbs that loader.
- **Rollout:** Agent22 first (working copy → packager → cutover); Houdini second after Agent22 has run a stable cycle. Legacy `html/` directories are replaced (not preserved) once the packaged output is verified.
- **No persistent operator state** carried by PUI itself; per-session in-memory only.

**Out of scope for v1:**
- Custom panels beyond the stock five (slot mechanism reserves room; implementation deferred).
- INI ingestion (JSON only).
- Server-side rendering / SSR.
- Authentication or multi-user state.
- Migration of PxT or PFx UIs.
- Packager features beyond copy+prune (minification, hashing, etc.).
- A library of multiple layouts in v1 — only `default-dashboard` ships. Additional layouts are a follow-up.

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Regression in production rooms during cutover | Medium | High | The operator-controlled symlink lets cutover and rollback be one `ln -sf`. Run side-by-side (working copy vs packaged) for at least one full game cycle before declaring done. |
| Layout/room boundary leaks (panels accumulate "is this an Agent22 thing or a layout thing?" flags) | Medium | Medium | Hard rule: any room-specific behavior goes in `room.json` or a widget. Panels read room config; layouts only define structure. New flags on layouts are a code smell that requires review. |
| Modal/copy strings (emergency labels, abort confirm) currently hard-coded in JS | High | Low | Phase 0 catalogues every literal; modals become room-driven in Phase 2. |
| CSS specificity surprises (selectors that "look generic" but rely on Agent22 dimensions/colors) | Medium | Medium | Use CSS custom properties throughout; visual regression check at three widths in verification step 1. |
| MQTT topic inconsistencies surfaced by migration (e.g. existing `agent22s-challenge/checklist/state` typo) | High | Low | Resolve as part of the Houdini migration phase; document via explicit override in `room.json` rather than silent fix. |
| Versioning drift between PUI core and rooms after first ship to customers | Low | Medium | PUI gets its own `CHANGELOG.md` and version field. The packager records source commit in `pui-package-manifest.json`. Same discipline as PFx/PxO. |
| Packager bugs corrupting customer shipments | Low | High | `package.test.js` smoke test in Phase 5; manual diff of packaged Agent22 vs working copy as part of Phase 5 verification. |
| Symlink resolution differs across deploy targets (Pi vs dev box) | Low | Medium | Test under Nginx on both Pi5 and dev Linux before cutover. The packaged output has no symlinks internally — only the operator's `/opt/paradox/html/<room>` is a symlink. |
| Operators unable to author/edit `room.json` | Low | Low | Ship `config.schema.json` for VS Code autocomplete + `templates/rooms/_starter/`. `docs/ROOMS.md` walks through the common edits. |
| Layout authoring is too ad-hoc, every layout invents its own slot names | Medium | Medium | `docs/LAYOUTS.md` defines the canonical slot ids that stock panels expect; layouts can add new slots but must opt in to a stock panel by using its canonical slot id. |

## Open questions

1. **Symlink-vs-wrapper for the room's `index.html`** under `apps/PUI/rooms/<room>/`. Symlink to `apps/PUI/index.html` is cleanest; a 3-line wrapper sets `<base>` and includes PUI. Recommend wrapper for portability across Windows dev boxes (if any).
2. **Custom-panel format for v1.1.** Same loader pattern as widgets (recommended)? Or a different model where layouts compose stock primitives? Resolved when we tackle the first non-stock panel need.
3. **Houdini topic typo (`agent22s-challenge`).** Fix during migration (breaking for any external subscriber) or leave behind a config-level override and migrate later? Lean: explicit override + one-line follow-up issue.
4. **Where does the PUI repo live?** Standalone GitHub repo (like PFx, PxO) or only inside the monorepo? Recommend standalone, with the monorepo containing it as a tracked component (same as the rest of the family).
5. **Bootstrap version pinning.** Vendor it (Houdini already does) for offline-Pi reliability, or keep the CDN dependency? Recommend vendoring; do it as part of Phase 1.
6. **Does the packager produce a tarball/zip in addition to the directory?** Useful for shipping to customers via email/USB. Recommend deferring until first real customer shipment; directory output is the v1 contract.
7. **Layout "required slots" vs "optional slots" enforcement.** Does PUI hard-error if a layout's required slot has no corresponding panel included by the room, or just warn? Recommend hard-error to catch config drift early.

## Effort and sequencing

Order of magnitude: a few focused days of work spread over a couple of weeks of regression testing across both rooms. Most of the code volume is *deletion of duplicated code* and *parameter-extraction*, not greenfield. The layout split adds modest scaffolding. Expect Phases 0+1 in one PR, Phases 2+3 in a second, Phase 4 (Agent22 working copy) in a third, Phase 5 (packager + Agent22 cutover) in a fourth, Phase 6 (Houdini) in a fifth. Documentation is updated alongside each phase.

**Sequencing relative to other work:**
- Land [PR_PROP_WIDGETS.md](PR_PROP_WIDGETS.md) into Agent22 first. PUI absorbs it unchanged structurally; only the API namespace changes.
- After PUI v1 is stable on both rooms, retire the duplicated-UI codepath in favor of "all rooms use PUI".
