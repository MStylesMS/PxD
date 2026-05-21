# PxD Implementation Plan — phased delivery with checklists

> Detailed execution plan for [PR_PXD_GAME_DASHBOARD_FRAMEWORK.md](PR_PXD_GAME_DASHBOARD_FRAMEWORK.md).
> `PR_PROP_WIDGETS.md` is the design reference for the widget loader contract; no
> separate pre-implementation step is required. Both Agent22 and Houdini must be
> fully migrated and confirmed deployable before widget work (Phase 3) begins.
>
> Each phase declares:
> - **Goal** — what shipping this phase means.
> - **Recommended model** — the lowest-cost model that should produce reliable
>   results for the bulk of the work, with an escalation path for hard sub-tasks.
> - **Checklist** — concrete deliverables, in order.
> - **Acceptance criteria** — how we know the phase is done.

---

## Model selection guide

The aim is to get good results without defaulting to Opus or GPT-5.5. The
following tiers are used throughout the plan:

| Tier | Examples | Best at | Use for |
|---|---|---|---|
| **Light** | Claude Haiku, GPT-4.1 mini, Gemini Flash | Mechanical edits, file copies with renames, simple boilerplate, find/replace at scale, README tidy-ups | Scaffolding, template instantiation, renaming widget prefixes, generating starter files from a known shape |
| **Mid** *(default)* | Claude Sonnet, GPT-4.1 | Most app code, multi-file edits, debugging, doc writing, test scaffolds, packager logic | The bulk of every phase. Default to this unless a task explicitly calls for Light or Heavy. |
| **Heavy** *(escalate only)* | Claude Opus, GPT-5 / 5.5 | Architectural decisions with ambiguous trade-offs, untangling subtle async/event bugs, large refactors of legacy code | Use only when Mid produces wrong or low-confidence answers two attempts in a row, or for the listed escalation tasks. |

**Escalation rule:** if a Mid-tier session can't make progress in two attempts on
the same sub-task, save context to a `/memories/session/` note, switch to Heavy
for that sub-task only, then return to Mid.

**Anti-pattern:** running Heavy by default. The phases below are scoped so Mid
handles them comfortably.

---

## Phase 1 — `apps/PxD/` scaffolded; Agent22 migrated

**Goal:** PxD framework exists with the `default-dashboard` layout, `pxd.js`
runtime, panel implementations (no widget loader yet), vendored Bootstrap, and
`pxd-base.css`. Agent22 is fully migrated and deployable via PxD — visually
identical to the current hand-coded page, all MQTT functionality intact. No
widget panel yet; that is Phase 3.

**Recommended model:** Mid for `pxd.js`, panels, layout JSON, and the Agent22
migration. Light for vendoring static files and producing initial directory
structure.

**Escalation candidate:** Heavy only if the slot-mounting logic for layouts
turns out to need non-trivial generic handling (it shouldn't — slots are named
divs).

**Checklist — scaffold:**
- [x] Create `apps/PxD/` with `README.md`, `CHANGELOG.md`, `package.json`. *(CHANGELOG.md deferred)*
- [x] Vendor Bootstrap 5: `assets/css/bootstrap.min.css`, Paho MQTT, jQuery into `assets/js/`.
- [x] Write `assets/css/pxd-base.css` with the full design-token catalogue. Document each token in `docs/THEMING.md`. *(defaults are currently Agent22-specific; will be neutralised in Phase 2 — TODO in file)*
- [x] Write `assets/js/pxd.js`:
  - [x] Fetch `room.json` (relative to page).
  - [ ] Validate `pxdVersion`; emit migration warning if older but compatible; error if breaking. *(packager detects missing field; runtime migration warning not yet implemented — low priority)*
  - [x] Apply `theme.*` values as inline `<style>` on `<html>` before mount.
  - [x] Resolve `layout` reference, fetch `layout.html`, inject into body.
  - [x] For each slot present in layout and included in `room.json → panels.include`: dynamically import the matching panel from `assets/js/panels/<name>.js` and mount.
  - [x] Initialise single Paho MQTT client from `mqtt.broker / port / wsPath`; expose `window.PxD.mqtt = { subscribe, publish, unsubscribe }`.
  - [x] `window.PxD.widgets` is not mounted in this phase; the `widgets` slot in the layout is declared optional and is omitted from room `panels.include` until Phase 3.
