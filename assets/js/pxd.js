/**
 * pxd.js — PxD Framework Core Runtime (v2: sites / pages / panes)
 *
 * Responsibilities:
 *  1. Fetch room.json and expose it as window.PxD.config
 *  2. Apply the (build-time-resolved) theme tokens, fonts, title, favicon
 *  3. Identify THIS page's site + page (baked into the HTML by the packager as
 *     window.PXD_PAGE = { site: "<siteId>", page: "<pageId>" }, or read from
 *     <body data-pxd-site data-pxd-page>)
 *  4. Dynamically load the pane-type scripts this page needs
 *  5. Render the page: optional sticky header/footer + an ordered, responsive
 *     grid of panes, grouped into collapsible sections by `divider` entries
 *  6. Connect MQTT (Paho) once and share it across every pane on the page
 *  7. Expose window.PxD.mqtt / window.PxD.panes / window.PxD.utils
 *
 * Pane authoring contract (see docs/PANES.md):
 *   PxD.panes.registerType('<type>', function factory(config, ctx) {
 *       return { mount: function (el) {...}, unmount: function () {...} };
 *   });
 *   - `config` is the pane entry's `config` object from room.json.
 *   - `ctx` provides shared services: { mqtt, config, site, page, utils }.
 *   - Each config entry yields one independent instance (own DOM, own state).
 */
