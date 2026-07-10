# PxD Packager Reference

> **v2 note**: This document predates the "Flexible Sites, Pages & Panes"
> redesign (`pxdVersion: "2"`) and describes the original single-site,
> `panels.include`-driven packager. The packager is now multi-site and
> theme-resolving — see [ROOMS.md](ROOMS.md) § Packaging and
> [PANES.md](PANES.md) for the current model. This file is kept for
> background on the packaging pipeline mechanics (asset copying, output
> layout concepts), which are still broadly applicable.

The packager is a Node.js script (`scripts/package.js`) that assembles a
self-contained operator UI for a single room.  It reads the room's `pxd/`
source folder and produces a flat output directory that can be served directly
by Nginx with no server-side processing.

---

## Quick reference

```bash
# From apps/PxD/
node scripts/package.js --room-dir <source> --out <output>

# npm shorthand (if the room has an entry in package.json → scripts)
npm run package:agent22
npm run package:houdinis-challenge
```

---

## CLI flags

| Flag | Required | Description |
|---|---|---|
| `--room-dir <path>` | yes | Path to the room's `pxd/` source directory. Resolved relative to `cwd`. |
| `--out <path>` | yes | Path to the output directory. Created if it does not exist. Resolved relative to `cwd`. |

The packager does **not** delete stale files from the output directory.  If you
remove a widget or rename a media file, clean the output directory first:

```bash
rm -rf ../../rooms/<game>/html
node scripts/package.js --room-dir ../../rooms/<game>/pxd --out ../../rooms/<game>/html
```

---

## What the packager copies

Steps run in this order:

| Step | Source | Destination | Notes |
|---|---|---|---|
| 1 | `room.json` | validates `pxdVersion` exists | Aborts on missing field or invalid JSON |
| 2 | `assets/css/` | `out/assets/css/` | All framework CSS including `pxd-base.css`, `bootstrap.min.css`, `layout.css` |
| 3 | `assets/js/pxd.js`, vendor libs | `out/assets/js/` | `pxd.js`, `jquery.min.js`, `paho-mqtt.js`, `bootstrap.bundle.min.js` |
| 4 | Panel JS files | `out/assets/js/panels/` | Only panels listed in `room.json → panels.include`; room-local panels take precedence over framework panels (see below) |
| 5 | `layouts/<id>/layout.css` | `out/assets/css/layout.css` | Layout-specific structural CSS |
| 6 | `layouts/<id>/layout.html` | `out/index.html` | `{{PXD_TITLE}}` substituted with `room.json → title` |
| 7 | `room.json` | `out/room.json` | Verbatim copy; `pxd.js` fetches this at runtime |
| 8 | `room-dir/media/` | `out/media/` | Room hero image, favicon, etc. |
| 9 | `room-dir/fonts/` | `out/fonts/` | Custom web fonts referenced by theme |
| 10 | `room-dir/widgets/` | `out/widgets/` | Widget directories (skipped silently if absent) |

---

## Panel resolution order

For each panel ID in `panels.include` the packager looks for the JS file in
this order, taking the **first match**:

1. `<room-dir>/panels/<id>.js` — room-local or override panel
2. `assets/js/panels/<id>.js` — framework panel

This lets a room supply a customised variant of a panel (e.g. a restyled
`time-lights.js`) without modifying the shared framework.  An unknown panel ID
(not found in either location) produces a `[warn]` line but does not fail the
build.

---

## Output directory structure

```
out/
  index.html               ← layout.html with {{PXD_TITLE}} substituted
  room.json                ← verbatim copy of source room.json
  assets/
    css/
      pxd-base.css
      bootstrap.min.css
      layout.css           ← layout-specific CSS
    js/
      pxd.js
      jquery.min.js
      paho-mqtt.js
      bootstrap.bundle.min.js
      panels/
        game-control.js
        time-lights.js
        hints.js
        widgets.js         ← only if listed in panels.include
        system.js
  media/
    hero.jpg
    favicon.ico
  fonts/
    TypewriterBold.ttf     ← example
  widgets/
    front-door/
      widget.js
      widget.css
    bomb-timer/
      widget.js
      widget.css
```

---

## Validations

The packager aborts (`exit 1`) on:

- `room.json` not found
- `room.json` is not valid JSON
- `room.json` missing `pxdVersion` field
- Layout directory (`layouts/<id>/`) not found
- `layout.html` not found inside the layout directory

Non-fatal warnings (`[warn]`) are printed for:

- A panel ID in `panels.include` that is not found in either the framework or room-local panels directory
- A vendor JS file that is missing from `assets/js/`

---

## Deploying to a Pi

Use `scripts/deploy.sh` to package and deploy in one step:

```bash
# Package only (no remote deploy)
scripts/deploy.sh --room agent22

# Package + rsync + Nginx symlink on a remote Pi
scripts/deploy.sh --room agent22 --host pi5-ssd

# Custom Nginx web root (default: /opt/paradox/html)
scripts/deploy.sh --room agent22 --host pi5-ssd --nginx-root /var/www/paradox
```

See [deploy.sh usage](#deploy-sh) below for the full flag reference.

---

## deploy.sh

`scripts/deploy.sh` wraps the packager, `rsync`, and an SSH symlink swap into a
single command.

### Usage

```
scripts/deploy.sh --room <name> [--host <ssh-target>] [--nginx-root <path>]
                  [--rooms-base <path>] [--pxd-dir <path>]
```

### Flags

| Flag | Default | Description |
|---|---|---|
| `--room <name>` | **required** | Room name; must match `rooms/<name>/pxd/` |
| `--host <ssh-target>` | *(local only)* | SSH target (e.g. `pi5-ssd`, `paradox@192.168.1.10`) for remote deploy |
| `--nginx-root <path>` | `/opt/paradox/html` | Directory where Nginx symlinks live on the remote host |
| `--rooms-base <path>` | `<pxd-dir>/../../rooms` | Override for non-standard workspace layouts |
| `--pxd-dir <path>` | directory containing `deploy.sh` | Override the framework root |

### What it does

1. Runs `node scripts/package.js --room-dir … --out …`
2. If `--host` is given: `rsync -av --delete <output>/ <host>:/opt/paradox/rooms/<room>/html/`
3. If `--host` is given: `ssh <host> "ln -sfn /opt/paradox/rooms/<room>/html <nginx-root>/<room>"`

### Example: first deploy of a new room

```bash
# 1. Create the output locally
scripts/deploy.sh --room spycatcher-moscow

# 2. Push to Pi and swing Nginx symlink
scripts/deploy.sh --room spycatcher-moscow --host pi5-ssd

# 3. On the Pi, tell Nginx to reload (only needed if the symlink target changed)
ssh pi5-ssd "sudo nginx -s reload"
```

---

## Adding a room to package.json

Add a convenience script so any contributor can package without remembering the paths:

```jsonc
// apps/PxD/package.json
{
  "scripts": {
    "package:agent22":           "node scripts/package.js --room-dir ../../rooms/agent22/pxd           --out ../../rooms/agent22/html",
    "package:houdinis-challenge": "node scripts/package.js --room-dir ../../rooms/houdinis-challenge/pxd --out ../../rooms/houdinis-challenge/html"
  }
}
```

Then:

```bash
npm run package:houdinis-challenge
```
