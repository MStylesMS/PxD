/**
 * enigma — Px-Enigma prop monitor (compact 1×1 / 2×1 or full 2×2 grid)
 * MQTT state only. Default heartbeat 15 s (10 s publish interval + margin).
 */
(function () {

    const CONFIG = {
        STATE_TOPIC:          'REPLACE/WITH/YOUR/enigma/state',
        COMMAND_TOPIC:        'REPLACE/WITH/YOUR/enigma/commands',
        PROP_UI_URL:          '/props/enigma/',
        LABEL:                'ENIGMA',
        /** '1x1' | '2x1' (compact) | '2x2' (full grid) */
        SIZE:                 '2x1',
        INTERACTIVE:          false,
        HEARTBEAT_TIMEOUT_MS: 15000,
    };

    const IS_FULL = CONFIG.SIZE === '2x2';

    let _rootEl = null;
    let _tgtEl = null;
    let _curEl = null;
    let _battEl = null;
    let _solvedEl = null;
    let _gridEl = null;
    let _stateSub = null;

    let _last = {
        target: null,
        code: null,
        solved: false,
        grid: null,
        targetGrid: null,
        battery: {},
    };

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
            return '<svg class="wd-enigma-batt" viewBox="0 0 24 24" aria-label="External power">' +
                '<path fill="' + col + '" d="M16 7h1v10h-1V7zm-3-2h4v2h-4V5zM6 9h2v6H6V9zm8 0h2v6h-2V9z"/></svg>';
        }
        const warn = s === 'low' || s === 'critical';
        const fillPct = (pct != null && !isNaN(pct)) ? Math.max(0, Math.min(100, pct)) : 0;
        const showFill = s === 'ok' || s === 'low' || s === 'critical';
        const innerH = showFill ? (fillPct * 0.09).toFixed(2) : 0;
        return batteryWarnIcon(warn) +
            '<svg class="wd-enigma-batt" viewBox="0 0 24 24" aria-hidden="true">' +
            '<rect x="4" y="7" width="14" height="10" rx="1.5" fill="none" stroke="' + col + '" stroke-width="1.5"/>' +
            '<rect x="18" y="10" width="2" height="4" rx="0.5" fill="' + col + '"/>' +
            (showFill ? '<rect x="5.5" y="14" width="11" height="' + innerH + '" fill="' + col + '"/>' : '') +
            '</svg>' +
            (pct != null && s !== 'unknown' ? '<span class="wd-enigma-batt-pct">' + Math.round(pct) + '%</span>' : '');
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
        rows.forEach(function (rowStr, r) {
            maxCols = Math.max(maxCols, rowStr.length);
            const tgtRow = tgtRows ? (tgtRows[r] || '') : '';
            for (let c = 0; c < rowStr.length; c++) {
                const ch = rowStr[c];
                const tgtCh = tgtRow[c];
                if (ch === '-') continue;
                const cell = document.createElement('div');
                cell.className = 'wd-enigma-cell';
                if (ch === '1') cell.classList.add('wd-enigma-on');
                if (tgtCh === '1') cell.classList.add('wd-enigma-target');
                _gridEl.appendChild(cell);
            }
        });
        if (maxCols > 0) {
            _gridEl.style.gridTemplateColumns = 'repeat(' + maxCols + ', 1fr)';
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
        }
        if (_solvedEl) {
            _solvedEl.hidden = !_last.solved;
        }
        if (_battEl) {
            const b = _last.battery || {};
            _battEl.innerHTML = batteryGlyph(b.status, b.percent);
            _battEl.setAttribute('data-status', b.status || 'unknown');
        }
        if (IS_FULL) {
            renderGrid(_last.grid, _last.targetGrid);
        }
    }

    function onMessage(payload) {
        if (!payload || typeof payload !== 'object') return;
        const code = payload.code || {};
        _last.target = code.target;
        _last.code = code.code;
        _last.solved = !!code.solved;
        _last.grid = code.grid;
        _last.targetGrid = code.target_grid != null ? code.target_grid : code.targetGrid;
        _last.battery = payload.battery || {};
        render();
    }

    function buildMenuItems() {
        const items = [
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
        menuItems: buildMenuItems(),
        mount: function (bodyEl) {
            bodyEl.classList.add('wd-enigma');
            bodyEl.classList.toggle('wd-enigma-full', IS_FULL);

            const html = IS_FULL
                ? '<div class="wd-enigma-wrap">' +
                  '  <div class="wd-enigma-header">' +
                  '    <div class="wd-enigma-row"><span class="wd-enigma-lbl">TGT</span><span class="wd-enigma-val wd-enigma-target"></span></div>' +
                  '    <div class="wd-enigma-row"><span class="wd-enigma-lbl">CUR</span><span class="wd-enigma-val wd-enigma-current"></span></div>' +
                  '    <div class="wd-enigma-meta">' +
                  '      <span class="wd-enigma-solved" hidden>SOLVED</span>' +
                  '      <span class="wd-enigma-batt-wrap"></span>' +
                  '    </div>' +
                  '  </div>' +
                  '  <div class="wd-enigma-grid"></div>' +
                  '</div>'
                : '<div class="wd-enigma-wrap wd-enigma-compact">' +
                  '  <div class="wd-enigma-row"><span class="wd-enigma-lbl">TGT</span><span class="wd-enigma-val wd-enigma-target"></span></div>' +
                  '  <div class="wd-enigma-row"><span class="wd-enigma-lbl">CUR</span><span class="wd-enigma-val wd-enigma-current"></span></div>' +
                  '  <div class="wd-enigma-meta">' +
                  '    <span class="wd-enigma-solved" hidden>SOLVED</span>' +
                  '    <span class="wd-enigma-batt-wrap"></span>' +
                  '  </div>' +
                  '</div>';

            bodyEl.innerHTML = html;
            _rootEl = bodyEl;
            _tgtEl = bodyEl.querySelector('.wd-enigma-target');
            _curEl = bodyEl.querySelector('.wd-enigma-current');
            _battEl = bodyEl.querySelector('.wd-enigma-batt-wrap');
            _solvedEl = bodyEl.querySelector('.wd-enigma-solved');
            _gridEl = bodyEl.querySelector('.wd-enigma-grid');

            render();
            _stateSub = onMessage;
            PxD.mqtt.subscribe(CONFIG.STATE_TOPIC, _stateSub);
        },
        unmount: function () {
            if (_stateSub) {
                PxD.mqtt.unsubscribe(CONFIG.STATE_TOPIC, _stateSub);
                _stateSub = null;
            }
            _rootEl = null;
        },
    });

})();
