/**
 * binary-light — passive binary indicator widget
 * Displays a coloured dot: off (default) or on, based on MQTT state.
 * Default size: 1×1
 *
 * To use:
 *   1. Copy this directory to rooms/<game>/pxd/widgets/<your-id>/
 *   2. Edit only the CONFIG block below.
 *   3. Add the widget to room.json → widgets and run the packager.
 *
 * IMPORTANT — OFFLINE / KIOSK DEPLOYMENT
 * This widget uses only CSS and inline text — no images, no fonts, no network.
 * It works on air-gapped Pi kiosks out of the box.
 */
(function () {

    // ── CONFIG ─────────────────────────────────────────────────────────────
    const CONFIG = {

        // MQTT ---------------------------------------------------------------

        /** MQTT topic that carries the state messages. */
        STATE_TOPIC:          'REPLACE/WITH/YOUR/state',

        /** JSON field in the payload that holds the state value.
         *  Set to null to treat the raw (non-JSON) payload string as the value. */
        STATE_FIELD:          'state',

        /** The value of STATE_FIELD (coerced to string) that means "on".
         *  Common values: 'on', 'true', '1', 'HIGH', 'active' */
        ON_VALUE:             'on',

        // Display ------------------------------------------------------------

        ON_LABEL:             'ON',
        OFF_LABEL:            'OFF',

        /** CSS colour for the "on" state dot and label. */
        ON_COLOR:             '#198754',

        /** CSS colour for the "off" state dot and label. */
        OFF_COLOR:            '#6c757d',

        /** Optional glow radius when on (e.g. '8px'). Set to '0' to disable. */
        ON_GLOW_RADIUS:       '8px',

        // Widget metadata ----------------------------------------------------

        /** Tile size.  See WIDGETS.md § Tile sizing for the full table. */
        SIZE:                 '1x1',

        /** false = passive display only; true = full card area is a click target. */
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
    let _dotEl   = null;
    let _labelEl = null;


    // ── Render ───────────────────────────────────────────────────────────────
    function render(isOn) {
        if (!_dotEl) return;

        const color = isOn ? CONFIG.ON_COLOR  : CONFIG.OFF_COLOR;
        const label = isOn ? CONFIG.ON_LABEL  : CONFIG.OFF_LABEL;
        const glow  = (isOn && CONFIG.ON_GLOW_RADIUS && CONFIG.ON_GLOW_RADIUS !== '0')
            ? '0 0 ' + CONFIG.ON_GLOW_RADIUS + ' ' + color
            : 'none';

        _dotEl.style.backgroundColor = color;
        _dotEl.style.boxShadow        = glow;
        _labelEl.textContent          = label;
        _labelEl.style.color          = color;
    }

    function onMessage(payload) {
        try {
            const parsed = (typeof payload === 'string') ? JSON.parse(payload) : payload;
            const val    = (CONFIG.STATE_FIELD !== null)
                ? parsed[CONFIG.STATE_FIELD]
                : parsed;
            render(String(val).toLowerCase() === String(CONFIG.ON_VALUE).toLowerCase());
        } catch (_) {
            render(String(payload) === String(CONFIG.ON_VALUE));
        }
    }


    // ── Registration ─────────────────────────────────────────────────────────
    PxD.widgets.register({
        size:                CONFIG.SIZE,
        interactive:         CONFIG.INTERACTIVE,
        commandTopic:        CONFIG.COMMAND_TOPIC,
        heartbeatTimeoutMs:  CONFIG.HEARTBEAT_TIMEOUT_MS,

        mount(bodyEl) {
            bodyEl.innerHTML =
                '<div class="wd-light-wrap">' +
                '  <div class="wd-light-dot"></div>' +
                '  <div class="wd-light-label"></div>' +
                '</div>';

            _dotEl   = bodyEl.querySelector('.wd-light-dot');
            _labelEl = bodyEl.querySelector('.wd-light-label');

            render(false);  // show off until first MQTT message arrives

            PxD.mqtt.subscribe(CONFIG.STATE_TOPIC, onMessage);
        },

        unmount() {
            PxD.mqtt.unsubscribe(CONFIG.STATE_TOPIC, onMessage);
            _dotEl = _labelEl = null;
        },
    });

}());