- [x] Port each existing Agent22/Houdini panel into `assets/js/panels/`:
  - [x] `game-control.js` (start/solve/fail/checklist/emergency buttons; reads `gameControl.*` from `room.json`).
  - [x] `time-lights.js` (clock + lights state; reads `timeLights.*`).
  - [x] `hints.js` (preset list, audio playback; reads `hints.*`).
  - [x] `system.js` (system status + restart/shutdown; reads `system.*`).
  - [x] `widgets.js` — **not implemented this phase.** File is not created. The `widgets` slot in `layout.json` is marked optional; `pxd.js` silently skips unmounted optional slots.
- [x] Build `layouts/default-dashboard/`:
  - [x] `layout.json` declaring slots (`game-control`, `time-lights`, `hints`, `widgets`, `system`) with required/optional flags and default order.
  - [x] `layout.html` with `<div data-slot="…">` placeholders matching the existing Agent22 single-column structure.
  - [x] `layout.css` for structural rules only (grid/widths); paint comes from `pxd-base.css` tokens.
  - [x] `README.md` documenting the slot contract.
- [x] Build `templates/rooms/_starter/`:
  - [x] `room.json` with every supported key present and commented; placeholder values.
  - [x] `README.md` listing the edit order: title → topicRoot → mqtt → theme → media → hints → emergency → widgets.
- [ ] Build `rooms/_example/` — a minimal demo room used in CI tests of the packager. *(low priority — tests currently use temp dirs)*
- [x] Write `docs/SPEC.md` (formalised from the framework PR), `docs/LAYOUTS.md`, `docs/ROOMS.md`, `docs/THEMING.md`.
- [x] Stub `docs/WIDGETS.md` with a placeholder noting the widget loader ships in Phase 3.
- [ ] Write `docs/config.schema.json` (JSON Schema for `room.json`). *(low priority — deferred to Phase 2)*

**Checklist — packager (minimum viable):**
- [x] `scripts/package.js` accepts `--room-dir`, `--out`. *(--dry-run and --example not yet implemented)*
- [x] Resolves layout, widget folders, asset list.
- [x] Copies file set, vendoring `bootstrap.min.css` into the output.
- [ ] Writes `manifest.json` (assets + version + source git SHA if available). *(low priority)*
- [ ] Detects `pxdVersion` mismatch and refuses with checklist. *(detects missing field; version comparison not yet implemented — low priority)*
- [x] `scripts/package.test.js` written and passes (16/16). *(runs against temp dirs; should be updated to use `rooms/_example/` once that is populated)*

**Checklist — Agent22 migration:**
- [x] Create `rooms/agent22/pxd/`.
- [x] Fill in `room.json` matching current Agent22 theme. `widgets` not in `panels.include`.
- [x] Move PxD media (hero, favicon) to `rooms/agent22/pxd/media/`.
- [x] Move PxD fonts (`TypewriterBold.ttf`, `CursedTimer.ttf`) to `rooms/agent22/pxd/fonts/`.
- [x] Run packager into `rooms/agent22/html/`.
- [x] Swing `/opt/paradox/html/agent22` symlink to packager output; verify all four panels work on a real Pi. *(symlink was already correct; packager output confirmed live)*
- [x] Confirm Agent22 page is visually/functionally identical to hand-coded version. *(approved 2026-05-19)*
- [x] Delete the old hand-coded `rooms/agent22/html/*` (removed via `git rm`; recoverable via git history).

**Acceptance criteria:**
- Agent22 page is visually indistinguishable from the pre-migration version.
- All MQTT topics work; all buttons publish correct payloads.
- No widget panel shown (expected — not implemented yet).
- `node scripts/package.js --room-dir … --out …` produces a self-contained directory; serving it via Nginx yields a working page.
- `package.test.js` passes in CI.

---

## Phase 2 — Houdini migrated to PxD

**Goal:** Houdini is fully migrated to PxD and deployable with no PxD-side code
changes. Together with Phase 1, this proves PxD is genuinely reusable and
delivers two rooms that can be deployed to production.

> **Deployment gate:** Phases 3–5 do not begin until both Agent22 and Houdini
> are packaged, deployed via packager output, Nginx symlinks swung to that
> output, and confirmed working in production.

**Recommended model:** Mid; this is mostly mechanical (extract Houdini's theme,
populate `room.json`, relocate media). If PxD needs a new theme token to
accommodate something Houdini has and Agent22 doesn't, add it to `pxd-base.css`
in the same PR.

