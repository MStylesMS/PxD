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
4. `theme` — colours, fonts, border radius
5. `media.hero` — add your banner image to `pxd/media/`
6. `media.favicon` — add your favicon to `pxd/media/`
7. `gameControl.emergencyActions` — add room-specific emergency buttons
8. `system.watchZones` — add the services/devices you want to monitor
9. `timeLights.lightsScenesTopicRoot` — if your lighting system publishes a
   dynamic scene list

After editing, run the packager from `apps/PxD/`:

```bash
node scripts/package.js \
  --room-dir ../../rooms/<game>/pxd \
  --out      ../../rooms/<game>/html
```

## Next steps

- [QUICK_START.md](../../docs/QUICK_START.md) — step-by-step first-room guide
- [ROOMS.md](../../docs/ROOMS.md) — full room.json field reference
- [THEMING.md](../../docs/THEMING.md) — theming and font details
- [USERS_GUIDE.md](../../docs/USERS_GUIDE.md) — comprehensive guide
