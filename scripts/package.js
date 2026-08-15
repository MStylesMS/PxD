#!/usr/bin/env node
/**
 * PxD Packager v2 — scripts/package.js
 *
 * Assembles one or more self-contained "sites" for a room from a single
 * pxdVersion:"2" room.json (see docs/ROOMS.md, docs/PANES.md,
 * docs/PR_FLEXIBLE_SITES_AND_PANES.md):
 *   - `pxd` sites are fully generated (one HTML file per page) into
 *     <out>/<siteId>/, which is CLEANED AND REBUILT every run.
 *   - `external` sites are not built locally; they only appear as a link on
 *     the auto-generated landing page.
 *   - `manual` sites are never written to or deleted — only linked.
 *   - <out>/index.html is ALWAYS (re)generated: a redirect if there is
 *     exactly one buildable/linkable site, otherwise a link-list landing page.
 *
 * Safety: a `pxd` site's output subfolder is only ever deleted if it either
 * doesn't exist yet, or already contains this packager's `.pxd-generated`
 * marker file. A folder that exists without that marker is left completely
 * alone and the build for that site fails loudly — this is the guard against
 * ever deleting a `manual` or hand-made folder that happens to share a site id.
 *
 * Usage:
 *   node scripts/package.js --room-dir <path/to/room/pxd> --out <path/to/html>
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MARKER_FILE = '.pxd-generated';

// Unique per package run — stamped into HTML and used as ?v= cache-buster so
// browsers that previously received long-lived Cache-Control on .js/.css still
// pick up rebuilt control UI assets after a package.
const BUILD_ID = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

// ── Argument parsing ────────────────────────────────────────────────────────
function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--room-dir') { args.roomDir = argv[i + 1]; i++; }
        if (argv[i] === '--out') { args.out = argv[i + 1]; i++; }
    }
    return args;
}

// ── File helpers ────────────────────────────────────────────────────────────
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function copyFile(src, dest) { ensureDir(path.dirname(dest)); fs.copyFileSync(src, dest); }

function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;
    ensureDir(dest);
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(s, d);
        else copyFile(s, d);
    }
}

function writeFile(dest, content) { ensureDir(path.dirname(dest)); fs.writeFileSync(dest, content, 'utf8'); }

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Site/page resolution (mirrors pxd.js runtime's resolveSites) ──────────
function resolveSites(config) {
    if (Array.isArray(config.sites) && config.sites.length) return config.sites;
    return [{
        id: 'control', title: config.title || 'Control', type: 'pxd',
        pages: [{ id: 'main', title: 'Main', panes: config.panes || [] }]
    }];
}

function uniquePaneTypes(site, page) {
    const set = {};
    const collect = (paneCfg) => { if (paneCfg && paneCfg.type && paneCfg.type !== 'divider') set[paneCfg.type] = true; };
    (page.panes || []).forEach(collect);
    if (site.header) collect(site.header);
    if (site.footer) collect(site.footer);
    return Object.keys(set);
}

// ── Theme resolution ────────────────────────────────────────────────────────
// config.theme is "<name>" or { base: "<name>", overrides: {...}, fonts: [...] }.
// Resolves to { tokens, fonts, themeFontsDir }: `tokens` is a flat token object
// (pxd.js's runtime applyTheme expects flat tokens), `fonts` is the merged
// @font-face list (the named theme's own fonts, plus any room.json
// theme.fonts entries added/overriding by family name), and `themeFontsDir` is
// the on-disk folder (if any) the named theme's own font FILES live in, so
// buildPxdSite can copy them into the site output alongside the room's own
// `fonts/` folder.
function resolveTheme(config, fwDir) {
    const themeCfg = config.theme;
    if (!themeCfg) return { tokens: {}, fonts: [], themeFontsDir: null };

    const baseName = typeof themeCfg === 'string' ? themeCfg : themeCfg.base;
    const overrides = (typeof themeCfg === 'object' && themeCfg.overrides) || {};
    const roomFonts = (typeof themeCfg === 'object' && Array.isArray(themeCfg.fonts)) ? themeCfg.fonts : [];

    let tokens = {};
    let themeFonts = [];
    let themeFontsDir = null;
    if (baseName) {
        const themeDir = path.join(fwDir, 'themes', baseName);
        const themePath = path.join(themeDir, 'theme.json');
        if (fs.existsSync(themePath)) {
            try {
                const theme = JSON.parse(fs.readFileSync(themePath, 'utf8'));
                tokens = Object.assign({}, theme.tokens || {});
                themeFonts = Array.isArray(theme.fonts) ? theme.fonts : [];
                const candidateFontsDir = path.join(themeDir, 'fonts');
                if (fs.existsSync(candidateFontsDir)) themeFontsDir = candidateFontsDir;
            } catch (e) {
                console.warn(`  [warn]   Failed to parse theme "${baseName}": ${e.message}`);
            }
        } else {
            console.warn(`  [warn]   Theme "${baseName}" not found at ${themePath}`);
        }
    } else if (typeof themeCfg === 'object') {
        // Legacy-style inline token object (no named base) — used as-is.
        tokens = Object.assign({}, themeCfg);
        delete tokens.base;
        delete tokens.overrides;
        delete tokens.fonts;
    }

    // Merge fonts: the named theme's own fonts first, then any room.json
    // theme.fonts entries — matched by `family` so a room can add an extra
    // face or override a theme font's src without losing the rest.
    const fontMap = {};
    themeFonts.forEach((f) => { if (f && f.family) fontMap[f.family] = f; });
    roomFonts.forEach((f) => { if (f && f.family) fontMap[f.family] = f; });
    const mergedFonts = Object.keys(fontMap).map((k) => fontMap[k]);

    return { tokens: Object.assign({}, tokens, overrides), fonts: mergedFonts, themeFontsDir };
}

// ── Framework asset copy (shared by every pxd site) ─────────────────────────
function copyFrameworkAssets(fwDir, siteOutDir, paneTypes, roomDir, layoutId) {
    copyDir(path.join(fwDir, 'assets', 'css'), path.join(siteOutDir, 'assets', 'css'));

    const jsDst = path.join(siteOutDir, 'assets', 'js');
    for (const f of ['pxd.js', 'jquery.min.js', 'paho-mqtt.js', 'bootstrap.bundle.min.js']) {
        const src = path.join(fwDir, 'assets', 'js', f);
        if (fs.existsSync(src)) copyFile(src, path.join(jsDst, f));
        else console.warn(`  [warn]   vendor JS not found: ${f}`);
    }

    // Panes: room-local (roomDir/panes/<type>.js) override framework
    // (assets/js/panes/<type>.js), same override convention v1 panels used.
    const paneFwSrc = path.join(fwDir, 'assets', 'js', 'panes');
    const paneLocalSrc = path.join(roomDir, 'panes');
    const paneDst = path.join(jsDst, 'panes');
    let copied = 0, local = 0;
    for (const type of paneTypes) {
        const localSrc = path.join(paneLocalSrc, type + '.js');
        const fwSrc = path.join(paneFwSrc, type + '.js');
        const dst = path.join(paneDst, type + '.js');
        if (fs.existsSync(localSrc)) { copyFile(localSrc, dst); copied++; local++; }
        else if (fs.existsSync(fwSrc)) { copyFile(fwSrc, dst); copied++; }
        else console.warn(`  [warn]   Pane type not found (framework or room-local): ${type}`);
    }

    const layoutDir = path.join(fwDir, 'layouts', layoutId);
    for (const f of ['layout.css', 'layout.js']) {
        const src = path.join(layoutDir, f);
        if (fs.existsSync(src)) {
            copyFile(src, path.join(siteOutDir, 'assets', f === 'layout.css' ? path.join('css', f) : path.join('js', f)));
        }
    }

    return { copied, local };
}

// ── Build a single `pxd` site ────────────────────────────────────────────────
function buildPxdSite(site, config, roomDir, outDir, fwDir, theme) {
    const siteOutDir = path.join(outDir, site.id);
    const layoutId = config.layout || 'default-dashboard';
    const layoutDir = path.join(fwDir, 'layouts', layoutId);
    const layoutHtmlPath = path.join(layoutDir, 'layout.html');

    if (!fs.existsSync(layoutDir) || !fs.existsSync(layoutHtmlPath)) {
        console.error(`  [error]  Layout "${layoutId}" not found for site "${site.id}" — skipping.`);
        return false;
    }

    // ── Safety-gated clean ──────────────────────────────────────────────────
    if (fs.existsSync(siteOutDir)) {
        const markerPath = path.join(siteOutDir, MARKER_FILE);
        if (!fs.existsSync(markerPath)) {
            console.error(
                `  [error]  "${siteOutDir}" already exists and is not a previously-generated ` +
                `PxD site (no ${MARKER_FILE} marker found). Refusing to overwrite — remove it ` +
                `manually first if it is safe to replace. Skipping site "${site.id}".`
            );
            return false;
        }
        fs.rmSync(siteOutDir, { recursive: true, force: true });
    }
    ensureDir(siteOutDir);

    const pages = site.pages || [];
    if (!pages.length) {
        console.warn(`  [warn]   Site "${site.id}" has no pages — skipping.`);
        return false;
    }

    // Union of every pane type needed across every page in this site.
    const allTypes = {};
    pages.forEach((p) => uniquePaneTypes(site, p).forEach((t) => { allTypes[t] = true; }));
    const { copied, local } = copyFrameworkAssets(fwDir, siteOutDir, Object.keys(allTypes), roomDir, layoutId);

    const layoutHtmlSrc = fs.readFileSync(layoutHtmlPath, 'utf8');
    pages.forEach((pageObj, idx) => {
        let html = layoutHtmlSrc
            .replace(/\{\{PXD_TITLE\}\}/g, escapeHtml(pageObj.title || config.title || 'PxD'))
            .replace(/\{\{PXD_SITE\}\}/g, escapeHtml(site.id))
            .replace(/\{\{PXD_PAGE\}\}/g, escapeHtml(pageObj.id))
            .replace(/\{\{PXD_BUILD\}\}/g, escapeHtml(BUILD_ID));
        writeFile(path.join(siteOutDir, pageObj.id + '.html'), html);
        if (idx === 0) writeFile(path.join(siteOutDir, 'index.html'), html); // default page for this site
    });

    // Site-local room.json copy, with the theme resolved to flat tokens (+
    // merged font list) so pxd.js's runtime applyTheme()/injectFonts() (both
    // unchanged since v1/early v2) work as-is.
    const siteRoomJson = Object.assign({}, config, {
        theme: Object.assign({}, theme.tokens, theme.fonts.length ? { fonts: theme.fonts } : {})
    });
    writeFile(path.join(siteOutDir, 'room.json'), JSON.stringify(siteRoomJson, null, 2));

    const mediaSrc = path.join(roomDir, 'media');
    if (fs.existsSync(mediaSrc)) copyDir(mediaSrc, path.join(siteOutDir, 'media'));
    // Theme fonts first (named theme's own font files), then room-local
    // fonts/ (room can add extra faces or override a same-named file).
    if (theme.themeFontsDir) copyDir(theme.themeFontsDir, path.join(siteOutDir, 'fonts'));
    const fontsSrc = path.join(roomDir, 'fonts');
    if (fs.existsSync(fontsSrc)) copyDir(fontsSrc, path.join(siteOutDir, 'fonts'));
    const widgetsSrc = path.join(roomDir, 'widgets');
    if (fs.existsSync(widgetsSrc) && fs.readdirSync(widgetsSrc).filter((f) => !f.startsWith('.')).length > 0) {
        copyDir(widgetsSrc, path.join(siteOutDir, 'widgets'));
    }
    const cvLocalSrc = path.join(roomDir, 'camera-view.local.json');
    if (fs.existsSync(cvLocalSrc)) copyFile(cvLocalSrc, path.join(siteOutDir, 'camera-view.local.json'));

    // Marker — proves this folder was produced by this packager, and is the
    // gate that allows a future run to safely clean-and-rebuild it again.
    writeFile(path.join(siteOutDir, MARKER_FILE), new Date().toISOString());

    console.log(`  [site]   "${site.id}" → ${pages.length} page(s), ${copied} pane type(s) copied` +
        (local ? ` (${local} room-local)` : ''));
    return true;
}

// ── Landing page ─────────────────────────────────────────────────────────────
/** Default Game Views site ids (order preserved from room.json when present). */
const DEFAULT_GAME_VIEW_IDS = new Set(['simple', 'live', 'live-transcript']);

