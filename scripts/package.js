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
// config.theme is "<name>" or { base: "<name>", overrides: {...} }. Resolves
// to a flat token object (pxd.js's runtime applyTheme expects flat tokens).
function resolveTheme(config, fwDir) {
    const themeCfg = config.theme;
    if (!themeCfg) return {};

    const baseName = typeof themeCfg === 'string' ? themeCfg : themeCfg.base;
    const overrides = (typeof themeCfg === 'object' && themeCfg.overrides) || {};
    const fonts = (typeof themeCfg === 'object' && themeCfg.fonts) || undefined;

    let tokens = {};
    if (baseName) {
        const themePath = path.join(fwDir, 'themes', baseName, 'theme.json');
        if (fs.existsSync(themePath)) {
            try {
                const theme = JSON.parse(fs.readFileSync(themePath, 'utf8'));
                tokens = Object.assign({}, theme.tokens || {});
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
    }

    const resolved = Object.assign({}, tokens, overrides);
    if (fonts) resolved.fonts = fonts;
    return resolved;
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
function buildPxdSite(site, config, roomDir, outDir, fwDir, resolvedThemeTokens) {
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
            .replace(/\{\{PXD_PAGE\}\}/g, escapeHtml(pageObj.id));
        writeFile(path.join(siteOutDir, pageObj.id + '.html'), html);
        if (idx === 0) writeFile(path.join(siteOutDir, 'index.html'), html); // default page for this site
    });

    // Site-local room.json copy, with the theme resolved to flat tokens so
    // pxd.js's runtime applyTheme() (unchanged since v1) works as-is.
    const siteRoomJson = Object.assign({}, config, { theme: resolvedThemeTokens });
    writeFile(path.join(siteOutDir, 'room.json'), JSON.stringify(siteRoomJson, null, 2));

    const mediaSrc = path.join(roomDir, 'media');
    if (fs.existsSync(mediaSrc)) copyDir(mediaSrc, path.join(siteOutDir, 'media'));
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
    const rows = sites.map((s) => {
        const href = s.type === 'external' ? s.url : `${s.id}/index.html`;
        if (!href) return '';
        return `<li><a href="${escapeHtml(href)}" title="${escapeHtml(s.description || '')}">` +
            `${escapeHtml(s.title || s.id)}</a>` +
            (s.description ? ` <span class="pxd-landing-desc">${escapeHtml(s.description)}</span>` : '') +
            `</li>`;
    }).join('\n');

    const html = `<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<title>${escapeHtml(config.title || 'PxD')}</title>` +
        `<style>body{font-family:Arial,sans-serif;background:#111;color:#eee;display:flex;` +
        `flex-direction:column;align-items:center;padding:40px 16px;}` +
        `img{max-width:320px;margin-bottom:24px;}ul{list-style:none;padding:0;width:100%;max-width:420px;}` +
        `li{margin:10px 0;}a{color:#6cf;font-size:1.1rem;text-decoration:none;}a:hover{text-decoration:underline;}` +
        `.pxd-landing-desc{display:block;color:#999;font-size:0.85rem;}</style></head>` +
        `<body>${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(config.title || '')}">` : ''}` +
        `<h1>${escapeHtml(config.title || 'PxD')}</h1><ul>${rows}</ul></body></html>\n`;
    writeFile(path.join(outDir, 'index.html'), html);
    console.log(`  [landing] link list → ${buildable.length} site(s)`);
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
    const resolvedThemeTokens = resolveTheme(config, fwDir);

    console.log('PxD Packager v2');
    console.log(`  Room:    ${roomDir}`);
    console.log(`  Out:     ${outDir}`);
    console.log(`  Sites:   ${sites.map((s) => `${s.id} (${s.type})`).join(', ')}`);

    ensureDir(outDir);

    for (const site of sites) {
        if (site.type === 'pxd' || !site.type) {
            buildPxdSite(Object.assign({ type: 'pxd' }, site), config, roomDir, outDir, fwDir, resolvedThemeTokens);
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
