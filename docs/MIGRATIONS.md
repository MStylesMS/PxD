# PxD — Migration Guide

This document records breaking changes between `pxdVersion` values and the
steps required to upgrade a `room.json` from one version to the next.

> **Current schema version: `1`**
>
> There are no prior versions.  This document exists to provide a home for
> future breaking changes so they are never undocumented.

---

## Version history

| Version | Released | Breaking changes |
|---|---|---|
| `1` | 2026-05-19 | Initial release — baseline for all future migrations |

---

## How to detect which version a room is on

```bash
node -e "const r=require('./room.json'); console.log(r.pxdVersion)"
```

The packager aborts with an error if `pxdVersion` is absent.

---

## Future migration template

When a breaking change is introduced:

1. Bump `pxdVersion` in `apps/PxD/templates/rooms/_starter/room.json`.
2. Add a section here describing **what changed**, **which fields are affected**,
   and the **exact steps** to migrate an existing room.
3. Update the packager to detect the old version and emit a clear error message
   pointing to this document.

Example section structure:

```
## 1 → 2

Released: YYYY-MM-DD

### What changed

<describe the breaking change>

### Fields affected

| Old key | New key / behaviour |
|---|---|
| ... | ... |

### Migration steps

1. Open `room.json`.
2. ...
3. Run the packager and verify the output.
```
