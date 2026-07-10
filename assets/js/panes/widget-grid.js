/**
 * panes/widget-grid.js — Prop & Puzzle Widget Grid pane (v2, multi-instance)
 *
 * A page may contain MULTIPLE widget-grid panes, each with its own set of
 * widgets. Config:
 *   { "title": "Props & Puzzles",              // optional, defaults below
 *     "widgets": [ { "id": "front-door", "name": "Front Door", "shown": true },
 *                  { "id": "bomb-timer", "shown": false } ] }
 *
 * Widgets NOT listed, or listed with "shown": false (or omitted), start
 * hidden. Every configured widget is still loaded (so the gear menu can
 * reveal it instantly without a reload) — the gear menu exposes ALL widgets
 * declared for this instance, regardless of default visibility.
 *
 * Widget JS files are simple IIFEs that call window.PxD.widgets.register()
 * when their <script> executes. Because that API is necessarily global (a
 * widget script has no way to know which pane instance triggered its load),
 * all widget loads across every widget-grid instance on the page are
 * serialized through one shared queue below — this prevents two instances'
 * concurrent loads from corrupting each other's registration handoff.
 *
 * Widget list path: widgets/<id>/widget.js (+ optional widget.css), relative
 * to the packaged page — unchanged from v1.
 */
(function () {
    'use strict';

    // ── Shared across every widget-grid instance on the page ───────────────
    var _loadQueue = Promise.resolve();
    var _pending = null; // set immediately before a widget script executes

    window.PxD.widgets = {
        /**
         * Called by a widget IIFE immediately when its script runs.
         * @param {object} def
         */
        register: function (def) {
            if (!_pending) {
                console.warn('[widget-grid] register() called outside loader — ignored');
                return;
            }
            var ctx = _pending;
            _pending = null;

            var size = def.size || '1x1';
            var commandTopic = def.commandTopic || null;
            var heartbeatMs = (typeof def.heartbeatTimeoutMs === 'number') ? def.heartbeatTimeoutMs : 30000;

            ctx.cardEl.setAttribute('data-size', size);
            if (def.interactive) ctx.cardEl.classList.add('widget-interactive');

            if (!commandTopic) {
                if (ctx.enableBtn) ctx.enableBtn.disabled = true;
                if (ctx.disableBtn) ctx.disableBtn.disabled = true;
            }

            ctx.registry[ctx.id] = {
                def: def, cardEl: ctx.cardEl, bodyEl: ctx.bodyEl, popoverEl: ctx.popoverEl,
                commandTopic: commandTopic, heartbeatTimeoutMs: heartbeatMs,
                lastMsgAt: Date.now(), hbTimer: null,
                enableBtn: ctx.enableBtn, disableBtn: ctx.disableBtn
            };

            var origSubscribe = PxD.mqtt.subscribe;
            var origUnsubscribe = PxD.mqtt.unsubscribe;
            var widgetId = ctx.id;
            var registry = ctx.registry;
            var wrappedCallbacks = [];

            PxD.mqtt.subscribe = function (topic, cb) {
                var wrapped = function (payload, t) {
                    var e = registry[widgetId];
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

            try { def.mount(ctx.bodyEl); }
            finally { PxD.mqtt.subscribe = origSubscribe; PxD.mqtt.unsubscribe = origUnsubscribe; }

            var origUnmount = def.unmount;
            registry[widgetId].unmount = function () {
                wrappedCallbacks.forEach(function (item) {
                    origSubscribe.call(PxD.mqtt, item.topic, item.wrapped);
                    PxD.mqtt.unsubscribe(item.topic, item.wrapped);
                });
                if (origUnmount) {
                    try { origUnmount(); } catch (e) { console.error('[widget-grid] unmount error for', widgetId, e); }
                }
            };

            ctx.onRegistered(widgetId);
        }
    };

    window.PxD.widgetTypes = window.PxD.widgetTypes || {
        _types: {},
        register: function (name, factory) { this._types[name] = factory; },
        get: function (name) { return this._types[name] || null; }
    };

    /* eslint-disable max-len */
    var GEAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="18" height="18"><path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 14-7 29.5t-2 31.5q0 16 2 31.5t7 29.5l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"/></svg>';
    /* eslint-enable max-len */

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function factory(config, ctx) {
        var _registry = {};
        var _hiddenIds = {};
        var _gridEl = null;
        var _visOverlay = null;
        var _widgetList = Array.isArray(config.widgets) ? config.widgets : [];

        function createCard(id, name) {
            var card = document.createElement('div');
            card.className = 'widget-card';
            card.setAttribute('data-widget-id', id);
            card.setAttribute('data-widget-state', 'ok');

            var header = document.createElement('div');
            header.className = 'widget-card-header';
            var nameEl = document.createElement('span');
            nameEl.className = 'widget-card-name';
            nameEl.textContent = name;
            var menuBtn = document.createElement('button');
            menuBtn.type = 'button';
            menuBtn.className = 'widget-menu-btn';
            menuBtn.title = 'Widget options';
            menuBtn.setAttribute('aria-label', 'Widget options');
            menuBtn.textContent = '\u22EF';
            header.appendChild(nameEl);
            header.appendChild(menuBtn);

            var body = document.createElement('div');
            body.className = 'widget-card-body';

            card.appendChild(header);
            card.appendChild(body);

            var popover = document.createElement('div');
            popover.className = 'widget-menu-popover';
            popover.hidden = true;

            function menuItem(label, onClick) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'widget-menu-item';
                btn.textContent = label;
                btn.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
                return btn;
            }

            var enableBtn = menuItem('Enable', function () { menuAction(id, 'enable', popover); });
            var disableBtn = menuItem('Disable', function () { menuAction(id, 'disable', popover); });
            var sep = document.createElement('div');
            sep.className = 'widget-menu-sep';
            var hideBtn = menuItem('Hide', function () { menuAction(id, 'hide', popover); });

            popover.appendChild(enableBtn);
            popover.appendChild(disableBtn);
            popover.appendChild(sep);
            popover.appendChild(hideBtn);
            document.body.appendChild(popover);

            menuBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (popover.hidden) {
                    var rect = menuBtn.getBoundingClientRect();
                    popover.style.top = (rect.bottom + 4) + 'px';
                    popover.style.right = (window.innerWidth - rect.right) + 'px';
                    popover.hidden = false;
                } else { popover.hidden = true; }
            });
            document.addEventListener('click', function () { popover.hidden = true; });

            return { card: card, body: body, popover: popover, enableBtn: enableBtn, disableBtn: disableBtn };
        }

        function menuAction(id, action, popover) {
            if (popover) popover.hidden = true;
            var entry = _registry[id];
            if (!entry) return;
            if (action === 'hide') {
                entry.cardEl.style.display = 'none';
                _hiddenIds[id] = true;
                return;
            }
            if (entry.commandTopic) ctx.mqtt.publish(entry.commandTopic, { command: action });
        }

        function setVisible(id, visible) {
            var entry = _registry[id];
            if (!entry) return;
            if (visible) { entry.cardEl.style.display = ''; delete _hiddenIds[id]; }
            else { entry.cardEl.style.display = 'none'; _hiddenIds[id] = true; }
        }

        function buildVisOverlay() {
            var overlay = document.createElement('div');
            overlay.className = 'widget-vis-overlay';
            overlay.hidden = true;

            var dialog = document.createElement('div');
            dialog.className = 'widget-vis-dialog';

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

            var body = document.createElement('div');
            body.className = 'widget-vis-body';

            var footer = document.createElement('div');
            footer.className = 'widget-vis-footer';
            var applyBtn = document.createElement('button');
            applyBtn.type = 'button';
            applyBtn.className = 'btn btn-primary btn-sm';
            applyBtn.textContent = 'Apply';
            applyBtn.addEventListener('click', function () {
                body.querySelectorAll('input[type="checkbox"][data-widget-id]').forEach(function (cb) {
                    setVisible(cb.getAttribute('data-widget-id'), cb.checked);
                });
                overlay.hidden = true;
            });
            footer.appendChild(applyBtn);

            dialog.appendChild(hdr);
            dialog.appendChild(body);
            dialog.appendChild(footer);
            overlay.appendChild(dialog);
            overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.hidden = true; });

            var portal = document.getElementById('pxd-modals') || document.body;
            portal.appendChild(overlay);
            return overlay;
        }

        function openVisOverlay() {
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
                cb.checked = isLoaded && !isHidden;
                cb.disabled = !isLoaded;
                cb.setAttribute('data-widget-id', entry.id);

                var nameEl = document.createElement('span');
                nameEl.textContent = entry.name || entry.id;
                if (!isLoaded) { nameEl.style.opacity = '0.45'; nameEl.title = 'Widget failed to load'; }

                row.appendChild(cb);
                row.appendChild(nameEl);
                body.appendChild(row);
            });
            _visOverlay.hidden = false;
        }

        function startHeartbeat(id) {
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

        function loadCSS(href) {
            return new Promise(function (resolve) {
                var attr = 'data-widget-css';
                var all = document.querySelectorAll('link[' + attr + ']');
                for (var i = 0; i < all.length; i++) {
                    if (all[i].getAttribute(attr) === href) { resolve(); return; }
                }
                var link = document.createElement('link');
                link.rel = 'stylesheet';
                link.setAttribute(attr, href);
                link.href = href;
                link.onload = resolve;
                link.onerror = resolve;
                document.head.appendChild(link);
            });
        }

        function loadScript(src) {
            return new Promise(function (resolve, reject) {
                var s = document.createElement('script');
                s.src = src;
                s.onload = resolve;
                s.onerror = function () { reject(new Error('Failed to load: ' + src)); };
                document.head.appendChild(s);
            });
        }

        function loadWidget(entry, baseDir) {
            var id = entry.id;
            var name = entry.name || id;
            var jsPath = baseDir + id + '/widget.js';
            var cssPath = baseDir + id + '/widget.css';

            var chrome = createCard(id, name);
            _gridEl.appendChild(chrome.card);

            // Enqueue onto the shared cross-instance queue so widget script
            // execution never overlaps with another instance's pending load.
            _loadQueue = _loadQueue.then(function () {
                _pending = {
                    id: id, cardEl: chrome.card, bodyEl: chrome.body, popoverEl: chrome.popover,
                    enableBtn: chrome.enableBtn, disableBtn: chrome.disableBtn,
                    registry: _registry,
                    onRegistered: function (widgetId) {
                        startHeartbeat(widgetId);
                        if (entry.shown !== true) setVisible(widgetId, false);
                    }
                };
                return loadCSS(cssPath).then(function () { return loadScript(jsPath); })
                    .catch(function (err) {
                        console.error('[widget-grid] Failed to load "' + id + '":', err.message);
                        _pending = null;
                        if (chrome.card.parentNode) chrome.card.parentNode.removeChild(chrome.card);
                    });
            });
        }

        return {
            mount: function (el) {
                var title = config.title || 'Props & Puzzles';
                el.innerHTML =
                    '<div class="panel panel-widgets">' +
                    '  <div class="panel-header panel-header-tight panel-header-row">' +
                    '    <h2 class="panel-title">' + esc(title) + '</h2>' +
                    '    <button type="button" class="widget-gear-btn" title="Widget visibility" aria-label="Widget visibility">' +
                    GEAR_SVG +
                    '    </button>' +
                    '  </div>' +
                    '  <div class="widgets-grid"></div>' +
                    '</div>';

                _gridEl = el.querySelector('.widgets-grid');
                _visOverlay = buildVisOverlay();
                el.querySelector('.widget-gear-btn').addEventListener('click', openVisOverlay);

                if (!_widgetList.length) { el.style.display = 'none'; return; }

                var baseDir = 'widgets/';
                _widgetList.forEach(function (entry) { loadWidget(entry, baseDir); });
            },
            unmount: function () {
                Object.keys(_registry).forEach(function (id) {
                    var e = _registry[id];
                    if (e.hbTimer) clearInterval(e.hbTimer);
                    if (e.unmount) { try { e.unmount(); } catch (err) { /* ignore */ } }
                });
                _registry = {};
                if (_visOverlay && _visOverlay.parentNode) _visOverlay.parentNode.removeChild(_visOverlay);
            }
        };
    }

    PxD.panes.registerType('widget-grid', factory);
})();
