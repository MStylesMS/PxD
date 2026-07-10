/**
 * panes/content.js — Content Pane (reference implementation)
 *
 * The simplest pane type, and the worked example referenced by
 * docs/PANES.md § "How to add a new pane type". It renders static content:
 * either a raw HTML string, or a structured list of text / image / button
 * items — so operators can add headings, notes, logos, and simple action
 * buttons without a bespoke pane.
 *
 * config:
 *   {
 *     "title":  "Optional card title",       // omit for a title-less card
 *     "html":   "<p>raw html</p>",            // OR use "items" below
 *     "items": [
 *       { "type": "text",   "text": "Some note", "tag": "p" },
 *       { "type": "image",  "src": "media/x.png", "alt": "X" },
 *       { "type": "button", "label": "Unlock", "command": "unlock",
 *         "param": "front", "topic": "paradox/room/commands" }
 *     ]
 *   }
 *
 * A `button` item publishes { command, param? } to `topic` (defaults to
 * `<topicRoot>/commands`) via the shared MQTT client.
 */
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function factory(config, ctx) {
        var root = null;
        var buttonHandlers = [];

        function commandTopic(item) {
            if (item.topic) return item.topic;
            var topicRoot = (ctx.config && ctx.config.topicRoot) || '';
            return topicRoot ? topicRoot + '/commands' : null;
        }

        function buildItem(item) {
            if (item.type === 'text') {
                var tag = /^(h1|h2|h3|h4|h5|h6|p|span|div|small)$/.test(item.tag || '') ? item.tag : 'p';
                return '<' + tag + ' class="pxd-content-text">' + esc(item.text) + '</' + tag + '>';
            }
            if (item.type === 'image') {
                return '<img class="pxd-content-image" src="' + esc(item.src) + '" alt="' + esc(item.alt || '') + '">';
            }
            if (item.type === 'button') {
                var idx = buttonHandlers.length;
                buttonHandlers.push(item);
                return '<button type="button" class="btn btn-primary pxd-content-btn" data-cbtn="' + idx + '">' +
                    esc(item.label || 'Button') + '</button>';
            }
            return '';
        }

        function buildInner() {
            if (typeof config.html === 'string') return config.html;
            var items = Array.isArray(config.items) ? config.items : [];
            return '<div class="pxd-content-items">' + items.map(buildItem).join('') + '</div>';
        }

        return {
            mount: function (el) {
                root = el;
                var titleHtml = config.title
                    ? '<div class="panel-header panel-header-tight"><h2 class="panel-title">' +
                      esc(config.title) + '</h2></div>'
                    : '';
                el.innerHTML = '<section class="panel panel-content">' + titleHtml +
                    '<div class="pxd-content-body">' + buildInner() + '</div></section>';

                el.querySelectorAll('[data-cbtn]').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var item = buttonHandlers[Number(btn.getAttribute('data-cbtn'))];
                        if (!item) return;
                        var topic = commandTopic(item);
                        if (!topic) { console.warn('[content] no command topic for button', item); return; }
                        var payload = { command: item.command };
                        if (item.param !== undefined) payload.param = item.param;
                        ctx.mqtt.publish(topic, payload);
                    });
                });
            },
            unmount: function () {
                if (root) root.innerHTML = '';
                buttonHandlers = [];
            }
        };
    }

    PxD.panes.registerType('content', factory);
})();
