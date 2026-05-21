# numeric-gauge

Passive numeric value widget. Displays a number with an optional unit label and
threshold-driven colour bands. Useful for monitoring sensor values, scores,
counters, battery levels, temperatures, and similar numeric prop outputs.

**Default size:** `2x2`

---

## Setup

1. Copy this directory to `rooms/<game>/pxd/widgets/<your-id>/`.
2. Edit the CONFIG block near the top of `widget.js`:

   | Key | Required | Default | Description |
   |---|---|---|---|
   | `STATE_TOPIC` | ✓ | — | MQTT topic carrying state messages |
   | `VALUE_FIELD` | | `"value"` | JSON field holding the numeric value; `null` = raw payload |
   | `WARN_THRESHOLD` | | `null` | Value at which colour changes to warn; `null` = disabled |
   | `DANGER_THRESHOLD` | | `null` | Value at which colour changes to danger; `null` = disabled |
   | `HIGH_IS_BAD` | | `true` | `true` = above threshold is bad; `false` = below threshold is bad |
   | `NORMAL_COLOR` | | `#e9ecef` | Colour within normal range |
   | `WARN_COLOR` | | `#fd7e14` | Colour at warn threshold |
   | `DANGER_COLOR` | | `#dc3545` | Colour at danger threshold |
   | `UNIT_LABEL` | | `""` | Unit suffix (e.g. `°C`, `%`, `V`); `""` to hide |
   | `LABEL` | | `""` | Small label above the value; `""` to hide |
   | `DECIMAL_PLACES` | | `0` | Decimal places; `-1` = show raw string as-is |
   | `HEARTBEAT_TIMEOUT_MS` | | `30000` | ms before card shows disconnected; `0` to disable |

3. Add to `room.json → widgets`:
   ```json
   { "id": "<your-id>", "type": "numeric-gauge", "name": "Battery" }
   ```

4. Ensure `"widgets"` is in `room.json → panels.include`.
5. Run the packager.

---

## Payload shape

The widget expects a JSON payload containing a numeric value:

```json
{ "value": 87 }
```

To use a different field name, set `VALUE_FIELD: 'level'`.  
To parse a raw numeric payload (no JSON), set `VALUE_FIELD: null`.

Before any message arrives, the widget shows `—`.

---

## Threshold direction

`HIGH_IS_BAD: true` (default) — high values are bad:

```
Normal → Warn → Danger
0 ─────────── 75 ──── 90 ──── 100 (e.g. temperature or pressure)
```

`HIGH_IS_BAD: false` — low values are bad:

```
Danger ← Warn ← Normal
0 ─── 20 ──── 40 ──────────── 100 (e.g. battery level or fuel)
```

Thresholds are inclusive: `≥ WARN_THRESHOLD` triggers warn (high-is-bad mode).

---

## Customisation tips

**Battery monitor** (low = bad): set `HIGH_IS_BAD: false`, `WARN_THRESHOLD: 40`,
`DANGER_THRESHOLD: 20`, `UNIT_LABEL: '%'`, `LABEL: 'BATTERY'`.

**Temperature sensor**: set `WARN_THRESHOLD: 75`, `DANGER_THRESHOLD: 90`,
`UNIT_LABEL: '°C'`, `LABEL: 'TEMP'`.

**Score / counter** (no thresholds): leave `WARN_THRESHOLD: null` and
`DANGER_THRESHOLD: null`; the display stays `NORMAL_COLOR`.

**One decimal place**: set `DECIMAL_PLACES: 1` (e.g. displays `42.5`).
