# Plan: Camera View panel — embedded live camera feeds

## TL;DR
Add a fifth PxD panel type, `camera-view`, that embeds live go2rtc camera streams in the operator dashboard. One camera is always the "main" (large) view with audio; on layouts with more than one camera, the rest sit in a sidebar as muted thumbnails — click one to swap it into the main slot. The panel is a **consumer only**: it talks to an existing go2rtc instance (this room's own, installed as a persistent systemd service) over WebSocket/MSE. Camera discovery and encoder tuning happens separately, ahead of time, with `apps/PxD/tools/camera-finder/`.

## Context (decided)
- **go2rtc runs per-room**, installed as a systemd-managed Docker service on that room's own Room Controller Pi (`/opt/paradox/config/go2rtc.yaml` + `go2rtc.service`, installed manually or by PxP). Measured cost: under 10% CPU on a Pi5 for 24 simultaneous HD streams — one room's own Pi comfortably serves all of that room's cameras. No central multi-room streaming server.
- **Delivery method: MSE only (v1).** Chosen over WebRTC because these cameras' AAC audio isn't carried by WebRTC without an extra transcode step, and MSE gave equivalent video quality in side-by-side testing. WebRTC/HLS/MJPEG are documented as possible future modes but out of scope for v1.
- **Discovery tool relocated**: `apps/PxD/tools/camera-finder/` (formerly a standalone `camera-lab` scratch repo). Launch-when-needed, not a service, no root/system-nginx dependency. Its job ends at "copy a confirmed stream URL" — pasting that URL into `room.json` is a manual step.
- **No-signal state**: black box + dark grey TV-with-a-slash icon (inline SVG, no external asset).
- **Audio**: only the main view ever plays audio. Starts **muted**, default volume 50%, mute state visibly indicated. Sidebar thumbnails are always muted.
- **Settings persistence** is intentionally three-tiered (see ROOMS.md → `cameraView`): `room.json` (shipped default) → `camera-view.local.json` (optional, operator-maintained, durable) → gear-icon session override (`sessionStorage`, ephemeral, testing only). Full cross-reload persistence of "which camera is main" is explicitly **out of scope** (low priority, avoided for complexity reasons).
- **Network prerequisite**: whatever machine renders the dashboard needs LAN access to the room Pi's go2rtc ports — documented in `docs/SETUP.md` (Paradox Room Controller setup) rather than assumed.

## Why a panel, not a widget
PxD already has two extensibility patterns: **widgets** (small MQTT-state tiles, template/example/custom tiers, 4-unit grid) and **panels** (game-control, time-lights, hints, system — full-width sections with their own internal layout and config key in `room.json`). Camera view needs its own internal layout (main + sidebar, swap-on-click), non-MQTT state (which camera is main, mute/volume), and room-level configuration — that's the panel shape, not the widget shape. It follows the exact panel authoring contract (`PxD.panels.register(id, {mount, unmount})`, `assets/js/panels/<id>.js`, room-local override via `pxd/panels/<id>.js`, `data-slot="<id>"` in the layout template) rather than inventing a new mechanism.

## Directory layout (new)
```
apps/PxD/
  assets/js/panels/camera-view.js     # panel implementation (MSE client + UI)
  docs/PR_CAMERA_VIEW_PANEL.md         # this file
  tools/camera-finder/                 # relocated discovery/tuning tool
    server.js                          # self-contained launcher, no root
    go2rtc.yaml                        # scratch discovery config
    web/                               # comparison + multi-tile load-test pages

rooms/<game>/pxd/
  room.json                            # cameraView key (see ROOMS.md)
  camera-view.local.json               # optional, operator-maintained overrides

config/ (repo root)
  go2rtc.yaml.example                  # template for the room's persistent config
  go2rtc.service                       # sample systemd unit
```

## room.json schema
See `docs/ROOMS.md` → `cameraView` for the authoritative field reference. Summary:
```jsonc
"panels": { "include": ["game-control", "camera-view", "time-lights", "hints", "system"] },
"cameraView": {
  "layout": 2,                 // 1-5 camera slots
  "sidebarPosition": "right",  // left|right|top|bottom (layout > 1 only)
  "cameras": [
    { "id": "front-door", "label": "Front Door", "wsUrl": "ws://10.0.0.50:1984/api/ws?src=front-door", "main": true },
    { "id": "vault",      "label": "Vault",      "wsUrl": "ws://10.0.0.50:1984/api/ws?src=vault" }
  ]
}
```

## Runtime behavior
- **1 camera**: single full-width view + control bar (refresh, mute, volume, gear). No sidebar.
- **2–5 cameras**: one main view (same control bar) + a sidebar of muted thumbnails in the configured position. Clicking a thumbnail swaps it into the main slot (previous main becomes a thumbnail).
- **Control bar** (main view only): 🔄 refresh (reconnects that stream), 🔇/🔊 mute toggle, volume slider (0–100, default 50), ⚙ gear (session-only URL override dialog, uses the shared `#pxd-modals` portal).
- **No signal**: on WebSocket close/error, the tile shows a black box with a dark-grey TV+slash icon and keeps retrying in the background (5s interval) until a frame arrives, then clears automatically.
- **Camera URL resolution order** per camera: `sessionStorage` override → `camera-view.local.json` override → `room.json` default.

## Explicitly deferred (not this pass)
- WebRTC/HLS/MJPEG delivery modes (MSE only for v1).
- Cross-reload persistence of "which camera is main" (low priority, adds `localStorage` complexity for little benefit).
- A PxP-driven automated installer for `go2rtc.service` (PxP repo is not yet scaffolded in this workspace; `config/go2rtc.yaml.example` + `config/go2rtc.service` are ready for it to consume whenever that lands).

## Shipped reference configs
- Agent 22 (`rooms/agent22/pxd/room.json`) — 2 cameras, sidebar right.
- Houdini's Challenge (`rooms/houdinis-challenge/pxd/room.json`) — 3 cameras, sidebar right.

Both use placeholder `wsUrl` values (`ws://REPLACE-WITH-ROOM-PI-IP:1984/api/ws?src=...`) — no cameras are physically deployed at either room yet. Replace once real cameras and each room's persistent go2rtc service are online, using `apps/PxD/tools/camera-finder/` to confirm working URLs first.
