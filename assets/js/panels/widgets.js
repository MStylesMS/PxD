/**
 * panels/widgets.js — Prop & Puzzle Widget Panel
 *
 * Responsibilities:
 *  - Read widget list from PxD.config.widgets (declared in room.json)
 *  - For each entry: create card chrome, load optional widget.css, load widget.js
 *  - Expose window.PxD.widgets.register() for widget IIFEs
 *  - Manage per-card heartbeat (data-widget-state: "ok" / "disconnected")
 *  - Provide ⋯ menu: Enable / Disable (publish command) / Hide (remove card)
 *  - Show panel slot only when ≥1 widget loads; hide slot on zero widgets
 *
 * Widget JS files are loaded sequentially to ensure PxD.widgets.register()
 * is called in a deterministic order and the _pending context is never ambiguous.
 *
 * Widget list source: PxD.config.widgets — array of { id, name?, target? }
 * Widget files path:  widgets/<id>/widget.js  (relative to the packaged page)
 * Widget CSS path:    widgets/<id>/widget.css (loaded before widget.js)
 */
(function () {
    'use strict';

    // ── Panel-local state ──────────────────────────────────────────────────
    var _panelSlotEl = null;   // data-slot="widgets" element
    var _gridEl      = null;   // .widgets-grid inside the panel
    var _widgetList  = [];     // full declared list from room.json
    var _hiddenIds   = {};     // id → true when widget card is visually hidden

    // Per-widget registry entry:
    //   { def, cardEl, bodyEl, popoverEl, commandTopic, heartbeatTimeoutMs,
    //     lastMsgAt, hbTimer, enableBtn, disableBtn }
    var _registry = {};

    // Set before each widget script loads; cleared inside register()
    var _pending = null;

    // Visibility overlay element (built once, reused)
    var _visOverlay = null;

    // ── Expose PxD.widgets ─────────────────────────────────────────────────
    // Must be available before any widget script executes.
    window.PxD = window.PxD || {};

    window.PxD.widgets = {
        /**
         * Called by a widget IIFE immediately when its script runs.
         *
         * @param {object} def
         * @param {string}   def.size                Tile size ('1x1', '2x1', etc.)
         * @param {boolean}  def.interactive          True = card is a click target
         * @param {string}   [def.commandTopic]       Topic for enable/disable commands
         * @param {number}   [def.heartbeatTimeoutMs] ms with no message → disconnected
         * @param {Function} def.mount                fn(bodyEl) — inject HTML, subscribe MQTT
         * @param {Function} [def.unmount]            fn() — cleanup
         */
        register: function (def) {
            if (!_pending) {
                console.warn('[PxD/widgets] register() called outside loader — ignored');
                return;
            }
            var ctx  = _pending;
            _pending = null;

            var size              = def.size || '1x1';
            var commandTopic      = def.commandTopic || null;
            var heartbeatMs       = (typeof def.heartbeatTimeoutMs === 'number')
                                        ? def.heartbeatTimeoutMs
                                        : 30000;

            ctx.cardEl.setAttribute('data-size', size);
            if (def.interactive) ctx.cardEl.classList.add('widget-interactive');

            // Update menu button states now that we know commandTopic
            if (!commandTopic) {
                if (ctx.enableBtn)  ctx.enableBtn.disabled  = true;
                if (ctx.disableBtn) ctx.disableBtn.disabled = true;
            }

            // Store registry entry
            _registry[ctx.id] = {
                def:               def,
                cardEl:            ctx.cardEl,
                bodyEl:            ctx.bodyEl,
                popoverEl:         ctx.popoverEl,
                commandTopic:      commandTopic,
                heartbeatTimeoutMs: heartbeatMs,
                lastMsgAt:         Date.now(),   // start fresh — no immediate disconnect
                hbTimer:           null,
                enableBtn:         ctx.enableBtn,
                disableBtn:        ctx.disableBtn
            };

            // Wrap PxD.mqtt.subscribe during mount() to intercept all
            // subscriptions made by this widget and timestamp each message
            // arrival for heartbeat tracking.
            var origSubscribe  = PxD.mqtt.subscribe;
            var origUnsubscribe = PxD.mqtt.unsubscribe;
            var widgetId       = ctx.id;
            var wrappedCallbacks = [];  // keep track so unmount can clean up

            PxD.mqtt.subscribe = function (topic, cb) {
                var wrapped = function (payload, t) {
                    var e = _registry[widgetId];
                    if (e) {
                        e.lastMsgAt = Date.now();
                        if (ctx.cardEl.getAttribute('data-widget-state') !== 'ok') {
                            ctx.cardEl.setAttribute('data-widget-state', 'ok');
                        }
                    }
                    cb(payload, t);
                };
                wrappedCallbacks.push({ topic: topic, wrapped: wrapped, original: cb });
                origSubscribe.call(PxD.mqtt, topic, wrapped);
            };

            try {
                def.mount(ctx.bodyEl);
            } finally {
                // Restore originals immediately after mount() returns
                PxD.mqtt.subscribe   = origSubscribe;
                PxD.mqtt.unsubscribe = origUnsubscribe;
            }

            // Patch unmount to unsubscribe wrapped callbacks correctly
            var origUnmount = def.unmount;
            _registry[widgetId].unmount = function () {
                wrappedCallbacks.forEach(function (item) {
                    // Unsubscribe the wrapped version (not the original)
                    origSubscribe.call(PxD.mqtt, item.topic, item.wrapped);
                    PxD.mqtt.unsubscribe(item.topic, item.wrapped);
                });
                if (origUnmount) {
                    try { origUnmount(); } catch (e) {
                        console.error('[PxD/widgets] unmount error for', widgetId, e);
                    }
                }
            };

            // Widget registered and mounted — panel slot is always visible
            _startHeartbeat(widgetId);
        }
    };

    // ── widgetTypes stub (template factory tier — future phase) ───────────
    window.PxD.widgetTypes = window.PxD.widgetTypes || {
        _types: {},
        register: function (name, factory) { this._types[name] = factory; },
        get:      function (name)          { return this._types[name] || null; }
    };

    // ── Heartbeat ──────────────────────────────────────────────────────────
    function _startHeartbeat(id) {
        var entry = _registry[id];
        if (!entry || entry.heartbeatTimeoutMs <= 0) return;
        entry.hbTimer = setInterval(function () {
            var e = _registry[id];
            if (!e) return;
            if ((Date.now() - e.lastMsgAt) > e.heartbeatTimeoutMs) {
                e.cardEl.setAttribute('data-widget-state', 'disconnected');
            }
        }, 1000);
    }

    // ── Card chrome ────────────────────────────────────────────────────────
    function _createCard(id, name) {
        var card = document.createElement('div');
        card.className = 'widget-card';
        card.setAttribute('data-widget-id', id);
        card.setAttribute('data-widget-state', 'ok');

        // Header
        var header  = document.createElement('div');
        header.className = 'widget-card-header';

        var nameEl  = document.createElement('span');
        nameEl.className   = 'widget-card-name';
        nameEl.textContent = name;

        var menuBtn = document.createElement('button');
        menuBtn.type      = 'button';
        menuBtn.className = 'widget-menu-btn';
        menuBtn.title     = 'Widget options';
        menuBtn.setAttribute('aria-label', 'Widget options');
        menuBtn.textContent = '⋯';

        header.appendChild(nameEl);
        header.appendChild(menuBtn);

        // Body
        var body = document.createElement('div');
        body.className = 'widget-card-body';

        card.appendChild(header);
        card.appendChild(body);

        // Menu popover (Enable / Disable / Hide)
        var popover    = document.createElement('div');
        popover.className = 'widget-menu-popover';
        popover.hidden    = true;

        var enableBtn  = _menuBtn('Enable',  function () { _menuAction(id, 'enable',  popover); });
        var disableBtn = _menuBtn('Disable', function () { _menuAction(id, 'disable', popover); });
        var sep        = document.createElement('div');
        sep.className  = 'widget-menu-sep';
        var hideBtn    = _menuBtn('Hide',    function () { _menuAction(id, 'hide',    popover); });

        popover.appendChild(enableBtn);
        popover.appendChild(disableBtn);
        popover.appendChild(sep);
        popover.appendChild(hideBtn);

        // Portal popover to body so it is never clipped by overflow:hidden on the card
        document.body.appendChild(popover);

        // Toggle popover — reposition on each open using the button's current rect
        menuBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (popover.hidden) {
                var rect = menuBtn.getBoundingClientRect();
                popover.style.top   = (rect.bottom + 4) + 'px';
                popover.style.right = (window.innerWidth - rect.right) + 'px';
                popover.hidden = false;
            } else {
                popover.hidden = true;
            }
        });

        // Dismiss popover on outside click
        document.addEventListener('click', function () { popover.hidden = true; });

        return { card: card, body: body, popover: popover, enableBtn: enableBtn, disableBtn: disableBtn };
    }

    function _menuBtn(label, onClick) {
        var btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'widget-menu-item';
        btn.textContent = label;
        btn.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
        return btn;
    }

    // ── Menu actions ───────────────────────────────────────────────────────
    function _menuAction(id, action, popover) {
        if (popover) popover.hidden = true;
        var entry = _registry[id];
        if (!entry) return;

        if (action === 'hide') {
            // Visually hide — card stays in DOM so gear overlay can restore it
            entry.cardEl.style.display = 'none';
            _hiddenIds[id] = true;
            return;
        }

        if (entry.commandTopic) {
            PxD.mqtt.publish(entry.commandTopic, { command: action });
        }
    }

    // ── Visibility overlay (gear-icon panel) ──────────────────────────────
    /* eslint-disable max-len */
    var _GEAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="18" height="18"><path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 14-7 29.5t-2 31.5q0 16 2 31.5t7 29.5l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"/></svg>';
    /* eslint-enable max-len */

    function _buildVisOverlay() {
        var overlay = document.createElement('div');
        overlay.className = 'widget-vis-overlay';
        overlay.hidden = true;

        var dialog = document.createElement('div');
        dialog.className = 'widget-vis-dialog';

        // Header
        var hdr = document.createElement('div');
        hdr.className = 'widget-vis-header';
        var title = document.createElement('span');
        title.textContent = 'Widget Visibility';
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'widget-vis-close';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', function () { overlay.hidden = true; });
        hdr.appendChild(title);
        hdr.appendChild(closeBtn);

        // Body — populated fresh on every open
        var body = document.createElement('div');
        body.className = 'widget-vis-body';

        // Footer
        var footer = document.createElement('div');
        footer.className = 'widget-vis-footer';
        var applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'btn btn-primary btn-sm';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', function () {
            var checkboxes = body.querySelectorAll('input[type="checkbox"][data-widget-id]');
            checkboxes.forEach(function (cb) {
                var wid   = cb.getAttribute('data-widget-id');
                var entry = _registry[wid];
                if (!entry) return;
                var shouldShow = cb.checked;
                var isHidden   = !!_hiddenIds[wid];
                if (shouldShow && isHidden) {
                    entry.cardEl.style.display = '';
                    delete _hiddenIds[wid];
                } else if (!shouldShow && !isHidden) {
                    entry.cardEl.style.display = 'none';
                    _hiddenIds[wid] = true;
                }
            });
            overlay.hidden = true;
        });
        footer.appendChild(applyBtn);

        dialog.appendChild(hdr);
        dialog.appendChild(body);
        dialog.appendChild(footer);
        overlay.appendChild(dialog);

        // Close on backdrop click
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.hidden = true;
        });

        var portal = document.getElementById('pxd-modals') || document.body;
        portal.appendChild(overlay);
        return overlay;
    }

    function _openVisOverlay() {
        if (!_visOverlay) return;
        var body = _visOverlay.querySelector('.widget-vis-body');
        body.innerHTML = '';

        _widgetList.forEach(function (entry) {
            var isLoaded = !!_registry[entry.id];
            var isHidden = !!_hiddenIds[entry.id];

            var row = document.createElement('label');
            row.className = 'widget-vis-row';

            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked  = isLoaded && !isHidden;
            cb.disabled = !isLoaded;
            cb.setAttribute('data-widget-id', entry.id);

            var nameEl = document.createElement('span');
            nameEl.textContent = entry.name || entry.id;
            if (!isLoaded) {
                nameEl.style.opacity = '0.45';
                nameEl.title = 'Widget failed to load';
            }

            row.appendChild(cb);
            row.appendChild(nameEl);
            body.appendChild(row);
        });

        _visOverlay.hidden = false;
    }

    // ── CSS loader ─────────────────────────────────────────────────────────
    function _loadCSS(href) {
        return new Promise(function (resolve) {
            var attr = 'data-widget-css';
            // Use a simple check — querySelector with attribute equality
            var all = document.querySelectorAll('link[' + attr + ']');
            for (var i = 0; i < all.length; i++) {
                if (all[i].getAttribute(attr) === href) { resolve(); return; }
            }
            var link  = document.createElement('link');
            link.rel  = 'stylesheet';
            link.setAttribute(attr, href);
            link.href = href;
            link.onload  = resolve;
            link.onerror = resolve;   // missing CSS is not fatal
            document.head.appendChild(link);
        });
    }

    // ── Script loader ──────────────────────────────────────────────────────
    function _loadScript(src) {
        return new Promise(function (resolve, reject) {
            var s   = document.createElement('script');
            s.src   = src;
            s.onload  = resolve;
            s.onerror = function () { reject(new Error('Failed to load: ' + src)); };
            document.head.appendChild(s);
        });
    }

    // ── Single widget loader ───────────────────────────────────────────────
    function _loadWidget(entry, baseDir) {
        var id      = entry.id;
        var name    = entry.name   || id;
        var target  = entry.target || null;
        var jsPath  = baseDir + id + '/widget.js';
        var cssPath = baseDir + id + '/widget.css';

        // Determine mount container
        var mountEl = _gridEl;
        if (target) {
            var slotEl = document.querySelector('[data-slot="' + target + '"]');
            if (slotEl) {
                var anchor = slotEl.querySelector('[data-widget-slot]');
                if (anchor) {
                    mountEl = anchor;
                } else {
                    console.warn('[PxD/widgets] Panel "' + target + '" has no ' +
                        '[data-widget-slot]; falling back to main widgets grid');
                }
            } else {
                console.warn('[PxD/widgets] Target slot "' + target + '" not found; ' +
                    'falling back to main widgets grid');
            }
        }

        // Build card chrome and inject into grid
        var chrome = _createCard(id, name);
        mountEl.appendChild(chrome.card);

        // Set pending context before loading the widget script
        _pending = {
            id:         id,
            cardEl:     chrome.card,
            bodyEl:     chrome.body,
            popoverEl:  chrome.popover,
            enableBtn:  chrome.enableBtn,
            disableBtn: chrome.disableBtn
        };

        return _loadCSS(cssPath)
            .then(function () { return _loadScript(jsPath); })
            .catch(function (err) {
                console.error('[PxD/widgets] Failed to load "' + id + '":', err.message);
                _pending = null;
                // Remove the incomplete card
                if (chrome.card.parentNode) {
                    chrome.card.parentNode.removeChild(chrome.card);
                }
            });
    }

    // ── Panel registration ─────────────────────────────────────────────────
    PxD.panels.register('widgets', {

        mount: function (slotEl) {
            _panelSlotEl = slotEl;

            var widgetList = (PxD.config && Array.isArray(PxD.config.widgets))
                ? PxD.config.widgets
                : [];

            _widgetList = widgetList;

            // Build panel HTML immediately — slot is visible as soon as mounted
            slotEl.innerHTML =
                '<div class="panel panel-widgets">' +
                '  <div class="panel-header panel-header-tight panel-header-row">' +
                '    <h2 class="panel-title">Props &amp; Puzzles</h2>' +
                '    <button type="button" class="widget-gear-btn"' +
                '      title="Widget visibility" aria-label="Widget visibility">' +
                _GEAR_SVG +
                '    </button>' +
                '  </div>' +
                '  <div class="widgets-grid"></div>' +
                '</div>';

            _gridEl = slotEl.querySelector('.widgets-grid');
            _visOverlay = _buildVisOverlay();
            slotEl.querySelector('.widget-gear-btn')
                .addEventListener('click', _openVisOverlay);

            if (!widgetList.length) {
                // No widgets declared — collapse slot so it takes no grid space
                slotEl.style.display = 'none';
                return;
            }

            // Load widgets sequentially
            var baseDir = 'widgets/';
            var chain   = Promise.resolve();
            widgetList.forEach(function (entry) {
                chain = chain.then(function () { return _loadWidget(entry, baseDir); });
            });

            chain.then(function () {
                if (Object.keys(_registry).length === 0) {
                    console.warn('[PxD/widgets] All widget loads failed');
                }
            });
        },

        unmount: function () {
            Object.keys(_registry).forEach(function (id) {
                var entry = _registry[id];
                clearInterval(entry.hbTimer);
                if (entry.popoverEl && entry.popoverEl.parentNode) {
                    entry.popoverEl.parentNode.removeChild(entry.popoverEl);
                }
                if (entry.unmount) {
                    try { entry.unmount(); } catch (e) {
                        console.error('[PxD/widgets] unmount error for', id, e);
                    }
                }
            });
            if (_visOverlay && _visOverlay.parentNode) {
                _visOverlay.parentNode.removeChild(_visOverlay);
            }
            _registry    = {};
            _widgetList  = [];
            _hiddenIds   = {};
            _visOverlay  = null;
            _panelSlotEl = null;
            _gridEl      = null;
        }
    });

}());
