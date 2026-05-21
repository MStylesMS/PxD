# countdown

Passive countdown clock widget. Displays a timer in MM:SS (or H:MM:SS) format.
The display changes colour as the count approaches zero.

**Default size:** `2x1`  
**Display-only:** the widget renders whatever value it receives — the prop or
game engine owns the actual countdown.

---

## Setup

1. Copy this directory to `rooms/<game>/pxd/widgets/<your-id>/`.
2. Edit the CONFIG block near the top of `widget.js`:

   | Key | Required | Default | Description |
   |---|---|---|---|
   | `STATE_TOPIC` | ✓ | — | MQTT topic carrying countdown state messages |
   | `SECONDS_FIELD` | | `"seconds"` | JSON field holding remaining seconds; `null` for raw value |
   | `WARN_AT_SECONDS` | | `60` | Switch to warn colour at this many seconds; `0` to disable |
   | `DANGER_AT_SECONDS` | | `30` | Switch to danger colour at this many seconds; `0` to disable |
   | `NORMAL_COLOR` | | `#e9ecef` | Colour when plenty of time remains |
   | `WARN_COLOR` | | `#fd7e14` | Colour when approaching zero (orange) |
   | `DANGER_COLOR` | | `#dc3545` | Colour when critically low (red) |
   | `FORMAT` | | `"mm:ss"` | `"mm:ss"` or `"h:mm:ss"` |
   | `LABEL` | | `""` | Small label below timer; `""` to hide |
   | `HEARTBEAT_TIMEOUT_MS` | | `30000` | ms before card shows disconnected; `0` to disable |

3. Add to `room.json → widgets`:
   ```json
   { "id": "<your-id>", "type": "countdown", "name": "Bomb Timer" }
   ```

4. Ensure `"widgets"` is in `room.json → panels.include`.
5. Run the packager.

---

## Payload shape

The widget expects a JSON payload containing the remaining seconds as an
integer. For a typical PxC clock prop:

```json
{ "seconds": 3547 }
```

To use a different field name, set `SECONDS_FIELD: 'remaining'`.  
To use a raw integer payload (no JSON wrapper), set `SECONDS_FIELD: null`.

The widget does **not** tick autonomously — it displays whatever value it
receives. If the clock prop publishes updates every second, the display
updates each second. If the prop publishes less frequently (e.g. once per
minute), the display jumps between values.

---

## Size variants

| CONFIG `SIZE` | Best for |
|---|---|
| `"2x1"` *(default)* | MM:SS countdown, snug layout |
| `"4x1"` | MM:SS with more horizontal breathing room |
| `"2x2"` | H:MM:SS counters or when a large, prominent display is needed |

For `"h:mm:ss"` format, `"2x2"` or `"4x1"` is recommended to avoid clipping.

---

## Colour thresholds

Colour transitions cascade — the highest-priority threshold that is triggered
wins:

1. ≤ `DANGER_AT_SECONDS` → `DANGER_COLOR`
2. ≤ `WARN_AT_SECONDS` → `WARN_COLOR`
3. Otherwise → `NORMAL_COLOR`

To use only one threshold, set the other to `0` (disabled).
