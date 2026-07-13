/**
 * lights-control — active light scene + brightness widget
 * Scene picker, brightness slider, and a glyph tinted by the selected scene
 * colour mixed toward black by brightness.
 * Default size: 1×1
 *
 * To use:
 *   1. Copy this directory to rooms/<game>/pxd/widgets/<your-id>/
 *   2. Edit only the CONFIG block below.
 *   3. Add the widget to room.json → widgets and run the packager.
 *
 * Glyphs — set GLYPH to one of: 'ceiling' | 'desk' | 'spotlight' | 'bulb'
 *   Built-in SVGs are offline-safe (fill="currentColor", viewBox 0 0 24 24).
 *
 * IMPORTANT — OFFLINE / KIOSK DEPLOYMENT
 * Built-in glyphs are inline SVG. No font, CDN, or network access is required.
 */
(function () {

    // ── Built-in glyph SVGs ────────────────────────────────────────────────
    /* eslint-disable max-len */
    const GLYPHS = {

        // Flush-mount ceiling drum fixture (canopy + short stem + shade)
        ceiling:
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
            '<rect x="3.5" y="1.8" width="17" height="2" rx="0.8"/>' +
            '<rect x="11.1" y="3.8" width="1.8" height="2.4" rx="0.4"/>' +
            '<path d="M6.2 7.2h11.6c1 0 1.8.8 1.8 1.8v.8H4.4v-.8c0-1 .8-1.8 1.8-1.8z"/>' +
            '<path d="M4.4 9.8h15.2v5.4c0 1.6-3.4 2.9-7.6 2.9s-7.6-1.3-7.6-2.9V9.8z"/>' +
            '<ellipse cx="12" cy="17.6" rx="6.2" ry="1.15" opacity="0.5"/>' +
            '</svg>',

        desk:
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
            '<path d="M13.2 3.2c2.6 0 4.8 2.1 4.8 4.8 0 1.7-.9 3.2-2.2 4.1l-1.3.9V15h-2.6v-2l-1.3-.9C9.3 11.2 8.4 9.7 8.4 8c0-2.7 2.2-4.8 4.8-4.8z"/>' +
            '<path d="M11.6 15.2h3.2v1.4h-3.2z"/>' +
            '<path d="M10.4 16.8h5.6v1.6H17v2.4h-1.6v-1.2H9v1.2H7.4v-2.4h1.4v-1.6z"/>' +
            '</svg>',

        spotlight:
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
            '<path d="M11 2.5h2v4.2h-2z"/>' +
            '<path d="M8.2 6.5h7.6l1.8 3.2H6.4L8.2 6.5z"/>' +
            '<path d="M6 10.2h12l2.4 9.3H3.6L6 10.2z" opacity="0.85"/>' +
            '<path d="M9.2 12.2h5.6v1.2H9.2z" opacity="0.45"/>' +
            '</svg>',

        bulb:
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
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
    };
    /* eslint-enable max-len */


    // ── Hardcoded colour scenes (fallback when SCENES_TOPIC is empty) ─────
    const COLOR_SCENES = [
        { id: 'softWhite',   colorLabel: 'Soft White',   color: '#FFF0C0' },
        { id: 'warmWhite',   colorLabel: 'Warm White',   color: '#FFE4B0' },
        { id: 'normal',      colorLabel: 'White',        color: '#F4F4F4' },
        { id: 'brightWhite', colorLabel: 'Bright White', color: '#FFFFFF' },
        { id: 'dim',         colorLabel: 'Night Light',  color: '#FF8C00' },
        { id: 'red',         colorLabel: 'Red',          color: '#FF0000' },
        { id: 'orange',      colorLabel: 'Orange',       color: '#FF6E00' },
        { id: 'yellow',      colorLabel: 'Yellow',       color: '#FFDC00' },
        { id: 'green',       colorLabel: 'Green',        color: '#00FF5A' },
        { id: 'cyan',        colorLabel: 'Cyan',         color: '#00DCFF' },
        { id: 'blue',        colorLabel: 'Blue',         color: '#0046FF' },
        { id: 'purple',      colorLabel: 'Purple',       color: '#AA3CFF' },
        { id: 'pink',        colorLabel: 'Pink',         color: '#FF69B4' },
        { id: 'magenta',     colorLabel: 'Magenta',      color: '#FF00C8' },
        { id: 'off',         colorLabel: 'Off',          color: '#000000' },
    ];


    // ── CONFIG ─────────────────────────────────────────────────────────────
    const CONFIG = {

        /** MQTT topic carrying light state (scene / brightness / on). */
        STATE_TOPIC:          'REPLACE/WITH/YOUR/lights/state',

        /** Retained MQTT topic with scene list: { scenes: [{ id, label, swatch }] }. */
        SCENES_TOPIC:         'REPLACE/WITH/YOUR/lights/scenes',

        /** MQTT topic for light commands (setColorScene / setBrightness). */
        COMMAND_TOPIC:        'REPLACE/WITH/YOUR/lights/commands',

        /** Built-in glyph: 'ceiling' | 'desk' | 'spotlight' | 'bulb' */
        GLYPH:                'bulb',

        /** Tile size. Prefer 1x1 (compact) or 3x1 if controls need more width. */
        SIZE:                 '1x1',

        /** Card goes 'disconnected' if no state message arrives within this many ms.
         *  Set to 0 to disable the heartbeat watcher. */
        HEARTBEAT_TIMEOUT_MS: 30000,
    };
    // ── END CONFIG ──────────────────────────────────────────────────────────


    // ── Internal state ───────────────────────────────────────────────────────
    let _wrapEl       = null;
    let _glyphEl      = null;
    let _sceneSelect  = null;
    let _briSlider    = null;
    let _briLabel     = null;
    let _sceneId      = 'normal';
    let _brightness   = 100;   // session brightness 0–100
    let _liveScenes   = null;  // scenes from SCENES_TOPIC, if any
    let _suppressBri  = false; // skip publish while syncing slider from MQTT


    // ── Colour helpers ───────────────────────────────────────────────────────
    function parseHex(hex) {
        if (!hex || typeof hex !== 'string') return null;
        var h = hex.trim().replace(/^#/, '');
        if (h.length === 3) {
            h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        }
        if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
        };
    }

    function toHex(r, g, b) {
        function p(n) {
            var s = Math.max(0, Math.min(255, Math.round(n))).toString(16);
            return s.length === 1 ? '0' + s : s;
        }
        return '#' + p(r) + p(g) + p(b);
    }

    /** Black text on light swatches, white on dark (shared PxD helper). */
    function contrastText(hex) {
        if (PxD.utils && typeof PxD.utils.getContrastColor === 'function') {
            return PxD.utils.getContrastColor(hex);
        }
        // Fallback if utils not loaded yet
        var rgb = parseHex(hex);
        if (!rgb) return '#ffffff';
        return ((rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 > 128) ? '#000000' : '#ffffff';
    }

    function applySelectColors(selectEl, bgHex) {
        if (!selectEl) return;
        if (bgHex) {
            selectEl.style.backgroundColor = bgHex;
            selectEl.style.color = contrastText(bgHex);
        } else {
            selectEl.style.backgroundColor = '';
            selectEl.style.color = '';
        }
    }

    /** Mix scene RGB toward black by brightness (0% → black, 100% → full colour). */
    function mixTowardBlack(hex, brightness) {
        var rgb = parseHex(hex);
        if (!rgb) return '#000000';
        var t = Math.max(0, Math.min(100, Number(brightness) || 0)) / 100;
        return toHex(rgb.r * t, rgb.g * t, rgb.b * t);
    }

    function findSceneMeta(sceneId) {
        if (sceneId == null) return null;
        var lower = String(sceneId).toLowerCase();
        if (_liveScenes) {
            var live = _liveScenes.find(function (s) { return s.id === sceneId; }) ||
                       _liveScenes.find(function (s) { return String(s.id || '').toLowerCase() === lower; });
            if (live) {
                return {
                    id: live.id,
                    label: live.label || live.id,
                    color: live.swatch || null,
                };
            }
        }
        var fallback = COLOR_SCENES.find(function (s) { return s.id === sceneId; }) ||
                       COLOR_SCENES.find(function (s) { return s.id.toLowerCase() === lower; });
        if (fallback) {
            return { id: fallback.id, label: fallback.colorLabel, color: fallback.color };
        }
        return { id: sceneId, label: String(sceneId), color: null };
    }

    function sceneList() {
        if (_liveScenes && _liveScenes.length) {
            return _liveScenes.map(function (s) {
                return { id: s.id, label: s.label || s.id, color: s.swatch || null };
            });
        }
        return COLOR_SCENES.map(function (s) {
            return { id: s.id, label: s.colorLabel, color: s.color };
        });
    }


    // ── Render ───────────────────────────────────────────────────────────────
    function renderGlyph() {
        if (!_glyphEl) return;
        var meta = findSceneMeta(_sceneId);
        var base = (meta && meta.color) ? meta.color : '#F4F4F4';
        // Off scene or brightness 0 → black glyph
        if (_sceneId && String(_sceneId).toLowerCase() === 'off') {
            _glyphEl.style.color = '#000000';
            return;
        }
        _glyphEl.style.color = mixTowardBlack(base, _brightness);
    }

    function populateSceneSelect() {
        if (!_sceneSelect) return;
        var list = sceneList();
        var prev = _sceneId;
        _sceneSelect.innerHTML = '';
        list.forEach(function (s) {
            var opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.label;
            if (s.color) {
                opt.style.backgroundColor = s.color;
                opt.style.color = contrastText(s.color);
            }
            _sceneSelect.appendChild(opt);
        });
        var match = list.find(function (s) { return s.id === prev; }) ||
                    list.find(function (s) { return String(s.id).toLowerCase() === String(prev).toLowerCase(); });
        if (match) {
            _sceneId = match.id;
            _sceneSelect.value = match.id;
        } else if (list[0]) {
            // Previous scene was removed — keep select and state aligned.
            _sceneId = list[0].id;
            _sceneSelect.value = list[0].id;
        }
        var selected = findSceneMeta(_sceneId);
        applySelectColors(_sceneSelect, selected && selected.color);
    }

    function syncBrightnessUi() {
        if (_briSlider) {
            _suppressBri = true;
            _briSlider.value = String(_brightness);
            _suppressBri = false;
        }
        if (_briLabel) _briLabel.textContent = String(_brightness) + '%';
    }

    function applyDisplay() {
        if (_sceneSelect && _sceneSelect.value !== _sceneId) {
            var opts = Array.prototype.slice.call(_sceneSelect.options || []);
            var hit = opts.find(function (o) { return o.value === _sceneId; }) ||
                      opts.find(function (o) { return o.value.toLowerCase() === String(_sceneId).toLowerCase(); });
            if (hit) _sceneSelect.value = hit.value;
        }
        var meta = findSceneMeta(_sceneId);
        applySelectColors(_sceneSelect, meta && meta.color);
        syncBrightnessUi();
        renderGlyph();
    }


    // ── MQTT handlers ────────────────────────────────────────────────────────
    function onState(payload) {
        if (!payload || typeof payload !== 'object') return;

        // Scene: prefer top-level `scene` (firmware / simple adapters), then
        // `activeScene` / nested `lighting.activeScene` (PxB light-zone).
        var scene = null;
        if (payload.scene !== undefined && payload.scene !== null) {
            scene = payload.scene;
        } else if (payload.activeScene !== undefined && payload.activeScene !== null) {
            scene = payload.activeScene;
        } else if (payload.lighting && payload.lighting.activeScene != null) {
            scene = payload.lighting.activeScene;
        }
        if (scene != null && scene !== '') {
            _sceneId = String(scene);
        }

        // Brightness: top-level 0–100 when present (Wiz/Lifx-style); session
        // value is kept when the publisher omits it (e.g. PxB light-zone).
        if (typeof payload.brightness === 'number' && isFinite(payload.brightness)) {
            _brightness = Math.max(0, Math.min(100, Math.round(payload.brightness)));
        }

        // Optional on=false → treat as off for glyph (do not change scene id).
        if (payload.on === false && !(scene != null && scene !== '')) {
            // Keep scene; glyph will still mix by brightness. If brightness is 0, black.
        }

        applyDisplay();
    }

    function onScenes(payload) {
        if (!payload) return;
        var scenes = payload.scenes || [];
        if (!Array.isArray(scenes) || scenes.length === 0) return;
        _liveScenes = scenes;
        populateSceneSelect();
        applyDisplay();
    }


    // ── User actions ─────────────────────────────────────────────────────────
    function onSceneChange() {
        if (!_sceneSelect || !CONFIG.COMMAND_TOPIC) return;
        var id = _sceneSelect.value;
        if (!id) return;
        _sceneId = id;
        var meta = findSceneMeta(_sceneId);
        applySelectColors(_sceneSelect, meta && meta.color);
        renderGlyph();
        // Publish object payload — PxD.mqtt serialises once (do not JSON.stringify).
        PxD.mqtt.publish(CONFIG.COMMAND_TOPIC, { command: 'setColorScene', scene: id });
    }

    function onBrightnessInput() {
        if (!_briSlider || _suppressBri) return;
        _brightness = Math.max(0, Math.min(100, parseInt(_briSlider.value, 10) || 0));
        if (_briLabel) _briLabel.textContent = String(_brightness) + '%';
        renderGlyph();
    }

    function onBrightnessChange() {
        if (!_briSlider || _suppressBri || !CONFIG.COMMAND_TOPIC) return;
        _brightness = Math.max(0, Math.min(100, parseInt(_briSlider.value, 10) || 0));
        if (_briLabel) _briLabel.textContent = String(_brightness) + '%';
        renderGlyph();
        PxD.mqtt.publish(CONFIG.COMMAND_TOPIC, {
            command: 'setBrightness',
            brightness: _brightness,
        });
    }


    // ── Registration ─────────────────────────────────────────────────────────
    const glyphSvg = GLYPHS[CONFIG.GLYPH] || GLYPHS.bulb;

    PxD.widgets.register({
        size:                CONFIG.SIZE,
        interactive:         true,
        commandTopic:        CONFIG.COMMAND_TOPIC,
        heartbeatTimeoutMs:  CONFIG.HEARTBEAT_TIMEOUT_MS,

        mount(bodyEl) {
            bodyEl.innerHTML =
                '<div class="wd-lights-wrap">' +
                '  <div class="wd-lights-main">' +
                '    <div class="wd-lights-glyph" aria-hidden="true">' + glyphSvg + '</div>' +
                '    <label class="wd-lights-label">' +
                '      <select class="wd-lights-select form-select form-select-sm" aria-label="Color scene"></select>' +
                '    </label>' +
                '  </div>' +
                '  <div class="wd-lights-bri-col">' +
                '    <span class="wd-lights-bri-val">100%</span>' +
                '    <input class="wd-lights-bri" type="range" min="0" max="100" value="100" step="1" orient="vertical" aria-label="Brightness">' +
                '  </div>' +
                '</div>';

            _wrapEl      = bodyEl.querySelector('.wd-lights-wrap');
            _glyphEl     = bodyEl.querySelector('.wd-lights-glyph');
            _sceneSelect = bodyEl.querySelector('.wd-lights-select');
            _briSlider   = bodyEl.querySelector('.wd-lights-bri');
            _briLabel    = bodyEl.querySelector('.wd-lights-bri-val');

            populateSceneSelect();
            applyDisplay();

            _sceneSelect.addEventListener('change', onSceneChange);
            _briSlider.addEventListener('input', onBrightnessInput);
            _briSlider.addEventListener('change', onBrightnessChange);

            PxD.mqtt.subscribe(CONFIG.STATE_TOPIC, onState);
            if (CONFIG.SCENES_TOPIC) {
                PxD.mqtt.subscribe(CONFIG.SCENES_TOPIC, onScenes);
            }
        },

        unmount() {
            if (_sceneSelect) _sceneSelect.removeEventListener('change', onSceneChange);
            if (_briSlider) {
                _briSlider.removeEventListener('input', onBrightnessInput);
                _briSlider.removeEventListener('change', onBrightnessChange);
            }
            PxD.mqtt.unsubscribe(CONFIG.STATE_TOPIC, onState);
            if (CONFIG.SCENES_TOPIC) {
                PxD.mqtt.unsubscribe(CONFIG.SCENES_TOPIC, onScenes);
            }
            _wrapEl = _glyphEl = _sceneSelect = _briSlider = _briLabel = null;
        },
    });

}());
