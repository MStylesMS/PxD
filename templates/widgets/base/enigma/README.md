# enigma widget

Display-only monitor for **Px-Enigma-ESP8266** props via MQTT `state`.

## Sizes

| `SIZE` | Layout |
|--------|--------|
| `1x1` | Compact: target + current + battery |
| `2x1` | Compact (half width) — recommended for narrow dashboards |
| `2x2` | Full: compact header + live switch grid |

## CONFIG

Edit the inline `CONFIG` block in `widget.js`:

- `STATE_TOPIC` — full MQTT state topic (e.g. `paradox/spycatcher/moscow/enigma/state`)
- `COMMAND_TOPIC` — commands topic for Identify / Set Target / Sleep menu actions
- `PROP_UI_URL` — path-absolute reverse-proxy URL (e.g. `/props/enigma-machine/`)
- `HEARTBEAT_TIMEOUT_MS` — default **15000** (prop publishes every 10 s)

## State fields

Uses `code.code`, `code.target`, `code.solved`, `code.grid`, `code.target_grid` (optional — grid degrades without it), and `battery.status` / `battery.percent`.

Battery colours use theme tokens (`--pxd-battery-*`); low/critical also show a warning triangle icon.

## Menu actions (⋯)

Identify, Set target (inline input), Sleep (confirm), Open Prop UI — requires firmware ≥ 1.0.2 for `sleep` and `target_grid`.
