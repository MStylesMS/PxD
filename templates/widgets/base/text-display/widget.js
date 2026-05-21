/**
 * text-display — passive text field widget
 * Displays an arbitrary text value from an MQTT state message.
 * Default size: 4×1
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

        /** JSON field whose value is displayed as text.
         *  Set to null to display the entire raw payload string. */
        TEXT_FIELD:           'value',

        // Display ------------------------------------------------------------

        /** Optional label shown above the value (e.g. 'CODE', 'STATUS').
         *  Set to '' to hide the label. */
        LABEL:                '',

        /** CSS colour for the displayed value text. */
        VALUE_COLOR:          '#e9ecef',

        /** CSS colour for the label text. */
        LABEL_COLOR:          '#6c757d',

        /** Truncate the displayed value to this many characters.
         *  Set to 0 for no truncation. */
        MAX_LENGTH:           0,

        /** true = monospace font for the value (good for codes, hex, IDs).
         *  false = proportional font (default). */
        MONO_FONT:            false,

        // Widget metadata ----------------------------------------------------

        /** Tile size.  See WIDGETS.md § Tile sizing for the full table. */
        SIZE:                 '4x1',

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
    let _labelEl = null;


    // ── Render ───────────────────────────────────────────────────────────────
    function render(rawText) {
        if (!_valueEl) return;

        let text = String(rawText == null ? '' : rawText);

        if (CONFIG.MAX_LENGTH > 0 && text.length > CONFIG.MAX_LENGTH) {
            text = text.slice(0, CONFIG.MAX_LENGTH) + '…';
        }

        _valueEl.textContent = text || '—';
    }

    function onMessage(payload) {
        let text;
        try {
            const parsed = (typeof payload === 'string') ? JSON.parse(payload) : payload;
            text = (CONFIG.TEXT_FIELD !== null)
                ? parsed[CONFIG.TEXT_FIELD]
                : payload;
        } catch (_) {
            text = payload;
        }
        render(text);
    }


    // ── Registration ─────────────────────────────────────────────────────────
    PxD.widgets.register({
        size:                CONFIG.SIZE,
        interactive:         CONFIG.INTERACTIVE,
        commandTopic:        CONFIG.COMMAND_TOPIC,
        heartbeatTimeoutMs:  CONFIG.HEARTBEAT_TIMEOUT_MS,

        mount(bodyEl) {
            const showLabel = (CONFIG.LABEL !== '' && CONFIG.LABEL != null);
            const monoClass = CONFIG.MONO_FONT ? ' wd-text-mono' : '';

            bodyEl.innerHTML =
                '<div class="wd-text-wrap' + (showLabel ? ' wd-has-label' : '') + '">' +
                (showLabel
                    ? '<div class="wd-text-label">' +
                          _escapeHtml(String(CONFIG.LABEL)) +
                      '</div>'
                    : '') +
                '  <div class="wd-text-value' + monoClass + '"></div>' +
                '</div>';

            _valueEl = bodyEl.querySelector('.wd-text-value');
            _labelEl = showLabel ? bodyEl.querySelector('.wd-text-label') : null;

            // Apply colours from CONFIG
            _valueEl.style.color = CONFIG.VALUE_COLOR;
            if (_labelEl) _labelEl.style.color = CONFIG.LABEL_COLOR;

            _valueEl.textContent = '—';  // placeholder until first MQTT message

            PxD.mqtt.subscribe(CONFIG.STATE_TOPIC, onMessage);
        },

        unmount() {
            PxD.mqtt.unsubscribe(CONFIG.STATE_TOPIC, onMessage);
            _valueEl = _labelEl = null;
        },
    });


    // ── Util ─────────────────────────────────────────────────────────────────
    function _escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

}());