(function () {
    'use strict';

    // ── Internal state ─────────────────────────────────────────────────────
    var _config = null;
    var _client = null;
    var _subs = {};                 // topic-pattern → [callbacks]
    var _paneTypes = {};            // type → factory(config, ctx)
    var _instances = [];            // live pane instances (for teardown)
    var _site = null;               // resolved current site object
    var _page = null;               // resolved current page object
    var _reconnectTimer = null;
    var _reconnectDelayMs = 2000;

    // ── Global PxD namespace ───────────────────────────────────────────────
    window.PxD = {
        config: null,

        // ── MQTT API ───────────────────────────────────────────────────────
        mqtt: {
            publish: function (topic, payload, qos, retained) {
                if (!_client || !_client.isConnected()) {
                    console.warn('[PxD] publish called while disconnected — dropped');
                    return;
                }
                var msg = new Paho.MQTT.Message(JSON.stringify(payload));
                msg.destinationName = topic;
                msg.qos = (qos === 1 || qos === 2) ? qos : 0;
                msg.retained = !!retained;
                _client.send(msg);
            },
            subscribe: function (topic, callback) {
                if (!_subs[topic]) {
                    _subs[topic] = [];
                    if (_client && _client.isConnected()) {
                        _client.subscribe(topic, { qos: 0 });
                    }
                }
                _subs[topic].push(callback);
            },
            unsubscribe: function (topic, callback) {
                var cbs = _subs[topic];
                if (!cbs) return;
                var idx = cbs.indexOf(callback);
                if (idx >= 0) cbs.splice(idx, 1);
            }
        },

        // ── Pane registry API ──────────────────────────────────────────────
        panes: {
            /**
             * Register a pane type. Called by each pane script in
             * assets/js/panes/<type>.js.
             * @param {string} type
             * @param {function(object, object): {mount: Function, unmount: Function}} factory
             */
            registerType: function (type, factory) {
                _paneTypes[type] = factory;
            },
            /** @returns {boolean} whether a type has been registered */
            hasType: function (type) { return !!_paneTypes[type]; }
        },

        // ── Utility helpers (shared across panes) ──────────────────────────
        utils: {
            showToast: function (message, opts) {
                opts = opts || {};
                var container = document.getElementById('pxd-toast-container');
                if (!container) { alert(message); return; }

                var useAnchor = (typeof opts.x === 'number' && typeof opts.y === 'number') || opts.anchorEl;
                if (useAnchor) {
                    var anchorX, anchorY;
                    if (typeof opts.x === 'number') { anchorX = opts.x; anchorY = opts.y; }
                    else if (opts.anchorEl && opts.anchorEl.getBoundingClientRect) {
                        var r = opts.anchorEl.getBoundingClientRect();
                        anchorX = r.left + r.width / 2;
                        anchorY = r.top + r.height;
                    }
                    if (typeof anchorX === 'number') {
                        var margin = 12;
                        anchorX = Math.max(margin, Math.min(window.innerWidth - margin, anchorX));
                        anchorY = Math.max(margin, Math.min(window.innerHeight - margin, anchorY));
                        container.style.cssText = 'position:fixed;z-index:1080;pointer-events:none;' +
                            'left:' + anchorX + 'px;top:' + (anchorY + 10) + 'px;' +
                            'right:auto;bottom:auto;transform:translate(-50%,0);max-width:min(92vw,420px);';
                    }
                } else {
                    container.style.cssText = 'position:fixed;z-index:1080;pointer-events:none;' +
                        'bottom:16px;right:16px;left:auto;top:auto;transform:none;';
                }

                var toast = document.createElement('div');
                toast.className = 'toast align-items-center text-bg-dark border-0';
                toast.setAttribute('role', 'alert');
                toast.setAttribute('aria-atomic', 'true');
                toast.style.pointerEvents = 'auto';
                toast.style.marginTop = '8px';
                toast.innerHTML = '<div class="d-flex">' +
                    '<div class="toast-body">' + message + '</div>' +
                    '<button type="button" class="btn-close btn-close-white me-2 m-auto" ' +
                    'data-bs-dismiss="toast" aria-label="Close"></button></div>';
                container.appendChild(toast);

                try {
                    var bsToast = new bootstrap.Toast(toast, { delay: 3000, animation: true });
                    bsToast.show();
                    toast.addEventListener('hidden.bs.toast', function () {
                        if (toast.parentNode) toast.parentNode.removeChild(toast);
                    });
                } catch (e) {
                    setTimeout(function () {
                        if (toast.parentNode) toast.parentNode.removeChild(toast);
                    }, 3000);
                }
            },

            getContrastColor: function (hexColor) {
                if (!hexColor || hexColor.length < 7) return '#FFFFFF';
                var r = parseInt(hexColor.substr(1, 2), 16);
                var g = parseInt(hexColor.substr(3, 2), 16);
                var b = parseInt(hexColor.substr(5, 2), 16);
                return ((r * 299 + g * 587 + b * 114) / 1000 > 128) ? '#000000' : '#FFFFFF';
            }
        }
    };

    // ── MQTT wildcard topic matcher ────────────────────────────────────────
    function topicMatches(pattern, topic) {
        if (pattern === topic) return true;
        var pp = pattern.split('/');
        var tp = topic.split('/');
        for (var i = 0; i < pp.length; i++) {
            if (pp[i] === '#') return true;
            if (i >= tp.length) return false;
            if (pp[i] !== '+' && pp[i] !== tp[i]) return false;
        }
        return pp.length === tp.length;
    }

    function dispatchMessage(topic, payload) {
        Object.keys(_subs).forEach(function (pattern) {
            if (!topicMatches(pattern, topic)) return;
            _subs[pattern].forEach(function (cb) {
                try { cb(payload, topic); } catch (e) {
                    console.error('[PxD] subscriber error on', topic, e);
                }
            });
        });
    }

    // ── MQTT connection ────────────────────────────────────────────────────
    function connectMqtt() {
        var mqttCfg = _config.mqtt || {};
        var broker = (mqttCfg.broker === 'auto' || !mqttCfg.broker)
            ? (window.location.hostname || 'localhost')
            : mqttCfg.broker;
        var port = (mqttCfg.port === 'auto' || !mqttCfg.port)
            ? (window.location.port
                ? parseInt(window.location.port, 10)
                : (window.location.protocol === 'https:' ? 443 : 80))
            : parseInt(mqttCfg.port, 10);
        var wsPath = mqttCfg.wsPath || '/mqtt';
        var prefix = mqttCfg.clientIdPrefix || 'pxd_ui_';
        var clientId = prefix + Math.floor(Math.random() * 100000);

        _client = new Paho.MQTT.Client(broker, port, wsPath, clientId);

        _client.onConnectionLost = function (resp) {
            console.warn('[PxD] MQTT connection lost:', resp.errorMessage);
            clearTimeout(_reconnectTimer);
            _reconnectTimer = setTimeout(connectMqtt, _reconnectDelayMs);
        };

        _client.onMessageArrived = function (message) {
            try {
                var payload = JSON.parse(message.payloadString);
                dispatchMessage(message.destinationName, payload);
            } catch (e) {
                console.warn('[PxD] Unparseable MQTT message on', message.destinationName);
            }
        };

        _client.connect({
            timeout: 3,
            useSSL: window.location.protocol === 'https:',
            onSuccess: function () {
                console.log('[PxD] MQTT connected to', broker + ':' + port);
                clearTimeout(_reconnectTimer);
                Object.keys(_subs).forEach(function (topic) {
                    _client.subscribe(topic, { qos: 0 });
                });
            },
            onFailure: function (err) {
                console.warn('[PxD] MQTT connection failed:', err.errorMessage);
                clearTimeout(_reconnectTimer);
                _reconnectTimer = setTimeout(connectMqtt, _reconnectDelayMs);
            }
        });
    }

    // ── Pane-type script loading ───────────────────────────────────────────
    function loadPaneScript(type) {
        return new Promise(function (resolve) {
            if (_paneTypes[type]) { resolve(); return; } // already loaded
            var s = document.createElement('script');
            s.src = 'assets/js/panes/' + type + '.js';
            s.onload = resolve;
            s.onerror = function () {
                console.error('[PxD] Failed to load pane script:', type);
                resolve(); // don't block the page; unknown-type placeholder renders instead
            };
            document.head.appendChild(s);
        });
    }

    function uniquePaneTypes(site, page) {
        var set = {};
        // `divider` is handled entirely in-core (no pane script), so exclude it.
        function collect(paneCfg) {
            if (paneCfg && paneCfg.type && paneCfg.type !== 'divider') set[paneCfg.type] = true;
        }
        (page.panes || []).forEach(collect);
        if (site.header) collect(site.header);
        if (site.footer) collect(site.footer);
        return Object.keys(set);
    }

    // ── Pane instantiation ─────────────────────────────────────────────────
    function paneContext() {
        return { mqtt: PxD.mqtt, config: _config, site: _site, page: _page, utils: PxD.utils };
    }

    function instantiatePane(el, paneCfg) {
        var factory = _paneTypes[paneCfg.type];
        if (!factory) {
            el.innerHTML = '<section class="panel pxd-pane-error">Unknown pane type: "' +
                String(paneCfg.type).replace(/[<>&"]/g, '') + '"</section>';
            return null;
        }
        var inst;
        try {
            inst = factory(paneCfg.config || {}, paneContext());
            inst.mount(el);
        } catch (e) {
            console.error('[PxD] Pane mount error:', paneCfg.type, e);
            el.innerHTML = '<section class="panel pxd-pane-error">Pane error: ' + paneCfg.type + '</section>';
            return null;
        }
        _instances.push(inst);
        return inst;
    }

    // ── Section (divider) rendering ────────────────────────────────────────
    // A `divider` starts a section: a titled bar with an optional collapse
    // toggle, followed by a flex-wrap row that holds every pane up to the next
    // divider/footer. Collapsing unmounts the section's pane instances (freeing
    // camera streams / MQTT subs); expanding rebuilds them. Session-only state.
    function buildSection(gridEl, dividerCfg) {
        var align = ['left', 'center', 'right'].indexOf(dividerCfg.align) !== -1 ? dividerCfg.align : 'left';
        var collapsible = dividerCfg.collapsible !== false;

        var header = document.createElement('div');
        header.className = 'pxd-divider pxd-divider-' + align + (collapsible ? ' pxd-divider-collapsible' : '');

        var titleWrap = document.createElement('div');
        titleWrap.className = 'pxd-divider-title';
        if (collapsible) {
            var caret = document.createElement('span');
            caret.className = 'pxd-divider-caret';
            caret.setAttribute('aria-hidden', 'true');
            titleWrap.appendChild(caret);
        }
        var titleText = document.createElement('span');
        titleText.textContent = dividerCfg.title || '';
        titleWrap.appendChild(titleText);
        header.appendChild(titleWrap);

        var body = document.createElement('div');
        body.className = 'pxd-row pxd-section-body';

        gridEl.appendChild(header);
        gridEl.appendChild(body);

        var section = {
            bodyEl: body,
            panes: [],          // pane configs assigned to this section
            instances: [],      // live instances when expanded
            collapsed: !!dividerCfg.collapsed
        };

        function mountSectionPanes() {
            section.instances = [];
            section.panes.forEach(function (paneCfg) {
                var paneEl = document.createElement('div');
                paneEl.className = 'pxd-pane pxd-w-' + (paneCfg.width || 'full');
                body.appendChild(paneEl);
                var inst = instantiatePane(paneEl, paneCfg);
                if (inst) section.instances.push(inst);
            });
        }
        function unmountSectionPanes() {
            section.instances.forEach(function (inst) {
                try { if (inst.unmount) inst.unmount(); } catch (e) { /* ignore */ }
                var i = _instances.indexOf(inst);
                if (i >= 0) _instances.splice(i, 1);
            });
            section.instances = [];
            body.innerHTML = '';
        }
        function applyCollapsed() {
            header.classList.toggle('pxd-collapsed', section.collapsed);
            if (section.collapsed) { unmountSectionPanes(); body.style.display = 'none'; }
            else { body.style.display = ''; if (!section.instances.length) mountSectionPanes(); }
        }

        if (collapsible) {
            header.addEventListener('click', function () {
                section.collapsed = !section.collapsed;
                applyCollapsed();
            });
        }

        // `render` runs after all panes are assigned (see renderPage).
        section.render = function () {
            if (section.collapsed) { applyCollapsed(); }
            else { mountSectionPanes(); }
        };
        return section;
    }

    // ── Page rendering ─────────────────────────────────────────────────────
    function renderPage(container, page) {
        var grid = document.createElement('div');
        grid.className = 'pxd-page-grid';

        // Panes before the first divider live in an initial default row.
        var defaultRow = document.createElement('div');
        defaultRow.className = 'pxd-row';
        grid.appendChild(defaultRow);

        var currentSection = null;
        var deferredSections = [];

        (page.panes || []).forEach(function (paneCfg) {
            if (paneCfg.type === 'divider') {
                currentSection = buildSection(grid, paneCfg);
                deferredSections.push(currentSection);
                return;
            }
            if (currentSection) {
                currentSection.panes.push(paneCfg); // mounted when the section renders
            } else {
                var paneEl = document.createElement('div');
                paneEl.className = 'pxd-pane pxd-w-' + (paneCfg.width || 'full');
                defaultRow.appendChild(paneEl);
                instantiatePane(paneEl, paneCfg);
            }
        });

        container.appendChild(grid);
        // Render sections after DOM attach (some panes measure layout on mount).
        deferredSections.forEach(function (s) { s.render(); });
    }

    // ── Sticky header / footer ─────────────────────────────────────────────
    function renderStickyRegion(hostEl, paneCfg) {
        if (!paneCfg) return;
        var inner = document.createElement('div');
        inner.className = 'pxd-pane pxd-w-full';
        hostEl.appendChild(inner);
        hostEl.hidden = false;
        instantiatePane(inner, paneCfg);
    }

    // ── Site / page resolution ─────────────────────────────────────────────
    function resolveSites(config) {
        if (Array.isArray(config.sites) && config.sites.length) return config.sites;
        // Zero-config fallback: a single implicit `control` site with one page
        // built from a legacy-style flat `panes` array if present.
        return [{
            id: 'control', title: config.title || 'Control', type: 'pxd',
            pages: [{ id: 'main', title: 'Main', panes: config.panes || [] }]
        }];
    }

    function currentPageRef() {
        if (window.PXD_PAGE && window.PXD_PAGE.site) return window.PXD_PAGE;
        var body = document.body;
        return {
            site: body.getAttribute('data-pxd-site') || null,
            page: body.getAttribute('data-pxd-page') || null
        };
    }

    // ── Theme + fonts ──────────────────────────────────────────────────────
    var TOKEN_MAP = {
        bgColor1: '--pxd-bg-1', bgColor2: '--pxd-bg-2', bgColor3: '--pxd-bg-3',
        panel: '--pxd-panel', panelBorder: '--pxd-panel-border',
        ink: '--pxd-ink', inkSoft: '--pxd-ink-soft',
        accent: '--pxd-accent', accentAlt: '--pxd-accent-alt',
        warn: '--pxd-warn', danger: '--pxd-danger',
        radius: '--pxd-radius', shadow: '--pxd-shadow',
        fontBody: '--pxd-font-body', fontMono: '--pxd-font-mono',
        bgGlow1: '--pxd-bg-glow-1', bgGlow2: '--pxd-bg-glow-2'
    };

    function applyTheme(theme) {
        // The packager resolves { base, overrides } → a flat token object at
        // build time, so at runtime `theme` is a flat token object.
        Object.keys(TOKEN_MAP).forEach(function (key) {
            if (theme && theme[key]) {
                document.documentElement.style.setProperty(TOKEN_MAP[key], theme[key]);
            }
        });
    }

    var FONT_FORMATS = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' };

    function injectFonts(fonts) {
        if (!Array.isArray(fonts) || !fonts.length) return;
        var css = fonts.map(function (f) {
            var ext = (f.src || '').split('.').pop().toLowerCase();
            var fmt = FONT_FORMATS[ext] || 'truetype';
            return '@font-face{font-family:"' + f.family + '";src:url("' + f.src + '") format("' + fmt + '");' +
                'font-weight:' + (f.weight || 'normal') + ';font-style:' + (f.style || 'normal') + ';}';
        }).join('\n');
        var style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ── Initialisation entry point ─────────────────────────────────────────
    function init() {
        fetch('room.json')
            .then(function (r) {
                if (!r.ok) throw new Error('room.json not found (HTTP ' + r.status + ')');
                return r.json();
            })
            .then(function (config) {
                _config = config;
                window.PxD.config = config;

                if (config.title) document.title = config.title;
                if (config.theme && config.theme.fonts) injectFonts(config.theme.fonts);
                if (config.theme) applyTheme(config.theme);

                var favicon = config.media && config.media.favicon;
                if (favicon) {
                    var link = document.querySelector('link[rel="shortcut icon"], link[rel="icon"]');
                    if (link) link.href = favicon;
                }

                // Resolve this page's site + page.
                var sites = resolveSites(config);
                var ref = currentPageRef();
                _site = sites.filter(function (s) { return s.id === ref.site; })[0]
                    || sites.filter(function (s) { return s.type !== 'external'; })[0]
                    || sites[0];
                var pages = (_site && _site.pages) || [];
                _page = pages.filter(function (p) { return p.id === ref.page; })[0] || pages[0];

                if (!_page) { console.error('[PxD] No page to render for', ref); return Promise.resolve(); }

                // Load every pane-type script this page needs, then render.
                var types = uniquePaneTypes(_site, _page);
                return types.reduce(function (chain, t) {
                    return chain.then(function () { return loadPaneScript(t); });
                }, Promise.resolve()).then(function () {
                    var header = document.getElementById('pxd-header');
                    var footer = document.getElementById('pxd-footer');
                    var body = document.getElementById('pxd-page-body');
                    if (header && _site.header) renderStickyRegion(header, _site.header);
                    if (footer && _site.footer) renderStickyRegion(footer, _site.footer);
                    if (body) renderPage(body, _page);
                });
            })
            .then(function () { if (_config) connectMqtt(); })
            .catch(function (err) { console.error('[PxD] Initialisation error:', err); });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
