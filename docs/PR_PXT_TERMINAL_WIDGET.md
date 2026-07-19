# Plan: PxT Terminal widget — large operator monitor for PxT

## TL;DR

Add a **large PxD widget template** (`pxt-terminal`) that monitors a live Paradox Terminal (PxT) kiosk: FSM state, variant/profile, recent events, password attempts (main + confidential), and GM actions (reset / start / solve / fail / show message / force-unlock when available).

This is intentionally bigger than a 1×1 prop tile — default **`SIZE`: `4x2`** (full grid width, tall), with room for a denser layout later.

Docs only in this PR; implementation assigned later.

## Context

- PxT base topic (Moscow): `paradox/spycatcher/terminal`
- Retained state: `{base}/state` — `waitGameStart`, `introPlay`, `login`, `loggedin`, `win`, `fail`, …
- Events: `{base}/events` — `passwordAttempt`, `introVideoDone`, `stateChange`, …
- Commands: `{base}/commands` — `start`, `reset`, `solve`, `fail`, `showMessage`, …
- Chat is a **separate pane** — see [`PR_PXT_CHAT_PANE.md`](PR_PXT_CHAT_PANE.md); this widget may deep-link or note “use chat pane” but does not embed a full chat UI in v1.
- Closest templates: `text-display`, `countdown`, control widgets (`lights-control`)

## Why a widget template (not a pane)

This is a **prop/kiosk monitor card** that belongs in a `widget-grid` alongside doors/locks/timers. It needs MQTT state + command buttons, schema-driven config, and template instantiation per room — that matches [`docs/WIDGETS.md`](WIDGETS.md). Pane widths are wrong for multi-card dashboards; use a wide tile (`4x2`) instead.

If the layout later needs half/¾ page alone, place the parent `widget-grid` at that pane width.

## Directory layout (new)

```
apps/PxD/templates/widgets/base/pxt-terminal/
  widget.js
  widget.css                 # optional denser layout
  README.md
  schema bits via register()

rooms/<game>/pxd/widgets/terminal/
  config.json                # topic root + labels

docs/PR_PXT_TERMINAL_WIDGET.md
```

## What the widget should show (v1)

| Region | Content |
|--------|---------|
| Header | Title, connection badge, variant / profile |
| State | Large FSM state (`login`, `loggedin`, …) + last change time |
| Passwords | Last main attempt: success/fail + value; last confidential attempt |
| Live typing | Field that mirrors password entry as typed (**needs PxT support** — see below) |
| Event log | Last N events (`introVideoDone`, `stateChange`, `passwordAttempt`, rejects) |
| GM actions | Buttons: Start, Reset, Solve, Fail, Show message; Unlock main / Unlock email (enabled when PxT supports) |

Suggested default `SIZE`: **`4x2`**. Allow `4x1` as compact (state + actions only).

## config.json sketch

```jsonc
{
  "SIZE": "4x2",
  "BASE_TOPIC": "paradox/spycatcher",
  "PROP_TOPIC": "terminal",
  "TITLE": "Player Terminal",
  "SHOW_PASSWORD_VALUES": true,
  "EVENT_LOG_LIMIT": 30
}
```

Topic assembly (standard widget pattern):

- State: `{BASE}/{PROP}/state` (and/or subscribe events)
- Commands: `{BASE}/{PROP}/commands`

Literal overrides (`STATE_TOPIC`, `COMMAND_TOPIC`, `EVENTS_TOPIC`) allowed.

## MQTT contract (consume / publish)

**Subscribe**

- `{base}/state` (retained)
- `{base}/events`
- `{base}/warnings` (optional)

**Publish** (GM buttons)

```json
{ "command": "start" }
{ "command": "reset" }
{ "command": "solve" }
{ "command": "fail" }
{ "command": "showMessage", "title": "Hint", "text": "…" }
```

**Wishlist commands (PxT — not implemented yet; wire UI disabled until schema/discovery advertises them)**

```json
{ "command": "unlockMain" }
{ "command": "unlockConfidential" }
```

GM force-unlock is required so operators can solve passwords when players are stuck.

## PxT dependency: live password typing

**Desired:** as the player types into the password field, PxT publishes incremental updates so this widget can show the string in real time (AJAX-style / keystroke events).

Proposed event (illustrative):

```json
{ "ts": 1712764800000, "event": "passwordTyping", "which": "main", "password": "rac" }
```

**Fallback if too hard:** keep using `passwordAttempt` on Enter (already includes `password`, uppercased). Widget still shows last submitted value; live field stays blank or shows “waiting for Enter…”.

Track implementation in a companion PxT docs/PR; this widget treats live typing as progressive enhancement.

## Intro / start orchestration note (for GM UX copy)

Today PxT **`start`** = play intro **then automatically** show login. There is no separate “show login” command.

| Approach | Implication for this widget |
|----------|-----------------------------|
| A. Atomic `start` (current) | One Start button; show state transitions intro → login |
| B. Split intro / login (future) | Separate “Play intro” and “Show login” buttons when PxT adds them |

Document both; v1 buttons match approach A.

## Implementation steps

1. Scaffold `templates/widgets/base/pxt-terminal/` from `_starter` / `text-display`.
2. Subscribe state + events; render header/state/password panels + event log.
3. Add GM command buttons with confirm on Solve/Fail/Reset.
4. Gate Unlock buttons on command presence (schema discovery or config flag).
5. Document Moscow instance `config.json` under `rooms/spycatcher/pxd/widgets/`.
6. Manual QA against Windows/Pi PxT on shared broker.

## Verification

- [ ] Retained state appears within 1s of mount
- [ ] Password attempts update main / email panels
- [ ] Start / Reset / Solve / Fail produce expected PxT FSM changes
- [ ] Live typing works when PxT emits `passwordTyping`; otherwise fallback OK
- [ ] Unlock buttons disabled until PxT advertises support
- [ ] Unmount unsubscribes cleanly

## Explicitly deferred

- Embedding full chat (use `pxt-chat` pane)
- SLM agent (chat pane owns that)
- Editing passwords over MQTT (`setPassword` — separate PxT wishlist)
- Video preview of intro/win overlays

## Decisions & assumptions (locked)

- Template id: `pxt-terminal`
- Default size: `4x2`
- Shared `PxD.mqtt` only
- Force-unlock + live typing depend on future PxT work; UI designed around them now
- Companion chat UI: [`PR_PXT_CHAT_PANE.md`](PR_PXT_CHAT_PANE.md)
