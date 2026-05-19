#!/usr/bin/env node
/**
 * PxD Packager — scripts/package.test.js
 *
 * Minimal smoke tests for the packager. Run with:
 *   node scripts/package.test.js
 *
 * Tests:
 *   1. Packager produces index.html, room.json, assets/css, assets/js
 *   2. index.html contains the room title
 *   3. Only panels listed in panels.include are included
 *   4. Missing room.json causes non-zero exit
 */
'use strict';

const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { execSync } = require('child_process');

const PACKAGER  = path.resolve(__dirname, 'package.js');
const FW_DIR    = path.resolve(__dirname, '..');
const ROOMS_DIR = path.join(FW_DIR, 'rooms');

let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) {
        console.log('  PASS', label);
        passed++;
    } else {
        console.error('  FAIL', label);
        failed++;
    }
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
        return { ok: false };
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'pxd-test-'));
}

function makeRoomDir(roomJson) {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'room.json'), JSON.stringify(roomJson, null, 2));
    fs.mkdirSync(path.join(dir, 'media'));
    fs.writeFileSync(path.join(dir, 'media', 'favicon.ico'), '');
    fs.writeFileSync(path.join(dir, 'media', 'hero.png'), '');
    return dir;
}

function cleanup(dir) {
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ── Test: basic happy path ─────────────────────────────────────────────────
console.log('\nTest 1: Basic packager output');
{
    const roomDir = makeRoomDir({
        pxdVersion: '1',
        layout: 'default-dashboard',
        title: 'Test Room',
        topicRoot: 'paradox/test',
        mqtt: { broker: 'auto', port: 'auto', wsPath: '/mqtt' },
        panels: { include: ['game-control', 'system'] }
    });
    const outDir = makeTempDir();
    const result = run(`--room-dir ${roomDir} --out ${outDir}`);
    if (result.ok) {
        assert(fs.existsSync(path.join(outDir, 'index.html')),         'index.html exists');
        assert(fs.existsSync(path.join(outDir, 'room.json')),          'room.json exists');
        assert(fs.existsSync(path.join(outDir, 'assets', 'css', 'bootstrap.min.css')), 'bootstrap.min.css copied');
        assert(fs.existsSync(path.join(outDir, 'assets', 'css', 'pxd-base.css')),      'pxd-base.css copied');
        assert(fs.existsSync(path.join(outDir, 'assets', 'js', 'pxd.js')),             'pxd.js copied');
        assert(fs.existsSync(path.join(outDir, 'assets', 'js', 'jquery.min.js')),      'jquery copied');
        assert(fs.existsSync(path.join(outDir, 'assets', 'js', 'paho-mqtt.js')),       'paho-mqtt copied');
        assert(fs.existsSync(path.join(outDir, 'assets', 'js', 'bootstrap.bundle.min.js')), 'bootstrap.bundle.min.js copied');
        assert(fs.existsSync(path.join(outDir, 'assets', 'js', 'panels', 'game-control.js')), 'game-control panel copied');
        assert(fs.existsSync(path.join(outDir, 'assets', 'js', 'panels', 'system.js')),       'system panel copied');
        // hints.js should NOT be present (not in panels.include)
        assert(!fs.existsSync(path.join(outDir, 'assets', 'js', 'panels', 'hints.js')), 'hints panel NOT copied (not in include)');
        // media copied
        assert(fs.existsSync(path.join(outDir, 'media', 'favicon.ico')), 'media/favicon.ico copied');
    }
    cleanup(roomDir);
    cleanup(outDir);
}

// ── Test: title substitution in index.html ─────────────────────────────────
console.log('\nTest 2: Title substitution in index.html');
{
    const roomDir = makeRoomDir({
        pxdVersion: '1',
        layout: 'default-dashboard',
        title: 'My Test Room',
        topicRoot: 'paradox/x',
        mqtt: { broker: 'auto', port: 'auto', wsPath: '/mqtt' },
        panels: { include: [] }
    });
    const outDir = makeTempDir();
    const result = run(`--room-dir ${roomDir} --out ${outDir}`);
    if (result.ok) {
        const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
        assert(html.includes('<title>My Test Room</title>'), 'title tag contains room title');
        assert(!html.includes('{{PXD_TITLE}}'), 'no unresolved placeholders');
    }
    cleanup(roomDir);
    cleanup(outDir);
}

// ── Test: missing room.json fails ──────────────────────────────────────────
console.log('\nTest 3: Missing room.json causes failure');
{
    const emptyDir = makeTempDir();
    const outDir   = makeTempDir();
    console.log('  (expecting non-zero exit)');
    run(`--room-dir ${emptyDir} --out ${outDir}`, { expectFail: true });
    cleanup(emptyDir);
    cleanup(outDir);
}

// ── Test: room.json without pxdVersion fails ───────────────────────────────
console.log('\nTest 4: room.json missing pxdVersion causes failure');
{
    const roomDir = makeRoomDir({ layout: 'default-dashboard', title: 'Bad Room' });
    const outDir  = makeTempDir();
    console.log('  (expecting non-zero exit)');
    run(`--room-dir ${roomDir} --out ${outDir}`, { expectFail: true });
    cleanup(roomDir);
    cleanup(outDir);
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
