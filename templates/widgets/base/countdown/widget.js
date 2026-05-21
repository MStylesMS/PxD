/**
 * countdown — passive countdown clock widget
 * Displays a countdown timer from a seconds value in the MQTT payload.
 * Changes colour as the count approaches zero.
 * Default size: 2×1
 *
 * To use:
 *   1. Copy this directory to rooms/<game>/pxd/widgets/<your-id>/
 *   2. Edit only the CONFIG block below.
 *   3. Add the widget to room.json → widgets and run the packager.
 *
 * The widget is display-only — it does not manage the timer itself.
 * The prop (clock, game engine, etc.) owns the countdown and publishes
 * the remaining seconds; this widget renders whatever value it receives.
 *
 * IMPORTANT — OFFLINE / KIOSK DEPLOYMENT
 * This widget uses only CSS — no images, no external fonts, no network.
 * It works on air-gapped Pi kiosks out of the box.
 */
(function () {

    // ── CONFIG ─────────────────────────────────────────────────────────────
    const CONFIG = {

        // MQTT ---------------------------------------------------------------

        /** MQTT topic that carries countdown state messages. */
        STATE_TOPIC:          'REPLACE/WITH/YOUR/state',

        /** JSON field in the payload that holds the remaining seconds (integer).
         *  Set to null to treat the raw payload string as the seconds value.
         *  Common field names: 'seconds', 'remaining', 'time_remaining' */
        SECONDS_FIELD:        'seconds',

        // Threshold colours --------------------------------------------------

        /** Remaining seconds at which the display switches to WARN_COLOR.
         *  Set to 0 to disable the warn threshold. */
        WARN_AT_SECONDS:      60,

        /** Remaining seconds at which the display switches to DANGER_COLOR.
         *  Set to 0 to disable the danger threshold. */
        DANGER_AT_SECONDS:    30,

        /** Normal state colour (plenty of time remaining). */
        NORMAL_COLOR:         '#e9ecef',

        /** Warn state colour (approaching zero). */
        WARN_COLOR:           '#fd7e14',

        /** Danger state colour (critically low). */
        DANGER_COLOR:         '#dc3545',

        // Display ------------------------------------------------------------

        /** Time format.
         *  'mm:ss'    — minutes and seconds (default; e.g. 12:34)
         *  'h:mm:ss'  — hours, minutes, and seconds (e.g. 1:02:34) */
        FORMAT:               'mm:ss',

        /** Optional label shown below the timer (e.g. 'BOMB', 'TIME').
         *  Set to '' to hide the label. */
        LABEL:                '',

        // Widget metadata ----------------------------------------------------

        /** Tile size.  See WIDGETS.md § Tile sizing for the full table.
         *  '2x1' fits a clean MM:SS display; '4x1' gives more horizontal room. */
        SIZE:                 '2x1',

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
    let _timeEl  = null;
    let _labelEl = null;


    // ── Helpers ───────────────────────────────────────────────────────────────
    function formatSeconds(totalSecs) {
        if (isNaN(totalSecs) || totalSecs < 0) totalSecs = 0;
        totalSecs = Math.floor(totalSecs);

        const h   = Math.floor(totalSecs / 3600);
        const m   = Math.floor((totalSecs % 3600) / 60);
        const s   = totalSecs % 60;

        const mm  = String(m).padStart(2, '0');
        const ss  = String(s).padStart(2, '0');

        if (CONFIG.FORMAT === 'h:mm:ss') {
            return h + ':' + mm + ':' + ss;
        }
        // mm:ss — clamp to 99:59 rather than silently truncating
        const clampedM = h * 60 + m;
        return String(clampedM).padStart(2, '0') + ':' + ss;
    }

    function colorForSeconds(secs) {
        if (CONFIG.DANGER_AT_SECONDS > 0 && secs <= CONFIG.DANGER_AT_SECONDS) {
            return CONFIG.DANGER_COLOR;
        }
        if (CONFIG.WARN_AT_SECONDS > 0 && secs <= CONFIG.WARN_AT_SECONDS) {
            return CONFIG.WARN_COLOR;
        }
        return CONFIG.NORMAL_COLOR;
    }


    // ── Render ───────────────────────────────────────────────────────────────
    function render(totalSecs) {
        if (!_timeEl) return;
        const color = colorForSeconds(totalSecs);
        _timeEl.textContent = formatSeconds(totalSecs);
        _timeEl.style.color = color;
    }

    function onMessage(payload) {
        let secs;
        try {
            const parsed = (typeof payload === 'string') ? JSON.parse(payload) : payload;
            secs = (CONFIG.SECONDS_FIELD !== null)
                ? Number(parsed[CONFIG.SECONDS_FIELD])
                : Number(parsed);
        } catch (_) {
            secs = Number(payload);
        }
        render(isNaN(secs) ? 0 : secs);
    }


    // ── Registration ─────────────────────────────────────────────────────────
    PxD.widgets.register({
        size:                CONFIG.SIZE,
        interactive:         CONFIG.INTERACTIVE,
        commandTopic:        CONFIG.COMMAND_TOPIC,
        heartbeatTimeoutMs:  CONFIG.HEARTBEAT_TIMEOUT_MS,

        mount(bodyEl) {
            const showLabel = (CONFIG.LABEL !== '' && CONFIG.LABEL != null);
            bodyEl.innerHTML =
                '<div class="wd-countdown-wrap' + (showLabel ? ' wd-has-label' : '') + '">' +
                '  <div class="wd-countdown-time">--:--</div>' +
                (showLabel
                    ? '<div class="wd-countdown-label">' +
                          _escapeHtml(String(CONFIG.LABEL)) +
                      '</div>'
                    : '') +
                '</div>';

            _timeEl  = bodyEl.querySelector('.wd-countdown-time');
            _labelEl = showLabel ? bodyEl.querySelector('.wd-countdown-label') : null;

            PxD.mqtt.subscribe(CONFIG.STATE_TOPIC, onMessage);
        },

        unmount() {
            PxD.mqtt.unsubscribe(CONFIG.STATE_TOPIC, onMessage);
            _timeEl = _labelEl = null;
        },
    });


    // ── Util ─────────────────────────────────────────────────────────────────
    function _escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

}());
