/**
 * binary-switch — active binary widget
 * Displays a power/device switch icon: on or off, based on MQTT state.
 * Clicking the tile publishes an allOn or allOff command (configurable).
 * Default size: 1×1
 *
 * To use:
 *   1. Copy this directory to rooms/<game>/pxd/widgets/<your-id>/
 *   2. Edit only the CONFIG block below.
 *   3. Add the widget to room.json → widgets and run the packager.
 *
 * Glyphs — set GLYPH to one of: 'plug' | 'fan' | 'bulb' | 'tv'
 *   Built-in SVG pairs are offline-safe (fill="currentColor", viewBox 0 0 24 24).
 *
 * Icon overrides — set ICON_ON / ICON_OFF to one of:
 *
 *   '<svg>…</svg>'        Inline SVG string (offline safe, no dependencies)
 *   'icons/on.png'        File path → <img> tag (PNG, GIF, WebP, APNG, SVG)
 *   'power'               Material Symbols ligature name (requires font/CDN)
 *
 * If ICON_ON / ICON_OFF are set, they override the GLYPH pair.
 * Both overrides must be the same format type.
 *
 * IMPORTANT — OFFLINE / KIOSK DEPLOYMENT
 * The default CONFIG uses built-in inline SVG glyphs. This has zero network
 * dependencies and works on air-gapped Pi kiosks. Do NOT switch to ligature
 * icon overrides without vendoring the Material Symbols font first.
 */
