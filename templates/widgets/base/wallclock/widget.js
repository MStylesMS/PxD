/**
 * wallclock — px-clock-esp8266 prop monitor
 * Size (Quarter / Third / Half) chosen from the ⋯ menu dropdown.
 */
(function () {

    const CONFIG = {
        STATE_TOPIC:          'REPLACE/WITH/YOUR/wallclock/state',
        COMMAND_TOPIC:        'REPLACE/WITH/YOUR/wallclock/commands',
        PROP_UI_URL:          '/props/wallclock/',
        SIZE:                 '3x1',
        DEFAULT_VARIANT:      null,
        INTERACTIVE:          false,
        HEARTBEAT_TIMEOUT_MS: 15000,
        BAR_SEGMENTS:         8,
    };

    const VARIANTS = {
        quarter: { label: 'Quarter', size: '3x1' },
        third:   { label: 'Third',   size: '4x1' },
        half:    { label: 'Half',    size: '2x1' },
    };

    let _rootEl = null;
    let _cardEl = null;
    let _widgetId = 'wallclock';
    let _variantKey = 'quarter';
    let _timeEl = null;
    let _secsEl = null;
    let _stateEl = null;
    let _topBarEl = null;
    let _botBarEl = null;
    let _stateSub = null;

    let _last = {
        remainingTime: '--:--',
        remainingS: null,
        clockState: '--',
        topCount: 0,
        bottomCount: 0,
    };

    function variantStorageKey() {
        return 'pxd-wallclock-variant:' + _widgetId;
    }

    function defaultVariantKey() {
        if (CONFIG.DEFAULT_VARIANT && VARIANTS[CONFIG.DEFAULT_VARIANT]) {
            return CONFIG.DEFAULT_VARIANT;
        }
        return 'quarter';
    }

    function readStoredVariant() {
        try {
            const v = sessionStorage.getItem(variantStorageKey());
            if (v && VARIANTS[v]) return v;
        } catch (e) { /* ignore */ }
        return null;
    }

    function renderBar(container, count, max) {
        if (!container) return;
        container.innerHTML = '';
        const n = Math.max(0, Math.min(max, parseInt(count, 10) || 0));
        for (let i = 0; i < max; i++) {
            const seg = document.createElement('span');
            seg.className = 'wd-wallclock-seg' + (i < n ? ' wd-wallclock-seg-on' : '');
            container.appendChild(seg);
        }
    }

    function render() {
        if (_timeEl) _timeEl.textContent = _last.remainingTime || '--:--';
        if (_secsEl) {
            _secsEl.textContent = (_last.remainingS != null && !isNaN(_last.remainingS))
                ? (_last.remainingS + ' s')
                : '-- s';
        }
        if (_stateEl) _stateEl.textContent = _last.clockState || '--';
        renderBar(_topBarEl, _last.topCount, CONFIG.BAR_SEGMENTS);
        renderBar(_botBarEl, _last.bottomCount, CONFIG.BAR_SEGMENTS);
    }

    function onMessage(payload) {
        if (!payload || typeof payload !== 'object') return;
        const clock = payload.clock || {};
        const leds = payload.leds || {};
        const disp = payload.display || {};
        _last.remainingTime = clock.remaining_time || disp.showing || '--:--';
        _last.remainingS = clock.remaining_s != null ? clock.remaining_s : null;
        _last.clockState = clock.state || payload.status || '--';
        _last.topCount = leds.top_count != null ? leds.top_count : 0;
        _last.bottomCount = leds.bottom_count != null ? leds.bottom_count : 0;
        render();
    }

    function bindElements() {
        if (!_rootEl) return;
        _timeEl = _rootEl.querySelector('.wd-wallclock-time');
        _secsEl = _rootEl.querySelector('.wd-wallclock-secs');
        _stateEl = _rootEl.querySelector('.wd-wallclock-state');
        _topBarEl = _rootEl.querySelector('[data-bar="top"]');
        _botBarEl = _rootEl.querySelector('[data-bar="bottom"]');
    }

    function mountInnerHtml() {
        if (!_rootEl) return;
        _rootEl.innerHTML =
            '<div class="wd-wallclock-wrap">' +
            '  <div class="wd-wallclock-head">' +
            '    <span class="wd-wallclock-time"></span>' +
            '    <span class="wd-wallclock-state"></span>' +
            '  </div>' +
            '  <div class="wd-wallclock-secs"></div>' +
            '  <div class="wd-wallclock-bars">' +
            '    <div class="wd-wallclock-bar-row"><span class="wd-wallclock-bar" data-bar="top"></span></div>' +
            '    <div class="wd-wallclock-bar-row"><span class="wd-wallclock-bar" data-bar="bottom"></span></div>' +
            '  </div>' +
            '</div>';
        bindElements();
        render();
    }

    function applyVariant(key, persist) {
        const v = VARIANTS[key] || VARIANTS.quarter;
        _variantKey = key;
        if (persist) {
            try { sessionStorage.setItem(variantStorageKey(), key); } catch (e) { /* ignore */ }
        }
        if (_cardEl) _cardEl.setAttribute('data-size', v.size);
    }

    function buildMenuItems() {
        const items = [
            {
                type: 'select',
                label: 'Display',
                value: _variantKey,
                options: Object.keys(VARIANTS).map(function (k) {
                    return { value: k, label: VARIANTS[k].label };
                }),
                onChange: function (value) {
                    applyVariant(value, true);
                },
            },
            { type: 'sep' },
            { label: 'Identify', publish: { command: 'identify' } },
        ];
        if (CONFIG.PROP_UI_URL) {
            items.push({ type: 'sep' });
            items.push({ label: 'Open Prop UI', href: CONFIG.PROP_UI_URL });
        }
        return items;
    }

    PxD.widgets.register({
        size: CONFIG.SIZE,
        interactive: CONFIG.INTERACTIVE,
        commandTopic: CONFIG.COMMAND_TOPIC,
        heartbeatTimeoutMs: CONFIG.HEARTBEAT_TIMEOUT_MS,
        menuItems: buildMenuItems,
        mount: function (bodyEl) {
            _cardEl = bodyEl.closest('.widget-card');
            _widgetId = (_cardEl && _cardEl.getAttribute('data-widget-id')) || 'wallclock';
            bodyEl.classList.add('wd-wallclock');
            _rootEl = bodyEl;

            const initial = readStoredVariant() || defaultVariantKey();
            applyVariant(initial, false);
            mountInnerHtml();

            _stateSub = onMessage;
            PxD.mqtt.subscribe(CONFIG.STATE_TOPIC, _stateSub);
        },
        unmount: function () {
            if (_stateSub) {
                PxD.mqtt.unsubscribe(CONFIG.STATE_TOPIC, _stateSub);
                _stateSub = null;
            }
            _rootEl = null;
            _cardEl = null;
        },
    });

})();
