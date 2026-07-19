# Plan: Prop & Puzzle Widgets — pluggable per-prop monitor cards

> **Renamed from PR_WEB_UI_PROP_MONITOR.md.** Terminology is now **widgets** throughout. The runtime API is `PFx.widgets`, the directory is `widgets/`, and the manifest key is `widgets`. Nothing has shipped, so there is no compatibility alias.

## TL;DR
Add a new "Prop and Puzzle Monitoring" panel to the Agent22 Web UI between "Time, Lighting, and Safety" and "Hint Delivery". Populate it at runtime from a pluggable set of **widgets** loaded from per-widget subdirectories. A manifest declares which widgets load and in what order. If the list is empty, the whole panel hides.

Approach: **manifest-driven client-side fetch + a small loader in `scripts.js`** — no build step, parent styling inherits by default, each widget is a fully self-contained folder (HTML, optional JS, optional CSS, **its own `media/` subdirectory referenced via hard-coded paths**), cleanly extends to controls later.

Every widget gets a built-in tri-state lifecycle (**enabled / disabled / disconnected**) supplied by the loader so widget authors don't reimplement it. Card visual state is **driven entirely by the prop's published state message** — the UI never sets state locally. A built-in three-dot menu button at the top-right of each card lets the operator send `enable` / `disable` commands to the prop; `disconnected` is purely a function of heartbeat timeout on the prop's state topic.

This PR ships the feature **into the existing Agent22 page** (`rooms/agent22/html/`). The follow-on PUI consolidation ([PR_PUI.md](PR_PUI.md)) absorbs the loader unchanged.

## Context (discovered)
- Page is static HTML served by Nginx (symlinked `/opt/paradox/html/agent22/` → `rooms/agent22/html/`). No server-side templating.
- All UI logic lives in `index_files/scripts.js`; MQTT via Paho over `ws://host/mqtt`. `init()` already subscribes to `paradox/agent22/...` topics — widgets piggyback on the shared client.
- Existing panels: `panel-control`, `panel-time-lights`, `panel-hints`, `panel-system` — share Bootstrap 5 + custom `style.css`. The new panel matches.

## Approach (Option A — chosen)
Manifest-driven client-side fetch. Each widget lives in `html/widgets/<widget-id>/` containing `widget.html`, optional `widget.js`, optional `widget.css`, optional `media/`. A `html/widgets/manifest.json` lists active widgets in order. A loader in `scripts.js` fetches each `widget.html`, inserts it into the panel body, then dynamically loads its JS/CSS. Widgets call a registration API (`PFx.widgets.register(...)`) to hook into the existing MQTT client.

**Pros:** No build step. Parent CSS inherits by default. Media stays per-widget. Templates are just folders to copy. Hide-if-empty trivial. Easy to add controls later. Per-game customization = different `manifest.json`.

**Cons:** Async load means the panel renders progressively (mitigated with placeholder card). ~50–80 lines of loader code. Widgets must namespace IDs to avoid DOM collisions (enforced by convention/id-prefix).

*(Alternatives B–E — iframes, build-time concat, Web Components, single-file JS-only — were considered and rejected; see prior revision history if needed.)*

## Directory layout (new)

```
rooms/agent22/html/
  widgets/
    manifest.json                 # ordered list of active widget ids
    front-door/                   # sample 1 — binary input
      widget.html
      widget.js
      widget.css                  # optional
      media/
        ding.mp3
    bomb-timer/                   # sample 2 — countdown clock
      widget.html
      widget.js
      media/
        warn.mp3
    _template/                    # derived from front-door at end of Phase 4
      widget.html
      widget.js
      widget.css
      media/
        .gitkeep
      README.md                   # author contract
```

