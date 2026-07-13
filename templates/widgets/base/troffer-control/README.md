# troffer-control

Active operator widget for **Paradox Troffer** / **px-wifi-light** MQTT-native
fixtures (RGB + white MOSFET + UV PWM).

**Default size:** `3x1` (~25% width)  
**Interactive:** Yes — white toggle, colour scene, brightness, UV slider

> **Offline / kiosk note:** Glyph is inline SVG. No font, CDN, or network
> access is required.

---

## Setup

1. Copy this directory to `rooms/<game>/pxd/widgets/<your-id>/`.
2. Edit the CONFIG block near the top of `widget.js`:

   | Key | Required | Default | Description |
   |---|---|---|---|
   | `STATE_TOPIC` | ✓ | — | `{base}/state` from the troffer |
   | `COMMAND_TOPIC` | ✓ | — | `{base}/commands` |
   | `SIZE` | | `"3x1"` | Prefer `3x1` or `2x1` |
   | `HEARTBEAT_TIMEOUT_MS` | | `30000` | `0` to disable |

3. Add to a `widget-grid` pane in `room.json`:
   ```json
   { "id": "<your-id>", "type": "troffer-control", "name": "Troffer" }
   ```

4. Run the packager.

---

## Capabilities

| Channel | Control | Notes |
|---|---|---|
| White | W ON / W OFF button | Digital on/off (not PWM). ON → `setColorScene` `white`. OFF → `setColor` with current RGB, or `off` if RGB is black. |
| RGB | Colour `<select>` | Uses Troffer scene names (`red`, `cyan`, …) via `setColorScene`. |
| Brightness | 0–100 slider | PWM scaler for RGB only (`setBrightness`). Does not affect white or UV. |
| UV | 0–255 slider | Independent channel (`setUV` `level`). Label also shows mapped %. |

Optimistic UI is applied on click; the next retained/heartbeat state overwrites.

---

## State payload

```json
{
  "on": true,
  "white": false,
  "r": 0, "g": 255, "b": 255,
  "brightness": 100,
  "uv": 0,
  "scene": "cyan"
}
```

## Commands (object payloads)

```json
{ "command": "setColorScene", "scene": "white" }
{ "command": "setColor", "color": "#00dcff", "brightness": 80 }
{ "command": "setBrightness", "brightness": 60 }
{ "command": "setUV", "level": 128 }
{ "command": "off" }
```

UV uses **device units 0–255** (not 0–100). The UI shows both the raw level and
a percentage for operators.
