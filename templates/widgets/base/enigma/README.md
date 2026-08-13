# enigma widget

Display-only monitor for **Px-Enigma-ESP8266** props via MQTT `state`.

## Sizes and layouts

Card tile size (`SIZE`) sets the widget-grid footprint (Bootstrap 12-col aligned):

| `SIZE` | Name | Footprint |
|---|---|---|
| `3x1` | Quarter | col-3 wide, short |
| `4x1` | Third | col-4 wide, short |
| `3x2` | Quarter Grid | col-3 wide, tall + switch grid |
| `4x2` | Third Grid | col-4 wide, tall + switch grid |
| `2x2` | Full | half width, tall + large grid |

Inner **layout mode** (compact / compact-grid / full) can be switched from the ⋯ menu on `2x2` cards. Quarter and Third short tiles are compact-only; Quarter Grid and Third Grid tiles use compact-grid.

## CONFIG

- `STATE_TOPIC`, `COMMAND_TOPIC`, `PROP_UI_URL`
- `LAYOUT_MODE` — optional default inner layout
- `SWITCH_COUNT` — numbered switches on grid (default **20**)
- `HEARTBEAT_TIMEOUT_MS` — default **15000**

## State fields

Uses `code.*`, `puzzle.mode` (Latch/Live), `battery.*`, and optional grid fields.

## Menu actions (⋯)

Identify, Set target, Sleep, Layout picker (when available), Open Prop UI.