### `manifest.json` shape
```json
{
  "widgets": [
    { "id": "front-door", "label": "Front Door" },
    { "id": "bomb-timer", "label": "Bomb Timer" }
  ]
}
```
- `id` is the widget's folder name and unique instance identifier (one folder = one instance).
- `label` is optional display name override; if omitted the loader uses the title set by the widget itself.
- Per-widget settings (topics, heartbeat timeout, value mappings, alert sounds, etc.) **are not in the manifest** — they live as named constants at the top of each widget's `widget.js`.
- Empty `widgets` (or missing file) → loader leaves the panel `hidden`.
- Two similar widgets (e.g. two Levers) get two folders (`lever-left/`, `lever-right/`); do not parameterise one folder for two instances.

### `index.html` change
Insert between current lines 133 and 135:
```html
<section class="panel panel-widgets" id="panel-widgets" hidden>
  <div class="panel-header panel-header-tight">
    <h2 class="panel-title">Prop and Puzzle Monitoring</h2>
  </div>
  <div class="widgets-grid" id="widgetsGrid"></div>
</section>
```

### Loader (added to `scripts.js`, called from `init()` after MQTT connect)
1. `fetch('./widgets/manifest.json')` — on 404 or empty, do nothing (panel stays hidden).
2. For each entry in order:
   - Create `<div class="widget-card" data-widget-id="${id}" data-widget-state="enabled">` with a header bar (title + `.widget-menu-btn` three-dot top-right); append to `#widgetsGrid`.
   - `fetch('./widgets/${id}/widget.html')` → inject HTML inside the card body.
   - If `widget.css` exists, inject `<link rel="stylesheet" href="./widgets/${id}/widget.css">` (loaded **after** parent CSS so widget rules win).
   - If `widget.js` exists, inject `<script src="./widgets/${id}/widget.js">`. The script self-registers via `PFx.widgets.register(...)`, providing `stateTopic`, `commandTopic`, `heartbeatTimeoutMs` (constants at the top of `widget.js`).
   - Wire built-in lifecycle (three-dot menu, heartbeat watcher) automatically.
3. Once at least one widget loads successfully, remove `hidden` from `#panel-widgets`.
4. Expose API:
   ```js
   window.PFx = window.PFx || {};
   PFx.widgets = {
     mqtt: client,
     publish(topic, payload) { ... },
     subscribe(topic, handler) { ... },
     register({
       id,                       // matches folder name; unique
       title,                    // display title (manifest.label overrides)
       stateTopic,               // MQTT topic the prop publishes to
       commandTopic,             // MQTT topic to send enable/disable etc. (optional)
       heartbeatTimeoutMs,       // 0 / undefined => not monitorable
       onMount(rootEl, ctx),     // called once after HTML is in the DOM
       onMessage(payload, raw),  // called for every state message; should return
                                 //   { state: 'enabled'|'disabled'|undefined } so the
                                 //   loader can update card visual from prop state.
       onState(state),           // optional: notified after state changes
       onTeardown()              // optional cleanup
     }) { ... },
     getState(id)                // current visual state of the card
   };
   ```
   Note: there is **no `PFx.widgets.setState`** — visual state is read from the prop's published state message via `onMessage`'s return value, plus the loader's heartbeat watcher. The three-dot menu sends a *command* (`enable`/`disable`) on `commandTopic`; the card only flips colour once the prop echoes the new state.
5. CSS additions to `style.css`: `.panel-widgets`, `.widgets-grid`, `.widget-card`, `.widget-card[data-widget-state="disabled"]`, `.widget-card[data-widget-state="disconnected"]`, `.widget-card-header`, `.widget-menu-btn`, `.widget-menu-popover`.

## Lifecycle states (built-in, applied to every widget)

Card visual state is a **read-only reflection of the prop's published state**. The UI never decides its own state; it only sends commands the prop may or may not honour.

| State | Visual | How it's set |
|---|---|---|
| **enabled** | full color, matches sibling panels | The prop's last state message reported `enabled` (or equivalent — `onMessage` returns `{ state: 'enabled' }`). Also the initial state on page load. |
| **disabled** | muted/greyed using existing page muted-color tokens; "Disabled" indicator | The prop's last state message reported `disabled`. |
| **disconnected** | enabled-color base + warning accent (red border / "Disconnected" indicator) | Heartbeat watcher: no state message received within `heartbeatTimeoutMs`. Cleared automatically on next state message. |

