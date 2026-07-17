# camera-finder — PxD camera discovery & tuning tool

Tool for finding IP cameras on the network, tuning encoder settings, and
comparing go2rtc delivery methods (WebRTC/MSE/HLS/MJPEG) side by side — so
you can grab a working stream URL to paste into a PxD room's `camera-view`
config.

You can run it ad hoc (`node server.js`) or enable the optional
`camera-finder.service` (port 8090, also proxied at `/camera-finder/` when
nginx is configured). Full production install (binary, systemd, Tailscale
nginx proxy): **[docs/GO2RTC.md](../../docs/GO2RTC.md)**.

## Relationship to the room's real go2rtc

Once a camera is confirmed working here, its `streams:` entry belongs in the
**room's persistent go2rtc config** —
`/opt/paradox/config/go2rtc.yaml` (+ `go2rtc.yaml.example` template) and
`/opt/paradox/config/go2rtc.service`. That persistent instance is what the
deployed PxD Live page talks to at runtime. This tool's own `go2rtc.yaml` is
scratch space for discovery only.

If a persistent go2rtc is already running on this machine (port 1984),
`server.js` detects and reuses it automatically instead of starting a second
one — so it's also safe to run this tool on a live Room Controller Pi to
audit currently-configured cameras.

For PxD `room.json`, prefer path-absolute embed URLs (nginx `/go2rtc/` proxy):

```text
/go2rtc/api/ws?src=<stream_name>
```

not `ws://<lan-ip>:1984/...` (breaks Tailscale from off-site).

## Run it

```bash
cd apps/PxD/tools/camera-finder
node server.js            # defaults to port 8090
# or: node server.js 8099
```

Open `http://<machine-ip>:8090/`. Ctrl+C to stop. If this run started its own
temporary go2rtc container, it's removed automatically on exit; if it reused
an already-running instance, that instance is left alone.

## Add a camera

Edit `go2rtc.yaml` (Amcrest/Dahua RTSP pattern), then restart:
```
rtsp://USER:PASSWORD@CAMERA_IP:554/cam/realmonitor?channel=1&subtype=0   # main
rtsp://USER:PASSWORD@CAMERA_IP:554/cam/realmonitor?channel=1&subtype=1   # sub
```
Ctrl+C and re-run `node server.js` to pick up config changes (or, if you're
reusing an already-running instance, edit that instance's own config and
restart it directly).

## Using the test page

Two side-by-side panels, each with:
- **Stream** dropdown — from go2rtc's configured streams
- **Delivery method** dropdown — WebRTC (UDP/TCP), MSE, HLS, MP4, MJPEG, or Auto
- **📋 Embed URL** — copies the URL to paste into a room's `cameraView.cameras[].wsUrl`
  (or the HLS/MP4/MJPEG direct URL, matching the method selected)
- **📺 RTSP URL** — copies the raw `rtsp://` restream URL

**View: 1 Camera / 2 Cameras** toggle switches panel count (hidden panel is
fully disconnected, not just hidden). Header shows live go2rtc CPU/mem/net,
polled every 2s.

### Multi-tile load test (`grid.html`)

Linked from the header of both pages. Spin up 1–24 tiles to see how resource
usage scales — cycle through every configured stream, or repeat one fixed
stream in every tile (isolates "cost per viewer of the same camera" vs.
"cost per additional unique camera").

## Findings from prior testing (this Pi5, two Amcrest 1080p cameras)

- **MSE is the recommended default delivery method.** Same video quality as
  WebRTC, but also carries audio (these cameras' AAC audio isn't compatible
  with WebRTC's audio codec set without an extra transcode step).
- **Main vs. sub stream are independent encoder profiles**, not a
  bug/quirk — configure main for the focused/enlarged view (e.g.
  1920x1080/15fps/2048kbps CBR/GOP15/audio-on) and sub for grid/thumbnail
  tiles (e.g. 640x480/15fps/512kbps CBR/GOP15/audio-off). The resolution
  difference is real but only becomes visually obvious once a tile is
  enlarged — a small grid thumbnail can't show 1080p detail anyway.
- **MJPEG is not free** — these cameras only send H.264/AAC, and go2rtc's
  MJPEG *output* requires a real FFmpeg transcode (`ffmpeg:<stream>#video=mjpeg`
  in `go2rtc.yaml`), meaningfully more CPU per stream than WebRTC/MSE/HLS
  (cheap repackaging, no transcode). Avoid it for anything running
  continuously in a grid.
- **Multiple viewers of the same stream are nearly free** — go2rtc pulls a
  camera once and fans that single decode out to every consumer.
- **Measured on this Pi5**: ~2.5% CPU for one active 1080p MSE consumer;
  24 simultaneous HD streams via `grid.html` measured under 10% CPU. At this
  cost, a room's own go2rtc instance can comfortably serve all of that
  room's cameras — no need for a central multi-room streaming server.
- **Lesson learned:** never set `video.background = true` on go2rtc's
  `<video-stream>` element unless you want it to keep streaming after
  removal from the DOM — it breaks cleanup-on-unmount and leaks connections.

## Amcrest admin UI notes (from tuning a real camera)

- Multiple identically-labeled hidden "Save" buttons exist in the DOM (one
  per sub-tab) — if automating this, find the one with a non-zero bounding
  box, not the first match.
- A stray browser-autofill suggestion has been observed overwriting an
  unrelated "Watermark Character" text field during automated sessions —
  double-check unrelated fields after any automated changes to that UI.
