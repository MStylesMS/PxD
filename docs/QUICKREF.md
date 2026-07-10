# PxD — Quick Reference

> One-liners for the five most common operator tasks.
> For full detail see the linked documents.

---

## I want to package a room

```bash
cd /opt/paradox/apps/PxD
node scripts/package.js \
  --room-dir ../../rooms/<game>/pxd \
  --out      ../../rooms/<game>/html
```

Or, if the room has an npm shorthand:

```bash
npm run package:agent22
npm run package:houdinis-challenge
```

→ Full reference: [PACKAGER.md](PACKAGER.md)

---

## I want to deploy a room to a Pi

```bash
# Package + rsync + Nginx symlink in one step
cd /opt/paradox/apps/PxD
scripts/deploy.sh --room <game> --host <pi-hostname>

# Then reload Nginx if the symlink target changed
ssh <pi-hostname> "sudo nginx -s reload"
```

→ Full reference: [PACKAGER.md § deploy.sh](PACKAGER.md#deploy-sh)

---

## I want to create a new room from scratch

```bash
GAME=myroom
cd /opt/paradox

mkdir -p rooms/$GAME/pxd/{media,fonts}
cp apps/PxD/templates/rooms/_starter/room.json rooms/$GAME/pxd/room.json
```

Then open `rooms/$GAME/pxd/room.json` and edit **in this order**:

1. `title` — display name shown in the browser tab
2. `topicRoot` — MQTT topic prefix (e.g. `paradox/myroom`)
3. `mqtt.broker` / `mqtt.port` — leave `"auto"` for same-host Pi deploys
4. `theme.base` — pick a named theme (`midnight-teal`, `haunted-manor`,
   `crimson-gold`, `parchment-light`), add `overrides`/`fonts` if needed
5. `media.hero` / `media.favicon` — drop files in `pxd/media/` first
6. `sites[].pages[].panes[]` — list the panes you need, in order (see
   [PANES.md](PANES.md) for the library)
7. Pane config sections (`gameControl`, `timeLights`, `hints`, `system`) — fill in topic overrides
8. Any `widget-grid` pane's `config.widgets[]` — add entries for each prop widget

→ Step-by-step walkthrough: [QUICK_START.md](QUICK_START.md)
→ Full field reference: [ROOMS.md](ROOMS.md)

---

## I want to add a widget to a room

1. Copy a base template from `apps/PxD/templates/widgets/base/`:

```bash
cp -r apps/PxD/templates/widgets/base/binary-door \
      rooms/<game>/pxd/widgets/<prop-name>
```

2. Open `rooms/<game>/pxd/widgets/<prop-name>/widget.js` and fill in the
   `STATE_TOPIC`, `VALUE_FIELD`, labels, and colours at the top of the file.

3. Add an entry to a `widget-grid` pane's `config.widgets[]` in
   `rooms/<game>/pxd/room.json`:

```jsonc
{ "type": "widget-grid", "width": "full", "config": {
  "widgets": [
    { "id": "<prop-name>", "name": "Display Name", "shown": true }
  ]
} }
```

4. Repackage:

```bash
node apps/PxD/scripts/package.js \
  --room-dir rooms/<game>/pxd \
  --out      rooms/<game>/html
```

→ Full widget authoring guide: [WIDGETS.md](WIDGETS.md)

---

## I want to change a room's colour theme

1. Open `rooms/<game>/pxd/room.json`.
2. Edit the values under `"theme"` (hex colours, opacity strings, or CSS values).
3. Repackage (see above).

Token reference:

| Token key | What it controls |
|---|---|
| `bgColor1` / `bgColor2` / `bgColor3` | Background gradient stops |
| `panel` | Panel card background (usually semi-transparent) |
| `panelBorder` | Panel card border |
| `ink` / `inkSoft` | Primary and secondary text colour |
| `accent` / `accentAlt` | Button and highlight colours |
| `warn` / `danger` | Warning and error indicator colours |
| `radius` | Card corner radius |
| `fontBody` / `fontMono` | Body and monospace font stacks |

→ Full token list: [THEMING.md](THEMING.md)