function siteHref(s) {
    if (s.type === 'external') return s.url || '';
    return s.id ? `${s.id}/index.html` : '';
}

function renderLandingItem(s) {
    const href = siteHref(s);
    if (!href) return '';
    return `<li><a href="${escapeHtml(href)}" title="${escapeHtml(s.description || '')}">` +
        `${escapeHtml(s.title || s.id)}</a>` +
        (s.description ? ` <span class="pxd-landing-desc">${escapeHtml(s.description)}</span>` : '') +
        `</li>`;
}

/**
 * Build ordered landing sections.
 *
 * room.json options (all optional):
 *   landing.sections: [ { "title": "Game Views", "sites": ["simple","live",…] }, … ]
 *   site.landingSection: "Game Views" | "Utilities" | custom title
 *
 * Defaults when nothing is set and there are both game-view and other sites:
 *   Game Views  → simple, live, live-transcript (ids present, room order)
 *   Utilities   → everything else; system-health / health last
 */
function buildLandingSections(sites, config) {
    const linkable = sites.filter((s) => siteHref(s));
    if (!linkable.length) return [];

    const landing = config.landing || {};
    if (Array.isArray(landing.sections) && landing.sections.length) {
        const byId = new Map(linkable.map((s) => [s.id, s]));
        const used = new Set();
        const sections = [];
        for (const sec of landing.sections) {
            const title = String(sec.title || sec.id || 'Section').trim() || 'Section';
            const ids = Array.isArray(sec.sites) ? sec.sites : [];
            const items = [];
            for (const id of ids) {
                const s = byId.get(id);
                if (s) { items.push(s); used.add(id); }
            }
            if (items.length) sections.push({ title, items });
        }
        const leftovers = linkable.filter((s) => !used.has(s.id));
        if (leftovers.length) {
            const util = sections.find((s) => /^utilities$/i.test(s.title));
            if (util) util.items.push(...leftovers);
            else sections.push({ title: 'Utilities', items: leftovers });
        }
        // Ensure system-health / health is last within Utilities
        for (const sec of sections) {
            if (!/^utilities$/i.test(sec.title)) continue;
            sec.items.sort((a, b) => {
                const ah = (a.id === 'system-health' || a.id === 'health') ? 1 : 0;
                const bh = (b.id === 'system-health' || b.id === 'health') ? 1 : 0;
                return ah - bh;
            });
        }
        return sections;
    }

    // Per-site landingSection labels
    const hasPerSite = linkable.some((s) => s.landingSection);
    if (hasPerSite) {
        const order = [];
        const map = new Map();
        for (const s of linkable) {
            const title = String(s.landingSection || 'Utilities').trim() || 'Utilities';
            if (!map.has(title)) {
                map.set(title, []);
                order.push(title);
            }
            map.get(title).push(s);
        }
        return order.map((title) => ({ title, items: map.get(title) }));
    }

    // Default split when classic game-view ids coexist with utilities
    const gameViews = linkable.filter((s) => DEFAULT_GAME_VIEW_IDS.has(s.id));
    const utilities = linkable.filter((s) => !DEFAULT_GAME_VIEW_IDS.has(s.id));
    if (gameViews.length && utilities.length) {
        utilities.sort((a, b) => {
            const ah = (a.id === 'system-health' || a.id === 'health') ? 1 : 0;
            const bh = (b.id === 'system-health' || b.id === 'health') ? 1 : 0;
            return ah - bh;
        });
        return [
            { title: 'Game Views', items: gameViews },
            { title: 'Utilities', items: utilities }
        ];
    }

    // Flat single list (no section headings)
    return [{ title: '', items: linkable }];
}

