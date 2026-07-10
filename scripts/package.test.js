#!/usr/bin/env node
/**
 * PxD Packager v2 — scripts/package.test.js
 *
 * Minimal smoke tests for the packager. Run with:
 *   node scripts/package.test.js
 *
 * Tests:
 *   1. Single pxd site: happy path output + landing-page redirect
 *   2. Multi-site: pxd + external + manual — landing link list, manual/
 *      external untouched, only declared pane types copied
 *   3. Theme resolution: named theme resolves to flat tokens in output room.json
 *   4. Safety: an unmarked existing folder blocks rebuild without deleting it
 *   5. Missing room.json / wrong pxdVersion cause non-zero exit
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PACKAGER = path.resolve(__dirname, 'package.js');

let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) { console.log('  PASS', label); passed++; }
    else { console.error('  FAIL', label); failed++; }
}

function run(args, { expectFail = false } = {}) {
    try {
        const out = execSync(`node ${PACKAGER} ${args}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        if (expectFail) { console.error('  FAIL expected non-zero exit but got zero'); failed++; }
        return { ok: true, output: out };
    } catch (e) {
        if (expectFail) { passed++; return { ok: false }; }
        console.error('  FAIL unexpected error:', e.message);
        failed++;
        return { ok: false, output: (e.stdout || '') + (e.stderr || '') };
    }
}

function makeTempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pxd-test-')); }

function makeRoomDir(roomJson) {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, 'pxd'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'pxd', 'room.json'), JSON.stringify(roomJson, null, 2));
    return path.join(dir, 'pxd');
}

function cleanup(dir) { if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); }

// ── Test 1: single pxd site ─────────────────────────────────────────────────
console.log('\nTest 1: Single pxd site — happy path + redirect landing page');
{
    const roomDir = makeRoomDir({
        pxdVersion: '2', title: 'Test Room', topicRoot: 'paradox/test',
        mqtt: { broker: 'auto', port: 'auto', wsPath: '/mqtt' },
        sites: [{
            id: 'control', title: 'Control', type: 'pxd',
            pages: [{ id: 'main', title: 'Main', panes: [
                { type: 'game-control', width: 'full', config: {} },
                { type: 'system', width: 'full', config: {} }
            ] }]
        }]
    });
    const outDir = makeTempDir();
    const result = run(`--room-dir ${roomDir} --out ${outDir}`);
    if (result.ok) {
        assert(fs.existsSync(path.join(outDir, 'index.html')), 'root index.html (landing) exists');
        const landing = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
        assert(landing.includes('control/index.html'), 'single-site landing redirects to the site');
        assert(fs.existsSync(path.join(outDir, 'control', 'index.html')), 'site index.html exists');
        assert(fs.existsSync(path.join(outDir, 'control', 'main.html')), 'site main.html (per-page) exists');
        assert(fs.existsSync(path.join(outDir, 'control', 'room.json')), 'site room.json exists');
        assert(fs.existsSync(path.join(outDir, 'control', '.pxd-generated')), 'marker file written');
        assert(fs.existsSync(path.join(outDir, 'control', 'assets', 'js', 'panes', 'game-control.js')), 'game-control pane copied');
        assert(fs.existsSync(path.join(outDir, 'control', 'assets', 'js', 'panes', 'system.js')), 'system pane copied');
        assert(!fs.existsSync(path.join(outDir, 'control', 'assets', 'js', 'panes', 'hints.js')), 'hints pane NOT copied (not referenced)');
        const html = fs.readFileSync(path.join(outDir, 'control', 'main.html'), 'utf8');
        assert(html.includes('<title>Main</title>'), 'page title used in generated HTML');
        assert(!html.includes('{{PXD_'), 'no unresolved placeholders');
    }
    cleanup(roomDir); cleanup(outDir);
}

// ── Test 2: multi-site (pxd + external + manual) ────────────────────────────
console.log('\nTest 2: Multi-site — pxd + external + manual');
{
    const roomDir = makeRoomDir({
        pxdVersion: '2', title: 'Multi Room', topicRoot: 'paradox/multi',
        mqtt: { broker: 'auto', port: 'auto', wsPath: '/mqtt' },
        sites: [
            { id: 'simple', title: 'Simple', type: 'pxd',
                pages: [{ id: 'main', title: 'Main', panes: [{ type: 'content', width: 'full', config: {} }] }] },
            { id: 'ext', title: 'External', type: 'external', url: 'http://example.test/' },
            { id: 'manual-site', title: 'Manual', type: 'manual' }
        ]
    });
    const outDir = makeTempDir();
    const result = run(`--room-dir ${roomDir} --out ${outDir}`);
    if (result.ok) {
        const landing = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
        assert(landing.includes('simple/index.html'), 'landing links to pxd site');
        assert(landing.includes('http://example.test/'), 'landing links to external site url');
        assert(landing.includes('manual-site/index.html'), 'landing links to manual site path');
        assert(!fs.existsSync(path.join(outDir, 'ext')), 'no folder created for external site');
        assert(!fs.existsSync(path.join(outDir, 'manual-site')), 'no folder created for manual site');
        assert(fs.existsSync(path.join(outDir, 'simple', 'index.html')), 'pxd site still built normally');
    }
    cleanup(roomDir); cleanup(outDir);
}

// ── Test 3: theme resolution ─────────────────────────────────────────────────
console.log('\nTest 3: Named theme resolves to flat tokens');
{
    const roomDir = makeRoomDir({
        pxdVersion: '2', title: 'Themed Room', topicRoot: 'paradox/themed',
        mqtt: { broker: 'auto', port: 'auto', wsPath: '/mqtt' },
        theme: { base: 'haunted-manor', overrides: { accent: '#123456' } },
        sites: [{ id: 'control', title: 'Control', type: 'pxd',
            pages: [{ id: 'main', title: 'Main', panes: [] }] }]
    });
    const outDir = makeTempDir();
    const result = run(`--room-dir ${roomDir} --out ${outDir}`);
    if (result.ok) {
        const site = JSON.parse(fs.readFileSync(path.join(outDir, 'control', 'room.json'), 'utf8'));
        assert(site.theme.bgColor1 === '#1a1310', 'base theme token present (bgColor1 from haunted-manor)');
        assert(site.theme.accent === '#123456', 'override applied on top of base theme');
        assert(typeof site.theme.base !== 'object', 'resolved theme is flat, not {base,overrides}');
    }
    cleanup(roomDir); cleanup(outDir);
}

// ── Test 4: safety — unmarked folder blocks rebuild ─────────────────────────
console.log('\nTest 4: Unmarked existing folder is never deleted');
{
    const roomDir = makeRoomDir({
        pxdVersion: '2', title: 'Safety Room', topicRoot: 'paradox/safety',
        mqtt: { broker: 'auto', port: 'auto', wsPath: '/mqtt' },
        sites: [{ id: 'control', title: 'Control', type: 'pxd',
            pages: [{ id: 'main', title: 'Main', panes: [] }] }]
    });
    const outDir = makeTempDir();
    fs.mkdirSync(path.join(outDir, 'control'), { recursive: true });
    fs.writeFileSync(path.join(outDir, 'control', 'DO_NOT_DELETE.txt'), 'hand-made content');

    const result = run(`--room-dir ${roomDir} --out ${outDir}`);
    assert(result.ok, 'packager still exits zero (only that one site is skipped)');
    assert(fs.existsSync(path.join(outDir, 'control', 'DO_NOT_DELETE.txt')), 'hand-made file survived untouched');
    assert(!fs.existsSync(path.join(outDir, 'control', '.pxd-generated')), 'no marker written into the protected folder');

    cleanup(roomDir); cleanup(outDir);
}

// ── Test 5: validation failures ─────────────────────────────────────────────
console.log('\nTest 5: Missing room.json / wrong pxdVersion cause failure');
{
    const emptyDir = makeTempDir();
    const outDir1 = makeTempDir();
    console.log('  (expecting non-zero exit — missing room.json)');
    run(`--room-dir ${emptyDir} --out ${outDir1}`, { expectFail: true });
    cleanup(emptyDir); cleanup(outDir1);

    const v1RoomDir = makeRoomDir({ pxdVersion: '1', title: 'Old Room' });
    const outDir2 = makeTempDir();
    console.log('  (expecting non-zero exit — pxdVersion "1" no longer supported)');
    run(`--room-dir ${v1RoomDir} --out ${outDir2}`, { expectFail: true });
    cleanup(v1RoomDir); cleanup(outDir2);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
