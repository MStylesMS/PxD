/**
 * numeric-gauge — passive numeric value widget
 * Displays a numeric value with optional threshold colour bands.
 * Default size: 2×2
 *
 * To use:
 *   1. Copy this directory to rooms/<game>/pxd/widgets/<your-id>/
 *   2. Edit only the CONFIG block below.
 *   3. Add the widget to room.json → widgets and run the packager.
 *
 * IMPORTANT — OFFLINE / KIOSK DEPLOYMENT
 * This widget uses only CSS — no images, no external fonts, no network.
 * It works on air-gapped Pi kiosks out of the box.
 */
(function () {

    // ── CONFIG ─────────────────────────────────────────────────────────────
    const CONFIG = {

        // MQTT ---------------------------------------------------------------

        /** MQTT topic that carries the state messages. */
        STATE_TOPIC:          'REPLACE/WITH/YOUR/state',

        /** JSON field in the payload that holds the numeric value.
         *  Set to null to treat the raw payload string as the value. */
        VALUE_FIELD:          'value',

        // Thresholds ---------------------------------------------------------

        /** Value at or above which the colour switches to WARN_COLOR.
         *  Set to null to disable the warn threshold. */
        WARN_THRESHOLD:       null,

        /** Value at or above which the colour switches to DANGER_COLOR.
         *  Set to null to disable the danger threshold.
         *  DANGER_THRESHOLD takes precedence over WARN_THRESHOLD. */
        DANGER_THRESHOLD:     null,

        /** true  = higher values are "worse" (above thresholds → warn/danger).
         *  false = lower values are "worse" (below thresholds → warn/danger). */
        HIGH_IS_BAD:          true,

        // Display colours ----------------------------------------------------

        NORMAL_COLOR:         '#e9ecef',
        WARN_COLOR:           '#fd7e14',
        DANGER_COLOR:         '#dc3545',

        // Display formatting -------------------------------------------------

        /** Unit label appended after the number (e.g. '°C', '%', 'kg', 'V').
         *  Set to '' to hide. */
        UNIT_LABEL:           '',

        /** Optional label shown above the value (e.g. 'TEMP', 'PRESSURE').
         *  Set to '' to hide. */
        LABEL:                '',

        /** Number of decimal places to display.
         *  0 = integer; 1 = one decimal; etc. -1 = show raw string as-is. */
        DECIMAL_PLACES:       0,

        // Widget metadata ----------------------------------------------------

        /** Tile size.  See WIDGETS.md § Tile sizing for the full table. */
        SIZE:                 '2x2',

        /** Passive widget — no click target. */
        INTERACTIVE:          false,

        /** Not used by a passive widget; present so the loader ⋯ menu can
         *  grey out Enable/Disable rather than hiding them. */
        COMMAND_TOPIC:        null,

        /** Card goes 'disconnected' if no MQTT message arrives within this many ms.
         *  Set to 0 to disable the heartbeat watcher. */
        HEARTBEAT_TIMEOUT_MS: 30000,
    };
    // ── END CONFIG ──────────────────────────────────────────────────────────


    // ── Internal state ───────────────────────────────────────────────────────
    let _valueEl = null;
    let _unitEl  = null;
    let _labelEl = null;


    // ── Helpers ───────────────────────────────────────────────────────────────
    function colorForValue(num) {
        if (isNaN(num)) return CONFIG.NORMAL_COLOR;

        if (CONFIG.HIGH_IS_BAD) {
            if (CONFIG.DANGER_THRESHOLD !== null && num >= CONFIG.DANGER_THRESHOLD) {
                return CONFIG.DANGER_COLOR;
            }
            if (CONFIG.WARN_THRESHOLD !== null && num >= CONFIG.WARN_THRESHOLD) {
                return CONFIG.WARN_COLOR;
            }
        } else {
            // Low is bad: below thresholds → warn/danger
            if (CONFIG.DANGER_THRESHOLD !== null && num <= CONFIG.DANGER_THRESHOLD) {
                return CONFIG.DANGER_COLOR;
            }
            if (CONFIG.WARN_THRESHOLD !== null && num <= CONFIG.WARN_THRESHOLD) {
                return CONFIG.WARN_COLOR;
            }
        }

        return CONFIG.NORMAL_COLOR;
    }

    function formatValue(num) {
        if (CONFIG.DECIMAL_PLACES < 0) return String(num);
        if (isNaN(num)) return '—';
        return num.toFixed(CONFIG.DECIMAL_PLACES);
    }


    // ── Render ───────────────────────────────────────────────────────────────
    function render(num) {
        if (!_valueEl) return;

        const color = colorForValue(num);
        _valueEl.textContent = formatValue(num);
        _valueEl.style.color = color;
        if (_unitEl) _unitEl.style.color = color;
    }

    function onMessage(payload) {
        let num;
        try {
            const parsed = (typeof payload === 'string') ? JSON.parse(payload) : payload;
            num = (CONFIG.VALUE_FIELD !== null)
                ? Number(parsed[CONFIG.VALUE_FIELD])
                : Number(parsed);
        } catch (_) {
            num = Number(payload);
        }
        render(num);
    }


    // ── Registration ─────────────────────────────────────────────────────────
    PxD.widgets.register({
        size:                CONFIG.SIZE,
        interactive:         CONFIG.INTERACTIVE,
        commandTopic:        CONFIG.COMMAND_TOPIC,
        heartbeatTimeoutMs:  CONFIG.HEARTBEAT_TIMEOUT_MS,

        mount(bodyEl) {
            const showLabel = (CONFIG.LABEL !== '' && CONFIG.LABEL != null);
            const showUnit  = (CONFIG.UNIT_LABEL !== '' && CONFIG.UNIT_LABEL != null);

            bodyEl.innerHTML =
                '<div class="wd-gauge-wrap' + (showLabel ? ' wd-has-label' : '') + '">' +
                (showLabel
                    ? '<div class="wd-gauge-label">' +
                          _escapeHtml(String(CONFIG.LABEL)) +
                      '</div>'
                    : '') +
                '  <div class="wd-gauge-row">' +
                '    <span class="wd-gauge-value">—</span>' +
                (showUnit
                    ? '<span class="wd-gauge-unit">' +
                          _escapeHtml(String(CONFIG.UNIT_LABEL)) +
                      '</span>'
                    : '') +
                '  </div>' +
                '</div>';

            _valueEl = bodyEl.querySelector('.wd-gauge-value');
            _unitEl  = showUnit  ? bodyEl.querySelector('.wd-gauge-unit')  : null;
            _labelEl = showLabel ? bodyEl.querySelector('.wd-gauge-label') : null;

            PxD.mqtt.subscribe(CONFIG.STATE_TOPIC, onMessage);
        },

        unmount() {
            PxD.mqtt.unsubscribe(CONFIG.STATE_TOPIC, onMessage);
            _valueEl = _unitEl = _labelEl = null;
        },
    });


    // ── Util ─────────────────────────────────────────────────────────────────
    function _escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

}());
