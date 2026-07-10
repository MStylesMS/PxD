/**
 * panels/camera-view.js — Camera View Panel
 *
 * Embeds live go2rtc camera streams in the operator dashboard. Talks
 * directly to an existing go2rtc instance (this room's own, per
 * /opt/paradox/config/go2rtc.yaml + go2rtc.service) — this panel is a
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
 * Reads from: PxD.config.cameraView
 *   {
 *     layout: 1-5,                 // number of camera slots
 *     sidebarPosition: "right",    // left|right|top|bottom (layout > 1 only)
 *     cameras: [
 *       { id, label, wsUrl, main?: true }
 *     ]
 *   }
 *
 * Persistence tiers (lowest to highest precedence):
 *   1. room.json cameraView.cameras[].wsUrl         — shipped default
 *   2. camera-view.local.json (optional, packaged)  — operator override,
 *      persists across page reloads AND repackages. Edit the room's
 *      pxd/camera-view.local.json source file (or the deployed copy) by
 *      hand: { "overrides": { "<camera-id>": "ws://...` } }
 *   3. sessionStorage (gear icon)                   — this browser tab's
 *      session only, cleared on close. NOT persisted anywhere durable.
 */
(function () {
    'use strict';

    var SESSION_KEY = 'pxd:cameraView:overrides';
    var NO_SIGNAL_RETRY_MS = 5000;

    var _root = null;
    var _cfg = null;
    var _cameras = [];       // resolved camera list (after override merge)
    var _mainId = null;      // id of the camera currently in the main slot
    var _streams = {};       // id -> stream handle ({disconnect, setMuted, setVolume, refresh})
    var _localOverrides = null; // parsed camera-view.local.json, or null

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
     * @returns {{ disconnect: function() }}
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

    // ── No-signal icon (inline SVG, offline-safe, no CDN) ──────────────────
    var NO_SIGNAL_SVG =
        '<svg viewBox="0 0 64 64" width="25%" height="25%" fill="none" stroke="#5a5a62" stroke-width="3">' +
        '<rect x="8" y="16" width="48" height="34" rx="4"/>' +
        '<path d="M24 50 L20 58 M40 50 L44 58 M20 58 L44 58"/>' +
        '<line x1="4" y1="4" x2="60" y2="60" stroke="#5a5a62" stroke-width="3"/>' +
        '</svg>';

    // ── Config resolution ───────────────────────────────────────────────────
    function readSessionOverrides() {
        try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}'); }
        catch (e) { return {}; }
    }

    function writeSessionOverride(id, url) {
        var o = readSessionOverrides();
        o[id] = url;
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(o)); } catch (e) {}
    }

    function resolveCameraUrl(cam) {
        var session = readSessionOverrides();
        if (session[cam.id]) return session[cam.id];
        if (_localOverrides && _localOverrides.overrides && _localOverrides.overrides[cam.id]) {
            return _localOverrides.overrides[cam.id];
        }
        return cam.wsUrl;
    }

    // ── Rendering ───────────────────────────────────────────────────────────
    function cameraById(id) {
        for (var i = 0; i < _cameras.length; i++) if (_cameras[i].id === id) return _cameras[i];
        return null;
    }

    // ── Orientation (rotate/flip) ───────────────────────────────────────────
    // cam.transform: { rotate: 0|90|180|270, flipH?: bool, flipV?: bool }.
    // Applied entirely in CSS/JS on the client — no transcoding in go2rtc.
    // Rotation is done on an inner wrapper (not the <video> itself) so a
    // 90/270 rotation can swap its measured box to match the tile's aspect
    // ratio. Sizing that swap requires clientWidth/clientHeight, which are
    // only meaningful once the tile is attached to the document — callers
    // must invoke the returned `initialResize()` after that attach (see
    // render()). A ResizeObserver (plus a window-resize fallback, in case
    // ResizeObserver is unavailable or delayed) keeps it in sync afterward.
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

        var gearBtn = document.createElement('button');
        gearBtn.type = 'button';
        gearBtn.className = 'btn btn-sm btn-outline-light cv-btn';
        gearBtn.title = 'Camera settings (this session only)';
        gearBtn.textContent = '\u2699';
        gearBtn.addEventListener('click', function () { openSettingsModal(); });

        bar.appendChild(refreshBtn);
        bar.appendChild(muteBtn);
        bar.appendChild(volume);
        bar.appendChild(gearBtn);
        return bar;
    }

    function swapToMain(id) {
        if (id === _mainId) return;
        _mainId = id;
        render();
    }

    function render() {
        // Tear down existing streams before re-rendering
        Object.keys(_streams).forEach(function (id) {
            _streams[id].handle.disconnect();
            if (_streams[id].transformHandle) _streams[id].transformHandle.dispose();
        });
        _streams = {};

        _root.innerHTML = '';

        var wrap = document.createElement('div');
        wrap.className = 'cv-layout cv-sidebar-' + (_cfg.sidebarPosition || 'right');

        var mainCam = cameraById(_mainId) || _cameras[0];
        if (!mainCam) {
            _root.innerHTML = '<section class="panel panel-camera-view"><div class="panel-header panel-header-tight"><h2 class="panel-title">Cameras</h2></div><div class="cv-empty">No cameras configured.</div></section>';
            return;
        }

        var mainTile = buildViewTile(mainCam, true);
        mainTile.classList.add('cv-slot-main');
        wrap.appendChild(mainTile);

        if (_cameras.length > 1) {
            var sidebar = document.createElement('div');
            sidebar.className = 'cv-sidebar';
            _cameras.filter(function (c) { return c.id !== mainCam.id; }).forEach(function (c) {
                sidebar.appendChild(buildViewTile(c, false));
            });
            wrap.appendChild(sidebar);
        }

        var section = document.createElement('section');
        section.className = 'panel panel-camera-view';
        section.innerHTML = '<div class="panel-header panel-header-tight"><h2 class="panel-title">Cameras</h2></div>';
        section.appendChild(wrap);
        _root.appendChild(section);

        // Tiles with a 90/270 rotation need one measurement pass now that
        // they're actually attached to the document (clientWidth/Height are
        // meaningless before this point — see applyTransform()).
        Object.keys(_streams).forEach(function (id) {
            if (_streams[id].transformHandle) _streams[id].transformHandle.initialResize();
        });
    }

    // ── Settings modal (gear icon — session-only overrides) ────────────────
    function openSettingsModal() {
        var portal = document.getElementById('pxd-modals');
        if (!portal) return;

        var rowsHtml = _cameras.map(function (c) {
            var current = resolveCameraUrl(c);
            return '<div class="mb-2">' +
                '<label class="form-label small mb-1">' + escapeHtml(c.label || c.id) + '</label>' +
                '<input type="text" class="form-control form-control-sm cv-url-input" data-camera-id="' + escapeHtml(c.id) + '" value="' + escapeHtml(current) + '">' +
                '</div>';
        }).join('');

        portal.innerHTML =
            '<div class="modal fade" id="cvSettingsModal" tabindex="-1">' +
            '<div class="modal-dialog"><div class="modal-content">' +
            '<div class="modal-header"><h5 class="modal-title">Camera settings (this session only)</h5>' +
            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
            '<div class="modal-body">' +
            '<p class="small text-body-secondary">Changes here apply only to this browser tab and are lost on reload/close. For a durable change, edit <code>camera-view.local.json</code> or <code>room.json</code>.</p>' +
            rowsHtml +
            '</div>' +
            '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
            '<button type="button" class="btn btn-primary" id="cvSettingsApply">Apply</button>' +
            '</div></div></div></div>';

        var modalEl = document.getElementById('cvSettingsModal');
        var modal = new bootstrap.Modal(modalEl);
        document.getElementById('cvSettingsApply').addEventListener('click', function () {
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

    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── panel.mount ────────────────────────────────────────────────────────
    function mount(slotEl) {
        _root = slotEl;
        _cfg = (PxD.config && PxD.config.cameraView) || {};
        _cameras = Array.isArray(_cfg.cameras) ? _cfg.cameras.slice(0, 5) : [];

        if (!_cameras.length) { _root.innerHTML = ''; return; } // hide if unconfigured

        var defaultMain = _cameras.filter(function (c) { return c.main; })[0];
        _mainId = (defaultMain || _cameras[0]).id;

        fetch('camera-view.local.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; })
            .then(function (data) {
                _localOverrides = data;
                render();
            });
    }

    function unmount() {
        Object.keys(_streams).forEach(function (id) {
            _streams[id].handle.disconnect();
            if (_streams[id].transformHandle) _streams[id].transformHandle.dispose();
        });
        _streams = {};
        if (_root) _root.innerHTML = '';
    }

    PxD.panels.register('camera-view', { mount: mount, unmount: unmount });
})();