function buildLandingPage(sites, config, outDir) {
    const buildable = sites.filter((s) => s.type !== 'external' || s.url); // external needs a url to link
    if (buildable.length === 1 && buildable[0].type === 'pxd') {
        const only = buildable[0];
        const target = `${only.id}/index.html`;
        const html = `<!DOCTYPE html>\n<html><head><meta charset="UTF-8">` +
            `<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">` +
            `<title>${escapeHtml(config.title || 'PxD')}</title></head>` +
            `<body><script>location.replace(${JSON.stringify(target)});</script>` +
            `<p>Redirecting to <a href="${escapeHtml(target)}">${escapeHtml(only.title || only.id)}</a>…</p>` +
            `</body></html>\n`;
        writeFile(path.join(outDir, 'index.html'), html);
        console.log(`  [landing] single-site redirect → ${target}`);
        return;
    }

    const logo = config.media && config.media.logo;
    const sections = buildLandingSections(sites, config);
    const bodySections = sections.map((sec) => {
        const items = sec.items.map(renderLandingItem).filter(Boolean).join('\n');
        if (!items) return '';
        if (!sec.title) return `<ul class="pxd-landing-list">${items}</ul>`;
        return `<section class="pxd-landing-section">` +
            `<h2 class="pxd-landing-section-title">${escapeHtml(sec.title)}</h2>` +
            `<ul class="pxd-landing-list">${items}</ul></section>`;
    }).join('\n');

    const html = `<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<title>${escapeHtml(config.title || 'PxD')}</title>` +
        `<style>body{font-family:Arial,sans-serif;background:#111;color:#eee;display:flex;` +
        `flex-direction:column;align-items:center;padding:40px 16px;}` +
        `img{max-width:320px;margin-bottom:24px;}` +
        `.pxd-landing-section{width:100%;max-width:420px;margin:0 0 28px 0;}` +
        `.pxd-landing-section-title{margin:0 0 12px 0;font-size:0.95rem;font-weight:700;` +
        `letter-spacing:0.06em;text-transform:uppercase;color:#bbb;border-bottom:1px solid #333;` +
        `padding-bottom:8px;}` +
        `ul.pxd-landing-list,ul{list-style:none;padding:0;margin:0;width:100%;max-width:420px;}` +
        `li{margin:10px 0;}a{color:#6cf;font-size:1.1rem;text-decoration:none;}a:hover{text-decoration:underline;}` +
        `.pxd-landing-desc{display:block;color:#999;font-size:0.85rem;}</style></head>` +
        `<body>${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(config.title || '')}">` : ''}` +
        `<h1>${escapeHtml(config.title || 'PxD')}</h1>${bodySections}</body></html>\n`;
    writeFile(path.join(outDir, 'index.html'), html);
    const n = sections.reduce((acc, s) => acc + s.items.length, 0);
    const labeled = sections.filter((s) => s.title).length;
    console.log(`  [landing] link list → ${n} site(s)` + (labeled ? `, ${labeled} section(s)` : ''));
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.roomDir || !args.out) {
        console.error('Usage: node scripts/package.js --room-dir <dir> --out <dir>');
        process.exit(1);
    }

    const roomDir = path.resolve(args.roomDir);
    const outDir = path.resolve(args.out);
    const fwDir = path.resolve(__dirname, '..');

    const roomJsonPath = path.join(roomDir, 'room.json');
    if (!fs.existsSync(roomJsonPath)) {
        console.error(`Error: room.json not found at ${roomJsonPath}`);
        process.exit(1);
    }
    let config;
    try {
        config = JSON.parse(fs.readFileSync(roomJsonPath, 'utf8'));
    } catch (e) {
        console.error(`Error: room.json is not valid JSON — ${e.message}`);
        process.exit(1);
    }
    if (config.pxdVersion !== '2') {
        console.error('Error: room.json must have "pxdVersion": "2" (this packager does not support v1 configs — migrate the room first).');
        process.exit(1);
    }

    const sites = resolveSites(config);
    const theme = resolveTheme(config, fwDir);

    console.log('PxD Packager v2');
    console.log(`  Room:    ${roomDir}`);
    console.log(`  Out:     ${outDir}`);
    console.log(`  Sites:   ${sites.map((s) => `${s.id} (${s.type})`).join(', ')}`);

    ensureDir(outDir);

    for (const site of sites) {
        if (site.type === 'pxd' || !site.type) {
            buildPxdSite(Object.assign({ type: 'pxd' }, site), config, roomDir, outDir, fwDir, theme);
        } else if (site.type === 'manual') {
            console.log(`  [site]   "${site.id}" is manual — not touched.`);
        } else if (site.type === 'external') {
            console.log(`  [site]   "${site.id}" is external — link only (${site.url}).`);
        } else {
            console.warn(`  [warn]   Unknown site type "${site.type}" for "${site.id}" — treated as manual (not touched).`);
        }
    }

    buildLandingPage(sites, config, outDir);

    console.log(`\nDone. Output: ${outDir}`);
}

main();
