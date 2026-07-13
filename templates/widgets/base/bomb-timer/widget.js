/**
 * bomb-timer — suitcase / bomb countdown with gameState colour + battery
 * Passive display for px-wifi-v1 (and compatible) bomb props.
 * Default size: 3×1
 *
 * To use:
 *   1. Copy this directory to rooms/<game>/pxd/widgets/<your-id>/
 *   2. Edit only the CONFIG block below.
 *   3. Add the widget to room.json → widgets and run the packager.
 *
 * Expected state fields (px-wifi-v1):
 *   timeRemaining, gameState, battery, batteryState, lowBattery
 *
 * gameState colours (case-insensitive; aliases in parentheses):
 *   ready / not_ready → grey
 *   countdown (running) → white
 *   paused → blink
 *   defused (solved) → green
 *   detonated (failed) → red
 *
 * Battery glyph:
 *   good → green
 *   lowBattery or ≤ BATTERY_LOW_PCT → yellow
 *   ≤ BATTERY_CUTOFF_PCT + 5 → red
 * Cutoff % is not published on the state topic — use CONFIG knobs
 * (firmware defaults: low 40%, cutoff 20%).
 *
 * IMPORTANT — OFFLINE / KIOSK DEPLOYMENT
 * Inline SVG only — no fonts, CDN, or network required.
 */
