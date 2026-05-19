/**
 * panels/time-lights.js — Time Adjustment & Lighting Panel
 *
 * Responsibilities:
 *  - MM:SS clock adjustment inputs (+/- minute, +/- second, Add/Subtract)
 *  - Lighting scene dropdown (colour scenes + MQTT-driven named scenes)
 *  - Emergency button shortcut (delegates to game-control panel's modal)
 *  - Clock visibility indicator (driven by tv/state and clock/state)
 *
 * Reads from: PxD.config.timeLights, PxD.config.topicRoot
 * Subscribes to: lights/state, lights/scenes, clock/state, tv/state
 * Publishes to: lights/commands
 */
(function () {
    'use strict';

    var _config = null;
    var _topicRoot = '';
    var _lightsCommandTopic = '';

    var _tvBrowserVisible = false;
    var _clockDisplayVisible = false;
    var _tvLastSeen = 0;
    var _clockLastSeen = 0;
    var _lastKnownLightScene = null;

    var _root = null;

    // Hardcoded colour scene list (fallback and default colour picker)
    var COLOR_SCENES = [
        { id: 'softWhite',   colorLabel: 'Soft White',   color: '#FFF0C0' },
        { id: 'warmWhite',   colorLabel: 'Warm White',   color: '#FFE4B0' },
        { id: 'normal',      colorLabel: 'White',        color: '#F4F4F4' },
        { id: 'brightWhite', colorLabel: 'Bright White', color: '#FFFFFF' },
        { id: 'dim',         colorLabel: 'Night Light',  color: '#FF8C00' },
        { id: 'pink',        colorLabel: 'Pink',         color: '#FF69B4' },
        { id: 'magenta',     colorLabel: 'Magenta',      color: '#FF00C8' },
        { id: 'red',         colorLabel: 'Red',          color: '#FF0000' },
        { id: 'orange',      colorLabel: 'Orange',       color: '#FF6E00' },
        { id: 'yellow',      colorLabel: 'Yellow',       color: '#FFDC00' },
        { id: 'green',       colorLabel: 'Green',        color: '#00FF5A' },
        { id: 'cyan',        colorLabel: 'Cyan',         color: '#00DCFF' },
        { id: 'blue',        colorLabel: 'Blue',         color: '#0046FF' },
        { id: 'purple',      colorLabel: 'Purple',       color: '#AA3CFF' },
        { id: 'off',         colorLabel: 'Off',          color: '#000000' }
    ];

    // ── Helpers ────────────────────────────────────────────────────────────
    function topic(suffix, override) {
        return override || (_topicRoot + '/' + suffix);
    }

    // Effective clock visibility: true | false | null (unknown/stale)
    function getEffectiveClockVisible() {
        var stale = 8000;
        var now = Date.now();
        if (_tvLastSeen === 0 || _clockLastSeen === 0) return null;
        if ((now - _tvLastSeen) > stale || (now - _clockLastSeen) > stale) return null;
        return _tvBrowserVisible && _clockDisplayVisible;
    }

    // ── Clock status indicator ─────────────────────────────────────────────
    function updateClockStatus() {
        var el = _root && _root.querySelector('#clockStatus');
        if (!el) return;
        var v = getEffectiveClockVisible();
        if (v === null) {
            el.className = 'alert alert-secondary clock-pill mb-0 text-center d-flex align-items-center justify-content-center h-100';
            el.innerHTML = 'Clock Unknown';
        } else if (v) {
            el.className = 'alert alert-success clock-pill mb-0 text-center d-flex align-items-center justify-content-center h-100';
            el.innerHTML = 'Clock Visible';
        } else {
            el.className = 'alert alert-warning clock-pill mb-0 text-center d-flex align-items-center justify-content-center h-100';
            el.innerHTML = 'Clock Hidden';
        }
        // Notify hints panel of clock visibility change
        document.dispatchEvent(new CustomEvent('pxd:clockVisibilityChanged', { detail: { visible: v } }));
    }

    // ── Time adjustment ────────────────────────────────────────────────────
    function adjustMinutes(delta) {
        var inp = _root.querySelector('#minutesInput');
        if (!inp) return;
        inp.value = Math.max(0, Math.min(60, (parseInt(inp.value) || 0) + delta));
    }

    function adjustSeconds(delta) {
        var inp = _root.querySelector('#secondsInput');
        if (!inp) return;
        inp.value = Math.max(0, Math.min(59, (parseInt(inp.value) || 0) + delta));
    }

    function validateTimeInput() {
        var mi = _root.querySelector('#minutesInput');
        var si = _root.querySelector('#secondsInput');
        if (mi) { var m = parseInt(mi.value); if (isNaN(m) || m < 0) mi.value = 0; else if (m > 60) mi.value = 60; }
        if (si) { var s = parseInt(si.value); if (isNaN(s) || s < 0) si.value = 0; else if (s > 59) si.value = 59; }
    }

    function adjustTime(direction) {
        var mi = _root.querySelector('#minutesInput');
        var si = _root.querySelector('#secondsInput');
        var mins = parseInt((mi && mi.value) || '0') || 0;
        var secs = parseInt((si && si.value) || '0') || 0;
        var total = (mins * 60 + secs) * direction;
        if (total !== 0) {
            PxD.mqtt.publish(topic('commands', _config.commandTopic), { command: 'adjustTime', seconds: total });
            if (mi) mi.value = '0';
            if (si) si.value = '0';
        }
    }

    // ── Lighting ────────────────────────────────────────────────────────────
    function buildDropdownItem(id, label, swatchColor, onClickFn) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.className = 'dropdown-item d-flex align-items-center';
        a.href = '#';
        a.onclick = function (e) { e.preventDefault(); onClickFn(id); };
        if (swatchColor) {
            var swatch = document.createElement('span');
            swatch.style.cssText = 'background:' + swatchColor + ';width:16px;height:16px;display:inline-block;border:1px solid #444;margin-right:8px;border-radius:2px;flex-shrink:0;';
            a.appendChild(swatch);
        }
        a.appendChild(document.createTextNode(label));
        li.appendChild(a);
        return li;
    }

    function populateColorScenes() {
        var dropdown = _root && _root.querySelector('#colorDropdown');
        var btn = _root && _root.querySelector('#colorBtn');
        if (!dropdown || !btn) return;
        dropdown.innerHTML = '';
        COLOR_SCENES.forEach(function (scene) {
            dropdown.appendChild(buildDropdownItem(scene.id, scene.colorLabel, scene.color, setColorScene));
        });
        btn.disabled = false;
        updateColorButton(_lastKnownLightScene);
    }

    function renderScenesFromMqtt(payload) {
        var dropdown = _root && _root.querySelector('#colorDropdown');
        var btn = _root && _root.querySelector('#colorBtn');
        if (!dropdown || !btn) return;
        var scenes = payload.scenes || [];
        if (!Array.isArray(scenes) || scenes.length === 0) return;
        dropdown.innerHTML = '';
        scenes.forEach(function (scene) {
            dropdown.appendChild(buildDropdownItem(scene.id, scene.label || scene.id, scene.swatch || null, setColorScene));
        });
        btn.disabled = false;
        updateColorButton(_lastKnownLightScene);
    }

    function updateColorButton(currentColor) {
        var btn = _root && _root.querySelector('#colorBtn');
        if (!btn) return;
        if (currentColor != null) _lastKnownLightScene = currentColor;
        else currentColor = _lastKnownLightScene;

        // Clear pending state if confirmed
        var pending = btn.getAttribute('data-pending-scene');
        if (pending && currentColor && currentColor.toLowerCase() === pending.toLowerCase()) {
            btn.removeAttribute('data-pending-scene');
            var toId = btn.getAttribute('data-pending-timeout');
            if (toId) { clearTimeout(parseInt(toId, 10)); btn.removeAttribute('data-pending-timeout'); }
            btn.disabled = false;
        }
        if (currentColor == null) return;

        var scene = COLOR_SCENES.find(function (s) { return s.id === currentColor; }) ||
                    COLOR_SCENES.find(function (s) { return s.id.toLowerCase() === (currentColor || '').toLowerCase(); });
        if (scene) {
            btn.textContent = scene.colorLabel;
            btn.style.background = scene.color;
            btn.style.color = PxD.utils.getContrastColor(scene.color);
        } else {
            btn.textContent = currentColor;
            btn.style.background = '#d3d3d3';
            btn.style.color = '#000000';
        }
    }

    function setColorScene(sceneId) {
        var btn = _root && _root.querySelector('#colorBtn');
        if (btn) {
            btn.setAttribute('data-pending-scene', sceneId);
            btn.disabled = true;
            btn.innerHTML = 'setting\u2026';
            btn.style.background = '#cccccc';
            btn.style.color = '#000000';
            var to = setTimeout(function () {
                btn.removeAttribute('data-pending-scene');
                btn.removeAttribute('data-pending-timeout');
                btn.disabled = false;
                updateColorButton(null);
            }, 12000);
            btn.setAttribute('data-pending-timeout', to.toString());
        }
        PxD.mqtt.publish(_lightsCommandTopic, { command: 'setColorScene', scene: sceneId });
    }

    // ── MQTT handlers ──────────────────────────────────────────────────────
    function onLightsState(payload) {
        if (payload && payload.lighting) updateColorButton(payload.lighting.activeScene);
    }

    function onLightsScenes(payload) {
        renderScenesFromMqtt(payload);
    }

    function onTvState(payload) {
        if (payload && payload.browser && typeof payload.browser.focused !== 'undefined') {
            _tvBrowserVisible = payload.browser.focused;
            _tvLastSeen = Date.now();
            updateClockStatus();
        }
    }

    function onClockState(payload) {
        if (payload && typeof payload.visible !== 'undefined') {
            _clockDisplayVisible = payload.visible;
            _clockLastSeen = Date.now();
            updateClockStatus();
        }
    }

    // ── HTML template ──────────────────────────────────────────────────────
    function buildHTML() {
        return '<section class="panel panel-time-lights">' +
            '<div class="panel-header panel-header-tight">' +
                '<h2 class="panel-title">Time, Lighting, and Safety</h2>' +
                '<div id="clockStatus" class="alert alert-warning clock-pill mb-0 text-center d-flex align-items-center justify-content-center h-100" style="min-width:120px;">Clock Hidden</div>' +
            '</div>' +
            '<div class="time-lights-grid">' +
                // Clock adjust
                '<div class="clock-adjust">' +
                    '<label class="form-label">Adjust Time</label>' +
                    '<div class="time-row">' +
                        '<div class="input-group time-input-group">' +
                            '<button class="btn btn-outline-secondary btn-sm time-adjust-btn" type="button" onclick="window._tlPanel.adjustMinutes(-1)" tabindex="-1">-</button>' +
                            '<input type="number" id="minutesInput" class="form-control time-input text-center" min="0" max="60" value="0" onchange="window._tlPanel.validateTimeInput()" placeholder="MM">' +
                            '<button class="btn btn-outline-secondary btn-sm time-adjust-btn" type="button" onclick="window._tlPanel.adjustMinutes(1)" tabindex="-1">+</button>' +
                        '</div>' +
                        '<div class="time-separator" aria-hidden="true">:</div>' +
                        '<div class="input-group time-input-group">' +
                            '<button class="btn btn-outline-secondary btn-sm time-adjust-btn" type="button" onclick="window._tlPanel.adjustSeconds(-1)" tabindex="-1">-</button>' +
                            '<input type="number" id="secondsInput" class="form-control time-input text-center" min="0" max="59" value="0" onchange="window._tlPanel.validateTimeInput()" placeholder="SS">' +
                            '<button class="btn btn-outline-secondary btn-sm time-adjust-btn" type="button" onclick="window._tlPanel.adjustSeconds(1)" tabindex="-1">+</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="btn-group w-100 shift-buttons" role="group">' +
                        '<button type="button" class="btn btn-outline-light" onclick="window._tlPanel.adjustTime(-1)">Subtract</button>' +
                        '<button type="button" class="btn btn-outline-light" onclick="window._tlPanel.adjustTime(1)">Add</button>' +
                    '</div>' +
                '</div>' +
                // Lighting
                '<div class="lighting-block">' +
                    '<label class="form-label">Lights</label>' +
                    '<div class="dropdown w-100">' +
                        '<button id="colorBtn" class="btn btn-secondary dropdown-toggle w-100" type="button" data-bs-toggle="dropdown" disabled>Color Scene</button>' +
                        '<ul id="colorDropdown" class="dropdown-menu w-100"><li class="px-3 text-muted small">Loading scenes\u2026</li></ul>' +
                    '</div>' +
                '</div>' +
                // Emergency shortcut
                '<div class="safety-block">' +
                    '<label class="form-label">Emergency</label>' +
                    '<button id="emergencyBtnTL" type="button" class="btn btn-danger w-100" onclick="window._gcPanel && window._gcPanel.showEmergencyModal && window._gcPanel.showEmergencyModal()">Emergency Controls</button>' +
                '</div>' +
            '</div>' +
        '</section>';
    }

    // ── panel.mount ────────────────────────────────────────────────────────
    function mount(slotEl) {
        var cfg = PxD.config;
        _config = cfg.timeLights || {};
        _topicRoot = cfg.topicRoot || '';
        _lightsCommandTopic = topic('lights/commands', _config.lightsCommandTopic);

        _root = slotEl;
        slotEl.innerHTML = buildHTML();

        // Patch emergency button to use game-control panel modal
        var emerBtn = slotEl.querySelector('#emergencyBtnTL');
        if (emerBtn) {
            emerBtn.onclick = function () {
                var el = document.getElementById('gc-emergencyModal');
                if (el) { new bootstrap.Modal(el).show(); }
            };
        }

        populateColorScenes();

        // Expose methods for inline handlers
        window._tlPanel = {
            adjustMinutes:    adjustMinutes,
            adjustSeconds:    adjustSeconds,
            validateTimeInput:validateTimeInput,
            adjustTime:       adjustTime
        };

        // MQTT subscriptions
        PxD.mqtt.subscribe(topic('lights/state',  _config.lightsStateTopic),   onLightsState);
        PxD.mqtt.subscribe(topic('lights/scenes', _config.lightsScenesTopicRoot && _config.lightsScenesTopicRoot + '/scenes'), onLightsScenes);
        PxD.mqtt.subscribe(topic('clock/state',   _config.clockStateTopic),    onClockState);
        PxD.mqtt.subscribe(topic('tv/state',      _config.tvStateTopic),       onTvState);
    }

    function unmount() {
        window._tlPanel = null;
    }

    PxD.panels.register('time-lights', { mount: mount, unmount: unmount });
})();
