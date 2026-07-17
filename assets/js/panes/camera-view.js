/**
 * panes/camera-view.js — Camera View pane
 *
 * Embeds live go2rtc camera streams in the operator dashboard. Talks
 * directly to an existing go2rtc instance (this room's own, per
 * /opt/paradox/config/go2rtc.yaml + go2rtc.service) — this pane is a
 * consumer only; it does not run or manage go2rtc itself.
 *
 * Delivery method: MSE only (v1). MSE was chosen over WebRTC because these
 * cameras' AAC audio isn't carried by WebRTC without an extra transcode
 * step, and MSE gave equivalent video quality in side-by-side testing
 * (see apps/PxD/tools/camera-finder/README.md). The wire protocol below
 * (WebSocket + `{type:'mse', value: codecs}` handshake + binary MP4
 * fragments) matches go2rtc's own reference player (www/video-rtc.js,
 * MIT licensed) — this is a deliberately trimmed-down reimplementation
 * scoped to MSE only, so this file has no external/vendored dependency.
 *
 * MULTIPLE CAMERA PANES: to show more than one camera-view on a page, add
 * more than one `{ "type": "camera-view", "config": {...} }` entry to that
 * page's `panes` list in room.json — the page/pane framework itself gives
 * each entry its own independent instance (own state, own DOM). Width is
 * controlled by that pane entry's own `width` field (full/two-thirds/half/
 * third), same as every other pane type — this file does not manage width.
 *
 * Single pane config shape:
 *   {
 *     layout: 1-5,                 // number of camera slots
 *     sidebarPosition: "right",    // left|right|top|bottom (layout > 1 only)
 *     defaultViewMode: "multi",    // "multi" | "single" — initial view mode
 *     cameras: [ { id, label, wsUrl, main?: true, transform?: {...} } ]
 *   }
 *
 * Persistence tiers for camera URLs (lowest to highest precedence):
 *   1. room.json cameraView config's cameras[].wsUrl  — shipped default
 *   2. camera-view.local.json (optional, packaged)     — operator override,
 *      persists across page reloads AND repackages. Edit the room's
 *      pxd/camera-view.local.json source file (or the deployed copy) by
 *      hand: { "overrides": { "<camera-id>": "ws://...` } }
 *   3. sessionStorage (gear icon)                       — this browser tab's
 *      session only, cleared on close. NOT persisted anywhere durable.
 *
 * Preferred wsUrl form (works over LAN and Tailscale via nginx):
 *   "/go2rtc/api/ws?src=<stream>"   — path-absolute; resolved to
 *   ws(s)://<page-host>/go2rtc/... using window.location. Absolute
 *   ws://host:1984/... URLs still work for direct go2rtc access.
 *
 * The Single/Multi view-mode toggle in each pane's toolbar is runtime-only
 * (not persisted) — it always starts from `defaultViewMode` on page load.
 */
