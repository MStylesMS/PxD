#!/usr/bin/env node
/**
 * PxD Packager — scripts/package.js
 *
 * Assembles a self-contained operator UI for a single room by combining:
 *   - PxD framework assets (CSS, JS, vendor libs)
 *   - The room's layout template (HTML)
 *   - Panel JS files (only those listed in room.json → panels.include)
 *   - Room-specific assets (media, fonts, widgets)
 *   - room.json (verbatim copy)
 *
 * Usage:
 *   node scripts/package.js --room-dir <path/to/room/pxd> --out <path/to/output>
 *
 * Example (run from apps/PxD/):
 *   node scripts/package.js \
 *     --room-dir ../../rooms/agent22/pxd \
 *     --out      ../../rooms/agent22/html
 *
 * The output directory is safe to overwrite; the packager does not delete
 * files that are no longer referenced — clean the directory manually if needed.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Argument parsing ───────────────────────────────────────────────────────
function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--room-dir') { args.roomDir = argv[i + 1]; i++; }
        if (argv[i] === '--out')      { args.out     = argv[i + 1]; i++; }
    }
    return args;
}

// ── File helpers ───────────────────────────────────────────────────────────
function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

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

function writeFile(dest, content) {
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, content, 'utf8');
}

// ── Main ───────────────────────────────────────────────────────────────────
function main() {
    const args = parseArgs(process.argv.slice(2));

    if (!args.roomDir || !args.out) {
        console.error('Usage: node scripts/package.js --room-dir <dir> --out <dir>');
        process.exit(1);
    }

    // Resolve paths relative to cwd
    const roomDir  = path.resolve(args.roomDir);
    const outDir   = path.resolve(args.out);
    const fwDir    = path.resolve(__dirname, '..'); // apps/PxD/

    // ── 1. Load and validate room.json ────────────────────────────────────
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

    if (!config.pxdVersion) {
        console.error('Error: room.json missing required field "pxdVersion"');
        process.exit(1);
    }

    const layoutId = config.layout || 'default-dashboard';
    const title    = config.title  || 'PxD';
    const panels   = (config.panels && config.panels.include) || [];

    console.log(`PxD Packager`);
    console.log(`  Room:    ${roomDir}`);
    console.log(`  Layout:  ${layoutId}`);
    console.log(`  Panels:  ${panels.join(', ') || '(none)'}`);
    console.log(`  Out:     ${outDir}`);

    ensureDir(outDir);

    // ── 2. Copy vendor CSS ─────────────────────────────────────────────────
    const cssSrc = path.join(fwDir, 'assets', 'css');
    const cssDst = path.join(outDir, 'assets', 'css');
    copyDir(cssSrc, cssDst);
    console.log('  [css]    assets/css/ copied');

    // ── 3. Copy vendor JS (pxd.js, jquery, paho, bootstrap) ──────────────
    const jsSrc = path.join(fwDir, 'assets', 'js');
    const jsDst = path.join(outDir, 'assets', 'js');
    for (const f of ['pxd.js', 'jquery.min.js', 'paho-mqtt.js', 'bootstrap.bundle.min.js']) {
        const src = path.join(jsSrc, f);
        if (fs.existsSync(src)) {
            copyFile(src, path.join(jsDst, f));
        } else {
            console.warn(`  [warn]   vendor JS not found: ${f}`);
        }
    }
    console.log('  [js]     assets/js/ core files copied');

    // ── 4. Copy panel JS files ────────────────────────────────────────────
    // Resolution order: room-local panels (roomDir/panels/) override framework
    // panels (assets/js/panels/). This lets rooms supply custom or variant
    // panels without touching the framework.
    const panelFwSrc    = path.join(jsSrc, 'panels');
    const panelLocalSrc = path.join(roomDir, 'panels');
    const panelDst      = path.join(jsDst, 'panels');
    ensureDir(panelDst);
    let panelsCopied = 0;
    let panelsLocal  = 0;
    for (const panelId of panels) {
        const localSrc = path.join(panelLocalSrc, panelId + '.js');
        const fwSrc    = path.join(panelFwSrc,    panelId + '.js');
        const dst      = path.join(panelDst,       panelId + '.js');
        if (fs.existsSync(localSrc)) {
            copyFile(localSrc, dst);
            panelsCopied++;
            panelsLocal++;
        } else if (fs.existsSync(fwSrc)) {
            copyFile(fwSrc, dst);
            panelsCopied++;
        } else {
            console.warn(`  [warn]   Panel not found (framework or room-local): ${panelId}.js`);
        }
    }
    const localNote = panelsLocal > 0 ? ` (${panelsLocal} room-local)` : '';
    console.log(`  [panels] ${panelsCopied} panel(s) copied${localNote}`);

    // ── 5. Copy layout CSS/JS (if present) ───────────────────────────────
    const layoutDir = path.join(fwDir, 'layouts', layoutId);
    if (!fs.existsSync(layoutDir)) {
        console.error(`Error: Layout "${layoutId}" not found at ${layoutDir}`);
        process.exit(1);
    }
    for (const f of ['layout.css', 'layout.js']) {
        const src = path.join(layoutDir, f);
        if (fs.existsSync(src)) {
            copyFile(src, path.join(outDir, 'assets', 'css', f === 'layout.css' ? f : path.join('..', 'js', f)));
        }
    }

    // ── 6. Generate index.html from layout.html template ─────────────────
    const layoutHtmlPath = path.join(layoutDir, 'layout.html');
    if (!fs.existsSync(layoutHtmlPath)) {
        console.error(`Error: layout.html not found at ${layoutHtmlPath}`);
        process.exit(1);
    }
    let layoutHtml = fs.readFileSync(layoutHtmlPath, 'utf8');
    // Substitute template placeholders
    layoutHtml = layoutHtml.replace(/\{\{PXD_TITLE\}\}/g, escapeHtml(title));
    writeFile(path.join(outDir, 'index.html'), layoutHtml);
    console.log('  [html]   index.html generated');

    // ── 7. Copy room.json ─────────────────────────────────────────────────
    copyFile(roomJsonPath, path.join(outDir, 'room.json'));
    console.log('  [cfg]    room.json copied');

    // ── 8. Copy room media ────────────────────────────────────────────────
    const mediaSrc = path.join(roomDir, 'media');
    if (fs.existsSync(mediaSrc)) {
        copyDir(mediaSrc, path.join(outDir, 'media'));
        console.log('  [media]  media/ copied');
    }

    // ── 9. Copy room fonts ────────────────────────────────────────────────
    const fontsSrc = path.join(roomDir, 'fonts');
    if (fs.existsSync(fontsSrc)) {
        copyDir(fontsSrc, path.join(outDir, 'fonts'));
        console.log('  [fonts]  fonts/ copied');
    }

    // ── 10. Copy room widgets (placeholder for Phase 3) ───────────────────
    const widgetsSrc = path.join(roomDir, 'widgets');
    if (fs.existsSync(widgetsSrc) && fs.readdirSync(widgetsSrc).filter(f => !f.startsWith('.')).length > 0) {
        copyDir(widgetsSrc, path.join(outDir, 'widgets'));
        console.log('  [widgets] widgets/ copied');
    }

    // ── 11. Copy camera-view local override (optional, hand-maintained) ──
    // Not part of room.json — lets an operator persist camera URL tweaks
    // (edit the source file, or the deployed copy directly) without needing
    // a full repackage-and-redeploy cycle to see them take effect.
    const cvLocalSrc = path.join(roomDir, 'camera-view.local.json');
    if (fs.existsSync(cvLocalSrc)) {
        copyFile(cvLocalSrc, path.join(outDir, 'camera-view.local.json'));
        console.log('  [camera] camera-view.local.json copied');
    }

    console.log(`\nDone. Output: ${outDir}`);
}

// ── Utility ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

main();
