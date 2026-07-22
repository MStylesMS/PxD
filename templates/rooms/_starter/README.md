# PxD Room Starter Template

Copy this folder when creating a new room UI.

```bash
# From the paradox workspace root
mkdir -p rooms/<game>/pxd/media
mkdir -p rooms/<game>/pxd/fonts
cp apps/PxD/templates/rooms/_starter/room.json rooms/<game>/pxd/room.json
```

## Edit order

1. `title` — your room's display name
2. `topicRoot` — MQTT topic prefix (e.g. `paradox/myroom`)
3. `mqtt` — broker/port if not using the defaults (`"auto"` is correct for
   nearly all Paradox Pi deployments)
4. `theme` — pick a named base theme (see `docs/THEMING.md`), add overrides
   or custom fonts if needed
5. `media.hero` — add your banner image to `pxd/media/`
6. `media.favicon` — add your favicon to `pxd/media/`
7. `gameControl.emergencyActions` — add room-specific emergency buttons
8. `system.warningTopics` — keep room `…/warnings` patterns and include
   `paradox/+/system/alerts` so **PxH** disk/service alerts appear in the
   System Warnings pane
9. `system.watchZones` — add the services/devices you want to monitor
10. `timeLights.lightsScenesTopicRoot` — if your lighting system publishes a
    dynamic scene list
11. `sites` — adjust the pane list for your room (add `camera-view` and/or
    `widget-grid` panes as needed, or split into multiple sites); see
    `docs/PANES.md` for the full pane library. Keep the external
    **System Health** site (`/health/`) when this host runs PxH; remove it
    otherwise (or point at `http://<host>:19090/ui/` if nginx `/health/` is
    not configured).

After editing, run the packager from `apps/PxD/`:

```bash
node scripts/package.js \
  --room-dir ../../rooms/<game>/pxd \
  --out      ../../rooms/<game>/html
```

## Next steps

- [QUICK_START.md](../../docs/QUICK_START.md) — step-by-step first-room guide
- [ROOMS.md](../../docs/ROOMS.md) — full room.json field reference
- [PANES.md](../../docs/PANES.md) — pane library reference
- [THEMING.md](../../docs/THEMING.md) — theming and font details
- [USERS_GUIDE.md](../../docs/USERS_GUIDE.md) — comprehensive guide
