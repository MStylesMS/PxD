/**
 * binary-lock — active binary widget
 * Displays a lock icon: locked (default) or unlocked, based on MQTT state.
 * Clicking the tile publishes a lock or unlock command.
 * Default size: 1×1
 *
 * To use:
 *   1. Copy this directory to rooms/<game>/pxd/widgets/<your-id>/
 *   2. Edit only the CONFIG block below.
 *   3. Add the widget to room.json → widgets and run the packager.
 *
 * Icon formats — set ICON_LOCKED / ICON_UNLOCKED to one of:
 *
 *   '<svg>…</svg>'        Inline SVG string (DEFAULT — offline safe, no dependencies)
 *   'icons/locked.png'    File path → <img> tag (PNG, GIF, WebP, APNG, SVG)
 *                           All animated formats (GIF, WebP, APNG) work automatically.
 *   'lock'                Material Symbols ligature name; requires either:
 *                           • Internet access (CDN), or
 *                           • A locally vendored copy of the Material Symbols font.
 *                           See docs/WIDGETS.md § Offline assets for vendoring steps.
 *
 * ICON_LOCKED and ICON_UNLOCKED must be the same format type.
 *
 * IMPORTANT — OFFLINE / KIOSK DEPLOYMENT
 * The default CONFIG below uses inline SVG (the Material Symbols lock /
 * lock_open_right paths, embedded directly). This has zero network dependencies
 * and works on air-gapped Pi kiosks. Do NOT change the defaults to ligature names
 * without vendoring the font first.
 */
