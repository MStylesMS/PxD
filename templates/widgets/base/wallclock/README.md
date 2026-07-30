# wallclock widget

Display monitor for **px-clock-esp8266** props via MQTT `state`.

## Display

- **Primary:** `clock.remaining_time` (MM:SS)
- **Secondary:** `clock.remaining_s` (seconds)
- **State pill:** `clock.state` (READY, RUNNING, PAUSED, …)
- **Bars:** two rows of 8 segments from `leds.top_count` / `leds.bottom_count`

## CONFIG

- `STATE_TOPIC` — e.g. `paradox/spycatcher/moscow/wallclock/state`
- `COMMAND_TOPIC` — for Identify menu action
- `PROP_UI_URL` — prop admin link
- `SIZE` — default `2x1`
- `BAR_SEGMENTS` — default **8**

## Menu

Identify, Open Prop UI
