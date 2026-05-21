/**
 * _starter — minimal custom widget scaffold
 *
 * Copy this file, rename the directory, and implement the widget.
 *
 * Edit steps (in order):
 *   1. Set STATE_TOPIC (and COMMAND_TOPIC if interactive).
 *   2. Adjust CONFIG values for your use case.
 *   3. Implement the render() function to reflect your state.
 *   4. Implement the onMessage() parser to extract your state value.
 *   5. Wire up mount() — inject HTML into bodyEl, subscribe to STATE_TOPIC.
 *   6. Wire up unmount() — unsubscribe and release DOM references.
 *   7. Add to room.json → widgets and run the packager.
 *
 * See docs/WIDGETS.md for the full widget authoring contract.
 */
(function () {

    // ── CONFIG ─────────────────────────────────────────────────────────────
    //
    // Place all widget settings here.  The loader merges any matching keys
    // from the instance's config.json over these defaults before mount().
    //
    const CONFIG = {

        // MQTT ---------------------------------------------------------------

        /** Required: topic to subscribe for state messages. */
        STATE_TOPIC:          'REPLACE/WITH/YOUR/state',

        /** Set to your command topic if the widget is interactive.
         *  null = passive (display-only). */
        COMMAND_TOPIC:        null,

        // Display (add your own keys here) -----------------------------------

        LABEL:                'MY WIDGET',

        // Widget metadata ----------------------------------------------------

        /** Tile size: '1x1', '2x1', '2x2', '4x1', or '4x2'. */
        SIZE:                 '2x1',

        /** false = passive display; true = full card area is a click target. */
        INTERACTIVE:          false,

        /** Heartbeat watchdog — card goes 'disconnected' after this many ms
         *  with no incoming message.  0 = disabled. */
        HEARTBEAT_TIMEOUT_MS: 30000,
    };
    // ── END CONFIG ──────────────────────────────────────────────────────────


    // ── Internal DOM references ───────────────────────────────────────────────
    let _rootEl = null;


    // ── Render ───────────────────────────────────────────────────────────────
    /** Update the DOM to reflect a new state value. */
    function render(value) {
        if (!_rootEl) return;
        // TODO: implement your render logic here.
        _rootEl.querySelector('.starter-value').textContent = String(value);
    }


    // ── MQTT message handler ─────────────────────────────────────────────────
    function onMessage(payload) {
        let value;
        try {
            const parsed = (typeof payload === 'string') ? JSON.parse(payload) : payload;
            // TODO: extract your state value from the parsed payload.
            value = parsed.state || parsed.value || payload;
        } catch (_) {
            value = payload;
        }
        render(value);
    }


    // ── Registration ─────────────────────────────────────────────────────────
    PxD.widgets.register({
        size:                CONFIG.SIZE,
        interactive:         CONFIG.INTERACTIVE,
        commandTopic:        CONFIG.COMMAND_TOPIC,
        heartbeatTimeoutMs:  CONFIG.HEARTBEAT_TIMEOUT_MS,

        mount(bodyEl) {
            // Inject your HTML into bodyEl.  This is the card's content area.
            bodyEl.innerHTML =
                '<div class="starter-wrap">' +
                '  <div class="starter-label">' + _escapeHtml(CONFIG.LABEL) + '</div>' +
                '  <div class="starter-value">—</div>' +
                '</div>';

            _rootEl = bodyEl.querySelector('.starter-wrap');

            // Subscribe to the state topic.
            PxD.mqtt.subscribe(CONFIG.STATE_TOPIC, onMessage);

            // If interactive, add a click handler:
            // if (CONFIG.INTERACTIVE && CONFIG.COMMAND_TOPIC) {
            //     _rootEl.addEventListener('click', onClickHandler);
            // }
        },

        unmount() {
            // Unsubscribe from MQTT.
            PxD.mqtt.unsubscribe(CONFIG.STATE_TOPIC, onMessage);

            // Remove event listeners and release DOM references.
            // _rootEl.removeEventListener('click', onClickHandler);
            _rootEl = null;
        },
    });


    // ── Util ─────────────────────────────────────────────────────────────────
    function _escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

}());
