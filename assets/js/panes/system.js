/**
 * panels/system.js — System Warnings Panel
 *
 * Responsibilities:
 *  - Scrollable warnings log (from MQTT warning topics)
 *  - Zone heartbeat status bar (per room.json → system.watchZones)
 *  - Auto-expires warnings older than 10 minutes
 *
 * Reads from: PxD.config.system
 * Subscribes to: system.warningTopics[], each watchZone.topic
 */
(function () {
    'use strict';

    var _config = null;
    var _topicRoot = '';
    var _root = null;

    var _warnings = [];           // [{ msg, ts }]
    var _zoneLastSeen = {};       // zoneId → timestamp
    var _zoneTimers = {};         // zoneId → setInterval id
    var _cleanupTimer = null;

    // ── Helpers ────────────────────────────────────────────────────────────
    function topic(suffix, override) {
        return override || (_topicRoot + '/' + suffix);
    }

    // ── Warnings ───────────────────────────────────────────────────────────
    function addWarning(msg) {
        var now = Date.now();
        _warnings.push({ msg: msg, ts: now });
        if (_warnings.length > 200) _warnings = _warnings.slice(-200);
        renderWarnings();
    }

    function expireWarnings() {
        var cutoff = Date.now() - 600000; // 10 minutes
        _warnings = _warnings.filter(function (w) { return w.ts > cutoff; });
        renderWarnings();
    }

    function formatTimePrefix() {
        // Use game state time if available (set by game-control panel via shared state)
        return '';
    }

    function renderWarnings() {
        var box = _root && _root.querySelector('#pageWarnings');
        if (!box) return;
        var active = _warnings.filter(function (w) { return (Date.now() - w.ts) < 600000; });
        if (active.length === 0) {
            box.innerHTML = '<div class="text-muted">No warnings</div>';
            box.style.backgroundColor = '';
            box.style.color = '';
        } else {
            box.innerHTML = active.map(function (w) { return '<div>' + w.msg + '</div>'; }).join('');
            box.style.backgroundColor = (getComputedStyle(document.documentElement).getPropertyValue('--pxd-warnings-active-bg').trim() || '#fff3b0');
            box.style.color = (getComputedStyle(document.documentElement).getPropertyValue('--pxd-warnings-active-ink').trim() || '#222');
        }
    }

    // ── Zone heartbeat rendering ───────────────────────────────────────────
    function renderZoneStatus(zoneId, label, isUp) {
        var bar = _root && _root.querySelector('#pfxWarnings');
        if (!bar) return;
        var el = bar.querySelector('[data-zone="' + zoneId + '"]');
        if (!el) return;

        if (isUp) {
            el.style.color = (getComputedStyle(document.documentElement).getPropertyValue('--pxd-zone-up').trim() || '#321111');
            el.style.fontWeight = '600';
            el.textContent = label + ' Connected';
        } else {
            el.style.color = (getComputedStyle(document.documentElement).getPropertyValue('--pxd-zone-down').trim() || '#ffff00');
            el.style.fontWeight = '700';
            el.textContent = label + ' Disconnected';
        }
    }

    // ── Build warning handler for a topic pattern ──────────────────────────
    function makeWarningHandler(timePrefix) {
        return function (payload) {
            var messages = [];
            if (Array.isArray(payload)) {
                payload.forEach(function (p) {
                    if (p && p.message) messages.push(p.message);
                    else if (p && p.data && p.data.message) messages.push(p.data.message);
                    else if (p && p.warning) messages.push(p.warning);
                    else messages.push(JSON.stringify(p));
                });
            } else if (payload && typeof payload === 'object') {
                if (payload.message) messages.push(payload.message);
                else if (payload.data && payload.data.message) messages.push(payload.data.message);
                else if (payload.warning) messages.push(payload.warning);
                else messages.push(JSON.stringify(payload));
            } else if (typeof payload === 'string') {
                messages.push(payload);
            }
            messages.forEach(function (m) { addWarning(m); });
        };
    }

    // ── Build heartbeat handler for a watch zone ───────────────────────────
    function makeZoneHandler(zone) {
        return function (payload) {
            _zoneLastSeen[zone.id] = Date.now();
            renderZoneStatus(zone.id, zone.label, true);
        };
    }

    // ── Build warning bar HTML ─────────────────────────────────────────────
    function buildZoneBadges(watchZones) {
        return watchZones.map(function (z) {
            return '<span data-zone="' + z.id + '" style="color:var(--pxd-zone-down, #ffff00);font-weight:700;">' + z.label + ' \u2717</span>';
        }).join('');
    }

    // ── HTML template ──────────────────────────────────────────────────────
    function buildHTML(watchZones) {
        return '<section class="panel panel-system">' +
            '<div class="panel-header panel-header-tight">' +
                '<h2 class="panel-title">System Warnings</h2>' +
            '</div>' +
            '<div class="page-warnings" id="pageWarnings" role="status" aria-live="polite">' +
                '<div class="text-muted">No warnings</div>' +
            '</div>' +
            '<div id="pfxWarnings" class="pfx-warning-bar">' +
                buildZoneBadges(watchZones) +
            '</div>' +
        '</section>';
    }

    // ── panel.mount ────────────────────────────────────────────────────────
    function mount(slotEl) {
        var cfg = PxD.config;
        _config = cfg.system || {};
        _topicRoot = cfg.topicRoot || '';

        var watchZones = _config.watchZones || [];
        _root = slotEl;
        slotEl.innerHTML = buildHTML(watchZones);

        // Subscribe to warning topics
        var warnTopics = _config.warningTopics || [
            _topicRoot + '/warnings',
            _topicRoot + '/+/warnings',
            'paradox/+/system/alerts'
        ];
        var handler = makeWarningHandler();
        warnTopics.forEach(function (t) {
            PxD.mqtt.subscribe(t, handler);
        });

        // Subscribe to each watch zone topic and start heartbeat timer
        watchZones.forEach(function (zone) {
            _zoneLastSeen[zone.id] = 0;
            PxD.mqtt.subscribe(zone.topic, makeZoneHandler(zone));

            // Heartbeat watchdog for this zone
            var timeoutMs = zone.timeoutMs || 15000;
            _zoneTimers[zone.id] = setInterval(function () {
                var seen = _zoneLastSeen[zone.id];
                var isUp = seen > 0 && (Date.now() - seen) < timeoutMs;
                renderZoneStatus(zone.id, zone.label, isUp);
            }, 1000);
        });

        // Periodic warning expiry
        _cleanupTimer = setInterval(expireWarnings, 60000);
    }

    function unmount() {
        Object.keys(_zoneTimers).forEach(function (id) { clearInterval(_zoneTimers[id]); });
        clearInterval(_cleanupTimer);
        _zoneTimers = {};
    }

    PxD.panes.registerType('system', function factory(config, ctx) {
        return { mount: mount, unmount: unmount };
    });
})();
