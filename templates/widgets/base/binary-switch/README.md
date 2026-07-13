# binary-switch

Active binary widget. Shows a power/device switch icon that switches between on
and off based on MQTT state. Clicking the tile publishes an `allOn` or `allOff`
command (configurable) to the configured command topic.

**Default size:** `1x1`
**Default glyph:** `plug` (inline SVG pair)
**Interactive:** Yes — click publishes the opposite command of the current state

> **Offline / kiosk note:** Built-in glyphs are inline SVG strings. No font, CDN,
> or network access is required. Do **not** override with Material Symbols
> ligature names without first vendoring the font — see
> [docs/WIDGETS.md §&nbsp;Offline assets](../../../docs/WIDGETS.md).

---

## Setup

1. Copy this directory to `rooms/<game>/pxd/widgets/<your-id>/`.
2. Edit the CONFIG block near the top of `widget.js`:

   | Key | Required | Default | Description |
   |---|---|---|---|
   | `STATE_TOPIC` | ✓ | — | MQTT topic carrying switch state messages |
   | `STATE_FIELD` | | `"state"` | JSON field that holds the value; `null` for raw payload |
   | `ON_VALUE` | | `"on"` | String value that means the switch is on |
   | `COMMAND_TOPIC` | ✓ | — | MQTT topic to publish commands to |
   | `ON_COMMAND` | | `"allOn"` | Command name sent when clicking to turn on |
   | `OFF_COMMAND` | | `"allOff"` | Command name sent when clicking to turn off |
   | `ON_LABEL` | | `"ON"` | Label shown in the on state |
   | `OFF_LABEL` | | `"OFF"` | Label shown in the off state |
   | `ON_COLOR` | | `#198754` | CSS colour for on state (icon + label) |
   | `OFF_COLOR` | | `#dc3545` | CSS colour for off state |
   | `GLYPH` | | `"plug"` | Built-in SVG pair: `plug` \| `fan` \| `bulb` \| `tv` |
   | `ICON_ON` | | `null` | Optional override for the on icon |
   | `ICON_OFF` | | `null` | Optional override for the off icon |
   | `INTERACTIVE` | | `true` | `false` disables click-to-command |
   | `INITIAL_STATE` | | `"off"` | State before first MQTT message |
   | `PENDING_TIMEOUT_MS` | | `4000` | ms to wait for confirmation; `0` = indefinite |
   | `HEARTBEAT_TIMEOUT_MS` | | `30000` | ms before card shows disconnected; `0` to disable |

3. Add to `room.json → widgets`:
   ```json
   { "id": "<your-id>", "type": "binary-switch" }
   ```

4. Ensure `"widgets"` is in `room.json → panels.include`.
5. Run the packager.

---

## GLYPH options

| GLYPH | ON | OFF |
|---|---|---|
| `plug` | Filled electrical plug | Same plug + circle/slash prohibition mark |
| `fan` | Four-blade fan with hub | Same fan + circle/slash prohibition mark |
| `bulb` | Solid bulb with radiating rays | Outline bulb, empty interior, no rays |
| `tv` | Classic CRT TV with rabbit-ear antennas | Same TV + circle/slash prohibition mark |

```js
GLYPH: 'fan',   // or 'plug' | 'bulb' | 'tv'
```

To replace the glyph pair entirely, set `ICON_ON` / `ICON_OFF` (inline SVG,
file path, or ligature). When set, they override `GLYPH`.

---

## Payload shape

The widget expects a JSON payload:

```json
{ "state": "on" }
```

To match a different field name, set `STATE_FIELD: 'yourField'`.  
To match a raw (non-JSON) string, set `STATE_FIELD: null`.

---

## Command shape

When clicked, the widget publishes an **object** payload to `COMMAND_TOPIC`
(not a pre-stringified JSON string):

```json
{ "command": "allOff" }   ← when currently on  (click to turn off)
{ "command": "allOn" }    ← when currently off (click to turn on)
```

The widget sends the command and **waits for an MQTT state message to confirm**
the change before updating the display. Optimistic updates are not applied.

To use custom command names, set `ON_COMMAND` and `OFF_COMMAND` in CONFIG.  
To disable command publishing entirely, set `COMMAND_TOPIC: null` and
`INTERACTIVE: false`.

---

## Previewing with the viewer

From the PxD repo root, start an HTTP server:

```bash
python3 -m http.server 9090
```

Then open:

```
http://localhost:9090/tools/widget-viewer.html
```

The viewer lets you switch themes, send simulated MQTT payloads, and simulate
click events — all without a running PxD instance.

---

## Size variants

| Variant | Size | Status |
|---|---|---|
| Standard *(this file)* | `1x1` | ✓ Available |
| Large | `2x2` | Planned — copy this directory, change `CONFIG.SIZE` to `"2x2"`, and adjust `.wd-switch-icon` size in `widget.css` |
