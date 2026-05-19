/**
 * pxd.js — PxD Framework Core Runtime
 *
 * Responsibilities:
 *  1. Fetch room.json and expose it as window.PxD.config
 *  2. Apply theme tokens, fonts, title, and hero image
 *  3. Dynamically load panel scripts from panels.include
 *  4. Connect MQTT (Paho) using room.json mqtt settings
 *  5. On connect: mount each panel into its [data-slot] element
 *  6. Expose window.PxD.mqtt.{publish,subscribe,unsubscribe}
 *  7. Expose window.PxD.utils.{showToast,getContrastColor}
 */
(function () {
    'use strict';

    // ── Internal state ─────────────────────────────────────────────────────
    var _config = null;
    var _client = null;
    var _subs = {};                 // topic-pattern → [callbacks]
    var _registeredPanels = {};     // panelId → {mount, unmount}
    var _reconnectTimer = null;
    var _reconnectDelayMs = 2000;

    // ── Global PxD namespace ───────────────────────────────────────────────
    window.PxD = {
        config: null,

        // ── MQTT API ───────────────────────────────────────────────────────
        mqtt: {
            /**
             * Publish a JSON payload to a topic.
             * @param {string}  topic
             * @param {object}  payload   — will be JSON-serialised
             * @param {number}  [qos=0]
             * @param {boolean} [retained=false]
             */
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

            /**
             * Subscribe to a topic pattern (supports + and # wildcards).
             * Multiple callbacks may be registered for the same pattern.
             * @param {string}   topic
             * @param {Function} callback  fn(payload, topic)
             */
            subscribe: function (topic, callback) {
                if (!_subs[topic]) {
                    _subs[topic] = [];
                    if (_client && _client.isConnected()) {
                        _client.subscribe(topic, { qos: 0 });
                    }
                }
                _subs[topic].push(callback);
            },

            /**
             * Remove a specific callback from a topic subscription.
             * @param {string}   topic
             * @param {Function} callback
             */
            unsubscribe: function (topic, callback) {
                var cbs = _subs[topic];
                if (!cbs) return;
                var idx = cbs.indexOf(callback);
                if (idx >= 0) cbs.splice(idx, 1);
            }
        },

        // ── Panel registry API ─────────────────────────────────────────────
        panels: {
            /**
             * Called by each panel script to register itself.
             * @param {string} id     matches a data-slot attribute
             * @param {{ mount: Function, unmount: Function }} panel
             */
            register: function (id, panel) {
                _registeredPanels[id] = panel;
            }
        },

        // ── Utility helpers (shared across panels) ─────────────────────────
        utils: {
            /**
             * Show a Bootstrap toast.
             * @param {string} message
             * @param {{ x?: number, y?: number, anchorEl?: Element }} [opts]
             */
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

            /**
             * Return '#000000' or '#FFFFFF' depending on the luminance of hexColor.
             * @param {string} hexColor  e.g. '#FF8C00'
             * @returns {string}
             */
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

    // Dispatch an incoming MQTT message to all matching subscribers
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
                // Re-subscribe to all registered topics
                Object.keys(_subs).forEach(function (topic) {
                    _client.subscribe(topic, { qos: 0 });
                });
                // Mount all panels
                mountPanels();
            },
            onFailure: function (err) {
                console.warn('[PxD] MQTT connection failed:', err.errorMessage);
                clearTimeout(_reconnectTimer);
                _reconnectTimer = setTimeout(connectMqtt, _reconnectDelayMs);
            }
        });
    }

    // ── Panel loading ──────────────────────────────────────────────────────
    function loadPanelScript(panelId) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = 'assets/js/panels/' + panelId + '.js';
            s.onload = resolve;
            s.onerror = function () {
                console.error('[PxD] Failed to load panel script:', panelId);
                reject(new Error('Panel load failed: ' + panelId));
            };
            document.head.appendChild(s);
        });
    }

    // Mount all registered panels into their slots
    function mountPanels() {
        var include = (_config.panels && _config.panels.include) || [];
        include.forEach(function (panelId) {
            var panel = _registeredPanels[panelId];
            if (!panel) { console.warn('[PxD] No registration for panel:', panelId); return; }
            var slotEl = document.querySelector('[data-slot="' + panelId + '"]');
            if (!slotEl) { console.warn('[PxD] No slot element for panel:', panelId); return; }
            try { panel.mount(slotEl); } catch (e) {
                console.error('[PxD] Panel mount error:', panelId, e);
            }
        });
    }

    // ── Theme application ──────────────────────────────────────────────────
    var TOKEN_MAP = {
        bgColor1:    '--pxd-bg-1',
        bgColor2:    '--pxd-bg-2',
        bgColor3:    '--pxd-bg-3',
        panel:       '--pxd-panel',
        panelBorder: '--pxd-panel-border',
        ink:         '--pxd-ink',
        inkSoft:     '--pxd-ink-soft',
        accent:      '--pxd-accent',
        accentAlt:   '--pxd-accent-alt',
        warn:        '--pxd-warn',
        danger:      '--pxd-danger',
        radius:      '--pxd-radius',
        shadow:      '--pxd-shadow',
        fontBody:    '--pxd-font-body',
        fontMono:    '--pxd-font-mono'
    };

    function applyTheme(theme) {
        Object.keys(TOKEN_MAP).forEach(function (key) {
            if (theme[key]) document.documentElement.style.setProperty(TOKEN_MAP[key], theme[key]);
        });
    }

    function injectFonts(fonts) {
        if (!Array.isArray(fonts) || !fonts.length) return;
        var css = fonts.map(function (f) {
            return '@font-face{font-family:"' + f.family + '";src:url("' + f.src + '") format("truetype");' +
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

                // Page title
                if (config.title) document.title = config.title;

                // Fonts (inject before theme so font-family values resolve)
                if (config.theme && config.theme.fonts) injectFonts(config.theme.fonts);

                // Theme tokens
                if (config.theme) applyTheme(config.theme);

                // Hero image
                var heroImg = document.getElementById('pxd-hero-img');
                if (heroImg && config.media && config.media.hero) {
                    heroImg.src = config.media.hero;
                    heroImg.alt = config.title || '';
                }

                // Load panel scripts sequentially, then connect MQTT
                var panels = (config.panels && config.panels.include) || [];
                return panels.reduce(function (chain, id) {
                    return chain.then(function () { return loadPanelScript(id); });
                }, Promise.resolve());
            })
            .then(function () {
                connectMqtt();
            })
            .catch(function (err) {
                console.error('[PxD] Initialisation error:', err);
            });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