**Checklist:**
- [x] Create `rooms/houdinis-challenge/pxd/` from `templates/rooms/_starter/`.
- [x] Extract Houdini's theme values from `rooms/houdinis-challenge/html/index_files/style.css`; populate `room.json → theme`. Do **not** include `widgets` in `panels.include`.
- [x] Move PxD media (header image, favicon) to `pxd/media/`.
- [x] Move PxD fonts (`AlmendraSC-Regular.woff2`) to `pxd/fonts/`.
- [x] Add `bgGlow1`/`bgGlow2` theme tokens to `pxd-base.css`; document in `docs/THEMING.md`. Neutralised all Agent22-specific hardcodes from `pxd-base.css` in the same pass.
- [x] Fixed `injectFonts` in `pxd.js` to auto-detect font format from extension (required for `.woff2`; previously always emitted `"truetype"`).
- [x] Responsive overflow fixes: `layout.css` `minmax(0,1fr)`, `.status-pill` flex shrink, `.control-grid` auto-fit, container queries for `time-lights` (post-`@media` ordering). Applied to both rooms.
- [x] Checklist button: replaced toast with a centered Bootstrap modal.
- [x] Time-lights panel header overflow (TypewriterBold / Agent22): removed inline `min-width:120px` from clock pill; added `flex-wrap: wrap` + `width: 100%` on the pill at `≤560px` container.
- [x] Run packager into `rooms/houdinis-challenge/html/`.
- [x] Delete old hand-coded `rooms/houdinis-challenge/html/*` (removed via `git rm`; recoverable via git history).
- [x] Repackage Agent22 (its `room.json` gained `bgGlow1`/`bgGlow2` values in this phase; responsive fixes also applied).
- [x] Point Nginx symlink at packager output; verify all four panels on a real Pi. *(confirmed 2026-05-19)*

