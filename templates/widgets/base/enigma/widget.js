/**
 * enigma — Px-Enigma prop monitor
 * Variant (Quarter / Third / grids) chosen from the ⋯ menu dropdown.
 */
(function () {

    const CONFIG = {
        STATE_TOPIC:          'REPLACE/WITH/YOUR/enigma/state',
        COMMAND_TOPIC:        'REPLACE/WITH/YOUR/enigma/commands',
        PROP_UI_URL:          '/props/enigma/',
        LABEL:                'ENIGMA',
        SIZE:                 '3x1',
        DEFAULT_VARIANT:      null,
        SWITCH_COUNT:         20,
        INTERACTIVE:          false,
        HEARTBEAT_TIMEOUT_MS: 15000,
    };

    const VARIANTS = {
        quarter:      { label: 'Quarter',      size: '3x1', layout: 'compact' },
        third:        { label: 'Third',        size: '4x1', layout: 'compact' },
        'quarter-grid': { label: 'Quarter Grid', size: '3x2', layout: 'compact-grid' },
        'third-grid':   { label: 'Third Grid',   size: '4x2', layout: 'compact-grid' },
        'half-grid':    { label: 'Half Grid',    size: '2x2', layout: 'half-grid' },
    };

    let _rootEl = null;
    let _cardEl = null;
    let _widgetId = 'enigma';
    let _variantKey = 'quarter';
    let _tgtEl = null;
    let _curEl = null;
    let _modeEl = null;
    let _battEl = null;
    let _solvedEl = null;
    let _gridEl = null;
    let _layoutMode = 'compact';
    let _stateSub = null;

    let _last = {
        target: null,
        code: null,
        solved: false,
        puzzleMode: null,
        grid: null,
        targetGrid: null,
        battery: {},
    };

    function variantStorageKey() {
        return 'pxd-enigma-variant:' + _widgetId;
    }

    function defaultVariantKey() {
        if (CONFIG.DEFAULT_VARIANT && VARIANTS[CONFIG.DEFAULT_VARIANT]) {
            return CONFIG.DEFAULT_VARIANT;
        }
        if (_widgetId === 'enigma-live') return 'half-grid';
        return 'quarter';
    }

    function readStoredVariant() {
        try {
            const v = sessionStorage.getItem(variantStorageKey());
            if (v && VARIANTS[v]) return v;
        } catch (e) { /* ignore */ }
        return null;
    }

    function showsGrid(mode) {
        return mode === 'compact-grid' || mode === 'half-grid';
    }

    function parseTargetInput(raw) {
        if (!raw || raw === '--') return null;
        const digits = String(raw).replace(/[^0-9]/g, '');
        if (digits.length === 0) return null;
        if (digits.length > 6) return false;
        const padded = digits.padStart(6, '0');
        return padded.slice(0, 2) + '-' + padded.slice(2, 4) + '-' + padded.slice(4, 6);
    }

    function formatCode(val) {
        if (val == null || val === '') return '--';
        return String(val);
    }

    function puzzleModeLabel(mode) {
        const m = String(mode || '').toLowerCase();
        if (m === 'latching') return 'Latch';
        if (m === 'live') return 'Live';
        return m ? m.charAt(0).toUpperCase() + m.slice(1) : '--';
    }

    function batteryColor(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'low') return 'var(--pxd-battery-low)';
        if (s === 'critical') return 'var(--pxd-battery-critical)';
        if (s === 'external') return 'var(--pxd-battery-external)';
        if (s === 'ok') return 'var(--pxd-battery-ok)';
        return 'var(--pxd-ink-soft)';
    }

    function batteryWarnIcon(show) {
        if (!show) return '';
        return '<svg class="wd-enigma-batt-warn" viewBox="0 0 16 16" aria-hidden="true">' +
            '<path fill="currentColor" d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>';
    }

    function batteryGlyph(status, pct) {
        const s = String(status || '').toLowerCase();
        const col = batteryColor(status);
        if (s === 'external') {
            return batteryWarnIcon(false) +
                '<svg class="wd-enigma-batt" viewBox="0 0 24 24" aria-label="External power">' +
                '<path fill="' + col + '" d="M16 7h1v10h-1V7zm-3-2h4v2h-4V5zM6 9h2v6H6V9zm8 0h2v6h-2V9z"/></svg>';
        }
        const warn = s === 'low' || s === 'critical';
        const fillPct = (pct != null && !isNaN(pct)) ? Math.max(0, Math.min(100, pct)) : null;
        const segments = 4;
        let segHtml = '';
        if (fillPct != null && (s === 'ok' || s === 'low' || s === 'critical')) {
            const filled = Math.round((fillPct / 100) * segments);
            for (let i = 0; i < segments; i++) {
                const on = i < filled;
                segHtml += '<rect class="wd-enigma-batt-seg' + (on ? ' wd-enigma-batt-seg-on' : '') + '" x="' +
                    (5 + i * 2.8) + '" y="9" width="2.2" height="6" rx="0.4" fill="' +
                    (on ? col : 'transparent') + '" stroke="' + col + '" stroke-width="0.6"/>';
            }
        }
        return batteryWarnIcon(warn) +
            '<svg class="wd-enigma-batt" viewBox="0 0 24 24" aria-hidden="true">' +
            '<rect x="4" y="7" width="14" height="10" rx="1.5" fill="none" stroke="' + col + '" stroke-width="1.5"/>' +
            '<rect x="18" y="10" width="2" height="4" rx="0.5" fill="' + col + '"/>' +
            segHtml +
            '</svg>' +
            (fillPct != null && s !== 'unknown' ? '<span class="wd-enigma-batt-pct">' + Math.round(fillPct) + '%</span>' : '');
    }

    function renderGrid(grid, targetGrid) {
        if (!_gridEl) return;
        _gridEl.innerHTML = '';
        const rows = Array.isArray(grid) ? grid : [];
        const tgtRows = Array.isArray(targetGrid) ? targetGrid : null;
        if (!rows.length) {
            _gridEl.classList.add('wd-enigma-grid-empty');
            return;
        }
        _gridEl.classList.remove('wd-enigma-grid-empty');
        let maxCols = 0;
        let swNum = 0;
        rows.forEach(function (rowStr, r) {
            maxCols = Math.max(maxCols, rowStr.length);
            const tgtRow = tgtRows ? (tgtRows[r] || '') : '';
            for (let c = 0; c < rowStr.length; c++) {
                const ch = rowStr[c];
                const tgtCh = tgtRow[c];
                if (ch === '-') continue;
                swNum += 1;
                if (swNum > CONFIG.SWITCH_COUNT) continue;
                const cell = document.createElement('div');
                cell.className = 'wd-enigma-cell';
                cell.textContent = String(swNum);
                if (ch === '1') cell.classList.add('wd-enigma-on');
                if (tgtCh === '1') cell.classList.add('wd-enigma-target');
                _gridEl.appendChild(cell);
            }
        });
        if (maxCols > 0) {
            _gridEl.style.gridTemplateColumns = 'repeat(' + maxCols + ', minmax(0, 1fr))';
        }
    }

    function render() {
        const hasTarget = _last.target != null && _last.target !== '';
        if (_tgtEl) {
            _tgtEl.textContent = hasTarget ? formatCode(_last.target) : '--';
            _tgtEl.classList.toggle('wd-enigma-missing', !hasTarget);
        }
        if (_curEl) {
            _curEl.textContent = formatCode(_last.code);
            _curEl.classList.toggle('wd-enigma-solved-code', !!_last.solved);
        }
        if (_modeEl) {
            _modeEl.textContent = puzzleModeLabel(_last.puzzleMode);
        }
        if (_solvedEl) {
            _solvedEl.hidden = !_last.solved;
        }
        if (_battEl) {
            const b = _last.battery || {};
            _battEl.innerHTML = batteryGlyph(b.status, b.percent);
            _battEl.setAttribute('data-status', b.status || 'unknown');
        }
        if (showsGrid(_layoutMode)) {
            renderGrid(_last.grid, _last.targetGrid);
        }
    }

    function onMessage(payload) {
        if (!payload || typeof payload !== 'object') return;
        const code = payload.code || {};
        const puzzle = payload.puzzle || {};
        _last.target = code.target;
        _last.code = code.code;
        _last.solved = !!code.solved;
        _last.puzzleMode = puzzle.mode;
        _last.grid = code.grid;
        _last.targetGrid = code.target_grid != null ? code.target_grid : code.targetGrid;
        _last.battery = payload.battery || {};
        render();
    }

    function headerBlock() {
        return '<div class="wd-enigma-header">' +
            '  <div class="wd-enigma-row"><span class="wd-enigma-lbl">TGT</span><span class="wd-enigma-val wd-enigma-target"></span></div>' +
            '  <div class="wd-enigma-row wd-enigma-cur-row">' +
            '    <span class="wd-enigma-lbl">CUR</span><span class="wd-enigma-val wd-enigma-current"></span>' +
            '    <span class="wd-enigma-solved" hidden>SOLVED</span>' +
            '  </div>' +
            '  <div class="wd-enigma-meta">' +
            '    <span class="wd-enigma-mode"></span>' +
            '    <span class="wd-enigma-batt-wrap"></span>' +
            '  </div>' +
            '</div>';
    }

    function buildInnerHtml(mode) {
        const gridHtml = showsGrid(mode) ? '<div class="wd-enigma-grid"></div>' : '';
        if (mode === 'half-grid') {
            return '<div class="wd-enigma-wrap wd-enigma-compact wd-enigma-layout-half-grid">' +
                headerBlock() + gridHtml + '</div>';
        }
        if (mode === 'compact-grid') {
            return '<div class="wd-enigma-wrap wd-enigma-compact wd-enigma-layout-compact-grid">' +
                headerBlock() + gridHtml + '</div>';
        }
        return '<div class="wd-enigma-wrap wd-enigma-compact wd-enigma-layout-compact">' + headerBlock() + '</div>';
    }

    function bindElements() {
        if (!_rootEl) return;
        _tgtEl = _rootEl.querySelector('.wd-enigma-target');
        _curEl = _rootEl.querySelector('.wd-enigma-current');
        _modeEl = _rootEl.querySelector('.wd-enigma-mode');
        _battEl = _rootEl.querySelector('.wd-enigma-batt-wrap');
        _solvedEl = _rootEl.querySelector('.wd-enigma-solved');
        _gridEl = _rootEl.querySelector('.wd-enigma-grid');
    }

    function applyLayoutClasses(mode) {
        if (!_rootEl) return;
        _rootEl.classList.toggle('wd-enigma-has-grid', showsGrid(mode));
    }

    function applyVariant(key, persist) {
        const v = VARIANTS[key] || VARIANTS.quarter;
        _variantKey = key;
        _layoutMode = v.layout;
        if (persist) {
            try { sessionStorage.setItem(variantStorageKey(), key); } catch (e) { /* ignore */ }
        }
        if (_cardEl) _cardEl.setAttribute('data-size', v.size);
        if (!_rootEl) return;
        _rootEl.innerHTML = buildInnerHtml(v.layout);
        applyLayoutClasses(v.layout);
        bindElements();
        render();
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
            {
                type: 'input',
                label: 'Set target',
                placeholder: '12-34-56 or blank',
                buttonLabel: 'Apply',
                onSubmit: function (value, close) {
                    const parsed = parseTargetInput(value);
                    if (parsed === false) {
                        window.alert('Enter up to 6 digits (e.g. 12-34-56) or leave blank to clear.');
                        return;
                    }
                    close();
                    PxD.mqtt.publish(CONFIG.COMMAND_TOPIC, {
                        command: 'setTarget',
                        target: parsed,
                    });
                },
            },
            {
                label: 'Sleep',
                confirm: 'Put this Enigma prop into deep sleep? Wake requires a power cycle.',
                publish: { command: 'sleep' },
            },
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
            _widgetId = (_cardEl && _cardEl.getAttribute('data-widget-id')) || 'enigma';
            bodyEl.classList.add('wd-enigma');

            const initial = readStoredVariant() || defaultVariantKey();
            _rootEl = bodyEl;
            applyVariant(initial, false);

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
