# PxD — Prop admin HTTP UIs (reverse proxy)

Paradox prop firmware exposes a small HTTP admin UI for setup, diagnostics, and
remote rescue. Operators reach it from the GM dashboard via a **path-absolute**
link that works on the LAN and over Tailscale through the Room Controller nginx
reverse proxy.

**Live game control stays on MQTT and PxD widgets.** The prop HTTP UI is not
part of the running game surface.

Related:

| Piece | Where |
|---|---|
| Suite overview | Paradox `AI-INSTRUCTIONS.md` → Prop admin HTTP UIs |
| Room Controller nginx (live pattern) | `/opt/paradox/config/nginx-paradox.conf` |
| mDNS DNS stub for nginx | `/opt/paradox/scripts/mdns-dns-stub.py` + `config/mdns-dns-stub.service` |
| Firmware helper (ESP32) | `props/esp32/px-components/docs/http-proxy.md` |
| Firmware library (ESP32) | `props/esp32/px-components/lib_http_proxy/` |
| Firmware helper (ESP8266) | `props/esp8266/*/src/http_proxy.*` |
| External landing links | [ROOMS.md](ROOMS.md) → `sites[]` `type: "external"` |
| Firmware agent prompt | [Firmware agent prompt](#firmware-agent-prompt) (copy-paste below) |

---

## Overview

Prop admin UIs are served by the prop itself over HTTP. On the venue LAN,
operators open them directly via mDNS:

```
http://<mdns-label>.local/
```

mDNS does **not** cross Tailscale. A browser on an operator laptop at home
cannot resolve `<label>.local` on the venue network.

The Room Controller nginx terminates HTTP for PxD and proxies a path-absolute
URL to each prop:

```
/props/<mdns-label>/  →  http://<mdns-label>.local/
```

PxD landing links use that same path (`/props/suitcase/`, etc.). One URL works
whether the operator browses from the LAN or over Tailscale — no separate
Tailscale-only link.

---

## URL model

| Access | Browser URL | Upstream |
|---|---|---|
| LAN direct | `http://<label>.local/` | Prop (mDNS) |
| LAN via Room Controller | `http://<pi>/props/<label>/` | nginx → `http://<label>.local/` |
| Tailscale via Room Controller | `http://<tailscale-host>/props/<label>/` | nginx → `http://<label>.local/` |

**Prefer `.local` as the nginx upstream**, not a DHCP-reserved LAN IP. mDNS
keeps working if the prop's address changes; a stale IP breaks the proxy.

**Do not** put `http://<label>.local/` in `room.json` if operators may browse
over Tailscale. Use the path-absolute form so the browser talks to the **same
host** it used for the PxD HTML page:

```json
{
  "id": "suitcase-admin",
  "title": "Suitcase Prop",
  "description": "Wi-Fi setup and diagnostics",
  "type": "external",
  "url": "/props/suitcase/"
}
```

The trailing slash matters: nginx must strip the prefix and forward `/` (and
`/app.js`, `/api/state`, …) to the prop root.

---

## Setup checklist (new prop)

1. Confirm the prop answers on LAN: `http://<label>.local/` and
   `avahi-resolve -n <label>.local` (or `getent hosts <label>.local`) on the
   Room Controller.
2. Add an nginx `location ^~ /props/<label>/` block (HTTP **and** HTTPS) using
   the [production pattern](#production-nginx-pattern) below. Deploy:
   ```bash
   sudo cp /opt/paradox/config/nginx-paradox.conf /etc/nginx/sites-available/paradox
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. Ensure `mdns-dns-stub.service` is enabled (nginx resolver cannot use
   nsswitch/mDNS by itself):
   ```bash
   sudo systemctl enable --now mdns-dns-stub.service
   ```
4. Add a path-absolute `external` site in `room.json` (`url: "/props/<label>/"`).
5. Repackage the room:
   ```bash
   cd /opt/paradox/apps/PxD
   node scripts/package.js --room-dir ../../rooms/<Room>/pxd --out ../../rooms/<Room>/html
   ```
6. Verify with the [checklist](#verification-checklist).

---

## Production nginx pattern

The minimal textbook `proxy_pass http://suitcase.local/;` is **not enough** on
this stack. Use the pattern in `/opt/paradox/config/nginx-paradox.conf`
(summarized here). Adjust `<label>` per prop; keep the same block in **both**
the `:80` and `:443` server blocks.

```nginx
# Once per server block (shared by all /props/ locations):
resolver 127.0.0.1:5354 valid=15s ipv6=off;

# ^~ beats the site-wide ~* \.(css|js|png|...) static regex.
# set must come BEFORE rewrite…break (break skips later rewrite-phase dirs).
location ^~ /props/suitcase/ {
    set $prop_suitcase suitcase.local;
    rewrite ^/props/suitcase/(.*)$ /$1 break;
    proxy_pass http://$prop_suitcase;
    proxy_http_version 1.1;

    # ESP HTTP servers have a tiny header buffer. Tailscale/browser cookies on
    # *.ts.net otherwise yield "Header fields are too long" (HTTP 431).
    proxy_pass_request_headers off;
    proxy_set_header Host $host;
    proxy_set_header Content-Type $content_type;
    proxy_set_header Content-Length $content_length;
    proxy_set_header X-Forwarded-Prefix /props/suitcase;
    proxy_set_header X-Forwarded-Host  $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Accept-Encoding "";

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    # Workaround until firmware uses prefix-aware API URLs (see Firmware contract).
    # Many prop UIs poll fetch("/api/...") from window.location.origin.
    proxy_buffering on;
    sub_filter_types application/javascript text/javascript;
    sub_filter '"/api/' '"/props/suitcase/api/';
    sub_filter_once off;
}
```

### Why each piece exists

| Piece | Why |
|---|---|
| `mdns-dns-stub` on `:5354` | nginx `resolver` speaks DNS only; it does not use nsswitch/mDNS. The stub answers via `getaddrinfo()` so `*.local` works. Also: literal `proxy_pass http://suitcase.local/` fails `nginx -t` when the prop is offline. |
| `location ^~` | Without `^~`, the site-wide `location ~* \.(css\|js\|png\|…)$` steals asset requests and serves from the HTML docroot → 404. |
| `set` then `rewrite … break` then `proxy_pass http://$host` | Variable `proxy_pass` does **not** strip the location prefix. Without rewrite, upstream sees `/props/suitcase/app.js`; many props SPA-fallback that path to `index.html` (HTML served as JS/CSS). `rewrite…break` skips later rewrite-phase `set` — put `set` first. |
| `proxy_pass_request_headers off` | Drops large Tailscale/session `Cookie` / other client headers. Re-add `Content-Type` / `Content-Length` so POSTs still work. |
| `sub_filter` on `"/api/` | Temporary bridge for UIs that call origin-absolute `/api/...`. Remove per prop once firmware honours `X-Forwarded-Prefix` with relative or prefix-aware fetches. Needs `Accept-Encoding ""` and `proxy_buffering on`. |

### Required forwarded headers

| Header | Example | Purpose |
|---|---|---|
| `X-Forwarded-Prefix` | `/props/suitcase` | External path prefix stripped by nginx |

### Optional but recommended

| Header | Example | Purpose |
|---|---|---|
| `X-Forwarded-Host` | `agent22.story-geological.ts.net` | Host the browser used |
| `X-Forwarded-Proto` | `https` | Scheme the browser used |

Direct LAN access (`http://<label>.local/`) omits these headers. Firmware must
behave exactly as before when they are absent.

---

## PxD landing links

Declare prop admin UIs as **`external` sites** in `room.json`. They appear on
the room landing page (`html/index.html`) alongside PxD-generated sites.

```json
"sites": [
  {
    "id": "suitcase-admin",
    "title": "Suitcase Prop",
    "description": "Setup and remote rescue",
    "type": "external",
    "url": "/props/suitcase/"
  }
]
```

Rules:

- **`url` must be path-absolute** (`/props/<label>/`), not `http://<label>.local/`.
- **One link per prop** — the same URL on LAN and Tailscale.
- **Live control** (locks, lights, puzzles) stays in MQTT-bound widgets; do not
  route game commands through the prop HTTP UI.

See [ROOMS.md](ROOMS.md) for the full `sites[]` schema.

---

## Firmware contract

Props that ship an HTTP admin UI must honour the reverse-proxy headers when
present and remain unchanged for direct LAN access.

1. **Read `X-Forwarded-Prefix`** on each HTML response. When present, inject
   `<base href="/props/<label>/">` immediately after `<head>` (trailing slash
   on the base href).
2. **Do not use origin-absolute API paths** like `fetch("/api/state")` when a
   prefix is active. Prefer path-relative (`api/state`, `./api/state`) so they
   resolve under `<base>`, **or** join `X-Forwarded-Prefix + "/api/state"` in JS.
3. **Accept the proxy `Host` header.** Do not require `Host: <mdns>.local`.
4. **Prefix-aware redirects and absolute URLs.** When emitting `Location` or
   other absolute URLs server-side, combine `X-Forwarded-Proto` +
   `X-Forwarded-Host` + `X-Forwarded-Prefix`.
5. **WebSocket URLs** (if used) must include the same prefix.
6. **Tolerate small request headers.** Prop admin auth must not depend on large
   browser cookies forwarded through the proxy (nginx strips them). Direct LAN
   can still use cookies if needed.
7. **Direct LAN unchanged.** When forwarded headers are absent, behaviour must
   match pre-proxy firmware — no broken assets or redirects.

### Implementation pointers

| Platform | Location |
|---|---|
| ESP32 (px-components) | `props/esp32/px-components/lib_http_proxy/` — see `docs/http-proxy.md` |
| ESP8266 (in-tree) | `props/esp8266/*/src/http_proxy.h`, `http_proxy.cpp` |

Both implementations should expose the same contract: read forwarded headers,
inject base tag into HTML, join prefix + path for redirects and API/WS URLs.

**Note (px-wifi-v1 / suitcase):** Live UI updates are HTTP polling of
`/api/state` (≈1 Hz), not WebSockets. Broken “live data” over Tailscale almost
always means absolute `/api/...` fetches hitting the Room Controller, not a WS
proxy issue.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Header fields are too long` / HTTP 431 over Tailscale | Browser sends large `*.ts.net` cookies; ESP header buffer overflows | `proxy_pass_request_headers off` + re-add `Content-Type` / `Content-Length` |
| HTML loads but CSS/JS/images missing or look like HTML | Prefix not stripped **or** `~*` static regex stole the request | Use `location ^~` + `rewrite … break` before variable `proxy_pass` |
| Tabs/navigation always show the Live page | Same as above — `config.html` etc. returned `index.html` | Confirm rewrite: `curl -sI http://127.0.0.1/props/<label>/config.html` → not 3012-byte index |
| No live metrics / API errors in console | JS calls `fetch("/api/...")` at origin root | Keep `sub_filter` workaround **or** fix firmware (preferred) |
| `nginx -t` → `host not found in upstream "….local"` | Literal hostname in `proxy_pass` while prop offline | Variable `proxy_pass` + `resolver 127.0.0.1:5354` + mdns-dns-stub |
| `invalid URL prefix in "http://"` in error.log | `set $upstream` ran **after** `rewrite … break` | Put `set` **before** `rewrite` |
| 502 Host not found / prop offline | Prop not on Wi‑Fi or mDNS down | Check MQTT client, `avahi-resolve -n <label>.local`, power/Wi‑Fi |
| Landing link only works on LAN | `room.json` still has `http://<label>.local/` | Change to `/props/<label>/` and repackage |

Quick probes (on the Room Controller):

```bash
# Prefix stripped + real JS (not HTML)?
curl -sS http://127.0.0.1/props/suitcase/app.js | head -c 80

# API JSON under prefix?
curl -sS http://127.0.0.1/props/suitcase/api/state

# Fat cookies must not 431:
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Cookie: a=$(python3 -c 'print("x"*8000)')" \
  http://127.0.0.1/props/suitcase/

# mDNS stub
systemctl is-active mdns-dns-stub
avahi-resolve -n suitcase.local
```

After nginx or JS-shaping changes, operators should **hard-refresh** the browser
(cached bad `app.js` / CSS is common).

---

## Verification checklist

### LAN direct

1. Open `http://<label>.local/` from a machine on the venue LAN.
2. Confirm the admin UI loads, assets resolve, and API / live updates succeed.
3. Confirm no `<base href="...">` injection (headers absent).

### Via Room Controller (`/props/<label>/`)

1. Open `http://<room-controller>/props/<label>/` from the LAN.
2. Confirm assets (CSS, JS, images), tab navigation, and live/API updates work.
3. Inspect HTML source: with compliant firmware, `<base href="/props/<label>/">`
   appears after `<head>` when proxied.
4. Confirm `curl` sizes: `app.js` and `styles.css` are not the same byte length
   as `index.html`.

### Tailscale

1. Open `http://<tailscale-host>/props/<label>/` from off-site (hard-refresh).
2. Confirm no “Header fields are too long”.
3. Confirm UI + live data; mDNS is not required on the client.
4. Open the PxD landing page over Tailscale and follow the external link.

### PxD landing link

1. `external` site in `room.json` with `url: "/props/<label>/"`.
2. Package and deploy the room.
3. From LAN and Tailscale, open the landing page and click the prop link.

---

## Firmware agent prompt

Copy everything in the block below into a chat with the firmware agent that
owns the prop HTTP admin UI (ESP32 `lib_http_proxy` / ESP8266 `http_proxy` /
px-wifi-v1 console).

```text
Context: Paradox Room Controllers reverse-proxy prop admin UIs at
`/props/<mdns-label>/` → `http://<mdns-label>.local/` so operators can reach
them over Tailscale. Canonical contract:
apps/PxD/docs/PROP_ADMIN_REVERSE_PROXY.md (Firmware contract).

Problem we hit with px-wifi-v1 (suitcase) and similar ESP admin UIs:

1. Over Tailscale, browsers send large cookies for `*.ts.net`. The ESP HTTP
   stack returns "Header fields are too long" / HTTP 431 if those cookies are
   forwarded. Nginx now strips client headers; do not require large cookies for
   admin UI when accessed via proxy.

2. The browser UI calls origin-absolute paths: `fetch("/api/state")`,
   `fetch("/api/command")`, etc. (and may use `window.location.origin` as the
   API base). Behind the proxy that hits the Room Controller root, not the prop.
   Live “dashboard” data on this UI is HTTP polling (~1s), not WebSockets.

3. Firmware does not yet honour `X-Forwarded-Prefix` (no `<base href>` injection,
   no prefix-aware API/redirect URLs). Nginx temporarily rewrites `"/api/` in
   served JS via `sub_filter` — that is a Room Controller workaround, not the
   long-term fix.

Please implement the reverse-proxy contract in firmware so nginx `sub_filter`
can be removed:

Must have:
- On each HTML response, if request has `X-Forwarded-Prefix` (e.g.
  `/props/suitcase`), inject
  `<base href="<prefix>/">` immediately after `<head>` (ensure trailing slash).
- Change the admin JS API helper so that when served over http(s) it does NOT
  use origin-absolute `"/api/..."`. Prefer path-relative URLs (`api/state` or
  `./api/state`) that resolve under `<base>`, OR explicitly prepend the
  forwarded prefix. Same for any WebSocket URL builders.
- Accept arbitrary `Host` (proxy passes the browser host, not `*.local`).
- Prefix-aware `Location` / redirect / absolute URL generation using
  `X-Forwarded-Proto` + `X-Forwarded-Host` + `X-Forwarded-Prefix` when present.
- When those headers are absent (direct LAN `http://<label>.local/`), behaviour
  must be unchanged from today.

Nice to have:
- Document the behaviour in `http-proxy.md` / component README with a curl
  example that sends `X-Forwarded-Prefix` and shows the injected `<base>`.
- Keep request header parsing robust on small ESP buffers; admin session must
  work without forwarded cookies.

Out of scope:
- Putting Tailscale on the ESP.
- Changing MQTT game-control topics.
- Room Controller nginx layout (already deployed).

Acceptance:
- Direct: `http://<label>.local/` — full UI, assets, API polling, no `<base>`.
- Proxied: `http://<room-controller>/props/<label>/` with forwarded headers —
  `<base>` present; CSS/JS/images load; `fetch` hits
  `/props/<label>/api/...`; tabs/navigation work.
- After firmware ships, nginx `sub_filter '"/api/' ...` for that prop can be
  deleted and the UI still works over Tailscale.
```

---

## What this doc does not cover

- **Tailscale on ESP** — props stay on venue LAN + mDNS; remote access is via
  Room Controller nginx only.
- **DHCP reservations** — upstream uses `.local`, not a fixed IP.
- **A second Tailscale-specific PxD URL** — one path-absolute link is enough.
