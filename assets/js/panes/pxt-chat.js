/**
 * panes/pxt-chat.js — Operator chat pane for Paradox Terminal (PxT)
 *
 * Bidirectional MQTT chat:
 *   publish → {topicRoot}/chat/to-players
 *   subscribe ← {topicRoot}/chat/from-players
 *
 * Payload: { ts?: number, author: string, message: string }
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
        var transcriptEl = null;
        var inputEl = null;
        var emptyEl = null;
        var messages = [];
        var fromHandler = null;

        var topicRoot = String(config.topicRoot || '').replace(/\/+$/, '');
        var toTopic = String(config.toPlayersTopic || '').trim()
            || (topicRoot ? topicRoot + '/chat/to-players' : '');
        var fromTopic = String(config.fromPlayersTopic || '').trim()
            || (topicRoot ? topicRoot + '/chat/from-players' : '');
        var operatorAuthor = String(config.operatorAuthor || 'operator').trim() || 'operator';
        var maxMessages = Number(config.maxMessages);
        if (!isFinite(maxMessages) || maxMessages < 10) maxMessages = 200;
        var title = String(config.title || 'Terminal Chat');
        // Reserved for future SLM agent — ignored when disabled
        var aiCfg = (config.ai && typeof config.ai === 'object') ? config.ai : { enabled: false };

        function mqtt() {
            return (ctx && ctx.mqtt) || (window.PxD && window.PxD.mqtt) || null;
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
            if (!message) return;
            var row = {
                ts: entry.ts || Date.now(),
                author: author,
                message: message,
                local: opts.local === true
            };
            // Deduplicate local echo if broker also reflects operator traffic
            if (!row.local && messages.length) {
                var last = messages[messages.length - 1];
                if (last.local && last.author === row.author && last.message === row.message
                    && Math.abs((last.ts || 0) - (row.ts || 0)) < 5000) {
                    return;
                }
            }
            messages.push(row);
            while (messages.length > maxMessages) messages.shift();
            renderTranscript();
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
            var out = { ts: Date.now(), author: author, message: message };
            client.publish(toTopic, out);
            pushMessage(out, { local: true });
            return true;
        }

        function onFromPlayers(payload) {
            if (!payload || typeof payload !== 'object') return;
            pushMessage({
                ts: payload.ts,
                author: payload.author,
                message: payload.message
            });
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

                if (aiCfg && aiCfg.enabled) {
                    console.info('[pxt-chat] ai.enabled is reserved; agent mode not active in v1');
                }

                el.innerHTML =
                    '<section class="panel panel-pxt-chat">' +
                        '<div class="panel-header panel-header-tight">' +
                            '<h2 class="panel-title">' + esc(title) + '</h2>' +
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

                transcriptEl = el.querySelector('.pxt-chat-transcript');
                emptyEl = el.querySelector('.pxt-chat-empty');
                inputEl = el.querySelector('.pxt-chat-input');
                var sendBtn = el.querySelector('.pxt-chat-send');

                if (sendBtn) sendBtn.addEventListener('click', onSendClick);
                if (inputEl) inputEl.addEventListener('keydown', onKeyDown);

                renderTranscript();

                var client = mqtt();
                if (fromTopic && client && typeof client.subscribe === 'function') {
                    fromHandler = onFromPlayers;
                    client.subscribe(fromTopic, fromHandler);
                } else if (!fromTopic) {
                    console.warn('[pxt-chat] no from-players topic configured');
                }

                // Expose send helper for future agent modules on this instance
                el._pxtChat = { sendChatMessage: sendChatMessage };
            },

            unmount: function () {
                var client = mqtt();
                if (fromTopic && fromHandler && client && typeof client.unsubscribe === 'function') {
                    client.unsubscribe(fromTopic, fromHandler);
                }
                fromHandler = null;
                if (root) {
                    root._pxtChat = null;
                    root.innerHTML = '';
                }
                root = null;
                transcriptEl = null;
                inputEl = null;
                emptyEl = null;
                messages = [];
            }
        };
    }

    PxD.panes.registerType('pxt-chat', factory);
})();
