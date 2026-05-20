/**
 * binary-door — passive binary widget
 * Displays a door icon: closed (default) or open, based on MQTT state.
 * Default size: 1×1
 *
 * To use:
 *   1. Copy this directory to rooms/<game>/pxd/widgets/<your-id>/
 *   2. Edit only the CONFIG block below.
 *   3. Add the widget to room.json → widgets and run the packager.
 *
 * Icon formats — set ICON_OPEN / ICON_CLOSED to one of:
 *
 *   '<svg>…</svg>'        Inline SVG string (DEFAULT — offline safe, no dependencies)
 *   'icons/open.gif'      File path → <img> tag (PNG, GIF, WebP, APNG, SVG)
 *                           All animated formats (GIF, WebP, APNG) work automatically.
 *   'door_open'           Material Symbols ligature name; requires either:
 *                           • Internet access (CDN), or
 *                           • A locally vendored copy of the Material Symbols font.
 *                           See docs/WIDGETS.md § Offline assets for vendoring steps.
 *
 * ICON_OPEN and ICON_CLOSED must be the same format type.
 *
 * IMPORTANT — OFFLINE / KIOSK DEPLOYMENT
 * The default CONFIG below uses inline SVG (the Material Symbols door_front /
 * door_open paths, embedded directly). This has zero network dependencies and
 * works on air-gapped Pi kiosks. Do NOT change the defaults to ligature names
 * without vendoring the font first.
 */
(function () {

    // ── CONFIG ─────────────────────────────────────────────────────────────
    const CONFIG = {

        // MQTT ---------------------------------------------------------------

        /** MQTT topic that carries door state messages. */
        STATE_TOPIC:          'REPLACE/WITH/YOUR/state',

        /** JSON field in the payload that holds the state value.
         *  Set to null to treat the raw (non-JSON) payload string as the value. */
        STATE_FIELD:          'state',

        // State mapping ------------------------------------------------------

        /** The value of STATE_FIELD (coerced to string) that means "open".
         *  Common values: 'open', 'true', '1', 'HIGH' */
        OPEN_VALUE:           'open',

        // Display ------------------------------------------------------------

        OPEN_LABEL:           'OPEN',
        CLOSED_LABEL:         'CLOSED',

        /** CSS colour for the open state (applied to icon + label).
         *  Not used when icons are file paths — the image conveys state instead. */
        OPEN_COLOR:           '#dc3545',

        /** CSS colour for the closed state. */
        CLOSED_COLOR:         '#198754',

        // Icons (see header comment for format options) ----------------------
        //
        // Defaults are the Material Symbols door_open / door_front paths
        // embedded as inline SVG — offline safe, no font or network required.
        // To switch to ligature mode: set these to 'door_open' / 'door_front'
        // AND vendor the Material Symbols font (see docs/WIDGETS.md).

        /* eslint-disable max-len */
        ICON_OPEN: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M120-120v-80h80v-560q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v560h80v80H120Zm480-80h80v-560H500v-44q44 8 72 41t28 77v486ZM468.5-451.5Q480-463 480-480t-11.5-28.5Q457-520 440-520t-28.5 11.5Q400-497 400-480t11.5 28.5Q423-440 440-440t28.5-11.5Z"/></svg>',

        ICON_CLOSED: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M120-120v-80h80v-560q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v560h80v80H120Zm468.5-331.5Q600-463 600-480t-11.5-28.5Q577-520 560-520t-28.5 11.5Q520-497 520-480t11.5 28.5Q543-440 560-440t28.5-11.5Z"/></svg>',
        /* eslint-enable max-len */

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


    // ── Icon mode detection ─────────────────────────────────────────────────
    // Detected once from ICON_CLOSED; ICON_OPEN must be the same type.
    const ICON_MODE = (function () {
        const ref = CONFIG.ICON_CLOSED;
        if (typeof ref === 'string' && ref.trimStart().startsWith('<')) return 'svg';
        if (/[/.]/.test(ref) || ref.startsWith('data:'))               return 'file';
        return 'ligature';  // Material Symbols or similar icon font
    }());


    // ── Material Symbols font loader (opt-in, ligature mode only) ───────────
    // Only called when ICON_OPEN / ICON_CLOSED are ligature names (e.g. 'door_open').
    // NOT called by the default inline-SVG CONFIG.
    //
    // Loads from Google CDN — requires internet access.
    // For offline kiosk deployment: replace MAT_SYM_HREF with a local @font-face
    // stylesheet path, or switch CONFIG icons back to inline SVG / file paths.
    const MAT_SYM_ID   = 'pxd-material-symbols';
    const MAT_SYM_HREF =
        'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined' +
        ':opsz,wght,FILL,GRAD@24,400,0,0&icon_names=door_front,door_open';

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
    let _iconEl  = null;
    let _labelEl = null;


    // ── Render ───────────────────────────────────────────────────────────────
    function render(isOpen) {
        if (!_iconEl) return;

        const ref   = isOpen ? CONFIG.ICON_OPEN   : CONFIG.ICON_CLOSED;
        const color = isOpen ? CONFIG.OPEN_COLOR  : CONFIG.CLOSED_COLOR;
        const label = isOpen ? CONFIG.OPEN_LABEL  : CONFIG.CLOSED_LABEL;

        if (ICON_MODE === 'svg') {
            _iconEl.innerHTML   = ref;
            _iconEl.style.color = color;

        } else if (ICON_MODE === 'file') {
            // Reuse existing <img>; create on first render.
            let img = _iconEl.querySelector('img');
            if (!img) {
                img = document.createElement('img');
                img.className = 'wd-door-img';
                _iconEl.innerHTML = '';
                _iconEl.appendChild(img);
            }
            img.src = ref;
            // Colour tinting skipped — the image itself conveys the state.

        } else { // ligature
            _iconEl.innerHTML   =
                '<span class="material-symbols-outlined">' + ref + '</span>';
            _iconEl.style.color = color;
        }

        _labelEl.textContent = label;
        _labelEl.style.color = color;
    }

    function onMessage(payload) {
        try {
            const parsed = (typeof payload === 'string') ? JSON.parse(payload) : payload;
            const val    = (CONFIG.STATE_FIELD !== null)
                ? parsed[CONFIG.STATE_FIELD]
                : parsed;
            render(String(val) === String(CONFIG.OPEN_VALUE));
        } catch (_) {
            // Non-JSON payload — compare raw string directly.
            render(String(payload) === String(CONFIG.OPEN_VALUE));
        }
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
                '<div class="wd-door-wrap">' +
                '  <div class="wd-door-icon"></div>' +
                '  <div class="wd-door-label"></div>' +
                '</div>';

            _iconEl  = bodyEl.querySelector('.wd-door-icon');
            _labelEl = bodyEl.querySelector('.wd-door-label');

            render(false);  // show closed until first MQTT message arrives

            PxD.mqtt.subscribe(CONFIG.STATE_TOPIC, onMessage);
        },

        unmount() {
            PxD.mqtt.unsubscribe(CONFIG.STATE_TOPIC, onMessage);
            _iconEl = _labelEl = null;
        },
    });

}());