- **Initial state:** every card starts `enabled`. Monitorable widgets (`heartbeatTimeoutMs > 0`) flip to `disconnected` if no message arrives in that window.
- **Heartbeat:** loader records the timestamp of every state message and runs a 1 s watcher. This is the **only** path into `disconnected`.
- **Three-dot menu (top-right of each card):** popover with **Enable Prop** / **Disable Prop**. Selecting one publishes `{ "command": "enable" | "disable" }` on `commandTopic`. Card visual only changes when the prop publishes the new state — visible operator confirmation that the command landed.
- **Disabled state — message handling:** loader continues routing MQTT messages to `onMessage` regardless of card visual state, so state stays current and the card recovers when the prop re-enables itself.

## Widget author contract (documented in `_template/README.md`)
- Author writes `widget.html` with content for **the inside of a single `widget-card` body** — no card header, no three-dot menu, no panel chrome, no width/positioning rules. Loader supplies the header and menu.
- All DOM ids and CSS classes inside the widget **must** be prefixed with the widget's `id` (e.g. `front-door-led`, `.front-door-led`). Loader does not rewrite them.
- All media paths are **hard-coded** as `widgets/<id>/media/<file>`. Authors copy the folder, rename, update the prefix and any media references in one pass.
- **All tunable settings (MQTT topics, heartbeat timeout, value field names, alert sounds, thresholds, labels, etc.) are declared as named constants at the top of `widget.js`**, in a clearly marked `// ---- Settings ---- ` block.
- Widget JS is an IIFE and registers via `PFx.widgets.register({...})`, passing those constants. Must not pollute globals other than via the register call.
- `onMessage(payload)` parses the prop's state message and **returns `{ state: 'enabled' | 'disabled' }`** so the loader can update the card visual. Returning `undefined` leaves the visual unchanged.
- Widgets **must not** open new MQTT connections; they use the shared `PFx.widgets` API.
- Built-in card visuals (header, three-dot menu, disabled/disconnected styling) are loader-supplied; widgets must not reimplement them.

## Sample widgets (shipped with this PR)

Two concrete widgets are built first; the `_template/` is **derived from the simpler one afterward** (parameterised with placeholders) — not built generically up front.

### Sample 1 — Simple binary input (`front-door`)
- **Purpose:** simplest possible widget. Watches a state topic and shows a single state indicator (true/false, high/low, open/closed).
- **`manifest.json` entry:** `{ "id": "front-door", "label": "Front Door" }`
- **`widget.js` settings block:** `STATE_TOPIC`, `COMMAND_TOPIC`, `HEARTBEAT_TIMEOUT_MS`, `VALUE_FIELD`, `TRUE_LABEL`, `FALSE_LABEL`, `ALERT_SOUND` (path `widgets/front-door/media/...`), `ALERT_ON_VALUE`.
- **UI:** large pill that reads the truthy/falsy label and colour-codes (e.g. red OPEN / green CLOSED). Mute/unmute toggle for the alert sound.
- **State message contract:** JSON payload on `STATE_TOPIC`; `VALUE_FIELD` (default `value`) coerced to boolean. Optional `enabled` (or `state`) field; widget returns `{ state: 'enabled' | 'disabled' }`.
- **Command message:** three-dot menu publishes `{ "command": "enable" | "disable" }` on `COMMAND_TOPIC`.

### Sample 2 — Countdown clock (`bomb-timer`)
- **Purpose:** monitor a clock prop; display remaining time and run/pause/finished status. (Detailed semantics deliberately deferred — placeholder schema.)
- **`manifest.json` entry:** `{ "id": "bomb-timer", "label": "Bomb Timer" }`
- **`widget.js` settings block:** `STATE_TOPIC`, `COMMAND_TOPIC`, `HEARTBEAT_TIMEOUT_MS`, `WARN_AT_MS`, `WARN_SOUND`.
- **UI:** big monospace `MM:SS` (or `HH:MM:SS`) using the existing `CursedTimer` font; status pill (`Running` / `Paused` / `Stopped` / `Finished`); mute toggle.
- **State message contract (placeholder):**
  ```json
  { "status": "running",
    "remainingMs": 0, "totalMs": 0, "ts": 0, "enabled": true }
  ```
  - When `status === "running"`, the widget ticks locally between messages using `ts` + `remainingMs`, resyncs on each new message.
  - When `remainingMs <= WARN_AT_MS` for the first time, plays `WARN_SOUND` (if not muted).
  - `onMessage` returns `{ state: payload.enabled === false ? 'disabled' : 'enabled' }`.