(function () {
    'use strict';

    var SESSION_KEY = 'pxd:cameraView:overrides';
    var NO_SIGNAL_RETRY_MS = 5000;

    // Reused verbatim from panels/widgets.js's gear icon for visual
    // consistency between the Prop/Puzzle panel and this one.
    /* eslint-disable max-len */
    var GEAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="16" height="16"><path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 14-7 29.5t-2 31.5q0 16 2 31.5t7 29.5l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"/></svg>';
    /* eslint-enable max-len */

    var NO_SIGNAL_SVG =
        '<svg viewBox="0 0 64 64" width="25%" height="25%" fill="none" stroke="#5a5a62" stroke-width="3">' +
        '<rect x="8" y="16" width="48" height="34" rx="4"/>' +
        '<path d="M24 50 L20 58 M40 50 L44 58 M20 58 L44 58"/>' +
        '<line x1="4" y1="4" x2="60" y2="60" stroke="#5a5a62" stroke-width="3"/>' +
        '</svg>';

    var _root = null;
    var _localOverrides = null; // parsed camera-view.local.json, shared by every instance
    var _localOverridesPromise = null;
    var _paneCounter = 0;       // ensures unique modal ids across instances

    // ── MSE mini-player (scoped-down go2rtc protocol client) ───────────────
    var CODEC_CANDIDATES = [
        'avc1.640029', 'avc1.64002A', 'avc1.640033', // H.264 high profiles
        'hvc1.1.6.L153.B0',                          // H.265 main
        'mp4a.40.2', 'mp4a.40.5',                    // AAC LC / HE
        'opus'
    ];

    function supportedCodecs(wantAudio) {
        return CODEC_CANDIDATES
            .filter(function (c) { return wantAudio || !/mp4a|opus/.test(c); })
            .filter(function (c) {
                try { return MediaSource.isTypeSupported('video/mp4; codecs="' + c + '"'); }
                catch (e) { return false; }
            })
            .join(',');
    }

    /**
     * Connect a <video> element to a go2rtc stream over MSE.
     * @param {HTMLVideoElement} videoEl
     * @param {string} wsUrl
     * @param {{ onStatus: function(('connecting'|'live'|'offline')) }} opts
     * @returns {{ disconnect: function(), refresh: function() }}
     */
    function connectMse(videoEl, wsUrl, opts) {
        var ws = null;
        var ms = null;
        var sb = null;
        var queue = [];
        var closedByUs = false;
        var retryTimer = null;
        var gotFrame = false;

        function status(s) { if (opts && opts.onStatus) opts.onStatus(s); }

        function flush() {
            if (!sb || sb.updating || !queue.length) return;
            try { sb.appendBuffer(queue.shift()); }
            catch (e) { /* ignore, will retry on next updateend */ }
        }

        function open() {
            status('connecting');
            sb = null;
            queue = [];
            ms = new MediaSource();
            videoEl.src = URL.createObjectURL(ms);

            ms.addEventListener('sourceopen', function () {
                ws = new WebSocket(wsUrl);
                ws.binaryType = 'arraybuffer';

                ws.addEventListener('open', function () {
                    ws.send(JSON.stringify({ type: 'mse', value: supportedCodecs(true) }));
                });

                ws.addEventListener('message', function (ev) {
                    if (typeof ev.data === 'string') {
                        var msg;
                        try { msg = JSON.parse(ev.data); } catch (e) { return; }
                        if (msg.type === 'mse' && !sb) {
                            try {
                                sb = ms.addSourceBuffer(msg.value);
                                sb.mode = 'segments';
                                sb.addEventListener('updateend', flush);
                            } catch (e) { console.error('[camera-view] addSourceBuffer failed', e); }
                        }
                    } else {
                        if (!gotFrame) { gotFrame = true; status('live'); videoEl.play().catch(function () {}); }
                        queue.push(ev.data);
                        flush();
                    }
                });

                ws.addEventListener('close', scheduleRetry);
                ws.addEventListener('error', scheduleRetry);
            }, { once: true });
        }

        function scheduleRetry() {
            if (closedByUs) return;
            gotFrame = false;
            status('offline');
            clearTimeout(retryTimer);
            retryTimer = setTimeout(open, NO_SIGNAL_RETRY_MS);
        }

        open();

        return {
            disconnect: function () {
                closedByUs = true;
                clearTimeout(retryTimer);
                if (ws) { try { ws.close(); } catch (e) {} }
                if (videoEl.src) { try { URL.revokeObjectURL(videoEl.src); } catch (e) {} }
                videoEl.removeAttribute('src');
                videoEl.load();
            },
            refresh: function () {
                if (ws) { try { ws.close(); } catch (e) {} }
                gotFrame = false;
                open();
            }
        };
    }

    // ── Orientation (rotate/flip) ───────────────────────────────────────────
    // cam.transform: { rotate: 0|90|180|270, flipH?: bool, flipV?: bool }.
    // Applied entirely in CSS/JS on the client — no transcoding in go2rtc.
    var ROTATE_VALUES = [0, 90, 180, 270];

    function applyTransform(wrap, inner, transform) {
        var rotate = ROTATE_VALUES.indexOf(transform && transform.rotate) !== -1 ? transform.rotate : 0;
        var scaleX = (transform && transform.flipH) ? -1 : 1;
        var scaleY = (transform && transform.flipV) ? -1 : 1;
        var swapped = (rotate === 90 || rotate === 270);

        inner.style.transform = 'translate(-50%, -50%) rotate(' + rotate + 'deg) scale(' + scaleX + ', ' + scaleY + ')';

        if (!swapped) return null; // default CSS sizing (100% x 100%) is already correct

        function resize() {
            var w = wrap.clientWidth, h = wrap.clientHeight;
            if (!w || !h) return; // not attached/laid out yet — nothing to measure
            inner.style.width = h + 'px';
            inner.style.height = w + 'px';
        }

        var ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(resize) : null;
        if (ro) ro.observe(wrap);
        window.addEventListener('resize', resize);

        return {
            initialResize: resize,
            dispose: function () {
                if (ro) ro.disconnect();
                window.removeEventListener('resize', resize);
            }
        };
    }

    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── One pane instance ────────────────────────────────────────────────
    function createPane(paneIndex, cfg) {
        var _paneEl = null;
        var _cameras = Array.isArray(cfg.cameras) ? cfg.cameras.slice(0, 5) : [];
        var _mainId = null;
        var _streams = {};

        // View mode (single/multi) is a runtime-only toggle, not persisted —
        // pane width itself is now controlled by the outer pane framework's
        // `width` field (full/two-thirds/half/third), same as every other
        // pane type, so camera-view no longer manages its own width toggle.
        var _viewMode = cfg.defaultViewMode || 'multi';

        function readSessionOverrides() {
            try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}'); }
            catch (e) { return {}; }
        }

        function writeSessionOverride(id, url) {
            var o = readSessionOverrides();
            o[id] = url;
            try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(o)); } catch (e) {}
        }

        function toWebsocketUrl(url) {
            if (!url) return url;
            // Path-absolute (e.g. /go2rtc/api/ws?src=...) → same host as the page
            // so Tailscale / LAN / hostname all work via the nginx proxy.
            if (url.charAt(0) === '/') {
                var proto = (window.location.protocol === 'https:') ? 'wss:' : 'ws:';
                return proto + '//' + window.location.host + url;
            }
            return url;
        }

        function resolveCameraUrl(cam) {
            var session = readSessionOverrides();
            if (session[cam.id]) return toWebsocketUrl(session[cam.id]);
            if (_localOverrides && _localOverrides.overrides && _localOverrides.overrides[cam.id]) {
                return toWebsocketUrl(_localOverrides.overrides[cam.id]);
            }
            return toWebsocketUrl(cam.wsUrl);
        }

        function cameraById(id) {
            for (var i = 0; i < _cameras.length; i++) if (_cameras[i].id === id) return _cameras[i];
            return null;
        }

        function buildViewTile(cam, isMain) {
            var tile = document.createElement('div');
            tile.className = 'cv-tile' + (isMain ? ' cv-tile-main' : ' cv-tile-thumb');
            tile.setAttribute('data-camera-id', cam.id);

            var videoWrap = document.createElement('div');
            videoWrap.className = 'cv-video-wrap';

            var inner = document.createElement('div');
            inner.className = 'cv-video-inner';
            videoWrap.appendChild(inner);

            var video = document.createElement('video');
            video.playsInline = true;
            // Both main and thumbnails start muted (browser autoplay policy +
            // only the main view should ever produce sound). Only the main
            // view's control bar exposes a mute toggle.
            video.muted = true;
            video.volume = 0.5;
            inner.appendChild(video);

            var transformHandle = applyTransform(videoWrap, inner, cam.transform);

            var noSignal = document.createElement('div');
            noSignal.className = 'cv-no-signal';
            noSignal.innerHTML = NO_SIGNAL_SVG;
            videoWrap.appendChild(noSignal);

            var label = document.createElement('div');
            label.className = 'cv-label';
            label.textContent = cam.label || cam.id;
            videoWrap.appendChild(label);

            tile.appendChild(videoWrap);

            if (!isMain) {
                tile.addEventListener('click', function () { swapToMain(cam.id); });
            } else {
                tile.appendChild(buildControlBar(cam, video));
            }

            var handle = connectMse(video, resolveCameraUrl(cam), {
                onStatus: function (s) { tile.classList.toggle('cv-offline', s !== 'live'); }
            });
            _streams[cam.id] = { handle: handle, video: video, transformHandle: transformHandle };

            return tile;
        }

        function buildControlBar(cam, video) {
            var bar = document.createElement('div');
            bar.className = 'cv-controls';

            var refreshBtn = document.createElement('button');
            refreshBtn.type = 'button';
            refreshBtn.className = 'btn btn-sm btn-outline-light cv-btn';
            refreshBtn.title = 'Refresh stream';
            refreshBtn.textContent = '\u21BB';
            refreshBtn.addEventListener('click', function () { _streams[cam.id].handle.refresh(); });

            var muteBtn = document.createElement('button');
            muteBtn.type = 'button';
            muteBtn.className = 'btn btn-sm btn-outline-light cv-btn cv-mute-btn';
            function renderMute() { muteBtn.textContent = video.muted ? '\uD83D\uDD07 Muted' : '\uD83D\uDD0A'; }
            renderMute();
            muteBtn.addEventListener('click', function () { video.muted = !video.muted; renderMute(); });

            var volume = document.createElement('input');
            volume.type = 'range';
            volume.min = '0'; volume.max = '100'; volume.value = '50';
            volume.className = 'form-range cv-volume';
            volume.addEventListener('input', function () { video.volume = Number(volume.value) / 100; });

            bar.appendChild(refreshBtn);
            bar.appendChild(muteBtn);
            bar.appendChild(volume);
            return bar;
        }

        function swapToMain(id) {
            if (id === _mainId) return;
            _mainId = id;
            render();
        }

        function setViewMode(m) {
            _viewMode = m;
            render();
        }

        function buildToolbar() {
            var toolbar = document.createElement('div');
            toolbar.className = 'cv-pane-toolbar';

            function buildToggle(labelA, valueA, labelB, valueB, current, onChange) {
                var grp = document.createElement('div');
                grp.className = 'btn-group btn-group-sm cv-toggle-group';
                [[labelA, valueA], [labelB, valueB]].forEach(function (pair) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'btn btn-outline-light' + (current === pair[1] ? ' active' : '');
                    btn.textContent = pair[0];
                    btn.addEventListener('click', function () { onChange(pair[1]); });
                    grp.appendChild(btn);
                });
                return grp;
            }

            toolbar.appendChild(buildToggle('Single', 'single', 'Multi', 'multi', _viewMode, setViewMode));

            var gearBtn = document.createElement('button');
            gearBtn.type = 'button';
            gearBtn.className = 'btn btn-sm btn-outline-light cv-gear-btn';
            gearBtn.title = 'Camera settings (this session only)';
            gearBtn.innerHTML = GEAR_SVG;
            gearBtn.addEventListener('click', function () { openSettingsModal(); });
            toolbar.appendChild(gearBtn);

            return toolbar;
        }

        function openSettingsModal() {
            var portal = document.getElementById('pxd-modals');
            if (!portal) return;
            var modalId = 'cvSettingsModal' + paneIndex;

            var rowsHtml = _cameras.map(function (c) {
                var current = resolveCameraUrl(c);
                return '<div class="mb-2">' +
                    '<label class="form-label small mb-1">' + escapeHtml(c.label || c.id) + '</label>' +
                    '<input type="text" class="form-control form-control-sm cv-url-input" data-camera-id="' + escapeHtml(c.id) + '" value="' + escapeHtml(current) + '">' +
                    '</div>';
            }).join('');

            portal.innerHTML =
                '<div class="modal fade" id="' + modalId + '" tabindex="-1">' +
                '<div class="modal-dialog"><div class="modal-content">' +
                '<div class="modal-header"><h5 class="modal-title">Camera settings (this session only)</h5>' +
                '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
                '<div class="modal-body">' +
                '<p class="small text-body-secondary">Changes here apply only to this browser tab and are lost on reload/close. For a durable change, edit <code>camera-view.local.json</code> or <code>room.json</code>.</p>' +
                rowsHtml +
                '</div>' +
                '<div class="modal-footer">' +
                '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
                '<button type="button" class="btn btn-primary" id="cvSettingsApply' + paneIndex + '">Apply</button>' +
                '</div></div></div></div>';

            var modalEl = document.getElementById(modalId);
            var modal = new bootstrap.Modal(modalEl);
            document.getElementById('cvSettingsApply' + paneIndex).addEventListener('click', function () {
                var inputs = portal.querySelectorAll('.cv-url-input');
                inputs.forEach(function (inp) {
                    var id = inp.getAttribute('data-camera-id');
                    var val = inp.value.trim();
                    if (val) writeSessionOverride(id, val);
                });
                modal.hide();
                render();
            });
            modal.show();
        }

        function teardownStreams() {
            Object.keys(_streams).forEach(function (id) {
                _streams[id].handle.disconnect();
                if (_streams[id].transformHandle) _streams[id].transformHandle.dispose();
            });
            _streams = {};
        }

        function render() {
            teardownStreams();
            _paneEl.innerHTML = '';
            // Add to (not replace) the outer pane wrapper's classes — it already
            // carries the framework's `pxd-pane pxd-w-<width>` grid classes.
            _paneEl.classList.add('panel', 'panel-camera-view');

            var header = document.createElement('div');
            header.className = 'panel-header panel-header-tight cv-pane-header';
            header.innerHTML = '<h2 class="panel-title">Cameras</h2>';
            header.appendChild(buildToolbar());
            _paneEl.appendChild(header);

            if (!_cameras.length) {
                var empty = document.createElement('div');
                empty.className = 'cv-empty';
                empty.textContent = 'No cameras configured.';
                _paneEl.appendChild(empty);
                return;
            }

            var mainCam = cameraById(_mainId) || _cameras[0];

            var wrap = document.createElement('div');
            wrap.className = 'cv-layout cv-sidebar-' + (cfg.sidebarPosition || 'right');

            var mainTile = buildViewTile(mainCam, true);
            mainTile.classList.add('cv-slot-main');
            wrap.appendChild(mainTile);

            if (_viewMode === 'multi' && _cameras.length > 1) {
                var sidebar = document.createElement('div');
                sidebar.className = 'cv-sidebar';
                _cameras.filter(function (c) { return c.id !== mainCam.id; }).forEach(function (c) {
                    sidebar.appendChild(buildViewTile(c, false));
                });
                wrap.appendChild(sidebar);
            } else {
                wrap.classList.add('cv-single-view');
            }

            _paneEl.appendChild(wrap);

            // Tiles with a 90/270 rotation need one measurement pass now that
            // they're actually attached to the document.
            Object.keys(_streams).forEach(function (id) {
                if (_streams[id].transformHandle) _streams[id].transformHandle.initialResize();
            });
        }

        return {
            mount: function (paneEl) {
                _paneEl = paneEl;
                var defaultMain = _cameras.filter(function (c) { return c.main; })[0];
                _mainId = (defaultMain || _cameras[0] || {}).id || null;
                render();
            },
            unmount: function () { teardownStreams(); }
        };
    }

    // ── panel.mount ────────────────────────────────────────────────────────
    // Each `{ "type": "camera-view", "config": {...} }` pane entry in a page's
    // `panes` list gets its own factory() call — the page/pane framework
    // itself now provides multi-instance support, so this file mounts exactly
    // one camera pane per call (no more internal pane-array loop).
    function fetchLocalOverridesOnce() {
        if (!_localOverridesPromise) {
            _localOverridesPromise = fetch('camera-view.local.json')
                .then(function (r) { return r.ok ? r.json() : null; })
                .catch(function () { return null; })
                .then(function (data) { _localOverrides = data; return data; });
        }
        return _localOverridesPromise;
    }

    function factory(config, ctx) {
        var paneIndex = _paneCounter++;
        var pane = createPane(paneIndex, config || {});
        return {
            mount: function (el) {
                _root = el;
                fetchLocalOverridesOnce().then(function () { pane.mount(el); });
            },
            unmount: function () { pane.unmount(); }
        };
    }

    PxD.panes.registerType('camera-view', factory);
})();
