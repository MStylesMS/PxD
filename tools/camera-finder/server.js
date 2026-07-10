#!/usr/bin/env node
/**
 * camera-finder — self-contained launcher (no root, no system nginx).
 *
 * Usage:
 *   node server.js [port]
 *
 * What it does:
 *   1. Checks whether a go2rtc instance is already answering on 127.0.0.1:1984
 *      (e.g. the room's persistent go2rtc.service). If so, it is reused as-is
 *      and this tool will NOT touch it or stop it on exit.
 *   2. If nothing is listening, starts a temporary go2rtc container via
 *      `docker run` using ./go2rtc.yaml, and stops+removes that container
 *      when this script exits (Ctrl+C).
 *   3. Serves web/ as static files, proxies /api/ to go2rtc's API/WebSocket,
 *      and serves /monitor/stats from `docker stats` (in-process, no
 *      separate monitor process needed).
 *
 * This tool is meant to be launched temporarily while hunting for/tuning
 * cameras, then closed. It is NOT installed as a service. Once you've found
 * good settings for a camera, copy its `streams:` block from go2rtc.yaml
 * into the room's persistent config (see ../../../config/go2rtc.yaml.example
 * at the repo root, installed as go2rtc.service by PxP / room setup).
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

const PORT = Number(process.argv[2] || 8090);
const GO2RTC_HOST = '127.0.0.1';
const GO2RTC_PORT = 1984;
const CONTAINER_NAME = 'camera-finder-go2rtc';
const WEB_ROOT = path.join(__dirname, 'web');

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

let startedContainer = false;

function checkGo2rtc() {
  return new Promise((resolve) => {
    const req = http.get({ host: GO2RTC_HOST, port: GO2RTC_PORT, path: '/api/streams', timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function startGo2rtc() {
  console.log('[camera-finder] No go2rtc detected on :1984 — starting a temporary container...');
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' }); // clean up any stale one
  } catch (_) { /* fine if it didn't exist */ }
  execSync(
    `docker run -d --name ${CONTAINER_NAME} --network host --restart unless-stopped ` +
    `-v "${path.join(__dirname, 'go2rtc.yaml')}:/config/go2rtc.yaml" alexxit/go2rtc:latest`,
    { stdio: 'inherit' }
  );
  startedContainer = true;
  console.log(`[camera-finder] Started temporary container "${CONTAINER_NAME}".`);
}

function stopGo2rtcIfOwned() {
  if (!startedContainer) return;
  console.log('\n[camera-finder] Stopping temporary go2rtc container...');
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
  } catch (_) { /* ignore */ }
}

function serveStatic(req, res, urlPath) {
  let filePath = path.join(WEB_ROOT, decodeURIComponent(urlPath));
  if (urlPath === '/' || urlPath === '') filePath = path.join(WEB_ROOT, 'index.html');
  if (!filePath.startsWith(WEB_ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function proxyToGo2rtc(req, res) {
  const opts = {
    host: GO2RTC_HOST, port: GO2RTC_PORT, path: req.url, method: req.method, headers: req.headers,
  };
  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => { res.writeHead(502); res.end('go2rtc unreachable'); });
  req.pipe(proxyReq);
}

function serveMonitorStats(req, res) {
  exec(`docker stats ${startedContainer ? CONTAINER_NAME : ''} --no-stream --format "{{json .}}"`.trim(),
    { timeout: 5000 }, (err, stdout) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (err) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(err.message || err) })); return; }
      // If not our container, just report the first go2rtc-named container found.
      const lines = stdout.trim().split('\n').filter(Boolean);
      const line = startedContainer ? lines[0] : (lines.find((l) => /go2rtc/i.test(l)) || lines[0]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(line || '{}');
    });
}

async function main() {
  const alreadyRunning = await checkGo2rtc();
  if (alreadyRunning) {
    console.log('[camera-finder] Reusing existing go2rtc instance on :1984 (not managed by this tool).');
  } else {
    startGo2rtc();
    // give it a moment to come up
    await new Promise((r) => setTimeout(r, 1500));
  }

  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) return proxyToGo2rtc(req, res);
    if (req.url.startsWith('/monitor/stats')) return serveMonitorStats(req, res);
    return serveStatic(req, res, req.url.split('?')[0]);
  });

  server.listen(PORT, () => {
    console.log(`[camera-finder] Open http://<this-machine-ip>:${PORT}/  (Ctrl+C to stop)`);
  });

  process.on('SIGINT', () => { stopGo2rtcIfOwned(); process.exit(0); });
  process.on('SIGTERM', () => { stopGo2rtcIfOwned(); process.exit(0); });
}

main();
