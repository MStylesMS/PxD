# PxD — AI Instructions

PxD is the **operator dashboard** (GM daily tool), browser-served from room packages (`room.json` / widgets).

## Docs

Read `docs/` and room `room.json` contracts before changing behaviour. Update docs in the same change as code.

## Conventions

- Conventional commits: `Docs:`, `Implement:`, `Fix:`, `Test:`, `Refactor:`, `Chore:`.
- MQTT topic structure `{baseTopic}/{commands|events|state|warnings}` is sacred.
- Suite context: Paradox escape-room suite; sibling apps under `apps/`.

## Prop admin HTTP UIs (reverse proxy)

Prop firmware HTTP admin UIs are reached on the LAN via mDNS
(`http://<mdns-label>.local/`). For remote access, the Room Controller nginx
proxies `/props/<mdns-label>/` to the prop; PxD landing links use the same
path-absolute URL (works on LAN and Tailscale).

- **Canonical doc:** [docs/PROP_ADMIN_REVERSE_PROXY.md](docs/PROP_ADMIN_REVERSE_PROXY.md)
- **PxD links:** path-absolute `/props/<label>/` in `room.json` `external` sites
- **Live control:** MQTT and widgets — prop HTTP UI is setup/rescue only
