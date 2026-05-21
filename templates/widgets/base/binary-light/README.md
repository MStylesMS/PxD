# binary-light

Passive binary indicator widget. Shows a coloured dot: off (grey, default) or
on (green by default), based on an MQTT state message.

**Default size:** `1x1`  
**Default style:** CSS circle — no images, no fonts, no network required

---

## Setup

1. Copy this directory to `rooms/<game>/pxd/widgets/<your-id>/`.
2. Edit the CONFIG block near the top of `widget.js`:

   | Key | Required | Default | Description |
   |---|---|---|---|
   | `STATE_TOPIC` | ✓ | — | MQTT topic carrying state messages |
   | `STATE_FIELD` | | `"state"` | JSON field that holds the value; `null` for raw payload |
   | `ON_VALUE` | | `"on"` | String value (case-insensitive) that means "on / active" |
   | `ON_LABEL` | | `"ON"` | Label shown in the on state |
   | `OFF_LABEL` | | `"OFF"` | Label shown in the off state |
   | `ON_COLOR` | | `#198754` | CSS colour for the on state (dot + label) |
   | `OFF_COLOR` | | `#6c757d` | CSS colour for the off state |
   | `ON_GLOW_RADIUS` | | `"8px"` | Box-shadow blur when on; `"0"` to disable glow |
   | `HEARTBEAT_TIMEOUT_MS` | | `30000` | ms before card shows disconnected; `0` to disable |

3. Add to `room.json → widgets`:
   ```json
   { "id": "<your-id>", "type": "binary-light", "name": "My Light" }
   ```

4. Ensure `"widgets"` is in `room.json → panels.include`.
5. Run the packager.

---

## Payload shape

The widget expects a JSON payload. For a typical PxO/PFx state topic:

```json
{ "state": "on" }
```

To match a different field name, set `STATE_FIELD: 'yourField'`.  
To match a raw (non-JSON) string (e.g. `on` or `1`), set `STATE_FIELD: null`.

Common `ON_VALUE` strings: `'on'`, `'true'`, `'1'`, `'HIGH'`, `'active'`, `'open'`

---

## Customisation tips

**Change colours per room:** edit `ON_COLOR` / `OFF_COLOR` in the CONFIG block.

**Disable the glow effect:** set `ON_GLOW_RADIUS: '0'`.

**Use as a simple alarm indicator:** set `ON_COLOR: '#dc3545'` (red) and  
`ON_LABEL: 'ALARM'`, `OFF_LABEL: 'OK'`, `OFF_COLOR: '#198754'`.

**Monitor any boolean state:** works for door sensors, motion detectors, relay
outputs, or any prop that publishes a two-state value.
