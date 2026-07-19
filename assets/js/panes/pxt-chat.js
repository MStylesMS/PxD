/**
 * panes/pxt-chat.js — Operator chat pane for Paradox Terminal (PxT)
 *
 * Bidirectional MQTT chat:
 *   publish → {topicRoot}/chat/to-players
 *   subscribe ← {topicRoot}/chat/to-players   (so all operator windows share outbound)
 *   subscribe ← {topicRoot}/chat/from-players
 *   subscribe ← {topicRoot}/chat/history      (retained snapshot from PxO for refresh)
 *
 * Transcript is MQTT-only: outbound lines appear when the to-players
 * publish is delivered (including the sender's own echo), not by local
 * optimistic insert. That keeps multiple GM browsers in sync.
 * On mount, a retained history snapshot (published by PxO) seeds the
 * transcript so refresh / new windows recover the current game chat.
 *
 * Payload: { ts?: number, author: string, message: string }
 * History: { ts?: number, messages: Array<{ts, author, message}> }
 *
 * config (pane entry):
 *   {
 *     "topicRoot": "paradox/spycatcher/terminal",
 *     "toPlayersTopic": "",       // optional override
 *     "fromPlayersTopic": "",     // optional override
 *     "operatorAuthor": "operator",
 *     "maxMessages": 200,
 *     "title": "Terminal Chat",
 *     "ai": { "enabled": false, "author": "agent", "mode": "assist" }  // reserved
 *   }
 *
 * Width allow-list (enforced by room.json / docs): full | three-quarters |
 * two-thirds | half. Do not use third/quarter for this pane.
 */
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function normalizeAuthor(raw) {
        var a = String(raw == null ? '' : raw).trim();
        return a || 'unknown';
    }

    function authorClass(author) {
        var a = String(author || '').toLowerCase();
        if (a === 'player' || a.indexOf('player') === 0) return 'pxt-chat-msg--player';
        if (a === 'operator' || a === 'gm' || a === 'admin') return 'pxt-chat-msg--operator';
        if (a === 'agent' || a === 'ai') return 'pxt-chat-msg--agent';
        return 'pxt-chat-msg--other';
    }

    function isPlayerAuthor(author) {
        var a = String(author || '').toLowerCase();
        return a === 'player' || a.indexOf('player') === 0;
    }

    function isOperatorAuthor(author, operatorAuthor) {
        var a = String(author || '').toLowerCase();
        var op = String(operatorAuthor || 'operator').toLowerCase();
        return a === op || a === 'operator' || a === 'gm' || a === 'admin';
    }

    function formatTime(ts) {
        var d = ts ? new Date(ts) : new Date();
        if (isNaN(d.getTime())) d = new Date();
        var hh = String(d.getHours()).padStart(2, '0');
        var mm = String(d.getMinutes()).padStart(2, '0');
        return hh + ':' + mm;
    }

    function factory(config, ctx) {
        config = config || {};
        var root = null;
        var panelEl = null;
        var transcriptEl = null;
        var inputEl = null;
        var emptyEl = null;
        var messages = [];
        var fromHandler = null;
        var toHandler = null;
        var historyHandler = null;
        var lastHistoryTs = 0;
        var awaitingReply = false;
        var notifyPermissionAsked = false;
        var audioCtx = null;
        var unlockAudioBound = null;
        var chimeEnabled = config.chime !== false;
        var muted = false;
        var muteStorageKey = 'pxd.pxt-chat.muted.' + (String(config.topicRoot || 'default').replace(/[^a-zA-Z0-9._-]/g, '_'));

        var topicRoot = String(config.topicRoot || '').replace(/\/+$/, '');
        var toTopic = String(config.toPlayersTopic || '').trim()
            || (topicRoot ? topicRoot + '/chat/to-players' : '');
        var fromTopic = String(config.fromPlayersTopic || '').trim()
            || (topicRoot ? topicRoot + '/chat/from-players' : '');
        var historyTopic = String(config.historyTopic || '').trim()
            || (topicRoot ? topicRoot + '/chat/history' : '');
        var operatorAuthor = String(config.operatorAuthor || 'operator').trim() || 'operator';
        var maxMessages = Number(config.maxMessages);
        if (!isFinite(maxMessages) || maxMessages < 10) maxMessages = 200;
        var title = String(config.title || 'Terminal Chat');
        // Reserved for future SLM agent — ignored when disabled
        var aiCfg = (config.ai && typeof config.ai === 'object') ? config.ai : { enabled: false };

        function mqtt() {
            return (ctx && ctx.mqtt) || (window.PxD && window.PxD.mqtt) || null;
        }

        function utils() {
            return (ctx && ctx.utils) || (window.PxD && window.PxD.utils) || null;
        }

        function setAwaitingReply(next) {
            awaitingReply = !!next;
            if (!panelEl) return;
            if (awaitingReply) panelEl.classList.add('pxt-chat--awaiting-reply');
            else panelEl.classList.remove('pxt-chat--awaiting-reply');
            var ackBtn = panelEl.querySelector('.pxt-chat-ack');
            if (ackBtn) ackBtn.disabled = !awaitingReply;
        }

        function acknowledgeSeen() {
            setAwaitingReply(false);
        }

        function loadMutePreference() {
            try {
                muted = window.localStorage && localStorage.getItem(muteStorageKey) === '1';
            } catch (e) {
                muted = false;
            }
        }

        function saveMutePreference() {
            try {
                if (!window.localStorage) return;
                if (muted) localStorage.setItem(muteStorageKey, '1');
                else localStorage.removeItem(muteStorageKey);
            } catch (e) { /* ignore */ }
        }

        function updateMuteButton() {
            if (!panelEl) return;
            var muteBtn = panelEl.querySelector('.pxt-chat-mute');
            if (!muteBtn) return;
            // Unmuted: speaker on; muted: speaker off
            muteBtn.textContent = muted ? 'MUTE \uD83D\uDD07' : 'MUTE \uD83D\uDD0A';
            muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
            muteBtn.title = muted ? 'Unmute chat notification sound' : 'Mute chat notification sound';
            if (muted) muteBtn.classList.add('pxt-chat-mute--on');
            else muteBtn.classList.remove('pxt-chat-mute--on');
        }

        function toggleMute() {
            muted = !muted;
            saveMutePreference();
            updateMuteButton();
        }

        function ensureAudioContext() {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            if (!audioCtx) audioCtx = new AC();
            if (audioCtx.state === 'suspended') {
                audioCtx.resume().catch(function () { /* ignore */ });
            }
            return audioCtx;
        }

        function unlockAudio() {
            ensureAudioContext();
        }

        /** Short two-tone chime via Web Audio (no media file required). */
        function playChime() {
            if (!chimeEnabled || muted) return;
            var ctx = ensureAudioContext();
            if (!ctx) return;

            function tone(freq, start, dur, peak) {
                var osc = ctx.createOscillator();
                var gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, start);
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(start);
                osc.stop(start + dur + 0.02);
            }

            var play = function () {
                var now = ctx.currentTime;
                tone(988, now, 0.12, 0.38);        // B5 — louder
                tone(1319, now + 0.09, 0.18, 0.32); // E6
            };

            if (ctx.state === 'suspended') {
                ctx.resume().then(play).catch(function () { /* autoplay blocked until gesture */ });
            } else {
                play();
            }
        }

        function notifyPlayerMessage(entry) {
            playChime();

            var preview = String(entry.message || '').trim();
            if (preview.length > 120) preview = preview.slice(0, 117) + '\u2026';
            var toastMsg = 'Player chat: ' + preview;
            var u = utils();
            if (u && typeof u.showToast === 'function') {
                u.showToast(esc(toastMsg), { delay: 4500 });
            }

            // Browser notification when permitted (useful if the tab is in the background)
            if (typeof Notification === 'undefined') return;
            function showBrowserNote() {
                try {
                    new Notification(title || 'Terminal Chat', {
                        body: preview,
                        tag: 'pxt-chat-player',
                        renotify: true
                    });
                } catch (e) { /* ignore */ }
            }
            if (Notification.permission === 'granted') {
                showBrowserNote();
            } else if (Notification.permission === 'default' && !notifyPermissionAsked) {
                notifyPermissionAsked = true;
                Notification.requestPermission().then(function (perm) {
                    if (perm === 'granted') showBrowserNote();
                }).catch(function () { /* ignore */ });
            }
        }

        function setEmptyVisible(show) {
            if (!emptyEl) return;
            emptyEl.style.display = show ? '' : 'none';
        }

        function renderMessage(entry) {
            var cls = authorClass(entry.author);
            return '<div class="pxt-chat-msg ' + cls + '" data-author="' + esc(entry.author) + '">' +
                '<div class="pxt-chat-msg-meta">' +
                    '<span class="pxt-chat-msg-author">' + esc(entry.author) + '</span>' +
                    '<span class="pxt-chat-msg-time">' + esc(formatTime(entry.ts)) + '</span>' +
                '</div>' +
                '<div class="pxt-chat-msg-body">' + esc(entry.message) + '</div>' +
            '</div>';
        }

        function renderTranscript() {
            if (!transcriptEl) return;
            if (!messages.length) {
                transcriptEl.innerHTML = '';
                setEmptyVisible(true);
                return;
            }
            setEmptyVisible(false);
            transcriptEl.innerHTML = messages.map(renderMessage).join('');
            transcriptEl.scrollTop = transcriptEl.scrollHeight;
        }

        function pushMessage(entry, opts) {
            opts = opts || {};
            var author = normalizeAuthor(entry.author);
            var message = String(entry.message == null ? '' : entry.message).trim();
            if (!message) return null;
            var row = {
                ts: entry.ts || Date.now(),
                author: author,
                message: message
            };
            // Dedupe live echo vs retained history snapshot (delivery order varies)
            for (var i = messages.length - 1; i >= Math.max(0, messages.length - 8); i--) {
                var prev = messages[i];
                if (prev.author === row.author && prev.message === row.message
                    && Math.abs((prev.ts || 0) - (row.ts || 0)) < 5000) {
                    return null;
                }
            }
            messages.push(row);
            while (messages.length > maxMessages) messages.shift();
            renderTranscript();

            // Last-sender highlight: player → awaiting reply; GM → clear
            if (isPlayerAuthor(author)) {
                setAwaitingReply(true);
                if (opts.notify !== false) notifyPlayerMessage(row);
            } else if (isOperatorAuthor(author, operatorAuthor)) {
                setAwaitingReply(false);
            }
            return row;
        }

        function applyHistory(payload) {
            if (!payload || typeof payload !== 'object') return;
            if (!Array.isArray(payload.messages)) return;
            var ts = Number(payload.ts) || 0;
            if (ts && lastHistoryTs && ts < lastHistoryTs) return;
            if (ts) lastHistoryTs = ts;

            var next = [];
            for (var i = 0; i < payload.messages.length; i++) {
                var m = payload.messages[i];
                if (!m || typeof m !== 'object') continue;
                var author = normalizeAuthor(m.author);
                var message = String(m.message == null ? '' : m.message).trim();
                if (!message) continue;
                next.push({
                    ts: m.ts || Date.now(),
                    author: author,
                    message: message
                });
            }
            while (next.length > maxMessages) next.shift();
            messages = next;
            renderTranscript();

            // Restore highlight from last line; never chime on history seed
            if (!messages.length) {
                setAwaitingReply(false);
                return;
            }
            var last = messages[messages.length - 1];
            if (isPlayerAuthor(last.author)) setAwaitingReply(true);
            else if (isOperatorAuthor(last.author, operatorAuthor)) setAwaitingReply(false);
            else setAwaitingReply(false);
        }

        /** Pluggable send path — human operator today; future SLM can call the same helper. */
        function sendChatMessage(payload) {
            var author = normalizeAuthor(payload && payload.author != null ? payload.author : operatorAuthor);
            var message = String(payload && payload.message != null ? payload.message : '').trim();
            if (!message) return false;
            if (!toTopic) {
                console.warn('[pxt-chat] no to-players topic configured');
                return false;
            }
            var client = mqtt();
            if (!client || typeof client.publish !== 'function') {
                console.warn('[pxt-chat] MQTT client unavailable');
                return false;
            }
            // Do not push locally — subscribe to to-players so every GM window
            // (including this one) records the same MQTT delivery.
            client.publish(toTopic, { ts: Date.now(), author: author, message: message });
            return true;
        }

        function onFromPlayers(payload) {
            if (!payload || typeof payload !== 'object') return;
            pushMessage({
                ts: payload.ts,
                author: payload.author,
                message: payload.message
            }, { notify: true });
        }

        function onToPlayers(payload) {
            if (!payload || typeof payload !== 'object') return;
            pushMessage({
                ts: payload.ts,
                author: payload.author,
                message: payload.message
            }, { notify: false });
        }

        function onHistory(payload) {
            applyHistory(payload);
        }

        function onSendClick() {
            if (!inputEl) return;
            var text = inputEl.value.trim();
            if (!text) return;
            if (sendChatMessage({ author: operatorAuthor, message: text })) {
                inputEl.value = '';
                inputEl.focus();
            }
        }

        function onKeyDown(evt) {
            if (evt.key === 'Enter' && !evt.shiftKey) {
                evt.preventDefault();
                onSendClick();
            }
        }

        return {
            mount: function (el) {
                root = el;
                messages = [];
                fromHandler = null;
                toHandler = null;
                historyHandler = null;
                lastHistoryTs = 0;
                awaitingReply = false;
                notifyPermissionAsked = false;

                if (aiCfg && aiCfg.enabled) {
                    console.info('[pxt-chat] ai.enabled is reserved; agent mode not active in v1');
                }

                el.innerHTML =
                    '<section class="panel panel-pxt-chat">' +
                        '<div class="panel-header panel-header-tight">' +
                            '<h2 class="panel-title">' + esc(title) + '</h2>' +
                            '<div class="pxt-chat-header-actions">' +
                                '<button type="button" class="btn pxt-chat-mute" aria-pressed="false" ' +
                                    'title="Mute chat notification sound">MUTE \uD83D\uDD0A</button>' +
                                '<button type="button" class="btn pxt-chat-ack" disabled title="Mark player message as seen">' +
                                    'Acknowledge' +
                                '</button>' +
                            '</div>' +
                        '</div>' +
                        '<div class="pxt-chat-body">' +
                            '<div class="pxt-chat-log">' +
                                '<div class="pxt-chat-empty">Waiting for chat\u2026</div>' +
                                '<div class="pxt-chat-transcript" aria-live="polite"></div>' +
                            '</div>' +
                            '<div class="pxt-chat-compose">' +
                                '<textarea class="form-control pxt-chat-input" rows="2" maxlength="500" ' +
                                    'placeholder="Message players\u2026"></textarea>' +
                                '<button type="button" class="btn btn-primary pxt-chat-send">Send</button>' +
                            '</div>' +
                        '</div>' +
                    '</section>';

                panelEl = el.querySelector('.panel-pxt-chat');
                transcriptEl = el.querySelector('.pxt-chat-transcript');
                emptyEl = el.querySelector('.pxt-chat-empty');
                inputEl = el.querySelector('.pxt-chat-input');
                var sendBtn = el.querySelector('.pxt-chat-send');
                var ackBtn = el.querySelector('.pxt-chat-ack');
                var muteBtn = el.querySelector('.pxt-chat-mute');

                loadMutePreference();
                updateMuteButton();

                if (sendBtn) sendBtn.addEventListener('click', onSendClick);
                if (ackBtn) ackBtn.addEventListener('click', acknowledgeSeen);
                if (muteBtn) muteBtn.addEventListener('click', toggleMute);
                if (inputEl) inputEl.addEventListener('keydown', onKeyDown);

                // Browsers block audio until a user gesture — unlock on first pane interaction
                unlockAudioBound = function () {
                    unlockAudio();
                    if (panelEl && unlockAudioBound) {
                        panelEl.removeEventListener('pointerdown', unlockAudioBound);
                        panelEl.removeEventListener('keydown', unlockAudioBound);
                    }
                    unlockAudioBound = null;
                };
                if (panelEl) {
                    panelEl.addEventListener('pointerdown', unlockAudioBound);
                    panelEl.addEventListener('keydown', unlockAudioBound, true);
                }

                renderTranscript();
                setAwaitingReply(false);

                var client = mqtt();
                if (client && typeof client.subscribe === 'function') {
                    if (historyTopic) {
                        historyHandler = onHistory;
                        client.subscribe(historyTopic, historyHandler);
                    }
                    if (fromTopic) {
                        fromHandler = onFromPlayers;
                        client.subscribe(fromTopic, fromHandler);
                    } else {
                        console.warn('[pxt-chat] no from-players topic configured');
                    }
                    if (toTopic) {
                        toHandler = onToPlayers;
                        client.subscribe(toTopic, toHandler);
                    } else {
                        console.warn('[pxt-chat] no to-players topic configured');
                    }
                }

                // Expose send helper for future agent modules on this instance
                el._pxtChat = { sendChatMessage: sendChatMessage };
            },

            unmount: function () {
                var client = mqtt();
                if (client && typeof client.unsubscribe === 'function') {
                    if (historyTopic && historyHandler) client.unsubscribe(historyTopic, historyHandler);
                    if (fromTopic && fromHandler) client.unsubscribe(fromTopic, fromHandler);
                    if (toTopic && toHandler) client.unsubscribe(toTopic, toHandler);
                }
                fromHandler = null;
                toHandler = null;
                historyHandler = null;
                lastHistoryTs = 0;
                if (panelEl && unlockAudioBound) {
                    panelEl.removeEventListener('pointerdown', unlockAudioBound);
                    panelEl.removeEventListener('keydown', unlockAudioBound, true);
                }
                unlockAudioBound = null;
                if (audioCtx && typeof audioCtx.close === 'function') {
                    audioCtx.close().catch(function () { /* ignore */ });
                }
                audioCtx = null;
                if (root) {
                    root._pxtChat = null;
                    root.innerHTML = '';
                }
                root = null;
                panelEl = null;
                transcriptEl = null;
                inputEl = null;
                emptyEl = null;
                messages = [];
                awaitingReply = false;
            }
        };
    }

    PxD.panes.registerType('pxt-chat', factory);
})();
