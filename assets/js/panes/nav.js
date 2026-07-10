/**
 * panes/nav.js — Auto-built site navigation pane
 *
 * Renders a compact horizontal link bar to every page in the current site
 * (auto-derived from ctx.site.pages — nothing to hand-maintain), plus any
 * extra static links declared in config. The current page is highlighted and
 * not rendered as a clickable link.
 *
 * config:
 *   { "links": [ { "label": "Amcrest App", "url": "http://10.0.0.29/" } ] }
 *
 * URL convention: each page in a `pxd` site is generated as `<pageId>.html`
 * (the site's first page is ALSO aliased as `index.html` by the packager —
 * see docs/PANES.md and the packager's site-build step). This pane only
 * needs a page's `id` to build a working link.
 *
 * Typically placed as a site's `header` or `footer` pane so it appears on
 * every page without repeating config, per docs/ROOMS.md § nav. Renders
 * nothing (and takes no vertical space) when the site has a single page and
 * no extra links are configured.
 */
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function factory(config, ctx) {
        return {
            mount: function (el) {
                var pages = (ctx.site && ctx.site.pages) || [];
                var extraLinks = Array.isArray(config.links) ? config.links : [];

                if (pages.length <= 1 && !extraLinks.length) {
                    el.style.display = 'none';
                    return;
                }

                var currentId = ctx.page && ctx.page.id;
                var items = pages.map(function (p) {
                    var isCurrent = p.id === currentId;
                    var label = esc(p.title || p.id);
                    return isCurrent
                        ? '<span class="pxd-nav-current">' + label + '</span>'
                        : '<a class="pxd-nav-link" href="' + esc(p.id) + '.html">' + label + '</a>';
                }).concat(extraLinks.map(function (l) {
                    return '<a class="pxd-nav-link pxd-nav-external" href="' + esc(l.url) +
                        '" target="_blank" rel="noopener">' + esc(l.label) + '</a>';
                }));

                el.innerHTML = '<nav class="pxd-nav">' + items.join('') + '</nav>';
            },
            unmount: function () { }
        };
    }

    PxD.panes.registerType('nav', factory);
})();
