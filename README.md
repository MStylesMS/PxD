# PxD — Paradox FX Dashboard Framework

**PxD** is a vendor-independent, offline-capable operator control UI framework for Paradox escape-room rooms. It produces a static self-contained web page per room by combining a shared framework, a named layout, and room-specific configuration.

## Quick start

See [docs/QUICK_START.md](docs/QUICK_START.md) for a step-by-step first-room walkthrough.

```bash
# From apps/PxD/ — package a room
node scripts/package.js \
  --room-dir ../../rooms/agent22/pxd \
  --out      ../../rooms/agent22/html

# Run packager tests
node scripts/package.test.js
```

Nginx serves the output directory. No web server changes are required.

## Documentation

| Document | Purpose |
|---|---|
| [docs/QUICK_START.md](docs/QUICK_START.md) | New room in under 10 minutes |
| [docs/USERS_GUIDE.md](docs/USERS_GUIDE.md) | Full guide — theming, layouts, panels, widgets |
| [docs/ROOMS.md](docs/ROOMS.md) | room.json field reference |
| [docs/THEMING.md](docs/THEMING.md) | CSS tokens and custom fonts |
| [docs/LAYOUTS.md](docs/LAYOUTS.md) | Layout system and creating new layouts |
| [docs/WIDGETS.md](docs/WIDGETS.md) | Widget API (Phase 3) |
| [docs/SPEC.md](docs/SPEC.md) | Functional specification |

## Phase 1 status

Phase 1 ships a fully working dashboard for Agent 22. Houdini's Challenge migrates in Phase 2. Widget support is Phase 3.

| Feature | Status |
|---|---|
| Framework scaffold | ✅ |
| default-dashboard layout | ✅ |
| game-control panel | ✅ |
| time-lights panel | ✅ |
| hints panel | ✅ |
| system panel | ✅ |
| Agent 22 room | ✅ |
| Houdini room | Phase 2 |
| Widget loader | Phase 3 |

## Repo layout

```
apps/PxD/
  assets/
    css/
      bootstrap.min.css     Vendored Bootstrap 5.3.3
      pxd-base.css          Framework structural CSS + design tokens
    js/
      jquery.min.js         Vendored jQuery
      paho-mqtt.js          Vendored Eclipse Paho MQTT
      bootstrap.bundle.min.js  Vendored Bootstrap 5.3.3 JS bundle
      pxd.js                Framework core runtime
      panels/               Panel JS modules
  layouts/
    default-dashboard/      Four-panel operator layout
  docs/                     Documentation
  scripts/
    package.js              Packager
    package.test.js         Packager tests

rooms/<game>/pxd/           Room sources (one per room)
  room.json                 Room configuration
  media/                    Hero image, favicon, room media
  fonts/                    Room-specific web fonts
  widgets/                  Widget sources (Phase 3)
```

## Key references

| Doc | Purpose |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | Functional specification |
| [docs/ROOMS.md](docs/ROOMS.md) | Room configuration guide |
| [docs/LAYOUTS.md](docs/LAYOUTS.md) | Layout system reference |
| [docs/THEMING.md](docs/THEMING.md) | CSS token theming reference |
| [docs/WIDGETS.md](docs/WIDGETS.md) | Widget system (Phase 3, stub) |
