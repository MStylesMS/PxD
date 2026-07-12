# default-dashboard

Four-panel operator dashboard for the PxD framework.

## Slots

| Slot ID | Required | Description |
|---|---|---|
| `game-control` | **Yes** | Game state display, mode selector, start/pause/solve buttons, emergency actions, and checklist. |
| `time-lights` | No | **Time & Lights** — clock adjust and lighting scene selector (no emergency). |
| `hints` | No | Hint selector and delivery control. |
| `system` | No | System warning log and MQTT zone heartbeat status. |

Optional slots that are not listed in `room.json → panels.include` are silently
skipped; their `data-slot` divs remain empty.

## Grid

```
mobile (< 768 px)          tablet / desktop (≥ 768 px)
┌───────────────┐          ┌──────────────────────────┐
│  game-control │          │       game-control        │
├───────────────┤          ├─────────────┬────────────┤
│  time-lights  │          │ time-lights │   hints    │
├───────────────┤          ├─────────────┴────────────┤
│     hints     │          │          system           │
├───────────────┤          └──────────────────────────┘
│    system     │
└───────────────┘
```

Grid geometry is in `layout.css`. Paint (colours, fonts, shadows) is provided
by `pxd-base.css` and the room's `theme.*` tokens.

## Files

| File | Purpose |
|---|---|
| `layout.html` | Page template; defines the `data-slot` anchors and loads assets. |
| `layout.json` | Slot declarations consumed by the packager. |
| `layout.css` | Grid template and responsive breakpoints for this layout. |

## Creating a variant

Copy this folder to `layouts/<your-name>/`, edit `layout.html` and `layout.css`,
then set `"layout": "<your-name>"` in `room.json`. See
[docs/USERS_GUIDE.md § Creating a new layout](../../docs/USERS_GUIDE.md) for a
step-by-step walkthrough.
