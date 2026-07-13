# bomb-timer

Passive suitcase / bomb countdown for **px-wifi-v1** (and compatible) props.
Shows remaining time, colours the clock from `gameState`, and a battery glyph.

**Default size:** `3x1` (~25% / col-3)  
**Display-only:** the prop owns the countdown; this widget renders state.

> **Offline / kiosk note:** Battery icon is inline SVG. No fonts or CDN.

---

## Setup

1. Copy this directory to `rooms/<game>/pxd/widgets/<your-id>/`.
2. Edit the CONFIG block in `widget.js` (topics + battery thresholds).
3. Add to a `widget-grid` pane:
   ```json
   { "id": "<your-id>", "type": "bomb-timer", "name": "Bomb Timer" }
   ```
4. Run the packager.

---

## CONFIG keys

| Key | Default | Description |
|---|---|---|
| `STATE_TOPIC` | — | Suitcase / bomb state topic |
| `SECONDS_FIELD` | `"timeRemaining"` | Remaining seconds |
| `STATE_FIELD` | `"gameState"` | Game state string |
| `BATTERY_FIELD` | `"battery"` | Percent 0–100 |
| `LOW_BATTERY_FIELD` | `"lowBattery"` | Boolean warn flag |
| `BATTERY_STATE_FIELD` | `"batteryState"` | `normal` \| `usb` \| `charging` |
| `BATTERY_LOW_PCT` | `40` | Yellow at/below (firmware default) |
| `BATTERY_CUTOFF_PCT` | `20` | Red when ≤ cutoff+5 (firmware default) |
| `FORMAT` | `"mm:ss"` | or `"h:mm:ss"` |
| `LABEL` | `"BOMB"` | `""` to hide |
| `SIZE` | `"3x1"` | Prefer `3x1`; fall back to `2x1` if cramped |
| `HEARTBEAT_TIMEOUT_MS` | `30000` | `0` to disable |

---

## gameState → time colour

| State (aliases) | Colour |
|---|---|
| `ready`, `not_ready` | Grey |
| `countdown` (`running`) | White |
| `paused` | White + blink |
| `defused` (`solved`) | Green |
| `detonated` (`failed`) | Red |

---

## Battery glyph

| Condition | Colour |
|---|---|
| `batteryState === "usb"` | Grey plug icon |
| `battery ≤ BATTERY_CUTOFF_PCT + 5` | Red |
| `lowBattery` or `battery ≤ BATTERY_LOW_PCT` | Yellow |
| Otherwise | Green |

**Note:** `lowBatteryPercent` / `lowBatteryCutoffPercent` live on the prop
**config** API, not the MQTT state payload. Keep `BATTERY_LOW_PCT` /
`BATTERY_CUTOFF_PCT` aligned with the device, or the red band will drift.

---

## Example payload

```json
{
  "timeRemaining": 1842,
  "gameState": "countdown",
  "battery": 74,
  "batteryState": "normal",
  "lowBattery": false
}
```
