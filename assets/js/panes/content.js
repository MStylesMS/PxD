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
 *     ],
 *     "aspectRatio": "4.6",       // ideal logo ratio beside status/actions
 *     "forceFit": true,           // contain image in the pane (no skew)
 *     "backgroundColor": "#1C4875" // optional pane fill (shows through alpha)
 *   }
 *
 * Ideal logo aspect ratio (half-width pane beside two quarter-width
 * game-status / game-actions panes at the 1500px shell): **4.6:1**.
 *
 * forceFit: image fills the pane with object-fit:contain — letterbox
 * (top/bottom) when the image is too wide, pillarbox (sides) when too
 * tall, edge-to-edge when the ratios match. Never skews. Transparent
 * pixels show backgroundColor (or the theme panel color).
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

    /** Parse "4.6", "23/5", or "23 / 5" into a CSS aspect-ratio value. */
    function parseAspectRatio(raw) {
        if (raw == null || raw === '') return null;
        if (typeof raw === 'number' && isFinite(raw) && raw > 0) return String(raw);
        var s = String(raw).trim();
        var slash = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
        if (slash) {
            var a = parseFloat(slash[1]);
            var b = parseFloat(slash[2]);
            if (a > 0 && b > 0) return a + ' / ' + b;
            return null;
        }
        var n = parseFloat(s);
        return (isFinite(n) && n > 0) ? String(n) : null;
    }

    /** Allow #rgb / #rrggbb / rgb() / rgba() / named colors for pane fill. */
    function parseBackgroundColor(raw) {
        if (raw == null || raw === '') return null;
        var s = String(raw).trim();
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return s;
        if (/^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+\s*)?\)$/.test(s)) return s;
        if (/^[a-zA-Z]+$/.test(s)) return s;
        return null;
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
                buttonHandlers = [];
                var aspect = parseAspectRatio(config.aspectRatio);
                var forceFit = config.forceFit === true;
                var bg = parseBackgroundColor(config.backgroundColor);
                var titleHtml = config.title
                    ? '<div class="panel-header panel-header-tight"><h2 class="panel-title">' +
                      esc(config.title) + '</h2></div>'
                    : '';
                var bodyInner = buildInner();
                if (forceFit) {
                    bodyInner = '<div class="pxd-content-frame">' + bodyInner + '</div>';
                }
                var panelClass = 'panel panel-content' + (forceFit ? ' panel-content-fit' : '');
                el.innerHTML = '<section class="' + panelClass + '">' + titleHtml +
                    '<div class="pxd-content-body">' + bodyInner + '</div></section>';

                var panel = el.querySelector('.panel-content');
                if (panel) {
                    if (aspect) panel.style.setProperty('--pxd-content-ar', aspect);
                    if (bg) {
                        panel.style.setProperty('--pxd-content-bg', bg);
                        panel.style.background = bg;
                    }
                }
                if (forceFit) {
                    var frame = el.querySelector('.pxd-content-frame');
                    if (frame && aspect) frame.style.setProperty('--pxd-content-ar', aspect);
                }

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
