/**
 * panels/hints.js — Hint Delivery Panel
 *
 * Responsibilities:
 *  - Hint selector dropdown (populated from game config via pxd:gameChanged event)
 *  - Hint text area (editable for text hints, read-only for others)
 *  - Hint prefix badge (emoji + zone)
 *  - Send Hint button with clock-visibility gate (text hints blocked when clock hidden)
 *  - Publishes hint payload to hintTopic
 *
 * Reads from: PxD.config.hints, PxD.config.topicRoot
 * Listens for custom events: pxd:gameChanged, pxd:clockVisibilityChanged, pxd:hintTopicChanged
 */
(function () {
    'use strict';

    var _config = null;
    var _topicRoot = '';
    var _hintTopic = '';
    var _lastGameState = 'ready';
    var _lastConnected = false;
    var _clockVisible = null; // true | false | null
    var _root = null;

    // ── Hint normalisation ─────────────────────────────────────────────────
    function normalizeHintZone(h) {
        if (!h || typeof h !== 'object') return '';
        return String(h.zone || h.target || '').trim();
    }

    function getHintDescription(h) {
        if (!h || typeof h !== 'object') return '';
        return (h.description || h.displayText || h.baseText || h.text || '').toString().trim();
    }

    function getHintEditableText(h) {
        if (!h || typeof h !== 'object') return '';
        return (h.text || (h.data && h.data.text) || '').toString().trim();
    }

    function getHintEmoji(type) {
        var map = { text: '\uD83C\uDD63', sequence: '\uD83E\uDE84', speech: '\uD83D\uDCAC', audio: '\uD83D\uDD0A', video: '\uD83C\uDFA5', action: '\uD83C\uDFAD' };
        return map[type] || '\uD83C\uDD63';
    }

    function normalizeHintInfo(h) {
        if (!h || typeof h !== 'object') return h;
        var n = Object.assign({}, h);
        var type = n.type ? String(n.type).toLowerCase() : 'text';
        if (type === 'audiofx') type = 'audio';
        n.type = type;
        n.zone = normalizeHintZone(n);
        n.target = n.zone;
        n.description = getHintDescription(n);
        n.emoji = n.emoji || getHintEmoji(type);
        n.isEditable = n.isEditable === true || type === 'text';
        var zonePart = n.zone ? ' ' + n.zone : '';
        n.displayText = n.emoji + ' ' + type + zonePart + ': ' + n.description;
        return n;
    }

    // ── UI: populate hint selector ─────────────────────────────────────────
    function populateHintSelector(game) {
        var sel = _root && _root.querySelector('#hintSelect');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Select hint --</option>';
        if (!game) return;
        var hints = [];
        if (Array.isArray(game.combinedHints) && game.combinedHints.length) {
            hints = game.combinedHints.map(normalizeHintInfo);
        } else if (Array.isArray(game.hints)) {
            hints = game.hints.map(function (text, i) {
                return { type: 'text', index: i, emoji: '\uD83C\uDD63', zone: '', target: '', description: String(text || '').trim(), displayText: '\uD83C\uDD63 text: ' + String(text || '').trim(), hint: text, isEditable: true };
            });
        }
        hints.forEach(function (h) {
            var opt = document.createElement('option');
            var payload = { id: h.id || null, info: h };
            opt.value = JSON.stringify(payload);
            var label = h.displayText || (h.emoji + ' ' + (h.target || '') + ': ' + h.description);
            opt.text = label.length > 60 ? label.substring(0, 60) + '\u2026' : label;
            sel.add(opt);
        });
    }

    // ── UI: hint select change ─────────────────────────────────────────────
    function onHintSelect() {
        var sel   = _root && _root.querySelector('#hintSelect');
        var ta    = _root && _root.querySelector('#hintText');
        var prefix  = _root && _root.querySelector('#hintPrefix');
        var emojiEl = _root && _root.querySelector('#hintEmoji');
        var targetEl= _root && _root.querySelector('#hintTarget');
        if (!sel || !ta) return;

        var val = sel.value;
        if (!val) {
            if (prefix) prefix.style.display = 'none';
            ta.value = ''; ta.readOnly = false; ta.placeholder = 'Enter custom hint text\u2026';
            ta.hintInfo = null; ta.hintId = null;
            updateSendButton();
            return;
        }
        try {
            var p = JSON.parse(val);
            var h = normalizeHintInfo(p.info || p);
            if (!h.hint && h.data) h.hint = h.data;
            if (prefix && emojiEl && targetEl) {
                emojiEl.textContent = h.emoji || '\uD83C\uDD63';
                targetEl.textContent = h.zone || '';
                prefix.style.display = 'block';
            }
            if (h.isEditable) {
                ta.value = getHintEditableText(h);
                ta.readOnly = false;
                ta.placeholder = 'Edit hint text\u2026';
            } else {
                ta.value = (h.description || (h.data && h.data.description) || h.displayText || '').toString().trim();
                ta.readOnly = true;
                ta.placeholder = '';
            }
            ta.hintInfo = h;
            ta.hintId = (p && p.id) ? p.id : null;
            // Reset dropdown back to placeholder after selection
            sel.value = '';
        } catch (e) {
            console.error('[PxD hints] parse error', e);
            if (prefix) prefix.style.display = 'none';
            ta.value = ''; ta.readOnly = false; ta.hintInfo = null; ta.hintId = null;
        }
        updateSendButton();
    }

    // ── UI: send button state ──────────────────────────────────────────────
    function updateSendButton() {
        var btn = _root && _root.querySelector('#sendHintBtn');
        if (!btn) return;
        var ta = _root && _root.querySelector('#hintText');
        var h = ta && ta.hintInfo;
        var isTextHint = !h || h.isEditable || h.type === 'text';
        var gameOk = _lastConnected && (_lastGameState === 'gameplay' || _lastGameState === 'paused');
        var enabled = false, showWarn = false;
        if (!gameOk) { enabled = false; showWarn = false; }
        else if (!isTextHint) { enabled = true; showWarn = false; }
        else {
            if (_clockVisible === false) { enabled = false; showWarn = false; }
            else if (_clockVisible === null) { enabled = true; showWarn = true; }
            else { enabled = true; showWarn = false; }
        }
        btn.disabled = !enabled;
        btn.style.backgroundColor = showWarn ? '#FFD700' : '';
        btn.style.color = showWarn ? '#000000' : '';
    }

    // ── UI: send the hint ──────────────────────────────────────────────────
    function sendHint() {
        var ta = _root && _root.querySelector('#hintText');
        if (!ta || !ta.value.trim()) return;
        var h = ta.hintInfo;
        var id = ta.hintId || null;
        var text = ta.value.trim();
        var payload;
        if (h && !h.isEditable && id) { payload = { id: id }; }
        else { payload = { id: id, text: text }; }
        PxD.mqtt.publish(_hintTopic, payload);
        // Reset
        ta.value = ''; ta.readOnly = false;
        ta.placeholder = 'Enter custom hint text\u2026';
        ta.hintInfo = null; ta.hintId = null;
        var prefix = _root.querySelector('#hintPrefix');
        if (prefix) prefix.style.display = 'none';
        var sel = _root.querySelector('#hintSelect');
        if (sel) sel.value = '';
    }

    // ── HTML template ──────────────────────────────────────────────────────
    function buildHTML() {
        return '<section class="panel panel-hints">' +
            '<div class="panel-header panel-header-tight">' +
                '<h2 class="panel-title">Hint Delivery</h2>' +
                '<div id="clockStatus-hints" class="alert alert-warning clock-pill mb-0 text-center d-flex align-items-center justify-content-center h-100" style="min-width:120px;">Clock Hidden</div>' +
            '</div>' +
            '<div class="hint-select-row">' +
                '<select id="hintSelect" class="form-select" onchange="window._hPanel.onHintSelect()" disabled><option value="">-- Select hint --</option></select>' +
            '</div>' +
            '<div class="hint-compose-row">' +
                '<div class="hint-container w-100 d-flex flex-row align-items-stretch">' +
                    '<div id="hintPrefix" class="hint-prefix text-center me-2" style="display:none;">' +
                        '<div id="hintEmoji" class="hint-emoji" style="font-size:2em;line-height:1;"></div>' +
                        '<div id="hintTarget" class="hint-target" style="font-size:0.8em;font-weight:600;margin-top:2px;"></div>' +
                    '</div>' +
                    '<textarea id="hintText" class="form-control flex-grow-1" rows="2" maxlength="160" placeholder="Enter hint text\u2026" disabled></textarea>' +
                '</div>' +
                '<button id="sendHintBtn" type="button" class="btn btn-primary send-hint-btn" onclick="window._hPanel.sendHint()" disabled>Send Hint</button>' +
            '</div>' +
        '</section>';
    }

    // ── Cross-panel event listeners ────────────────────────────────────────
    function onGameChanged(evt) {
        populateHintSelector(evt.detail && evt.detail.game);
        // enable hint select when connected
        var sel = _root && _root.querySelector('#hintSelect');
        var ta  = _root && _root.querySelector('#hintText');
        if (sel) sel.disabled = !_lastConnected;
        if (ta)  ta.disabled  = !_lastConnected;
        updateSendButton();
    }

    function onClockVisibilityChanged(evt) {
        _clockVisible = evt.detail && evt.detail.visible;
        // Mirror clock status pill in hints panel header
        var el = _root && _root.querySelector('#clockStatus-hints');
        if (el) {
            if (_clockVisible === null) {
                el.className = 'alert alert-secondary clock-pill mb-0 text-center d-flex align-items-center justify-content-center h-100';
                el.innerHTML = 'Clock Unknown';
            } else if (_clockVisible) {
                el.className = 'alert alert-success clock-pill mb-0 text-center d-flex align-items-center justify-content-center h-100';
                el.innerHTML = 'Clock Visible';
            } else {
                el.className = 'alert alert-warning clock-pill mb-0 text-center d-flex align-items-center justify-content-center h-100';
                el.innerHTML = 'Clock Hidden';
            }
        }
        updateSendButton();
    }

    function onHintTopicChanged(evt) {
        if (evt.detail && evt.detail.hintTopic) _hintTopic = evt.detail.hintTopic;
    }

    // Listen to game state for send button gate
    function onGameStateChange(payload) {
        _lastGameState = (payload && payload.gameState) || 'ready';
        var connected = payload && (Date.now() - (payload._ts || Date.now())) < 5000;
        _lastConnected = true; // if we receive a message, we're connected
        var sel = _root && _root.querySelector('#hintSelect');
        var ta  = _root && _root.querySelector('#hintText');
        if (sel) sel.disabled = !_lastConnected;
        if (ta)  ta.disabled  = !_lastConnected;
        updateSendButton();
    }

    // ── panel.mount ────────────────────────────────────────────────────────
    function mount(slotEl) {
        var cfg = PxD.config;
        _config = cfg.hints || {};
        _topicRoot = cfg.topicRoot || '';
        _hintTopic = _config.hintTopic || (_topicRoot + '/hints');

        _root = slotEl;
        slotEl.innerHTML = buildHTML();

        // hintText newline suppressor
        var ta = slotEl.querySelector('#hintText');
        if (ta) {
            ta.addEventListener('keyup', function () {
                this.value = this.value.replace(/[\r\n\v]+/g, ' ');
            });
        }

        // Expose methods for inline handlers
        window._hPanel = {
            onHintSelect: onHintSelect,
            sendHint:     sendHint
        };

        // Listen for cross-panel events
        document.addEventListener('pxd:gameChanged',            onGameChanged);
        document.addEventListener('pxd:clockVisibilityChanged', onClockVisibilityChanged);
        document.addEventListener('pxd:hintTopicChanged',       onHintTopicChanged);

        // Subscribe to game state for button gate
        var stateTopic = cfg.gameControl && cfg.gameControl.stateTopic
            ? cfg.gameControl.stateTopic
            : (_topicRoot + '/state');
        PxD.mqtt.subscribe(stateTopic, onGameStateChange);
    }

    function unmount() {
        document.removeEventListener('pxd:gameChanged',            onGameChanged);
        document.removeEventListener('pxd:clockVisibilityChanged', onClockVisibilityChanged);
        document.removeEventListener('pxd:hintTopicChanged',       onHintTopicChanged);
        window._hPanel = null;
    }

    PxD.panels.register('hints', { mount: mount, unmount: unmount });
})();
