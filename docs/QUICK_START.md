# PxD — Quick Start

> **Get a working room UI in under 10 minutes.**

For full detail on any topic below, see [USERS_GUIDE.md](USERS_GUIDE.md).

---

## Prerequisites

- Node.js 18+ on the machine running the packager
- A reachable MQTT broker (Mosquitto on the same Pi is typical)
- Nginx already serving `/opt/paradox/html/` (standard on a Paradox Pi)

---

## Step 1 — Create your room source folder

```bash
# From the paradox workspace root
GAME=myroom

mkdir -p rooms/$GAME/pxd/media
mkdir -p rooms/$GAME/pxd/fonts

cp apps/PxD/templates/rooms/_starter/room.json rooms/$GAME/pxd/room.json
```

---

## Step 2 — Fill in the three required fields

Open `rooms/$GAME/pxd/room.json` and set:

```jsonc
{
  "pxdVersion": "1",
  "layout": "default-dashboard",
  "title": "My Room Name",         // shown in the browser tab and page header
  "topicRoot": "paradox/myroom",   // all MQTT topics derive from this prefix
  ...
}
```

Everything else has a sensible default. You can come back and customise the
theme, panel overrides, and MQTT settings later.

---

## Step 3 — Swap in your logo and favicon

Drop your artwork into `rooms/$GAME/pxd/media/`:

```
rooms/$GAME/pxd/media/
  hero.jpg      ← wide banner shown at the top of the page
  favicon.ico   ← browser tab icon
```

Then confirm (or update) the paths in `room.json`:

```jsonc
"media": {
  "hero":    "media/hero.jpg",
  "favicon": "media/favicon.ico"
}
```

**Logo tips**:
- Any common format works (`jpg`, `png`, `webp`).
- A landscape image around 1200 × 300 px works well for the hero slot.
- For a transparent background, use `png` or `webp`.
- The hero is displayed full-width with `object-fit: cover`, so wider is better
  than taller.

---

## Step 4 — Run the packager

```bash
# From apps/PxD/
node scripts/package.js \
  --room-dir ../../rooms/$GAME/pxd \
  --out      ../../rooms/$GAME/html
```

Or add an npm script to `apps/PxD/package.json` for convenience:

```json
"package:myroom": "node scripts/package.js --room-dir ../../rooms/myroom/pxd --out ../../rooms/myroom/html"
```

Then run:

```bash
npm run package:myroom
```

The packager produces a fully self-contained directory at `rooms/$GAME/html/` —
Bootstrap, Paho MQTT, all panel scripts, and your room assets bundled together.
No internet access is required at runtime.

---

## Step 5 — Point Nginx at the output

Create a symlink in the Nginx root:

```bash
ln -s /opt/paradox/rooms/$GAME/html /opt/paradox/html/$GAME
```

Add a location block to the active Nginx config
(e.g. `/etc/nginx/sites-available/paradox`):

```nginx
location /myroom/ {
    alias /opt/paradox/html/myroom/;
    index index.html;
    try_files $uri $uri/ /myroom/index.html;
}
```

Reload Nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Open `http://<pi-hostname>/myroom/` in a browser.

---

## Step 6 — Quick theme tweak (optional)

The starter defaults to a dark blue theme. To use a different accent colour,
edit `room.json → theme.accent` and repackage:

```jsonc
"theme": {
  "accent":    "#e87040",   // burnt orange instead of teal
  "accentAlt": "#f0a860"
}
```

Only fields you set are overridden; everything else falls back to the built-in
defaults. See [THEMING.md](THEMING.md) for the full token list.

---

## Next steps

| Goal | Where to look |
|---|---|
| Change the colour theme in depth | [THEMING.md](THEMING.md) |
| Add custom fonts | [THEMING.md](THEMING.md) — Custom web fonts section |
| Override panel MQTT topics | [ROOMS.md](ROOMS.md) — Panel config fields |
| Create a different page layout | [LAYOUTS.md](LAYOUTS.md) |
| Full reference for every room.json field | [ROOMS.md](ROOMS.md) |
| Everything, with examples | [USERS_GUIDE.md](USERS_GUIDE.md) |
