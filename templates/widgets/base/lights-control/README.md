# lights-control

Active lighting widget. Shows a glyph tinted by the selected colour scene
(mixed toward black by brightness), a scene picker, and a 0–100 brightness
slider. Scene and brightness changes publish MQTT commands; the next state
message overwrites the display.

**Default size:** `1x1`  
**Default glyph:** `bulb` (inline SVG)  
**Interactive:** Yes — scene select and brightness slider publish commands

> **Offline / kiosk note:** Built-in glyphs are inline SVG strings. No font,
> CDN, or network access is required.

---

## Setup

1. Copy this directory to `rooms/<game>/pxd/widgets/<your-id>/`.
2. Edit the CONFIG block near the top of `widget.js`:

   | Key | Required | Default | Description |
   |---|---|---|---|
   | `STATE_TOPIC` | ✓ | — | MQTT topic carrying light state |
   | `SCENES_TOPIC` | | — | Retained scenes list; falls back to hardcoded colour scenes |
   | `COMMAND_TOPIC` | ✓ | — | MQTT topic for `setColorScene` / `setBrightness` |
   | `GLYPH` | | `"bulb"` | `ceiling` \| `desk` \| `spotlight` \| `bulb` |
   | `SIZE` | | `"1x1"` | Prefer `1x1` or `3x1` |
   | `HEARTBEAT_TIMEOUT_MS` | | `30000` | ms before card shows disconnected; `0` to disable |

3. Add to a `widget-grid` pane in `room.json`:
   ```json
   { "id": "<your-id>", "type": "lights-control", "name": "Room Lights" }
   ```

4. Run the packager.

---

## Payload shape (state)

Preferred fields (any combination):

```json
{ "scene": "warmWhite", "brightness": 80, "on": true }
```

Also accepted (PxB light-zone):

```json
{ "activeScene": "warmWhite", "lighting": { "activeScene": "warmWhite" } }
```

Brightness is session-local when the publisher omits it (zones often do).

## Scenes list (retained)

```json
{ "scenes": [{ "id": "red", "label": "Red", "swatch": "#FF0000" }] }
```

## Commands

Object payloads (not pre-stringified):

```json
{ "command": "setColorScene", "scene": "red" }
{ "command": "setBrightness", "brightness": 75 }
```