**Acceptance criteria:**
- Houdini page is visually indistinguishable from the pre-migration version.
- All MQTT-driven functionality works.
- No code changes were required in `apps/PxD/` for the migration itself (theme-token additions don't count as breaking the rule; new tokens are non-breaking).
- **Both Agent22 and Houdini are confirmed deployed and working in production before Phase 3 begins.**

---

## Phase 3 — Widget loader, base templates, and first room widgets

**Goal:** The widget panel is fully implemented in PxD. Both rooms gain widgets.
Agent22 ships its two reference widgets (`front-door`, `bomb-timer`). Four
base templates cover the common prop patterns. `docs/WIDGETS.md` is complete.

This phase begins only after the Phase 2 deployment gate is cleared.

**Recommended model:** Mid for the loader JS and widget author documentation;
Light for the base template derivation (mechanical renames from the reference
widgets).

**Escalation candidate:** Heavy only if the async lifecycle (heartbeat watcher +
MQTT subscription teardown) produces subtle bugs that Mid can't resolve in two
attempts.

**Checklist — widget loader:**
- [x] Implement `assets/js/panels/widgets.js`:
  - [x] Widget list read from `room.json → widgets[]` array via `PxD.config.widgets` *(implementation deviation: no separate `manifest.json`; list is co-located with room config, which is simpler and avoids an extra HTTP fetch)*.
  - [x] For each entry: create widget card with header + three-dot button; dynamically load `widget.js` and optional `widget.css`; no `widget.html` injection — widgets render entirely from JS into the card body.
  - [x] Expose `window.PxD.widgets = { register({ size, interactive, commandTopic, heartbeatTimeoutMs, mount, unmount }) }`.
  - [x] Heartbeat watcher (1 s tick) flips card to `data-state="disconnected"` after `heartbeatTimeoutMs` without a state message; clears on next message.
  - [x] Three-dot menu: **Enable** / **Disable** publish `{"command":"enable"}` / `{"command":"disable"}` to `commandTopic`; card state flips only when prop echoes new state. **Hide** collapses card visually (reversible via gear overlay).
  - [x] Slot visible immediately; collapses (`display:none`) only when `widgets[]` is empty, so Houdini gets no dead space.
  - [x] *(Additional)* Gear icon (inline Material SVG) in panel header opens a visibility overlay listing all declared widgets with checkboxes; **Apply** button shows/hides cards and updates state.
- [x] Add widget card CSS to `assets/css/pxd-base.css`: `.widget-card`, `.widget-card[data-state]`, `.widget-card-header`, `.widget-card-name`, `.widget-menu-btn`, `.widget-menu-popover`, `.widget-menu-item`, `.widgets-grid`, `.widget-gear-btn`, `.widget-vis-overlay`, `.widget-vis-dialog`, `.widget-vis-row`.
- [x] Add `widgets` to `panels.include` in `rooms/agent22/pxd/room.json` and `rooms/houdinis-challenge/pxd/room.json`.

**Checklist — base widget templates (`apps/PxD/templates/widgets/base/`):**
- [x] `_starter/` — minimal scaffold with placeholder comments; `README.md` documenting rename/edit steps.
- [x] Binary-state templates *(plan had one `binary-input/`; split into three variants to cover the most common prop patterns)*:
  - [x] `binary-door/` — open/closed door indicator. Settings: `STATE_TOPIC`, `COMMAND_TOPIC`, `VALUE_FIELD`, `TRUE_LABEL`, `FALSE_LABEL`, `TRUE_COLOR`, `FALSE_COLOR`, `ALERT_SOUND`, `ALERT_ON_VALUE`, `HEARTBEAT_TIMEOUT_MS`.
  - [x] `binary-light/` — on/off light indicator. Same settings block.
  - [x] `binary-lock/` — locked/unlocked indicator. Same settings block.
- [x] `countdown/` — countdown clock. Settings: `STATE_TOPIC`, `COMMAND_TOPIC`, `SECONDS_FIELD`, `WARN_AT_SECONDS`, `WARN_SOUND`, `FORMAT` (`mm:ss` / `h:mm:ss`), `HEARTBEAT_TIMEOUT_MS`.
- [x] `text-display/` — arbitrary text field. Settings: `STATE_TOPIC`, `TEXT_FIELD`, `LABEL`, `MAX_LENGTH`, `MONO_FONT`, `HEARTBEAT_TIMEOUT_MS`.
- [x] `numeric-gauge/` — numeric value with threshold alert. Settings: `STATE_TOPIC`, `VALUE_FIELD`, `MIN`, `MAX`, `WARN_THRESHOLD`, `DANGER_THRESHOLD`, `UNIT_LABEL`, `HEARTBEAT_TIMEOUT_MS`.
- [x] Each base template has its own `README.md` and `widget-meta.json` *(meta added: description, author, size, interactive flags for widget-viewer browser)*.
- [x] *(Additional)* `tools/widget-viewer.html` — in-browser template gallery that auto-scans all `widget-meta.json` files; committed to `apps/PxD/`.

**Checklist — Agent22 room widgets (`rooms/agent22/pxd/widgets/`):**
- [x] `front-door/` — derived from `binary-door/`; `STATE_TOPIC: paradox/agent22/front-door/state`.
- [x] `bomb-timer/` — derived from `countdown/`; `STATE_TOPIC: paradox/agent22/suitcase/state`; `SECONDS_FIELD: timeRemaining`; size `2x1`.
- [x] Widget list declared in `rooms/agent22/pxd/room.json → widgets[]` *(no separate manifest.json)*.
- [x] Repackage Agent22; widgets panel visible with both tiles.
- [ ] Verify widgets function on a real Pi (hardware test pending).

**Checklist — docs:**
- [x] `docs/WIDGETS.md` — widget author contract, lifecycle states, settings block convention, heartbeat, three-dot menu, card sizes, full authoring checklist.
- [ ] Add end-to-end manual-test recipe for each base template to `docs/WIDGETS.md`.

**Acceptance criteria:**
- [x] Agent22 page shows the widgets panel with `front-door` and `bomb-timer` tiles.
- [x] Three-dot menu enable/disable publishes correct commands; hide is reversible via gear overlay.
- [ ] Heartbeat timeout transitions card to `disconnected` within `HEARTBEAT_TIMEOUT_MS + 1 s` — Pi hardware test pending.
- [x] Each base template can be copied, renamed, and settings filled in to produce a working widget with no further code edits.
- [x] Houdini page omits the widget panel gracefully (slot collapses; no error in console).
- [x] `docs/WIDGETS.md` is complete and correct.

---

## Phase 4 — Packager + Nginx deploy workflow tested end-to-end

**Goal:** Operator-facing documentation and a tested deploy script. Confidence
that an operator who has never seen PxD before can package and deploy a room.

**Recommended model:** Mid for the docs and deploy script; Light for the
quick-reference card.

**Checklist:**
- [ ] `docs/PACKAGER.md` — full reference: every CLI flag, output structure, manifest format, dry-run usage.
- [ ] `docs/ROOMS.md` — operator guide: how to start a new room from the starter template, what to edit, in what order.
- [ ] `docs/MIGRATIONS.md` — empty for v1 (no prior versions); structure documented so future breaking changes have a home.
- [ ] `scripts/deploy.sh` (optional convenience): wraps `package.js` + `rsync` to Pi + Nginx symlink swap. Documented in `docs/PACKAGER.md`.
- [ ] End-to-end test on a real Pi (manual):
  - [ ] Fresh checkout on a Pi.
  - [ ] Run packager for Agent22.
  - [ ] Swing Nginx symlink.
  - [ ] Verify page works.
  - [ ] Reload page after a `pxd-base.css` token edit + repackage; verify the change is live.
- [ ] One-page quick-reference card (`docs/QUICKREF.md`) — "I want to ___: do ___" for the five most common operator tasks.

**Acceptance criteria:**
- A new operator can deploy Agent22 to a fresh Pi following only `docs/QUICKREF.md` and `docs/PACKAGER.md`.
- The packager smoke test runs in CI.

---

## Phase 5 — SpyCatcher uses PxD from day one

**Goal:** SpyCatcher (Moscow + Washington) is the first game built on PxD with
no legacy UI. Two `room.json` files; widgets reuse base templates where
possible.

**Recommended model:** Mid for new widget creation (SpyCatcher will likely have
prop types we haven't templated yet); Light for the room scaffolding.

**Escalation candidate:** Heavy only if a SpyCatcher widget needs interactivity
that the contract can't currently express (e.g. multi-step input or stateful
operator controls); use Heavy to design the contract extension, not to write
the widget itself.

**Checklist:**
- [ ] Create `rooms/spycatcher/moscow/pxd/` from `templates/rooms/_starter/`.
- [ ] Create `rooms/spycatcher/washington/pxd/` from `templates/rooms/_starter/`.
- [ ] Identify all SpyCatcher props that need widgets; for each:
  - [ ] If a base template fits: copy, rename, fill settings.
  - [ ] If not: build a new widget; consider whether it qualifies for `custom/` (and update `custom/README.md` if so).
- [ ] Theme each room from the SpyCatcher media assets.
- [ ] Package each room; deploy to test Pi.
- [ ] Verify against `docs/MANUAL_QA_CHECKLIST.md` (to be authored in this phase based on Phase 4 outputs).

**Acceptance criteria:**
- Two SpyCatcher dashboards (Moscow, Washington) deploy from PxD without any framework-side code changes specific to SpyCatcher.
- At least one new widget is added either to a SpyCatcher room or promoted to `custom/`.

---

## Cross-phase practices

These apply to every phase regardless of model:

- **Doc-first.** When a phase changes the spec or `room.json` schema, update the
  matching doc before writing the code. Keep `CHANGELOG.md` current.
- **Conventional commits.** `Implement:`, `Fix:`, `Docs:`, `Test:`, `Refactor:`,
  `Chore:`. Same convention as PFx / PxO / PxC.
- **Tests next to features.** `apps/PxD/scripts/package.test.js` and any panel
  tests live under `apps/PxD/test/` mirroring source layout.
- **Memory hygiene.** When a phase produces a non-obvious lesson (e.g. "Paho
  WebSocket requires path `/mqtt` on this broker"), record it in
  `/memories/repo/pxd-*.md` for future sessions.
- **No half-wired features on `main`.** If a phase isn't complete, work on a
  feature branch.

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Widget loader contract flaw discovered after both rooms are live | Medium | Phase 3 is isolated; rooms continue to work without widgets while the loader is fixed. The widget panel is hidden until at least one widget loads, so a loader bug has zero user-visible impact. |
| Theme tokens insufficient for Houdini's look | Low | Phase 2 explicitly allows adding new tokens. Cost is small. |
| Layout JSON contract doesn't generalise | Low | Phase 1 ships only one layout. Second layout in a later phase will exercise the contract. |
| Packager misses a required asset on a non-Agent22 room | Medium | Phase 4's manual end-to-end test on a fresh Pi catches this before SpyCatcher. |
| Custom widget directory becomes a dumping ground | Low | README convention requires a one-line entry; periodic prune. |
| Operator finds the JSON edit too intimidating | Medium | Phase 4 quick-reference card; future enhancement: a web-form editor (out of scope). |

---

## What is NOT in this plan

- A web-based room.json editor. Out of scope; possible follow-on.
- Multi-language UI. Out of scope.
- A second layout (`compact-dashboard`, `kiosk-portrait`). Out of scope; documented as future work.
- Migrating PxT to PxD. PxT is a different beast (kiosk with FSM); not a candidate.
- Replacing PxC. PxC builds React clocks; PxD is a vanilla shell. Embedding a built PxC clock as a widget is the integration path, not absorption.