(function () {

    // ── CONFIG ─────────────────────────────────────────────────────────────
    const CONFIG = {

        // MQTT state (subscribe) ---------------------------------------------

        /** MQTT topic that carries lock state messages. */
        STATE_TOPIC:          'REPLACE/WITH/YOUR/state',

        /** JSON field in the payload that holds the state value.
         *  Set to null to treat the raw (non-JSON) payload string as the value. */
        STATE_FIELD:          'state',

        /** The value of STATE_FIELD (coerced to string) that means "locked".
         *  Common values: 'locked', 'true', '1', 'HIGH' */
        LOCKED_VALUE:         'locked',

        // MQTT commands (publish) --------------------------------------------

        /** MQTT topic to publish commands to.
         *  Typically the same prop root with /commands suffix, e.g.:
         *  'paradox/room/prop/commands'
         *  Set to null to disable command publishing (passive mode). */
        COMMAND_TOPIC:        'REPLACE/WITH/YOUR/commands',

        /** Command name published when the user clicks to lock.
         *  Sent as: {"command": "<LOCK_COMMAND>"} */
        LOCK_COMMAND:         'lock',

        /** Command name published when the user clicks to unlock. */
        UNLOCK_COMMAND:       'unlock',

        // Display ------------------------------------------------------------

        LOCKED_LABEL:         'LOCKED',
        UNLOCKED_LABEL:       'UNLOCKED',

        /** CSS colour for the locked state (applied to icon + label).
         *  Not used when icons are file paths — the image conveys state instead. */
        LOCKED_COLOR:         '#198754',

        /** CSS colour for the unlocked state. */
        UNLOCKED_COLOR:       '#dc3545',

        // Icons (see header comment for format options) ----------------------
        //
        // Defaults are the Material Symbols lock / lock_open_right paths
        // embedded as inline SVG — offline safe, no font or network required.
        // To switch to ligature mode: set these to 'lock' / 'lock_open_right'
        // AND vendor the Material Symbols font (see docs/WIDGETS.md).

        /* eslint-disable max-len */
        ICON_LOCKED: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 22q-.825 0-1.412-.587T4 20V10q0-.825.588-1.412T6 8h1V6q0-2.075 1.463-3.537T12 1t3.538 1.463T17 6v2h1q.825 0 1.413.588T20 10v10q0 .825-.587 1.413T18 22zm7.413-5.587Q14 15.825 14 15t-.587-1.412T12 13t-1.412.588T10 15t.588 1.413T12 17t1.413-.587M9 8h6V6q0-1.25-.875-2.125T12 3t-2.125.875T9 6z"/></svg>',

        ICON_UNLOCKED: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13.413 16.413Q14 15.825 14 15t-.587-1.412T12 13t-1.412.588T10 15t.588 1.413T12 17t1.413-.587M6 22q-.825 0-1.412-.587T4 20V10q0-.825.588-1.412T6 8h7V6q0-2.075 1.463-3.537T18 1t3.538 1.463T23 6h-2q0-1.25-.875-2.125T18 3t-2.125.875T15 6v2h3q.825 0 1.413.588T20 10v10q0 .825-.587 1.413T18 22z"/></svg>',
        /* eslint-enable max-len */

        // Widget metadata ----------------------------------------------------

        /** Tile size.  See WIDGETS.md § Tile sizing for the full table. */
        SIZE:                 '1x1',

        /** true = full card area is a click target (publishes lock/unlock command).
         *  false = passive display only (no commands published on click). */
        INTERACTIVE:          true,

        /** State shown before the first MQTT message arrives.
         *  'locked' (default — secure assumption) or 'unlocked'. */
        INITIAL_STATE:        'locked',

        /** ms to wait for MQTT confirmation after a click before reverting the
         *  display to the last confirmed state.  Set to 0 to wait indefinitely. */
        PENDING_TIMEOUT_MS:   4000,

        /** Card goes 'disconnected' if no MQTT message arrives within this many ms.
         *  Set to 0 to disable the heartbeat watcher. */
        HEARTBEAT_TIMEOUT_MS: 30000,
    };
    // ── END CONFIG ──────────────────────────────────────────────────────────


    // ── Icon mode detection ─────────────────────────────────────────────────
    // Detected once from ICON_LOCKED; ICON_UNLOCKED must be the same type.
    const ICON_MODE = (function () {
        const ref = CONFIG.ICON_LOCKED;
        if (typeof ref === 'string' && ref.trimStart().startsWith('<')) return 'svg';
        if (/[/.]/.test(ref) || ref.startsWith('data:'))               return 'file';
        return 'ligature';  // Material Symbols or similar icon font
    }());


    // ── Material Symbols font loader (opt-in, ligature mode only) ───────────
    // Only called when ICON_LOCKED / ICON_UNLOCKED are ligature names.
    // NOT called by the default inline-SVG CONFIG.
    //
    // Loads from Google CDN — requires internet access.
    // For offline kiosk deployment: replace MAT_SYM_HREF with a local @font-face
    // stylesheet path, or switch CONFIG icons back to inline SVG / file paths.
    const MAT_SYM_ID   = 'pxd-material-symbols';
    const MAT_SYM_HREF =
        'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined' +
        ':opsz,wght,FILL,GRAD@24,400,1,0&icon_names=lock,lock_open_right';

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
    const _initialLocked = (String(CONFIG.INITIAL_STATE).toLowerCase() !== 'unlocked');

    let _iconEl         = null;
    let _labelEl        = null;
    let _wrapEl         = null;
    let _isLocked       = _initialLocked;  // current displayed state
    let _lastConfirmed  = null;            // last MQTT-confirmed state; null = no msg yet
    let _pending        = false;           // command sent, awaiting MQTT confirmation
    let _pendingTimer   = null;


    // ── Render ───────────────────────────────────────────────────────────────
    function render(isLocked) {
        _isLocked = isLocked;
        if (!_iconEl) return;

        const ref   = isLocked ? CONFIG.ICON_LOCKED    : CONFIG.ICON_UNLOCKED;
        const color = isLocked ? CONFIG.LOCKED_COLOR   : CONFIG.UNLOCKED_COLOR;
        const label = isLocked ? CONFIG.LOCKED_LABEL   : CONFIG.UNLOCKED_LABEL;

        if (ICON_MODE === 'svg') {
            _iconEl.innerHTML   = ref;
            _iconEl.style.color = color;

        } else if (ICON_MODE === 'file') {
            let img = _iconEl.querySelector('img');
            if (!img) {
                img = document.createElement('img');
                img.className = 'wd-lock-img';
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
        let isLocked;
        try {
            const parsed = (typeof payload === 'string') ? JSON.parse(payload) : payload;
            const val    = (CONFIG.STATE_FIELD !== null)
                ? parsed[CONFIG.STATE_FIELD]
                : parsed;
            isLocked = (String(val) === String(CONFIG.LOCKED_VALUE));
        } catch (_) {
            isLocked = (String(payload) === String(CONFIG.LOCKED_VALUE));
        }
        _lastConfirmed = isLocked;
        clearPending();
        render(isLocked);
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
                const revertTo = _lastConfirmed !== null ? _lastConfirmed : _initialLocked;
                clearPending();
                render(revertTo);
            }, CONFIG.PENDING_TIMEOUT_MS);
        }
    }


    // ── Command publishing ────────────────────────────────────────────────────
    function onClickHandler() {
        if (!CONFIG.COMMAND_TOPIC) return;
        if (_pending) return;  // ignore clicks while awaiting confirmation
        const cmd = _isLocked ? CONFIG.UNLOCK_COMMAND : CONFIG.LOCK_COMMAND;
        enterPending();
        PxD.mqtt.publish(CONFIG.COMMAND_TOPIC, JSON.stringify({ command: cmd }));
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
                '<div class="wd-lock-wrap' +
                    (CONFIG.INTERACTIVE ? ' wd-interactive' : '') + '">' +
                '  <div class="wd-lock-icon"></div>' +
                '  <div class="wd-lock-label"></div>' +
                '</div>';

            _wrapEl  = bodyEl.querySelector('.wd-lock-wrap');
            _iconEl  = bodyEl.querySelector('.wd-lock-icon');
            _labelEl = bodyEl.querySelector('.wd-lock-label');

            render(_initialLocked);  // show initial state until first MQTT message

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
