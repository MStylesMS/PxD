# PxD — go2rtc setup (cameras + Tailscale)

PxD `camera-view` panes do **not** pull RTSP themselves. Each Room Controller
runs a local **go2rtc** process that pulls NVR/camera streams and fans them out
over WebSocket/MSE. The dashboard is only a consumer.

This guide is what to install on a **new Paradox Pi** when a room needs live
cameras (or when cloning the Houdini pattern to Agent 22 / Moscow / etc.).

Related:

| Piece | Where |
|---|---|
| Pane config (`wsUrl`, layout) | [PANES.md](PANES.md) → `camera-view` |
| Discovery / tuning UI | [tools/camera-finder/README.md](../tools/camera-finder/README.md) |
| Host service control | `/opt/paradox/scripts/paradox-control.sh`, `/opt/paradox/docs/SERVICES.md` |

---

## Architecture (why the nginx proxy matters)

```
Browser (LAN or Tailscale)
    │  http://<pi>/live/          → nginx → static PxD HTML
    │  ws://<pi>/go2rtc/api/ws…   → nginx → go2rtc :1984 → NVR RTSP
    ▼
Room Controller Pi
    go2rtc.service     (:1984 API/MSE, :8554 RTSP restream)
    camera-finder.service  (:8090; optional; also at /camera-finder/)
    nginx              proxies /go2rtc/ and /camera-finder/
```

**Do not** put `ws://10.x.x.x:1984/...` in `room.json` if operators browse over
Tailscale from off-site. That LAN IP is unreachable from home. Use the
**path-absolute** form so the browser talks to the **same host** it used for
the HTML page:

```json
"wsUrl": "/go2rtc/api/ws?src=my_stream"
```

`camera-view.js` turns that into `ws://<page-host>/go2rtc/api/ws?src=...`
(or `wss://` if the page is HTTPS). Nginx must proxy `/go2rtc/` → `:1984`.

---

## Checklist (new machine)

1. Install the go2rtc binary  
2. Create `/opt/paradox/config/go2rtc.yaml` with this room’s streams  
3. Install `go2rtc.service` (and optionally `camera-finder.service`)  
4. Wire services into `install-services.sh` / `paradox-control.sh` (if not already)  
5. Add nginx `/go2rtc/` (+ `/camera-finder/`) proxy blocks and reload nginx  
6. Point `room.json` cameras at `/go2rtc/api/ws?src=…`  
7. Package the site; verify on LAN **and** Tailscale  

---

## 1. Install the go2rtc binary

No Docker required. Use the official linux/arm64 (or amd64) release:

```bash
# On the Room Controller (aarch64 Pi example)
sudo mkdir -p /opt/paradox/bin
cd /tmp
curl -sSL -o go2rtc \
  "https://github.com/AlexxIT/go2rtc/releases/download/v1.9.14/go2rtc_linux_arm64"
# amd64: …/go2rtc_linux_amd64
sudo install -m 755 go2rtc /opt/paradox/bin/go2rtc
/opt/paradox/bin/go2rtc -version
```

Pick a current release tag from https://github.com/AlexxIT/go2rtc/releases if
newer than `v1.9.14`.

---

## 2. Stream config — `/opt/paradox/config/go2rtc.yaml`

Copy the example and edit streams for this room:

```bash
sudo cp /opt/paradox/config/go2rtc.yaml.example /opt/paradox/config/go2rtc.yaml
sudoedit /opt/paradox/config/go2rtc.yaml
```

Minimal shape:

```yaml
api:
  listen: ":1984"
  origin: "*"

rtsp:
  listen: ":8554"

webrtc:
  listen: ":8555"

streams:
  # Names must match room.json ?src= values
  foyer: rtsp://USER:PASS@NVR_IP:554/cam/realmonitor?channel=1&subtype=0#backchannel=0
  cell:  rtsp://USER:PASS@NVR_IP:554/cam/realmonitor?channel=2&subtype=0#backchannel=0
  study: rtsp://USER:PASS@NVR_IP:554/cam/realmonitor?channel=4&subtype=0#backchannel=0
```

### Amcrest NV2104E (and similar Dahua-OEM NVRs)

These NVRs use the **Dahua** RTSP path (not Amcrest’s `h264Preview_*` docs):

| Purpose | URL |
|---|---|
| Main | `rtsp://admin:PASS@NVR:554/cam/realmonitor?channel=N&subtype=0` |
| Sub | `…&subtype=1` |
| Still | `http://admin:PASS@NVR/cgi-bin/snapshot.cgi?channel=N` |

`channel` is 1-based. Confirm mapping with stills (or camera-finder) before
shipping dashboard labels.

After edits:

```bash
/opt/paradox/scripts/paradox-control.sh restart
# or: sudo systemctl restart go2rtc
curl -sS http://127.0.0.1:1984/api/streams | head
```

---

## 3. systemd units

Shipped templates (track in the paradox install repo):

| File | Role |
|---|---|
| `/opt/paradox/config/go2rtc.service` | Runs `/opt/paradox/bin/go2rtc -config …/go2rtc.yaml` as `paradox` |
| `/opt/paradox/config/camera-finder.service` | Optional UI on `:8090`; reuses system go2rtc |

Install / enable (Combined or Mirror Room Controllers — not picture-only):

