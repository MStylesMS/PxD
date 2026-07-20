# PxD — Paradox FX Dashboard Framework

**PxD** is a vendor-independent, offline-capable operator control UI framework for Paradox escape-room rooms. It produces one or more static, self-contained sites per room, each built from a shared framework, a named theme, and a configurable tree of pages and panes.

## Quick start

See [docs/QUICK_START.md](docs/QUICK_START.md) for a step-by-step first-room walkthrough.

```bash
# From apps/PxD/ — package a room (writes one subfolder per site under --out)
node scripts/package.js \
  --room-dir ../../rooms/agent22/pxd \
  --out      ../../rooms/agent22/html

# Run packager tests
node scripts/package.test.js
```

Nginx serves the output directory. For rooms with **live cameras**, also
install go2rtc and the `/go2rtc/` nginx proxy — see
[docs/GO2RTC.md](docs/GO2RTC.md) (required for Tailscale access).

## Documentation

| Document | Purpose |
|---|---|
| [docs/QUICK_START.md](docs/QUICK_START.md) | New room in under 10 minutes |
| [docs/GO2RTC.md](docs/GO2RTC.md) | **Cameras:** install go2rtc, nginx Tailscale proxy, room.json `wsUrl` |
| [docs/ROOMS.md](docs/ROOMS.md) | room.json field reference — sites, pages, panes, glossary |
| [docs/PANES.md](docs/PANES.md) | Pane library reference + how to add a new pane type |
| [docs/THEMING.md](docs/THEMING.md) | Named themes, CSS tokens, custom fonts |
| [docs/WIDGETS.md](docs/WIDGETS.md) | Widget authoring (widget-grid panes) |
| [docs/USERS_GUIDE.md](docs/USERS_GUIDE.md) | Full narrative guide (some v1-era snippets — see its v2 note) |
| [docs/PR_FLEXIBLE_SITES_AND_PANES.md](docs/archive/PR_FLEXIBLE_SITES_AND_PANES.md) | v2 redesign spec/rationale (archived, implemented) |
| [docs/SPEC.md](docs/SPEC.md) | Original functional specification (background/history) |

## Status

PxD v2 ("Flexible Sites, Pages & Panes") is implemented and both Paradox
rooms with a `pxd/` config are migrated.

| Feature | Status |
|---|---|
| Multi-site / multi-page / pane-tree framework core | ✅ |
| Responsive width system (full / three-quarters / two-thirds / half / third / quarter) | ✅ |
| Pane `order` / `narrowWidth` / `narrowOrder` + `grid.narrowBreakpointPx` | ✅ |
| `game-status` + `game-actions` compact control panes | ✅ |
| Content pane `aspectRatio` / `forceFit` / `backgroundColor` (ideal logo **4.6:1**) | ✅ |
| Collapsible sections (`divider` panes) | ✅ |
| Named themes (midnight-teal, haunted-manor, crimson-gold, parchment-light, moscow-burgundy) | ✅ |
| Multi-instance `widget-grid` panes | ✅ |
| Multi-instance `camera-view` panes (MSE only) | ✅ |
| `content`, `nav` panes | ✅ |
| Packager v2 (multi-site, theme-resolving, marker-file-safe) | ✅ |
| Agent 22 room (`simple` + `live` sites) | ✅ |
| Houdini's Challenge room (`simple` + `live` sites) | ✅ |
| SpyCatcher room (`simple` + `live` + GPIO monitor link) | ✅ |

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
      pxd.js                Framework core runtime (sites/pages/panes)
      panes/                Pane type modules (game-control, game-status,
                             game-actions, time-lights, hints, system,
                             widget-grid, camera-view, content, nav)
  themes/
    <name>/theme.json        Named theme token bundles
  layouts/
    default-dashboard/       HTML shell template
  docs/                      Documentation
  templates/
    rooms/_starter/          Starter room.json + README for new rooms
    widgets/                 Widget base templates + examples
  tools/
    widget-viewer.html       Widget dev preview tool
    theme-viewer.html        Theme gallery (dropdown switcher for shipped themes + previews)
    camera-finder/           Camera discovery/tuning tool (launch on demand, not a service)
  scripts/
    package.js               Packager (v2)
    package.test.js          Packager tests

rooms/<game>/pxd/           Room sources (one per room)
  room.json                 Room configuration (sites, pages, panes, theme)
  media/                    Hero image, favicon, room media
  fonts/                    Room-specific web fonts
  widgets/                  Widget sources
  panes/                    Optional room-local pane overrides/additions
  camera-view.local.json    Optional, hand-maintained camera URL overrides
```

## Key references

| Doc | Purpose |
|---|---|
| [docs/ROOMS.md](docs/ROOMS.md) | Room configuration guide (sites/pages/panes glossary + fields) |
| [docs/PANES.md](docs/PANES.md) | Pane library reference |
| [docs/THEMING.md](docs/THEMING.md) | Named themes and CSS token reference |
| [docs/WIDGETS.md](docs/WIDGETS.md) | Widget system |
| [docs/SPEC.md](docs/SPEC.md) | Original functional specification (background) |
