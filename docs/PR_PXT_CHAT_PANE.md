# Plan: PxT Chat pane — operator chat window for PxT MQTT

## TL;DR

Add a PxD **pane** type `pxt-chat` that looks like a normal text chat window (scrollable transcript + compose box). It talks to PxT over MQTT:

- Publish → `{topicRoot}/chat/to-players`
- Subscribe ← `{topicRoot}/chat/from-players`

Allowed widths: **`full` | `three-quarters` | `two-thirds` | `half`** (not narrower).

Design the message pipeline so a future **SLM / AI agent** can sit on the same topics (or a thin adapter) without rewriting the UI.

## Context

- PxT chat payload (today): `{ "ts"?: number, "author": string, "message": string }`
- Default Moscow topic root: `paradox/spycatcher/terminal`
- Closest existing PxD UX: **hints** pane (compose + send) + **system** pane (scrollable log)
- No chat pane/widget exists in PxD yet

## Why a pane, not a widget

Pane width tokens in [`docs/PANES.md`](PANES.md) already match the required sizes. Widget `SIZE` tiles (`1x1`…`4x2`) cannot express ¾ / ⅔ and are too short for a real chat UI. Same rationale as [`PR_CAMERA_VIEW_PANEL.md`](PR_CAMERA_VIEW_PANEL.md).

## Directory layout (new)

```
apps/PxD/
  assets/js/panes/pxt-chat.js
  docs/PR_PXT_CHAT_PANE.md          # this file

rooms/<game>/pxd/room.json          # include pane + config
```

## room.json schema

```jsonc
{
  "type": "pxt-chat",
  "width": "half",                 // full | three-quarters | two-thirds | half
  "order": 40,
  "narrowWidth": "full",
  "config": {
    "topicRoot": "paradox/spycatcher/terminal",
    "toPlayersTopic": "",          // optional override; default "{topicRoot}/chat/to-players"
    "fromPlayersTopic": "",        // optional override; default "{topicRoot}/chat/from-players"
    "operatorAuthor": "operator",  // author field on outbound messages
    "maxMessages": 200,
    "title": "Terminal Chat"
  }
}
```

Reject / ignore `third` and `quarter` for this pane type in the editor if practical.

## Runtime behavior

- Transcript shows player messages and local echoes of operator sends (and later, AI replies).
- Compose box + Send publishes to `to-players` via shared `PxD.mqtt` (no second client).
- Subscribe `from-players` on mount; unsubscribe on unmount.
- Timestamps optional; display author + message clearly.
- Empty / disconnected state: muted placeholder text (“Waiting for chat…”).

## MQTT contract

**Operator → players**

```json
{ "ts": 1712764800000, "author": "operator", "message": "Need help?" }
```

**Players → operator**

```json
{ "ts": 1712764800000, "author": "player", "message": "Stuck on the safe" }
```

Canonical reference: `apps/PxT/docs/MQTT_API.md`.

## Future: SLM / AI agent (deferred — design for it now)

Not in v1 scope, but the pane must remain agent-ready:

1. **Single transcript** — all authors (`player`, `operator`, `agent`, …) render in one thread; style by `author` (or a future `role` field).
2. **Pluggable outbound path** — UI should call a small send helper (`sendChatMessage({ author, message })`) rather than hard-coding only human operator publishes, so an agent module can inject replies the same way.
3. **Optional config hooks** (unused in v1, reserved):

```jsonc
"ai": {
  "enabled": false,
  "author": "agent",
  "mode": "assist"           // assist | autopilot (future)
}
```

4. **No broker topology assumption** — agent may publish as another MQTT client on the same topics, or PxD may proxy; the pane only cares about topic I/O and payload shape.
5. **Do not** bake model/vendor APIs into the pane.

Document these reserved fields so a later agent PR can enable them without a schema break.

## Precedents

- `assets/js/panes/hints.js` — free-text compose + publish
- `assets/js/panes/system.js` — scrollable MQTT log
- [`PR_CAMERA_VIEW_PANEL.md`](PR_CAMERA_VIEW_PANEL.md) — pane vs widget decision

## Implementation steps

1. Register pane type `pxt-chat` (loader + `room.json` docs in `PANES.md` / `ROOMS.md`).
2. Build transcript + compose UI (plain chat look; match existing PxD typography/theme).
3. Wire MQTT subscribe/publish; echo outbound locally.
4. Enforce width allow-list; verify at full / ¾ / ⅔ / half and on narrow breakpoint.
5. Add a SpyCatcher Moscow example `room.json` snippet (commented or real once dashboard lands).
6. Manual QA against a live PxT on the shared broker.

## Verification

- [ ] Operator message appears on PxT help chat
- [ ] Player message appears in pane within ~1s
- [ ] Widths render correctly; no `third`/`quarter` offered
- [ ] Unmount cleans subscriptions (no duplicate handlers on remount)
- [ ] Reserved `ai` config keys parse and are ignored when disabled

## Explicitly deferred

- SLM / AI agent integration (see reserved hooks above) — **v1 shipped with hooks only**
- Typing indicators / read receipts
- Message persistence across dashboard reload (beyond in-memory buffer)
- Markdown / rich text in messages
- Voice input

## Implementation status

**Implemented** on `main` (pane + CSS + docs). Wired into Houdini and Agent22:

- **simple:** half-width after `hints`
- **live:** full-width immediately under `camera-view`

`topicRoot` currently points at `paradox/spycatcher/terminal` (active PxT under test). Retarget per room when each game has its own terminal.

## Decisions & assumptions (locked)

- Pane type name: `pxt-chat`
- Widths: full, three-quarters, two-thirds, half only
- Shared `PxD.mqtt` client only
- Payload matches current PxT chat JSON
- Future AI uses same topics + multi-author transcript