- **Command message:** three-dot menu publishes `{ "command": "enable" | "disable" }`. (Future control row may add `pause` / `resume` / `reset` / `setTime`.)

## Steps

1. **Phase 1 — Markup & styling skeleton**
   1.1 Add `panel-widgets` `<section>` to `rooms/agent22/html/index.html` (hidden by default).
   1.2 Add `.panel-widgets`, `.widgets-grid`, `.widget-card`, three state styles, `.widget-card-header`, `.widget-menu-btn`, `.widget-menu-popover` to `style.css` matching existing panel/muted-color tokens.
2. **Phase 2 — Loader + lifecycle** *(depends on 1)*
   2.1 Add widget loader to `scripts.js`; call from `init()` after MQTT `onConnect`.
   2.2 Expose `window.PFx.widgets` API.
   2.3 Implement card header + three-dot menu (Enable / Disable → publish to `commandTopic`).
   2.4 Implement heartbeat watcher (1 s tick) → `disconnected` after `heartbeatTimeoutMs`; auto-clear on next message.
   2.5 Wire `onMessage` return (`{ state }`) to update `data-widget-state`.
3. **Phase 3 — Sample widgets** *(depends on 2)*
   3.1 Build `widgets/front-door/` (binary input) — settings block at top of `widget.js`, hard-coded media paths.
   3.2 Build `widgets/bomb-timer/` (countdown) — same conventions.
   3.3 Create `widgets/manifest.json` listing both samples (ship enabled).
4. **Phase 4 — Derive `_template/`** *(depends on 3)*
   4.1 Copy the simpler sample, strip prop-specific behaviour, leave placeholders + inline comments.
   4.2 Add `_template/README.md` describing the author contract.
5. **Phase 5 — Documentation** *(parallel with 4)*
   5.1 Update `rooms/agent22/AI-DETAILED-OVERVIEW.md` and `README.md` with a "Widgets" section.
   5.2 Note in `rooms/houdinis-challenge/` that the pattern is reusable (follow-up).

## Relevant files
- `rooms/agent22/html/index.html` — insert new `<section>` between lines 133 and 135.
- `rooms/agent22/html/index_files/scripts.js` — add loader; wire into `init()` (line 1236) after MQTT `onConnect` (~line 1242). Reuse existing `client` and `onMessageArrived` routing.
- `rooms/agent22/html/index_files/style.css` — append widget-related rules; reuse existing `--panel-*` tokens.
- `rooms/agent22/html/widgets/` — new directory tree.
- `rooms/agent22/AI-DETAILED-OVERVIEW.md`, `README.md` — document the new pattern.
- `rooms/houdinis-challenge/html/` — out of scope here but architecturally compatible.

## Verification
1. Empty `manifest.json` → panel not rendered.
2. Both samples in manifest → both cards appear; styling matches sibling panels at 1280 and 1920 widths.
3. DevTools Network: only listed widgets are fetched; missing optional `widget.css` handled silently.
4. Publish `{"value":true,"enabled":true}` to `front-door`'s `STATE_TOPIC` → pill flips OPEN; alert sound plays when unmuted.
5. Publish `{"value":false,"enabled":false}` → card flips to `disabled` (muted styling); messages still flow.
6. Stop publishing for `>HEARTBEAT_TIMEOUT_MS` → card auto-flips to `disconnected`. Resume → recovers to reported state.
7. Three-dot menu → popover with **Enable Prop** / **Disable Prop** → publishes `{ "command": ... }` on `COMMAND_TOPIC` (verify with `mosquitto_sub`). Card visual does **not** change until prop echoes new state.
8. Reload page → cards start `enabled`; monitorable widgets degrade to `disconnected` after `HEARTBEAT_TIMEOUT_MS` if no message arrives.
9. `./scripts/paradox-control.sh restart && status`; tail `journalctl -u pfx -f` for unrelated regressions.

