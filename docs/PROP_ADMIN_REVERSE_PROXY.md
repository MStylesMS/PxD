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
| Firmware helper (ESP32) | `props/esp32/px-components/docs/http-proxy.md` |
| Firmware library (ESP32) | `props/esp32/px-components/lib_http_proxy/` |
| Firmware helper (ESP8266) | `props/esp8266/*/src/http_proxy.*` |
| External landing links | [ROOMS.md](ROOMS.md) → `sites[]` `type: "external"` |

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

The trailing slash matters: nginx strips the prefix and forwards `/` to the
prop root.

---

## Room Controller nginx

Each prop gets a location block under `/props/<mdns-label>/`. Nginx proxies to
the prop's mDNS hostname and sets forwarded headers so firmware can rewrite
HTML and redirects for the external path.

### Required headers

| Header | Example | Purpose |
|---|---|---|
| `X-Forwarded-Prefix` | `/props/suitcase` | External path prefix stripped by nginx |

### Optional but recommended

| Header | Example | Purpose |
|---|---|---|
| `X-Forwarded-Host` | `room-controller.example` | Host the browser used |
| `X-Forwarded-Proto` | `https` | Scheme the browser used |

Direct LAN access (`http://<label>.local/`) omits these headers. Firmware must
behave exactly as before when they are absent.

### Example location block

Adjust `<mdns-label>` per prop. Upstream must be the prop's `.local` hostname,
not a LAN IP.

```nginx
location /props/suitcase/ {
    proxy_pass http://suitcase.local/;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Prefix /props/suitcase;
    proxy_set_header X-Forwarded-Host  $host;
    proxy_set_header X-Forwarded-Proto $scheme;

    # WebSockets (if the prop admin UI uses them)
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Reload nginx after adding or changing blocks.

---

## PxD landing links

Declare prop admin UIs as **`external` sites** in `room.json`. They appear on
the room landing page (`/html/index.html`) alongside PxD-generated sites.

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

See [ROOMS.md](ROOMS.md) for the full `sites[]` schema. The starter template
includes a similar pattern for System Health (`url: "/health/"`).

---

## Firmware contract

Props that ship an HTTP admin UI must honour the reverse-proxy headers when
present and remain unchanged for direct LAN access.

1. **Read `X-Forwarded-Prefix`** on each HTML response. When present, inject
   `<base href="/props/<label>/">` immediately after `<head>`.
2. **Use path-relative URLs** in static UI assets and client `fetch` calls
   (`style.css`, `api/state`) so they resolve under the injected base tag.
3. **Accept the proxy `Host` header.** Do not require `Host: <mdns>.local`.
4. **Prefix-aware redirects and absolute URLs.** When emitting `Location` or
   other absolute URLs server-side, combine `X-Forwarded-Proto` +
   `X-Forwarded-Host` + `X-Forwarded-Prefix`.
5. **WebSocket URLs** (if used) must include the same prefix.
6. **Direct LAN unchanged.** When forwarded headers are absent, behaviour must
   match pre-proxy firmware — no broken assets or redirects.

### Implementation pointers

| Platform | Location |
|---|---|
| ESP32 (px-components) | `props/esp32/px-components/lib_http_proxy/` — see `docs/http-proxy.md` |
| ESP8266 (in-tree) | `props/esp8266/*/src/http_proxy.h`, `http_proxy.cpp` |

Both implementations expose the same contract: read forwarded headers, inject
base tag into HTML, join prefix + path for redirects.

---

## Verification checklist

Run these after nginx config and firmware are in place.

### LAN direct

1. Open `http://<label>.local/` from a machine on the venue LAN.
2. Confirm the admin UI loads, assets resolve, and API calls succeed.
3. Confirm no `<base href="...">` injection (headers absent).

### Via Room Controller (`/props/<label>/`)

1. Open `http://<room-controller>/props/<label>/` from the LAN.
2. Confirm the same UI loads with assets and API calls under the prefix.
3. Inspect HTML source: `<base href="/props/<label>/">` should appear after
   `<head>` when proxied.
4. Exercise any forms, redirects, or WebSockets the admin UI uses.

### Tailscale

1. Open `http://<tailscale-host>/props/<label>/` from off-site.
2. Confirm the UI loads (mDNS is not required on the client).
3. Open the PxD landing page over Tailscale and follow the external link — it
   should land on the same proxied URL.

### PxD landing link

1. Add the `external` site to `room.json` with `url: "/props/<label>/"`.
2. Package and deploy the room.
3. From LAN and Tailscale, open the landing page and click the prop link.

---

## What this doc does not cover

- **Tailscale on ESP** — props stay on venue LAN + mDNS; remote access is via
  Room Controller nginx only.
- **DHCP reservations** — upstream uses `.local`, not a fixed IP.
- **A second Tailscale-specific PxD URL** — one path-absolute link is enough.