(function () {

    // ── CONFIG ─────────────────────────────────────────────────────────────
    const CONFIG = {

        /** MQTT topic carrying suitcase / bomb state. */
        STATE_TOPIC:          'REPLACE/WITH/YOUR/suitcase/state',

        /** JSON field for remaining seconds. */
        SECONDS_FIELD:        'timeRemaining',

        /** JSON field for game state string. */
        STATE_FIELD:          'gameState',

        /** JSON field for battery percent 0–100. */
        BATTERY_FIELD:        'battery',

        /** Optional boolean field for low-battery warning. */
        LOW_BATTERY_FIELD:    'lowBattery',

        /** Optional batteryState (normal | usb | charging). */
        BATTERY_STATE_FIELD:  'batteryState',

        /**
         * Percent at/below which the battery glyph turns yellow
         * (firmware lowBatteryPercent default is 40).
         */
        BATTERY_LOW_PCT:      40,

        /**
         * Device cutoff percent (firmware lowBatteryCutoffPercent default 20).
         * Glyph turns red when battery ≤ cutoff + 5.
         * Not present on the state payload — keep in sync with prop config.
         */
        BATTERY_CUTOFF_PCT:   20,

        FORMAT:               'mm:ss',
        LABEL:                'BOMB',

        /** Tile size. 3x1 ≈ 25% width (col-3). */
        SIZE:                 '3x1',

        INTERACTIVE:          false,
        COMMAND_TOPIC:        null,
        HEARTBEAT_TIMEOUT_MS: 30000,
    };
    // ── END CONFIG ──────────────────────────────────────────────────────────


    const STATE_COLORS = {
        ready:      '#9a9a9a',
        not_ready:  '#6c757d',
        countdown:  '#ffffff',
        running:    '#ffffff',
        paused:     '#ffffff',
        defused:    '#198754',
        solved:     '#198754',
        detonated:  '#dc3545',
        failed:     '#dc3545',
    };

    const BATTERY_COLORS = {
        good: '#2f8f74',
        warn: '#e0a800',
        bad:  '#dc3545',
        usb:  '#6c757d',
    };


    let _wrapEl    = null;
    let _timeEl    = null;
    let _labelEl   = null;
    let _battEl    = null;
    let _secs      = null;
    let _gameState = 'ready';
    let _battery   = null;
    let _lowBatt   = false;
    let _battState = 'normal';


    function formatSeconds(totalSecs) {
        if (isNaN(totalSecs) || totalSecs < 0) totalSecs = 0;
        totalSecs = Math.floor(totalSecs);
        const h  = Math.floor(totalSecs / 3600);
        const m  = Math.floor((totalSecs % 3600) / 60);
        const s  = totalSecs % 60;
        const mm = String(m).padStart(2, '0');
        const ss = String(s).padStart(2, '0');
        if (CONFIG.FORMAT === 'h:mm:ss') {
            return h + ':' + mm + ':' + ss;
        }
        const clampedM = h * 60 + m;
        return String(clampedM).padStart(2, '0') + ':' + ss;
    }

    function normalizeState(raw) {
        return String(raw || 'ready').trim().toLowerCase();
    }

    function colorForState(state) {
        return STATE_COLORS[state] || STATE_COLORS.ready;
    }

    function batteryTier(percent, lowFlag) {
        if (percent == null || isNaN(percent)) return null;
        var p = Math.max(0, Math.min(100, Number(percent)));
        var redAt = Number(CONFIG.BATTERY_CUTOFF_PCT) + 5;
        if (p <= redAt) return 'bad';
        if (lowFlag || p <= Number(CONFIG.BATTERY_LOW_PCT)) return 'warn';
        return 'good';
    }

    function batteryGlyphSvg(percent, tier, battState) {
        var p = Math.max(0, Math.min(100, Number(percent) || 0));
        var fillW = Math.max(0, Math.round((p / 100) * 14));
        var color = BATTERY_COLORS[tier] || BATTERY_COLORS.good;
        if (battState === 'usb') {
            return '<svg class="wd-bomb-batt-svg" viewBox="0 0 24 24" aria-hidden="true">' +
                '<path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0V8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
                '<path d="M12 16v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
                '</svg>';
        }
        var bolt = '';
        if (battState === 'charging') {
            bolt = '<path d="M12.5 8L9 13h2.4l-1 4.5L15 12h-2.6z" fill="#ffffff" stroke="' +
                color + '" stroke-width="0.6" stroke-linejoin="round"/>';
        }
        return '<svg class="wd-bomb-batt-svg" viewBox="0 0 24 24" aria-hidden="true">' +
            '<rect x="2" y="7" width="18" height="10" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
            '<rect x="20" y="10" width="2" height="4" rx="1" fill="currentColor"/>' +
            '<rect x="4" y="9" width="' + fillW + '" height="6" rx="1" fill="' + color + '"/>' +
            bolt +
            '</svg>';
    }

    function render() {
        if (!_timeEl) return;

        var state = normalizeState(_gameState);
        var color = colorForState(state);

        if (_secs == null || isNaN(_secs)) {
            _timeEl.textContent = '--:--';
        } else {
            _timeEl.textContent = formatSeconds(_secs);
        }
        _timeEl.style.color = color;

        if (_wrapEl) {
            _wrapEl.classList.toggle('wd-bomb-paused', state === 'paused');
        }

        if (_battEl) {
            if (_battery == null || isNaN(_battery)) {
                _battEl.innerHTML = '';
                _battEl.title = '';
                _battEl.style.color = '';
                return;
            }
            var tier = batteryTier(_battery, _lowBatt);
            var bs = String(_battState || 'normal').toLowerCase();
            _battEl.innerHTML = batteryGlyphSvg(_battery, tier, bs);
            _battEl.style.color = (bs === 'usb')
                ? BATTERY_COLORS.usb
                : (BATTERY_COLORS[tier] || BATTERY_COLORS.good);
            _battEl.title = bs === 'usb'
                ? 'USB power (no battery)'
                : ('Battery ' + Math.round(_battery) + '%' +
                    (bs === 'charging' ? ' (charging)' : '') +
                    (_lowBatt ? ' — low' : ''));
        }
    }

    function onMessage(payload) {
        try {
            var parsed = (typeof payload === 'string') ? JSON.parse(payload) : payload;
            if (!parsed || typeof parsed !== 'object') {
                var n = Number(payload);
                if (!isNaN(n)) _secs = n;
                render();
                return;
            }
            if (CONFIG.SECONDS_FIELD && parsed[CONFIG.SECONDS_FIELD] != null) {
                _secs = Number(parsed[CONFIG.SECONDS_FIELD]);
            }
            if (CONFIG.STATE_FIELD && parsed[CONFIG.STATE_FIELD] != null) {
                _gameState = parsed[CONFIG.STATE_FIELD];
            }
            if (CONFIG.BATTERY_FIELD && parsed[CONFIG.BATTERY_FIELD] != null) {
                _battery = Number(parsed[CONFIG.BATTERY_FIELD]);
            }
            if (CONFIG.LOW_BATTERY_FIELD && parsed[CONFIG.LOW_BATTERY_FIELD] != null) {
                _lowBatt = Boolean(parsed[CONFIG.LOW_BATTERY_FIELD]);
            }
            if (CONFIG.BATTERY_STATE_FIELD && parsed[CONFIG.BATTERY_STATE_FIELD] != null) {
                _battState = parsed[CONFIG.BATTERY_STATE_FIELD];
            }
        } catch (_) {
            var raw = Number(payload);
            if (!isNaN(raw)) _secs = raw;
        }
        render();
    }


    PxD.widgets.register({
        size:                CONFIG.SIZE,
        interactive:         CONFIG.INTERACTIVE,
        commandTopic:        CONFIG.COMMAND_TOPIC,
        heartbeatTimeoutMs:  CONFIG.HEARTBEAT_TIMEOUT_MS,

        mount(bodyEl) {
            var showLabel = (CONFIG.LABEL !== '' && CONFIG.LABEL != null);
            bodyEl.innerHTML =
                '<div class="wd-bomb-wrap' + (showLabel ? ' wd-has-label' : '') + '">' +
                '  <div class="wd-bomb-main">' +
                '    <div class="wd-bomb-time">--:--</div>' +
                '    <div class="wd-bomb-batt" aria-hidden="true"></div>' +
                '  </div>' +
                (showLabel
                    ? '<div class="wd-bomb-label">' + _escapeHtml(String(CONFIG.LABEL)) + '</div>'
                    : '') +
                '</div>';

            _wrapEl  = bodyEl.querySelector('.wd-bomb-wrap');
            _timeEl  = bodyEl.querySelector('.wd-bomb-time');
            _battEl  = bodyEl.querySelector('.wd-bomb-batt');
            _labelEl = showLabel ? bodyEl.querySelector('.wd-bomb-label') : null;

            PxD.mqtt.subscribe(CONFIG.STATE_TOPIC, onMessage);
        },

        unmount() {
            PxD.mqtt.unsubscribe(CONFIG.STATE_TOPIC, onMessage);
            _wrapEl = _timeEl = _labelEl = _battEl = null;
        },
    });

    function _escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

}());