(function () {

    // ── Built-in glyph SVGs ────────────────────────────────────────────────
    // All use fill="currentColor" and viewBox="0 0 24 24" for theme colouring.
    /* eslint-disable max-len */
    const GLYPHS = {

        plug: {
            on: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
                '<rect x="8" y="1.5" width="2.2" height="5.5" rx="0.6"/>' +
                '<rect x="13.8" y="1.5" width="2.2" height="5.5" rx="0.6"/>' +
                '<path d="M6.5 8h11v5c0 2.4-1.4 4.5-3.5 5.4V22h-4v-3.6C7.9 17.5 6.5 15.4 6.5 13V8z"/>' +
                '</svg>',

            off: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
                '<g opacity="0.55">' +
                '<rect x="8" y="1.5" width="2.2" height="5.5" rx="0.6"/>' +
                '<rect x="13.8" y="1.5" width="2.2" height="5.5" rx="0.6"/>' +
                '<path d="M6.5 8h11v5c0 2.4-1.4 4.5-3.5 5.4V22h-4v-3.6C7.9 17.5 6.5 15.4 6.5 13V8z"/>' +
                '</g>' +
                '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
                '<path d="M6.2 6.2l11.6 11.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>' +
                '</svg>',
        },

        fan: {
            // Table fan: blade set inside a circular cage
            on: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
                '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
                '<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.35"/>' +
                '<ellipse cx="12" cy="7.3" rx="1.7" ry="3.5"/>' +
                '<ellipse cx="16.7" cy="12" rx="3.5" ry="1.7"/>' +
                '<ellipse cx="12" cy="16.7" rx="1.7" ry="3.5"/>' +
                '<ellipse cx="7.3" cy="12" rx="3.5" ry="1.7"/>' +
                '<circle cx="12" cy="12" r="1.9"/>' +
                '</svg>',

            off: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
                '<g opacity="0.55">' +
                '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
                '<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.5"/>' +
                '<ellipse cx="12" cy="7.3" rx="1.7" ry="3.5"/>' +
                '<ellipse cx="16.7" cy="12" rx="3.5" ry="1.7"/>' +
                '<ellipse cx="12" cy="16.7" rx="1.7" ry="3.5"/>' +
                '<ellipse cx="7.3" cy="12" rx="3.5" ry="1.7"/>' +
                '<circle cx="12" cy="12" r="1.9"/>' +
                '</g>' +
                '<path d="M5.5 5.5l13 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>' +
                '</svg>',
        },

        bulb: {
            // ON: solid bulb + radiating lines
            on: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
                '<rect x="11" y="0.4" width="2" height="2.8" rx="1"/>' +
                '<rect x="18.2" y="3.6" width="2" height="2.8" rx="1" transform="rotate(45 19.2 5)"/>' +
                '<rect x="20.8" y="11" width="2.8" height="2" rx="1"/>' +
                '<rect x="0.4" y="11" width="2.8" height="2" rx="1"/>' +
                '<rect x="3.8" y="3.6" width="2" height="2.8" rx="1" transform="rotate(-45 4.8 5)"/>' +
                '<path d="M8.2 14.2C6.9 13 6 11.4 6 9.5 6 6.5 8.7 4 12 4s6 2.5 6 5.5c0 1.9-.9 3.5-2.2 4.7H8.2z"/>' +
                '<rect x="9.3" y="14.8" width="5.4" height="1.4" rx="0.3"/>' +
                '<rect x="9.8" y="16.6" width="4.4" height="1.3" rx="0.3"/>' +
                '<rect x="10.3" y="18.3" width="3.4" height="2" rx="0.6"/>' +
                '</svg>',

            // OFF: outline bulb, empty interior, no rays
            off: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
                '<path fill-rule="evenodd" d="M12 3.5C8.96 3.5 6.5 5.96 6.5 9c0 1.95 1.02 3.66 2.55 4.6V15h6v-1.4' +
                'C16.48 12.66 17.5 10.95 17.5 9c0-3.04-2.46-5.5-5.5-5.5zm0 2c1.93 0 3.5 1.57 3.5 3.5' +
                ' 0 1.35-.77 2.52-1.9 3.12l-.6.32V13h-2v-.56l-.6-.32C9.27 11.52 8.5 10.35 8.5 9' +
                'c0-1.93 1.57-3.5 3.5-3.5z"/>' +
                '<rect x="9.3" y="15.5" width="5.4" height="1.3" rx="0.3"/>' +
                '<rect x="9.8" y="17.2" width="4.4" height="1.2" rx="0.3"/>' +
                '<rect x="10.3" y="18.8" width="3.4" height="1.8" rx="0.5"/>' +
                '</svg>',
        },

        tv: {
            // Classic CRT set with rabbit-ear antennas
            on: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
                '<path d="M7.2 2.2l4.3 4.1L16.8 2.2l1.1 1.2-4.2 3.9h-3.4L6.1 3.4z"/>' +
                '<rect x="3" y="7.2" width="18" height="12.2" rx="1.6"/>' +
                '<rect x="5" y="9" width="14" height="7.6" rx="0.6" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.35"/>' +
                '<rect x="8.5" y="19.4" width="2.2" height="2.2" rx="0.4"/>' +
                '<rect x="13.3" y="19.4" width="2.2" height="2.2" rx="0.4"/>' +
                '</svg>',

            off: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
                '<g opacity="0.55">' +
                '<path d="M7.2 2.2l4.3 4.1L16.8 2.2l1.1 1.2-4.2 3.9h-3.4L6.1 3.4z"/>' +
                '<rect x="3" y="7.2" width="18" height="12.2" rx="1.6"/>' +
                '<rect x="5" y="9" width="14" height="7.6" rx="0.6" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.5"/>' +
                '<rect x="8.5" y="19.4" width="2.2" height="2.2" rx="0.4"/>' +
                '<rect x="13.3" y="19.4" width="2.2" height="2.2" rx="0.4"/>' +
                '</g>' +
                '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
                '<path d="M6.2 6.2l11.6 11.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>' +
                '</svg>',
        },
    };
    /* eslint-enable max-len */


    // ── CONFIG ─────────────────────────────────────────────────────────────
    const CONFIG = {

        // MQTT state (subscribe) ---------------------------------------------

        /** MQTT topic that carries switch state messages. */
        STATE_TOPIC:          'REPLACE/WITH/YOUR/state',

        /** JSON field in the payload that holds the state value.
         *  Set to null to treat the raw (non-JSON) payload string as the value. */
        STATE_FIELD:          'state',

        /** The value of STATE_FIELD (coerced to string) that means "on".
         *  Common values: 'on', 'true', '1', 'HIGH' */
        ON_VALUE:             'on',

        // MQTT commands (publish) --------------------------------------------

        /** MQTT topic to publish commands to.
         *  Typically the same prop root with /commands suffix, e.g.:
         *  'paradox/room/prop/commands'
         *  Set to null to disable command publishing (passive mode). */
        COMMAND_TOPIC:        'REPLACE/WITH/YOUR/commands',

        /** Command name published when the user clicks to turn on.
         *  Sent as object: { command: "<ON_COMMAND>" } */
        ON_COMMAND:           'allOn',

        /** Command name published when the user clicks to turn off. */
        OFF_COMMAND:          'allOff',

        // Display ------------------------------------------------------------

        ON_LABEL:             'ON',
        OFF_LABEL:            'OFF',

        /** CSS colour for the on state (applied to icon + label).
         *  Not used when icons are file paths — the image conveys state instead. */
        ON_COLOR:             '#198754',

        /** CSS colour for the off state. */
        OFF_COLOR:            '#dc3545',

        // Glyph / icons ------------------------------------------------------
        //
        // GLYPH selects a built-in SVG pair: 'plug' | 'fan' | 'bulb' | 'tv'
        // Set ICON_ON / ICON_OFF to override (inline SVG, file path, or ligature).

        GLYPH:                'plug',

        /** Optional override for the on-state icon.  null = use GLYPH. */
        ICON_ON:              null,

        /** Optional override for the off-state icon.  null = use GLYPH. */
        ICON_OFF:             null,

        // Widget metadata ----------------------------------------------------

        /** Tile size.  See WIDGETS.md § Tile sizing for the full table. */
        SIZE:                 '1x1',

        /** true = full card area is a click target (publishes on/off command).
         *  false = passive display only (no commands published on click). */
        INTERACTIVE:          true,

        /** State shown before the first MQTT message arrives.
         *  'off' (default) or 'on'. */
        INITIAL_STATE:        'off',

        /** ms to wait for MQTT confirmation after a click before reverting the
         *  display to the last confirmed state.  Set to 0 to wait indefinitely. */
        PENDING_TIMEOUT_MS:   4000,

        /** Card goes 'disconnected' if no MQTT message arrives within this many ms.
         *  Set to 0 to disable the heartbeat watcher. */
        HEARTBEAT_TIMEOUT_MS: 30000,
    };
    // ── END CONFIG ──────────────────────────────────────────────────────────


    // ── Resolve icons from GLYPH + optional overrides ───────────────────────
    const _glyphPair = GLYPHS[CONFIG.GLYPH] || GLYPHS.plug;
    const ICON_ON    = CONFIG.ICON_ON  || _glyphPair.on;
    const ICON_OFF   = CONFIG.ICON_OFF || _glyphPair.off;


    // ── Icon mode detection ─────────────────────────────────────────────────
    // Detected once from ICON_ON; ICON_OFF must be the same type.
    const ICON_MODE = (function () {
        const ref = ICON_ON;
        if (typeof ref === 'string' && ref.trimStart().startsWith('<')) return 'svg';
        if (/[/.]/.test(ref) || (typeof ref === 'string' && ref.startsWith('data:'))) return 'file';
        return 'ligature';  // Material Symbols or similar icon font
    }());


    // ── Material Symbols font loader (opt-in, ligature mode only) ───────────
    // Only called when ICON_ON / ICON_OFF are ligature names.
    // NOT called by the default glyph CONFIG.
    const MAT_SYM_ID   = 'pxd-material-symbols';
    const MAT_SYM_HREF =
        'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined' +
        ':opsz,wght,FILL,GRAD@24,400,1,0';

    function ensureMaterialSymbols() {
        if (!document.getElementById(MAT_SYM_ID)) {
            const link = document.createElement('link');
            link.id   = MAT_SYM_ID;
            link.rel  = 'stylesheet';
            link.href = MAT_SYM_HREF;
            document.head.appendChild(link);
        }
    }


    // ── Internal state ───────────────────────────────────────────────────────
    const _initialOn = (String(CONFIG.INITIAL_STATE).toLowerCase() === 'on');

    let _iconEl         = null;
    let _labelEl        = null;
    let _wrapEl         = null;
    let _isOn           = _initialOn;  // current displayed state
    let _lastConfirmed  = null;        // last MQTT-confirmed state; null = no msg yet
    let _pending        = false;       // command sent, awaiting MQTT confirmation
    let _pendingTimer   = null;


    // ── Render ───────────────────────────────────────────────────────────────
    function render(isOn) {
        _isOn = isOn;
        if (!_iconEl) return;

        const ref   = isOn ? ICON_ON          : ICON_OFF;
        const color = isOn ? CONFIG.ON_COLOR  : CONFIG.OFF_COLOR;
        const label = isOn ? CONFIG.ON_LABEL  : CONFIG.OFF_LABEL;

        if (ICON_MODE === 'svg') {
            _iconEl.innerHTML   = ref;
            _iconEl.style.color = color;

        } else if (ICON_MODE === 'file') {
            let img = _iconEl.querySelector('img');
            if (!img) {
                img = document.createElement('img');
                img.className = 'wd-switch-img';
                _iconEl.innerHTML = '';
                _iconEl.appendChild(img);
            }
            img.src = ref;

        } else { // ligature
            _iconEl.innerHTML   =
                '<span class="material-symbols-outlined">' + ref + '</span>';
            _iconEl.style.color = color;
        }

        _labelEl.textContent = label;
        _labelEl.style.color = color;
    }

    function onMessage(payload) {
        let isOn;
        try {
            const parsed = (typeof payload === 'string') ? JSON.parse(payload) : payload;
            const val    = (CONFIG.STATE_FIELD !== null)
                ? parsed[CONFIG.STATE_FIELD]
                : parsed;
            isOn = (String(val) === String(CONFIG.ON_VALUE));
        } catch (_) {
            isOn = (String(payload) === String(CONFIG.ON_VALUE));
        }
        _lastConfirmed = isOn;
        clearPending();
        render(isOn);
    }


    // ── Pending state (command sent, awaiting MQTT confirmation) ──────────────
    function clearPending() {
        if (_pendingTimer !== null) { clearTimeout(_pendingTimer); _pendingTimer = null; }
        _pending = false;
        if (_wrapEl) _wrapEl.classList.remove('wd-pending');
    }

    function enterPending() {
        _pending = true;
        if (_wrapEl) _wrapEl.classList.add('wd-pending');
        if (CONFIG.PENDING_TIMEOUT_MS > 0) {
            _pendingTimer = setTimeout(function () {
                const revertTo = _lastConfirmed !== null ? _lastConfirmed : _initialOn;
                clearPending();
                render(revertTo);
            }, CONFIG.PENDING_TIMEOUT_MS);
        }
    }


    // ── Command publishing ────────────────────────────────────────────────────
    function onClickHandler() {
        if (!CONFIG.COMMAND_TOPIC) return;
        if (_pending) return;  // ignore clicks while awaiting confirmation
        const cmd = _isOn ? CONFIG.OFF_COMMAND : CONFIG.ON_COMMAND;
        enterPending();
        // Publish an object payload — PxD.mqtt serialises once (do not JSON.stringify).
        PxD.mqtt.publish(CONFIG.COMMAND_TOPIC, { command: cmd });
    }


    // ── Registration ─────────────────────────────────────────────────────────
    PxD.widgets.register({
        size:                CONFIG.SIZE,
        interactive:         CONFIG.INTERACTIVE,
        commandTopic:        CONFIG.COMMAND_TOPIC,
        heartbeatTimeoutMs:  CONFIG.HEARTBEAT_TIMEOUT_MS,

        mount(bodyEl) {
            if (ICON_MODE === 'ligature') ensureMaterialSymbols();

            bodyEl.innerHTML =
                '<div class="wd-switch-wrap' +
                    (CONFIG.INTERACTIVE ? ' wd-interactive' : '') + '">' +
                '  <div class="wd-switch-icon"></div>' +
                '  <div class="wd-switch-label"></div>' +
                '</div>';

            _wrapEl  = bodyEl.querySelector('.wd-switch-wrap');
            _iconEl  = bodyEl.querySelector('.wd-switch-icon');
            _labelEl = bodyEl.querySelector('.wd-switch-label');

            render(_initialOn);  // show initial state until first MQTT message

            PxD.mqtt.subscribe(CONFIG.STATE_TOPIC, onMessage);

            if (CONFIG.INTERACTIVE && CONFIG.COMMAND_TOPIC) {
                _wrapEl.addEventListener('click', onClickHandler);
            }
        },

        unmount() {
            clearPending();
            if (_wrapEl) _wrapEl.removeEventListener('click', onClickHandler);
            PxD.mqtt.unsubscribe(CONFIG.STATE_TOPIC, onMessage);
            _iconEl = _labelEl = _wrapEl = null;
        },
    });

}());
