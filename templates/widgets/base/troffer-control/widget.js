/**
 * troffer-control — Paradox Troffer / px-wifi-light operator widget
 * White on/off (digital), RGB colour + brightness (PWM), independent UV (0–255).
 * Default size: 3×1
 *
 * To use:
 *   1. Copy this directory to rooms/<game>/pxd/widgets/<your-id>/
 *   2. Edit only the CONFIG block below.
 *   3. Add the widget to room.json → widgets and run the packager.
 *
 * MQTT (px-wifi-light / Paradox Troffer):
 *   Subscribe  {base}/state
 *   Publish    {base}/commands  (object payloads — do not JSON.stringify)
 *
 * White ON  → { command: "setColorScene", scene: "white" }
 * White OFF → { command: "setColor", color } with current RGB, or { command: "off" }
 * Colour    → { command: "setColor", color, brightness? }
 * Brightness→ { command: "setBrightness", brightness }
 * UV        → { command: "setUV", level }   // 0–255 device units
 *
 * IMPORTANT — OFFLINE / KIOSK DEPLOYMENT
 * Built-in glyph is inline SVG. No font, CDN, or network access is required.
 */
(function () {

    /* eslint-disable max-len */
    const GLYPH =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
        '<rect x="2" y="4" width="20" height="3" rx="0.8"/>' +
        '<rect x="3" y="8" width="18" height="10" rx="1.2"/>' +
        '<rect x="4.5" y="9.5" width="15" height="7" rx="0.6" opacity="0.35"/>' +
        '<rect x="5" y="19" width="3" height="1.5" rx="0.3"/>' +
        '<rect x="16" y="19" width="3" height="1.5" rx="0.3"/>' +
        '</svg>';
    /* eslint-enable max-len */

    // Colour scenes used for the RGB picker (same set as lights-control / Troffer scenes).
    // White / off are handled by the dedicated White toggle — omitted here.
    const COLOR_SCENES = [
        { id: 'softWhite',   colorLabel: 'Soft White', color: '#FFF0C0' },
        { id: 'warmWhite',   colorLabel: 'Warm White', color: '#FFE4B0' },
        { id: 'coolWhite',   colorLabel: 'Cool White', color: '#A0A0FF' },
        { id: 'dim',         colorLabel: 'Night Light', color: '#FF8C00' },
        { id: 'red',         colorLabel: 'Red',        color: '#FF0000' },
        { id: 'orange',      colorLabel: 'Orange',     color: '#FF6E00' },
        { id: 'yellow',      colorLabel: 'Yellow',     color: '#FFDC00' },
        { id: 'green',       colorLabel: 'Green',      color: '#00FF5A' },
        { id: 'cyan',        colorLabel: 'Cyan',       color: '#00DCFF' },
        { id: 'blue',        colorLabel: 'Blue',       color: '#0046FF' },
        { id: 'purple',      colorLabel: 'Purple',     color: '#AA3CFF' },
        { id: 'pink',        colorLabel: 'Pink',       color: '#FF69B4' },
        { id: 'magenta',     colorLabel: 'Magenta',    color: '#FF00C8' },
    ];


    // ── CONFIG ─────────────────────────────────────────────────────────────
    const CONFIG = {

        /** MQTT topic carrying troffer / px-wifi-light state. */
        STATE_TOPIC:          'REPLACE/WITH/YOUR/troffer/state',

        /** MQTT topic for light commands. */
        COMMAND_TOPIC:        'REPLACE/WITH/YOUR/troffer/commands',

        /** Tile size. 3x1 (~25%) fits white + colour + bri + UV compactly. */
        SIZE:                 '3x1',

        /** Card goes 'disconnected' if no state message arrives within this many ms.
         *  Set to 0 to disable the heartbeat watcher. */
        HEARTBEAT_TIMEOUT_MS: 30000,
    };
    // ── END CONFIG ──────────────────────────────────────────────────────────


    let _wrapEl      = null;
    let _glyphEl     = null;
    let _whiteBtn    = null;
    let _colorSelect = null;
    let _briSlider   = null;
    let _briLabel    = null;
    let _uvSlider    = null;
    let _uvLabel     = null;

    let _on          = false;
    let _white       = false;
    let _r           = 0;
    let _g           = 0;
    let _b           = 0;
    let _brightness  = 100;
    let _uv          = 0;
    let _sceneId     = '';
    let _suppressBri = false;
    let _suppressUv  = false;


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

    function contrastText(hex) {
        if (PxD.utils && typeof PxD.utils.getContrastColor === 'function') {
            return PxD.utils.getContrastColor(hex);
        }
        var rgb = parseHex(hex);
        if (!rgb) return '#ffffff';
        return ((rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 > 128) ? '#000000' : '#ffffff';
    }

    function currentColorHex() {
        return toHex(_r, _g, _b);
    }

    function findSceneByColor(hex) {
        var lower = String(hex || '').toLowerCase();
        return COLOR_SCENES.find(function (s) {
            return String(s.color).toLowerCase() === lower;
        }) || null;
    }

    function findSceneById(id) {
        if (!id) return null;
        var lower = String(id).toLowerCase();
        return COLOR_SCENES.find(function (s) {
            return s.id.toLowerCase() === lower;
        }) || null;
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

    function populateColorSelect() {
        if (!_colorSelect) return;
        var prev = _colorSelect.value;
        _colorSelect.innerHTML = '';
        COLOR_SCENES.forEach(function (s) {
            var opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.colorLabel;
            opt.style.backgroundColor = s.color;
            opt.style.color = contrastText(s.color);
            _colorSelect.appendChild(opt);
        });
        var match = findSceneById(prev) || findSceneById(_sceneId) || findSceneByColor(currentColorHex());
        if (match) {
            _colorSelect.value = match.id;
            applySelectColors(_colorSelect, match.color);
        } else if (COLOR_SCENES[0]) {
            _colorSelect.value = COLOR_SCENES[0].id;
            applySelectColors(_colorSelect, COLOR_SCENES[0].color);
        }
    }

    function renderGlyph() {
        if (!_glyphEl) return;
        if (!_on && !_white && _r === 0 && _g === 0 && _b === 0) {
            _glyphEl.style.color = '#333333';
            return;
        }
        if (_white) {
            var t = Math.max(0, Math.min(100, _brightness)) / 100;
            _glyphEl.style.color = toHex(244 * t, 244 * t, 244 * t);
            return;
        }
        var base = currentColorHex();
        var bt = Math.max(0, Math.min(100, _brightness)) / 100;
        var rgb = parseHex(base) || { r: 0, g: 0, b: 0 };
        _glyphEl.style.color = toHex(rgb.r * bt, rgb.g * bt, rgb.b * bt);
    }

    function syncWhiteBtn() {
        if (!_whiteBtn) return;
        _whiteBtn.classList.toggle('wd-troffer-white-on', !!_white);
        _whiteBtn.setAttribute('aria-pressed', _white ? 'true' : 'false');
        _whiteBtn.textContent = _white ? 'W ON' : 'W OFF';
    }

    function syncSliders() {
        if (_briSlider) {
            _suppressBri = true;
            _briSlider.value = String(_brightness);
            _suppressBri = false;
        }
        if (_briLabel) _briLabel.textContent = String(_brightness) + '%';
        if (_uvSlider) {
            _suppressUv = true;
            _uvSlider.value = String(_uv);
            _suppressUv = false;
        }
        if (_uvLabel) {
            var pct = Math.round((_uv / 255) * 100);
            _uvLabel.textContent = 'UV ' + String(_uv) + ' (' + pct + '%)';
        }
    }

    function applyDisplay() {
        syncWhiteBtn();
        syncSliders();
        var scene = findSceneById(_sceneId) || findSceneByColor(currentColorHex());
        if (scene && _colorSelect) {
            _colorSelect.value = scene.id;
            applySelectColors(_colorSelect, scene.color);
        }
        renderGlyph();
    }

    function onState(payload) {
        if (!payload || typeof payload !== 'object') return;

        if (typeof payload.on === 'boolean') _on = payload.on;
        if (typeof payload.white === 'boolean') _white = payload.white;

        if (typeof payload.r === 'number') _r = Math.max(0, Math.min(255, Math.round(payload.r)));
        if (typeof payload.g === 'number') _g = Math.max(0, Math.min(255, Math.round(payload.g)));
        if (typeof payload.b === 'number') _b = Math.max(0, Math.min(255, Math.round(payload.b)));

        if (typeof payload.brightness === 'number' && isFinite(payload.brightness)) {
            _brightness = Math.max(0, Math.min(100, Math.round(payload.brightness)));
        }
        if (typeof payload.uv === 'number' && isFinite(payload.uv)) {
            _uv = Math.max(0, Math.min(255, Math.round(payload.uv)));
        }
        if (payload.scene != null && payload.scene !== '') {
            _sceneId = String(payload.scene);
            var whiteScenes = { white: 1, normal: 1, brightwhite: 1 };
            if (whiteScenes[_sceneId.toLowerCase()]) _white = true;
        }

        applyDisplay();
    }

    function publish(cmd) {
        if (!CONFIG.COMMAND_TOPIC) return;
        PxD.mqtt.publish(CONFIG.COMMAND_TOPIC, cmd);
    }

    function onWhiteClick() {
        if (_white) {
            // Turn white off; keep RGB if present, otherwise full off.
            if (_r || _g || _b) {
                _white = false;
                syncWhiteBtn();
                publish({ command: 'setColor', color: currentColorHex(), brightness: _brightness });
            } else {
                _white = false;
                syncWhiteBtn();
                publish({ command: 'off' });
            }
        } else {
            _white = true;
            syncWhiteBtn();
            publish({ command: 'setColorScene', scene: 'white' });
        }
        renderGlyph();
    }

    function onColorChange() {
        if (!_colorSelect) return;
        var scene = findSceneById(_colorSelect.value);
        if (!scene) return;
        _sceneId = scene.id;
        var rgb = parseHex(scene.color) || { r: 0, g: 0, b: 0 };
        _r = rgb.r; _g = rgb.g; _b = rgb.b;
        _white = false;
        applySelectColors(_colorSelect, scene.color);
        syncWhiteBtn();
        renderGlyph();
        publish({ command: 'setColorScene', scene: scene.id });
    }

    function onBriInput() {
        if (!_briSlider || _suppressBri) return;
        _brightness = Math.max(0, Math.min(100, parseInt(_briSlider.value, 10) || 0));
        if (_briLabel) _briLabel.textContent = String(_brightness) + '%';
        renderGlyph();
    }

    function onBriChange() {
        if (!_briSlider || _suppressBri) return;
        _brightness = Math.max(0, Math.min(100, parseInt(_briSlider.value, 10) || 0));
        if (_briLabel) _briLabel.textContent = String(_brightness) + '%';
        renderGlyph();
        publish({ command: 'setBrightness', brightness: _brightness });
    }

    function onUvInput() {
        if (!_uvSlider || _suppressUv) return;
        _uv = Math.max(0, Math.min(255, parseInt(_uvSlider.value, 10) || 0));
        if (_uvLabel) {
            var pct = Math.round((_uv / 255) * 100);
            _uvLabel.textContent = 'UV ' + String(_uv) + ' (' + pct + '%)';
        }
    }

    function onUvChange() {
        if (!_uvSlider || _suppressUv) return;
        _uv = Math.max(0, Math.min(255, parseInt(_uvSlider.value, 10) || 0));
        if (_uvLabel) {
            var pct = Math.round((_uv / 255) * 100);
            _uvLabel.textContent = 'UV ' + String(_uv) + ' (' + pct + '%)';
        }
        publish({ command: 'setUV', level: _uv });
    }


    PxD.widgets.register({
        size:                CONFIG.SIZE,
        interactive:         true,
        commandTopic:        CONFIG.COMMAND_TOPIC,
        heartbeatTimeoutMs:  CONFIG.HEARTBEAT_TIMEOUT_MS,

        mount(bodyEl) {
            bodyEl.innerHTML =
                '<div class="wd-troffer-wrap">' +
                '  <div class="wd-troffer-left">' +
                '    <div class="wd-troffer-glyph" aria-hidden="true">' + GLYPH + '</div>' +
                '    <button type="button" class="wd-troffer-white" aria-pressed="false">W OFF</button>' +
                '  </div>' +
                '  <div class="wd-troffer-main">' +
                '    <label class="wd-troffer-label">' +
                '      <select class="wd-troffer-color form-select form-select-sm" aria-label="Colour scene"></select>' +
                '    </label>' +
                '    <div class="wd-troffer-row">' +
                '      <span class="wd-troffer-bri-val">100%</span>' +
                '      <input class="wd-troffer-bri" type="range" min="0" max="100" value="100" step="1" aria-label="RGB brightness">' +
                '    </div>' +
                '    <div class="wd-troffer-row">' +
                '      <span class="wd-troffer-uv-val">UV 0 (0%)</span>' +
                '      <input class="wd-troffer-uv" type="range" min="0" max="255" value="0" step="1" aria-label="UV level">' +
                '    </div>' +
                '  </div>' +
                '</div>';

            _wrapEl      = bodyEl.querySelector('.wd-troffer-wrap');
            _glyphEl     = bodyEl.querySelector('.wd-troffer-glyph');
            _whiteBtn    = bodyEl.querySelector('.wd-troffer-white');
            _colorSelect = bodyEl.querySelector('.wd-troffer-color');
            _briSlider   = bodyEl.querySelector('.wd-troffer-bri');
            _briLabel    = bodyEl.querySelector('.wd-troffer-bri-val');
            _uvSlider    = bodyEl.querySelector('.wd-troffer-uv');
            _uvLabel     = bodyEl.querySelector('.wd-troffer-uv-val');

            populateColorSelect();
            applyDisplay();

            _whiteBtn.addEventListener('click', onWhiteClick);
            _colorSelect.addEventListener('change', onColorChange);
            _briSlider.addEventListener('input', onBriInput);
            _briSlider.addEventListener('change', onBriChange);
            _uvSlider.addEventListener('input', onUvInput);
            _uvSlider.addEventListener('change', onUvChange);

            PxD.mqtt.subscribe(CONFIG.STATE_TOPIC, onState);
        },

        unmount() {
            if (_whiteBtn) _whiteBtn.removeEventListener('click', onWhiteClick);
            if (_colorSelect) _colorSelect.removeEventListener('change', onColorChange);
            if (_briSlider) {
                _briSlider.removeEventListener('input', onBriInput);
                _briSlider.removeEventListener('change', onBriChange);
            }
            if (_uvSlider) {
                _uvSlider.removeEventListener('input', onUvInput);
                _uvSlider.removeEventListener('change', onUvChange);
            }
            PxD.mqtt.unsubscribe(CONFIG.STATE_TOPIC, onState);
            _wrapEl = _glyphEl = _whiteBtn = _colorSelect = null;
            _briSlider = _briLabel = _uvSlider = _uvLabel = null;
        },
    });

}());
