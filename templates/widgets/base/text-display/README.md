# text-display

Passive text field widget. Displays an arbitrary string value from an MQTT
state message — useful for showing codes, status text, names, or any other
textual prop output.

**Default size:** `4x1`

---

## Setup

1. Copy this directory to `rooms/<game>/pxd/widgets/<your-id>/`.
2. Edit the CONFIG block near the top of `widget.js`:

   | Key | Required | Default | Description |
   |---|---|---|---|
   | `STATE_TOPIC` | ✓ | — | MQTT topic carrying state messages |
   | `TEXT_FIELD` | | `"value"` | JSON field whose value is displayed; `null` = whole payload |
   | `LABEL` | | `""` | Small label above the value; `""` to hide |
   | `VALUE_COLOR` | | `#e9ecef` | CSS colour for the value text |
   | `LABEL_COLOR` | | `#6c757d` | CSS colour for the label |
   | `MAX_LENGTH` | | `0` | Truncate value to this many characters; `0` = no limit |
   | `MONO_FONT` | | `false` | `true` for monospace font (good for codes, hex, IDs) |
   | `HEARTBEAT_TIMEOUT_MS` | | `30000` | ms before card shows disconnected; `0` to disable |

3. Add to `room.json → widgets`:
   ```json
   { "id": "<your-id>", "type": "text-display", "name": "Safe Code" }
   ```

4. Ensure `"widgets"` is in `room.json → panels.include`.
5. Run the packager.

---

## Payload shape

The widget expects a JSON payload. For a typical state topic:

```json
{ "value": "A7B3" }
```

To use a different field name (e.g. `status`), set `TEXT_FIELD: 'status'`.  
To display the raw payload string with no JSON parsing, set `TEXT_FIELD: null`.

Before any message arrives, the widget shows `—` as a placeholder.

---

## Customisation tips

**Show a code entry result:** set `MONO_FONT: true` and `LABEL: 'LAST CODE'`.

**Display a player name:** set `TEXT_FIELD: 'player'`, `LABEL: 'LOGGED IN AS'`.

**Truncate long values:** set `MAX_LENGTH: 20` to prevent overflow.

**Compact variant:** change `SIZE` to `'2x1'` for a narrower tile (value may
truncate earlier depending on character width).