## Decisions & assumptions (locked)
- **Architecture:** Option A — manifest + client-side fetch.
- **Terminology:** **widgets** throughout — folder, manifest key, API, CSS classes, data attributes. No `PFx.props` alias (nothing has shipped).
- **Media paths:** each `widget.html` hard-codes `widgets/<id>/media/<file>`. Each widget is fully self-packaged.
- Optional `widget.css` is loaded **after** parent CSS so a widget can override.
- Widget isolation by **convention** (id-prefix + IIFE).
- Panel is **hidden** when no widgets are configured.
- Widgets share the existing Paho MQTT client; no new connections.
- **Card visual state is driven by the prop's published state**, not by local UI decisions. Loader's `onMessage` return-value contract is the only path the widget can set `enabled` vs `disabled`.
- **`disconnected` is heartbeat-only.** No operator override.
- **Initial state on page load is `enabled`**; monitorable widgets degrade to `disconnected` after `HEARTBEAT_TIMEOUT_MS`.
- **Three-dot menu** at top-right of each card provides **Enable Prop** / **Disable Prop**, publishing `{ "command": "enable" | "disable" }` on `commandTopic`. Card waits for prop to echo new state before changing colour.
- **Disabled cards still receive messages.**
- **One folder = one instance.** No `instanceId` parameter.
- **All per-widget tunables (topics, heartbeat, value mappings, sound paths, labels) live as named constants at the top of each `widget.js`.** Manifest only carries `id` and optional `label`.
- **Sample manifest ships enabled** so reviewers see the feature immediately.
- **Countdown-clock state schema is a placeholder** and will be tightened when the real producer is defined.
- Initial scope is monitoring + enable/disable; loader API is forward-compatible with richer controls.

**Out of scope:** introducing a build/bundler step; broader `scripts.js` refactor; applying the pattern to PxT or PFx UIs; the parallel change for Houdini's-Challenge; persistent (cross-reload) operator overrides; richer per-widget control rows beyond enable/disable.

## Forward compatibility with PUI

A future "Paradox User Interface" (PUI) consolidation is planned in [PR_PUI.md](PR_PUI.md). PUI relocates the shared chrome (panels, MQTT plumbing, theming, layouts) into `apps/PUI/` and treats each room as a configurable folder under `apps/PUI/rooms/<room>/` containing a single `room.json` (which references a developer-authored layout) plus the room's `widgets/`, `media/`, and `fonts/`. This widgets PR is intentionally designed to translate cleanly:

- **Loader paths are room-relative** (`./widgets/manifest.json`, `./widgets/<id>/...`). Under PUI the `widgets/` folder simply moves under `apps/PUI/rooms/<room>/widgets/`; only the loader code moves into PUI's shell. No path rewriting in any widget.
- **Per-widget settings live in each `widget.js`**, not in the page HTML — PUI does not have to inherit any widget-specific state.
- **`PFx.widgets` API** is the same API PUI exposes. PUI may rename it to `PUI.widgets`; if so, this PR's call sites get updated as part of the PUI migration. There are no shipped customer widgets to keep compatible.
- **Widget HTML, CSS, JS, and `media/` layout** stay exactly as specified here under PUI; no churn at the widget-author level.
- **Templates** under `apps/PUI/templates/widgets/` are the canonical home for new starter widgets after PUI ships. Until then, `_template/` lives next to the samples in this PR.

**Action item for PUI work (tracked in PR_PUI.md):** when migrating Agent22 to PUI, port the loader and the two sample widgets as part of the cutover and confirm zero behavioural changes. No changes to this PR are required.
