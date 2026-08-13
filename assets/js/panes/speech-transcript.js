/**
 * panes/speech-transcript.js — Live STT/TTS transcript (PxS WebSocket + MQTT speak)
 *
 * Connects to Paradox Speech (PxS) WebSocket for hello / snapshot / partial /
 * final / tts / session_cleared / status. Compose publishes MQTT speak on the
 * speech base topic so multi-GM windows share TTS via the service bus.
 *
 * Visual language mirrors pxt-chat:
 *   STT  → left  (pxt-chat-msg--player equivalent)
 *   TTS  → right (pxt-chat-msg--operator equivalent)
 *
 * config (pane entry):
 *   {
 *     "wsUrl": "/speech/v1/transcript",   // path or full ws(s):// URL
 *     "mqttBaseTopic": "paradox/<room>/speech",  // room-specific; required for Speak
 *     "ttsId": "main",
 *     "source": "ui",                     // MQTT speak source tag
 *     "showStt": true,                    // false = TTS-only (Live Transcript page)
 *     "showFooter": true,                 // model / voice footer
 *     "title": "Player Transcript",
 *     "maxTurns": 500,
 *     "reconnectMs": 2000
 *   }
 *
 * Width allow-list: full | three-quarters | two-thirds | half
 * (same as pxt-chat; avoid third/quarter).
 */
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Resolve WS URL. Path-absolute URLs use the page host + ws/wss scheme
     * (works behind nginx /speech/ proxy on LAN and Tailscale).
     */
    function resolveWsUrl(raw) {
        var u = String(raw || '/speech/v1/transcript').trim();
        if (!u) u = '/speech/v1/transcript';
        if (/^wss?:\/\//i.test(u)) return u;
        if (u.charAt(0) !== '/') u = '/' + u;
        var proto = (window.location.protocol === 'https:') ? 'wss:' : 'ws:';
        return proto + '//' + window.location.host + u;
    }

    function factory(config, ctx) {
        config = config || {};
        var root = null;
        var panelEl = null;
        var transcriptEl = null;
        var emptyEl = null;
        var inputEl = null;
        var footerEl = null;
        var statusEl = null;
        var ws = null;
        var reconnectTimer = null;
        var closed = false;
        /** @type {Map<string, object>} */
        var byId = new Map();
        /** @type {string[]} */
        var order = [];

        var wsUrl = resolveWsUrl(config.wsUrl);
        var mqttBase = String(config.mqttBaseTopic || '').replace(/\/+$/, '');
        var ttsId = String(config.ttsId || 'main').trim() || 'main';
        var source = String(config.source || 'ui').trim() || 'ui';
        var showStt = config.showStt !== false;
        var showFooter = config.showFooter !== false;
        var standalone = config.standalone === true;
        var title = String(config.title || 'Player Transcript');
        var maxTurns = Number(config.maxTurns);
        if (!isFinite(maxTurns) || maxTurns < 20) maxTurns = 500;
        var reconnectMs = Number(config.reconnectMs);
        if (!isFinite(reconnectMs) || reconnectMs < 500) reconnectMs = 2000;

        var sttModels = [];
        var ttsModels = [];
        var connState = 'connecting';
        /** Auto-follow new lines only while the user is near the bottom. */
        var stickToBottom = true;
        var STICK_PX = 64;

        function mqtt() {
            return (ctx && ctx.mqtt) || (window.PxD && window.PxD.mqtt) || null;
        }

        function isNearBottom() {
            if (!transcriptEl) return true;
            var gap = transcriptEl.scrollHeight - transcriptEl.scrollTop - transcriptEl.clientHeight;
            return gap <= STICK_PX;
        }

        function onTranscriptScroll() {
            stickToBottom = isNearBottom();
        }

        function scrollTranscriptAfterRender(prevTop) {
            if (!transcriptEl) return;
            if (stickToBottom) {
                transcriptEl.scrollTop = transcriptEl.scrollHeight;
            } else if (typeof prevTop === 'number' && isFinite(prevTop)) {
                // Full innerHTML replace resets scroll; restore so history stays put.
                transcriptEl.scrollTop = prevTop;
            }
        }

        function setConn(state, detail) {
            connState = state;
            if (!statusEl) return;
            statusEl.textContent = detail || state;
            statusEl.setAttribute('data-state', state);
        }

        function updateFooter() {
            if (!footerEl) return;
            var stt = sttModels.length
                ? sttModels.map(function (s) {
                    return (s.id || '?') + ':' + (s.model || s.provider || '?') +
                        (s.running ? ' •' : '');
                }).join(' · ')
                : '—';
            var tts = ttsModels.length
                ? ttsModels.map(function (t) {
                    return (t.id || '?') + ':' + (t.model || t.provider || '?') +
                        (t.voice ? '/' + t.voice : '') +
                        (t.speaking ? ' ▶' : '');
                }).join(' · ')
                : '—';
            footerEl.innerHTML =
                '<span class="speech-tx-foot-stt">STT ' + esc(stt) + '</span>' +
                '<span class="speech-tx-foot-tts">TTS ' + esc(tts) + '</span>';
        }

        function trimOrder() {
            while (order.length > maxTurns) {
                var old = order.shift();
                if (old) byId.delete(old);
            }
        }

        function upsertTurn(turn) {
            if (!turn || !turn.turn_id) return;
            var id = String(turn.turn_id);
            var rev = Number(turn.rev) || 1;
            var existing = byId.get(id);
            if (existing && (Number(existing.rev) || 0) > rev) return;
            if (!existing) order.push(id);
            byId.set(id, Object.assign({}, existing || {}, turn, { turn_id: id, rev: rev }));
            trimOrder();
            render();
        }

        function clearTranscript(reason) {
            byId.clear();
            order = [];
            stickToBottom = true;
            render();
            if (emptyEl && reason) {
                emptyEl.textContent = reason;
            }
        }

        /** HTML for one line: bold "S1:" + plain body (STT); plain body (TTS). */
        function lineHtml(t, isTts, partial) {
            var body = String(t.text || '');
            if (partial) body += (body ? ' …' : '…');
            // TTS: spoken text only (no GM/time meta)
            if (isTts) return esc(body);
            // STT: speaker at start — <strong>S1:</strong> check check check
            var sp = t.speaker != null && String(t.speaker).trim() !== ''
                ? String(t.speaker).trim()
                : '';
            if (!sp) return esc(body);
            return '<strong class="speech-tx-speaker">' + esc(sp) + ':</strong> ' + esc(body);
        }

        function render() {
            if (!transcriptEl) return;
            var prevTop = transcriptEl.scrollTop;
            var html = '';
            var visible = 0;
            for (var i = 0; i < order.length; i++) {
                var t = byId.get(order[i]);
                if (!t) continue;
                var role = String(t.role || t.type || '').toLowerCase();
                if (role === 'stt' && !showStt) continue;
                visible += 1;
                var isTts = role === 'tts';
                var side = isTts ? 'operator' : 'player';
                var partial = !t.final && !isTts;
                html +=
                    '<div class="speech-tx-msg pxt-chat-msg pxt-chat-msg--' + side +
                        (partial ? ' speech-tx-msg--partial' : '') +
                        '" data-turn="' + esc(t.turn_id) + '">' +
                        '<div class="pxt-chat-msg-body speech-tx-line">' +
                            lineHtml(t, isTts, partial) +
                        '</div>' +
                    '</div>';
            }
            transcriptEl.innerHTML = html;
            if (emptyEl) {
                emptyEl.style.display = visible ? 'none' : '';
                if (!visible && emptyEl.textContent.indexOf('cleared') < 0) {
                    emptyEl.textContent = showStt
                        ? 'Waiting for speech…'
                        : 'Waiting for GM / game TTS…';
                }
            }
            scrollTranscriptAfterRender(prevTop);
        }

        function applyHello(msg) {
            if (Array.isArray(msg.stt)) sttModels = msg.stt;
            if (Array.isArray(msg.tts)) ttsModels = msg.tts;
            updateFooter();
        }

        function applySnapshot(msg) {
            byId.clear();
            order = [];
            var turns = Array.isArray(msg.turns) ? msg.turns : [];
            for (var i = 0; i < turns.length; i++) {
                var t = turns[i];
                if (!t || !t.turn_id) continue;
                var role = String(t.role || '').toLowerCase();
                if (role === 'stt' && !showStt) continue;
                order.push(String(t.turn_id));
                byId.set(String(t.turn_id), t);
            }
            trimOrder();
            // Fresh history load: jump to latest (user can scroll up after).
            stickToBottom = true;
            render();
        }

        function onWsMessage(ev) {
            var msg;
            try {
                msg = JSON.parse(ev.data);
            } catch (e) {
                return;
            }
            if (!msg || typeof msg !== 'object') return;
            switch (msg.type) {
                case 'hello':
                    applyHello(msg);
                    setConn('open', 'connected');
                    break;
                case 'snapshot':
                    applySnapshot(msg);
                    break;
                case 'status':
                    // optional connection/session hint
                    break;
                case 'partial':
                case 'final':
                    if (!showStt) break;
                    upsertTurn({
                        turn_id: msg.turn_id,
                        rev: msg.rev,
                        t_sec: msg.t_sec,
                        role: 'stt',
                        text: msg.text,
                        speaker: msg.speaker,
                        final: msg.type === 'final' || !!msg.final,
                        session_id: msg.session_id
                    });
                    break;
                case 'tts':
                    upsertTurn({
                        turn_id: msg.turn_id,
                        rev: msg.rev || 1,
                        t_sec: msg.t_sec,
                        role: 'tts',
                        text: msg.text,
                        source: msg.source,
                        final: true,
                        session_id: msg.session_id
                    });
                    break;
                case 'session_cleared':
                    clearTranscript('Session cleared — waiting for next game…');
                    break;
                default:
                    break;
            }
        }

        function scheduleReconnect() {
            if (closed || reconnectTimer) return;
            setConn('reconnect', 'reconnecting…');
            reconnectTimer = setTimeout(function () {
                reconnectTimer = null;
                connectWs();
            }, reconnectMs);
        }

        function connectWs() {
            if (closed) return;
            if (ws) {
                try { ws.onclose = null; ws.close(); } catch (e) { /* ignore */ }
                ws = null;
            }
            setConn('connecting', 'connecting…');
            try {
                ws = new WebSocket(wsUrl);
            } catch (err) {
                console.warn('[speech-transcript] WS open failed', err);
                scheduleReconnect();
                return;
            }
            ws.onopen = function () {
                setConn('open', 'connected');
            };
            ws.onmessage = onWsMessage;
            ws.onerror = function () {
                /* onclose will fire */
            };
            ws.onclose = function () {
                ws = null;
                if (!closed) scheduleReconnect();
            };
        }

        function sendSpeak() {
            if (!inputEl) return;
            var text = String(inputEl.value || '').trim();
            if (!text) return;
            if (!mqttBase) {
                console.warn('[speech-transcript] mqttBaseTopic not configured');
                return;
            }
            var client = mqtt();
            if (!client || typeof client.publish !== 'function') {
                console.warn('[speech-transcript] MQTT client unavailable');
                return;
            }
            var topic = mqttBase + '/commands';
            client.publish(topic, {
                command: 'speak',
                id: ttsId,
                text: text,
                source: source
            });
            inputEl.value = '';
            inputEl.focus();
        }

        function onKeyDown(evt) {
            if (evt.key === 'Enter' && !evt.shiftKey) {
                evt.preventDefault();
                sendSpeak();
            }
        }

        return {
            mount: function (el) {
                root = el;
                closed = false;
                byId.clear();
                order = [];
                sttModels = [];
                ttsModels = [];

                el.innerHTML =
                    '<section class="panel panel-speech-tx panel-pxt-chat' +
                        (standalone ? ' speech-tx--standalone' : '') + '">' +
                        '<div class="panel-header panel-header-tight">' +
                            '<h2 class="panel-title">' + esc(title) + '</h2>' +
                            '<span class="speech-tx-status" data-state="connecting">connecting…</span>' +
                        '</div>' +
                        '<div class="pxt-chat-body speech-tx-body">' +
                            '<div class="pxt-chat-log speech-tx-log">' +
                                '<div class="pxt-chat-empty speech-tx-empty">' +
                                    (showStt ? 'Waiting for speech…' : 'Waiting for GM / game TTS…') +
                                '</div>' +
                                '<div class="pxt-chat-transcript speech-tx-transcript" aria-live="polite"></div>' +
                            '</div>' +
                            '<div class="pxt-chat-compose speech-tx-compose">' +
                                '<textarea class="form-control pxt-chat-input speech-tx-input" rows="2" maxlength="2000" ' +
                                    'placeholder="Speak to room (TTS)\u2026"></textarea>' +
                                '<button type="button" class="btn btn-primary pxt-chat-send speech-tx-send">Speak</button>' +
                            '</div>' +
                            (showFooter
                                ? '<div class="speech-tx-footer" aria-label="Active speech models"></div>'
                                : '') +
                        '</div>' +
                    '</section>';

                panelEl = el.querySelector('.panel-speech-tx');
                transcriptEl = el.querySelector('.speech-tx-transcript');
                emptyEl = el.querySelector('.speech-tx-empty');
                inputEl = el.querySelector('.speech-tx-input');
                footerEl = el.querySelector('.speech-tx-footer');
                statusEl = el.querySelector('.speech-tx-status');
                var sendBtn = el.querySelector('.speech-tx-send');
                if (sendBtn) sendBtn.addEventListener('click', sendSpeak);
                if (inputEl) inputEl.addEventListener('keydown', onKeyDown);
                if (transcriptEl) {
                    transcriptEl.addEventListener('scroll', onTranscriptScroll, { passive: true });
                }

                stickToBottom = true;
                updateFooter();
                render();
                connectWs();
            },

            unmount: function () {
                closed = true;
                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
                if (ws) {
                    try {
                        ws.onclose = null;
                        ws.close();
                    } catch (e) { /* ignore */ }
                    ws = null;
                }
                if (transcriptEl) {
                    try {
                        transcriptEl.removeEventListener('scroll', onTranscriptScroll);
                    } catch (e) { /* ignore */ }
                }
                if (root) root.innerHTML = '';
                root = null;
                panelEl = null;
                transcriptEl = null;
                emptyEl = null;
                inputEl = null;
                footerEl = null;
                statusEl = null;
                stickToBottom = true;
                byId.clear();
                order = [];
            }
        };
    }

    if (window.PxD && window.PxD.panes && typeof window.PxD.panes.registerType === 'function') {
        window.PxD.panes.registerType('speech-transcript', factory);
    } else {
        console.error('[speech-transcript] PxD.panes.registerType unavailable');
    }
})();