```bash
sudo cp /opt/paradox/config/go2rtc.service /etc/systemd/system/
sudo cp /opt/paradox/config/camera-finder.service /etc/systemd/system/   # optional
sudo systemctl daemon-reload
sudo systemctl enable --now go2rtc.service
sudo systemctl enable --now camera-finder.service   # optional

# Or, if install-services.sh already includes these units:
/opt/paradox/scripts/install-services.sh
/opt/paradox/scripts/paradox-control.sh start
/opt/paradox/scripts/paradox-control.sh status
```

`paradox-control.sh` should treat `go2rtc` (and `camera-finder` if installed)
like `pfx` / `houdini-game` for `start|stop|restart|status|logs`.

---

## 4. Nginx proxy (required for Tailscale / same-host access)

Edit the active site (on Houdini: `/etc/nginx/sites-available/paradox-html`).
Keep the repo copy in sync: `/opt/paradox/config/nginx-paradox.conf`.

Add **before** the catch-all `location /` (WebSocket upgrade headers matter):

```nginx
    # go2rtc — PxD camera-view uses /go2rtc/api/ws?src=<stream>
    location /go2rtc/ {
        proxy_pass http://127.0.0.1:1984/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    # Optional: camera-finder UI on the same host:80
    location /camera-finder/ {
        proxy_pass http://127.0.0.1:8090/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }
```

Apply:

```bash
sudo cp /opt/paradox/config/nginx-paradox.conf /etc/nginx/sites-available/paradox-html
sudo nginx -t && sudo systemctl reload nginx

# Smoke tests
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1/go2rtc/api/streams   # expect 200
# From a Tailscale client, same path against the Pi's 100.x address should also 200
```

Direct `:1984` can remain open on the LAN for debugging; production PxD pages
should use the proxied path only.

---

## 5. Wire `room.json`

In the `live` (or equivalent) site’s `camera-view` pane:

```jsonc
{
  "type": "camera-view",
  "width": "half",
  "config": {
    "layout": 3,
    "sidebarPosition": "right",
    "defaultViewMode": "multi",
    "cameras": [
      { "id": "study", "label": "Study", "wsUrl": "/go2rtc/api/ws?src=study", "main": true },
      { "id": "foyer", "label": "Foyer", "wsUrl": "/go2rtc/api/ws?src=foyer" },
      { "id": "cell",  "label": "Cell",  "wsUrl": "/go2rtc/api/ws?src=cell" }
    ]
  }
}
```

Optional landing-page link to camera-finder:

```jsonc
{
  "id": "camera-finder",
  "title": "Camera Finder",
  "description": "Stream discovery / tuning",
  "type": "external",
  "url": "/camera-finder/"
}
```

Package:

```bash
cd /opt/paradox/apps/PxD
node scripts/package.js \
  --room-dir ../../rooms/<game>/pxd \
  --out      ../../rooms/<game>/html
```

Ensure nginx’s document root (or symlink) points at that `html/` output.

---

## 6. Verify

| Check | Command / action |
|---|---|
| Service up | `systemctl is-active go2rtc` → `active` |
| Streams listed | `curl -sS http://127.0.0.1:1984/api/streams` |
| Proxied API | `curl -sS http://127.0.0.1/go2rtc/api/streams` |
| On-LAN Live View | Open `http://<lan-ip>/live/` — tiles should show video |
| Over Tailscale | Open `http://<100.x>/live/` from home — **same** tiles must work |
| WS upgrade | Browser DevTools → Network → `ws` filter → `/go2rtc/api/ws` status 101 |

If HTML loads but tiles stay black over Tailscale, the page is almost certainly
still using a hardcoded `ws://10.…:1984` URL — repackage after switching to
`/go2rtc/api/ws?src=…`, hard-refresh the browser.

### iPhone / iOS Chrome or Safari

Chrome on iPhone uses WebKit. Classic `window.MediaSource` is **not**
available there; iOS 17.1+ exposes `ManagedMediaSource` instead. PxD’s
`camera-view` pane uses that path (same approach as go2rtc’s `video-rtc.js`).
If the Cameras **header** appears but video tiles never render, an older
build may still be calling bare `new MediaSource()` — repackage from a
current PxD and hard-refresh. iOS older than 17.1 has no MSE-equivalent API;
use a desktop browser or upgrade iOS.

---

## camera-finder vs production go2rtc

| | camera-finder (`tools/camera-finder/`) | `go2rtc.service` |
|---|---|---|
| Purpose | Discover / compare / tune | Serve room dashboard 24/7 |
| Config | `tools/camera-finder/go2rtc.yaml` (scratch) | `/opt/paradox/config/go2rtc.yaml` |
| When go2rtc already on `:1984` | Reuses it; does not start Docker | — |
| Boot | Optional `camera-finder.service` | Required for Live View |
| UI URL | `:8090` or `/camera-finder/` via nginx | `/go2rtc/` (built-in go2rtc UI) |

Copy confirmed `streams:` entries from the finder scratch file into the
persistent yaml, then `systemctl restart go2rtc`.

---

## Security notes

- NVR credentials in `go2rtc.yaml` are readable by the `paradox` user; keep
  file mode `640`/`600` if the Pi is multi-user.
- Prefer not committing site passwords; use host-local overrides or
  `/etc` fragments if you split secrets later.
- Exposing `/go2rtc/` on Tailscale is intentional for operators; do not port-
  forward `:1984` to the public Internet.
