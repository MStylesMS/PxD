# Plan: PxT Chat pane — operator chat window for PxT MQTT

> **Status:** Implemented and shipped (SpyCatcher Moscow). Archived at
> `docs/archive/PR_PXT_CHAT_PANE.md`.
> Canonical pane docs: [`../PANES.md`](../PANES.md) (`pxt-chat`).

## TL;DR

PxD **pane** type `pxt-chat`: scrollable transcript + compose box over PxT MQTT.

- Publish → `{topicRoot}/chat/to-players`
- Subscribe ← `{topicRoot}/chat/to-players` (multi-GM sync of outbound)
- Subscribe ← `{topicRoot}/chat/from-players`
- Subscribe ← `{topicRoot}/chat/history` (retained snapshot from PxO; seed on refresh)

Allowed widths: **`full` | `three-quarters` | `two-thirds` | `half`** (not narrower).

Message pipeline remains **agent-ready** (reserved `ai` config; unused in v1).

## Context

- PxT chat payload: `{ "ts"?: number, "author": string, "message": string }`
- Default Moscow topic root: `paradox/spycatcher/terminal`
- Closest prior UX: **hints** (compose) + **system** (scrollable log)

## Why a pane, not a widget

Pane width tokens in [`../PANES.md`](../PANES.md) already match the required sizes. Widget `SIZE` tiles cannot express ¾ / ⅔ and are too short for a real chat UI. Same rationale as [`../PR_CAMERA_VIEW_PANEL.md`](../PR_CAMERA_VIEW_PANEL.md).

## Directory layout

```
apps/PxD/
  assets/js/panes/pxt-chat.js
  assets/css/pxd-base.css          # .panel-pxt-chat / transcript / MUTE / ack
  docs/PANES.md                    # canonical config
  docs/archive/PR_PXT_CHAT_PANE.md # this file

apps/PxO/
  src/game.js                      # in-memory buffer + retained chat/history
  (INI) chat_to_player / chat_from_player

rooms/spycatcher/
  pxd/room.json                    # simple + live wire pxt-chat
  config/pxo-moscow.ini            # chat topics for logging + history
  html/{simple,live}/              # packaged dashboards
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
    "toPlayersTopic": "",          // optional; default "{topicRoot}/chat/to-players"
    "fromPlayersTopic": "",        // optional; default "{topicRoot}/chat/from-players"
    "historyTopic": "",            // optional; default "{topicRoot}/chat/history"
    "operatorAuthor": "operator",
    "maxMessages": 200,
    "title": "Terminal Chat",
    "chime": true,                 // Web Audio chime on player messages; MUTE button also available
    "ai": { "enabled": false, "author": "agent", "mode": "assist" }  // reserved
  }
}
```

## Runtime behavior (as shipped)

- Transcript is **MQTT-only**: outbound lines come from `to-players` delivery (including the sender’s own echo), not a local optimistic insert — keeps multiple GM browsers in sync.
- Compose + Send publishes to `to-players` via shared `PxD.mqtt`.
- Retained `{topicRoot}/chat/history` (PxO) seeds the transcript after refresh / new windows. History apply never chimes; live `from-players` notifies (toast, optional browser Notification, Web Audio chime).
- **MUTE** header button (persisted in `localStorage`) silences the chime; **Acknowledge** clears the “awaiting reply” highlight without sending.
- Player last-message → yellow outer pane + dark title; GM send or Acknowledge clears it.
- Empty state: “Waiting for chat…”.
- PxO clears retained history when a **new game start** is accepted; JSONL archival uses the same chat topics when configured in INI.
- PxT help/chat clears and hides on `start` / idle `reset` (companion behavior; not part of this pane file).

## MQTT contract

**Operator → players** / **Players → operator**

```json
{ "ts": 1712764800000, "author": "operator", "message": "Need help?" }
```

**History snapshot (PxO, retained)**

```json
{ "ts": 1712764800000, "messages": [ { "ts": …, "author": "…", "message": "…" } ] }
```

Canonical reference: `apps/PxT/docs/MQTT_API.md`, `apps/PxO/docs/MQTT_API.md`.

## Future: SLM / AI agent (still deferred)

Not in v1; pane remains agent-ready:

1. **Single transcript** — style by `author` (`player`, `operator`, `agent`, …).
2. **Pluggable outbound** — `sendChatMessage({ author, message })` on the pane instance.
3. **Reserved** `ai.enabled` / `ai.author` / `ai.mode` (ignored when disabled).
4. No broker/vendor assumptions in the pane.

## Implementation steps

1. [x] Register pane type `pxt-chat` (loader + `PANES.md`).
2. [x] Build transcript + compose UI.
3. [x] Wire MQTT subscribe/publish; multi-GM via `to-players` (no local-only echo).
4. [x] Width allow-list documented; used at half (simple) and full (live).
5. [x] SpyCatcher Moscow `room.json` + packaged HTML.
6. [x] Manual QA against live PxT on shared broker.
7. [x] Operator alerts: toast, chime, MUTE, Acknowledge / awaiting-reply styling.
8. [x] Session history: PxO buffer + retained `chat/history`; pane seeds on mount.
9. [x] Clear history on new game start (PxO); companion PxT help hide/clear on start.

## Verification

- [x] Operator message appears on PxT help chat
- [x] Player message appears in pane promptly
- [x] Widths used correctly (half / full); no `third`/`quarter`
- [x] Unmount cleans subscriptions
- [x] Reserved `ai` config keys parse and are ignored when disabled
- [x] Second GM browser sees outbound messages via `to-players`
- [x] Refresh / new window recovers transcript from retained history
- [x] New game start clears history; help window does not reopen with stale chat after intro

## Explicitly deferred (follow-ups, not blocking archive)

- SLM / AI agent integration (hooks only in v1)
- Typing indicators / read receipts
- Markdown / rich text in messages
- Voice input
- PxD UI to browse **old** finished-game JSONL chat (archival logs exist when INI chat topics are set; no log viewer yet)
- Seed PxT help transcript from the same retained history (PxT clears on start; mid-game kiosk refresh still in-memory only)

## Implementation status

**Complete for SpyCatcher Moscow.**

| Surface | Location |
|---|---|
| Pane | `assets/js/panes/pxt-chat.js` |
| Docs | `docs/PANES.md` |
| Dashboards | `/spycatcher/simple/`, `/spycatcher/live/` |
| History publisher | PxO when `chat_to_player` / `chat_from_player` set (`pxo-moscow.ini`) |

**Not wired** into Agent22 / Houdini dashboards (by design).

## Decisions & assumptions (locked)

- Pane type name: `pxt-chat`
- Widths: full, three-quarters, two-thirds, half only
- Shared `PxD.mqtt` client only
- Payload matches current PxT chat JSON
- Live history authority: PxO retained `chat/history` (not JSONL for mid-game reload)
- Future AI uses same topics + multi-author transcript
