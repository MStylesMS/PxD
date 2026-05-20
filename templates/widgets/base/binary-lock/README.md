# binary-lock

Active binary widget. Shows a lock icon that switches between locked (default)
and unlocked states based on MQTT state. Clicking the tile publishes a `lock`
or `unlock` command to the configured command topic.

**Default size:** `1x1`
**Default icons:** Material Symbols `lock` / `lock_open_right` paths, embedded inline
**Interactive:** Yes — click publishes the opposite command of the current state

> **Offline / kiosk note:** The default CONFIG contains the icon shapes as inline
> SVG strings. No font, CDN, or network access is required. Do **not** change the
> icons to ligature names (`'lock'`) without first vendoring the Material
> Symbols font file locally — see [docs/WIDGETS.md §&nbsp;Offline assets](../../../docs/WIDGETS.md).

---

## Setup

1. Copy this directory to `rooms/<game>/pxd/widgets/<your-id>/`.
2. Edit the CONFIG block near the top of `widget.js`:

   | Key | Required | Default | Description |
   |---|---|---|---|
   | `STATE_TOPIC` | ✓ | — | MQTT topic carrying lock state messages |
   | `STATE_FIELD` | | `"state"` | JSON field that holds the value; `null` for raw payload |
   | `LOCKED_VALUE` | | `"locked"` | String value that means the lock is locked |
   | `COMMAND_TOPIC` | ✓ | — | MQTT topic to publish commands to (e.g. `paradox/room/prop/commands`) |
   | `LOCK_COMMAND` | | `"lock"` | Command name sent when clicking to lock |
   | `UNLOCK_COMMAND` | | `"unlock"` | Command name sent when clicking to unlock |
   | `LOCKED_LABEL` | | `"LOCKED"` | Label shown in the locked state |
   | `UNLOCKED_LABEL` | | `"UNLOCKED"` | Label shown in the unlocked state |
   | `LOCKED_COLOR` | | `#198754` | CSS colour for locked state (icon + label; not used for file icons) |
   | `UNLOCKED_COLOR` | | `#dc3545` | CSS colour for unlocked state |
   | `ICON_LOCKED` | | *(inline SVG — lock)* | Icon for the locked state — see **Icon formats** below |
   | `ICON_UNLOCKED` | | *(inline SVG — lock open right)* | Icon for the unlocked state |
   | `INTERACTIVE` | | `true` | `false` disables click-to-command (passive display only) |
   | `HEARTBEAT_TIMEOUT_MS` | | `30000` | ms before card shows disconnected; `0` to disable |

3. Add to `room.json → widgets`:
   ```json
   { "id": "<your-id>", "type": "binary-lock" }
   ```

4. Ensure `"widgets"` is in `room.json → panels.include`.
5. Run the packager.

---

## Payload shape

The widget expects a JSON payload. For a typical PxO/PFx state topic:

```json
{ "state": "locked" }
```

To match a different field name, set `STATE_FIELD: 'yourField'`.  
To match a raw (non-JSON) string, set `STATE_FIELD: null`.

---

## Command shape

When clicked, the widget publishes to `COMMAND_TOPIC`:

```json
{ "command": "unlock" }   ← when currently locked (click to unlock)
{ "command": "lock" }     ← when currently unlocked (click to lock)
```

The widget sends the command and **waits for an MQTT state message to confirm**
the change before updating the display. Optimistic updates are not applied.

To use custom command names, set `LOCK_COMMAND` and `UNLOCK_COMMAND` in CONFIG.  
To disable command publishing entirely, set `COMMAND_TOPIC: null` and `INTERACTIVE: false`.

---

## Icon formats

Set `ICON_LOCKED` and `ICON_UNLOCKED` to one of these three formats.
Both must be the same format — the type is auto-detected at load time.

> **Offline rule:** widgets run on air-gapped Pi kiosks. The first two formats
> below (inline SVG and file path) have **zero** network dependencies and are
> always acceptable. The ligature format requires either internet access or a
> locally vendored font file.

### 1. Inline SVG string (default — offline safe)

Paste any SVG string directly. Use `fill="currentColor"` so the colour tokens
apply automatically.

```js
ICON_LOCKED:   '<svg xmlns="..." viewBox="0 0 24 24" fill="currentColor"><path d="..."/></svg>',
ICON_UNLOCKED: '<svg xmlns="..." viewBox="0 0 24 24" fill="currentColor"><path d="..."/></svg>',
```

The default CONFIG already contains the Material Symbols `lock` /
`lock_open_right` paths embedded this way — no changes needed for standard use.

### 2. File path → `<img>` tag (offline safe)

Any browser-renderable image format works — the file must exist in the
packaged output directory (i.e., it is copied in by the packager):

| Format | Animated | Notes |
|---|---|---|
| PNG | – (APNG animated ✓) | Lossless, transparency |
| GIF | ✓ | Broad compatibility |
| WebP | ✓ | Best size/quality |
| SVG file | ✓ (CSS/SMIL) | Vector, any size |

```js
ICON_LOCKED:   'icons/locked.png',   // relative to the widget's directory
ICON_UNLOCKED: 'icons/unlocked.png',
```

Note: when icons are file paths, `LOCKED_COLOR` / `UNLOCKED_COLOR` are applied
only to the label — the image itself carries the visual state distinction.

### 3. Material Symbols ligature name (requires font)

```js
ICON_LOCKED:   'lock',
ICON_UNLOCKED: 'lock_open_right',
```

The widget lazily injects the Google Fonts stylesheet the first time it mounts.
Only the two icons you use are requested, keeping the download small.

**Offline / kiosk deployment:** vendor the font and replace `MAT_SYM_HREF`
in the `ensureMaterialSymbols()` function with a local path, or switch to
one of the other formats above.

Browse icons at https://fonts.google.com/icons (filter: Symbols).

---

## Previewing with the viewer

From the PxD repo root, start an HTTP server:

```bash
python3 -m http.server 9090
```

Then open:

```
http://localhost:9090/tools/widget-viewer.html
```

> Port 9090 is used because port 8080 is already occupied by Nginx
> (the packaged room output server).

The viewer lets you switch themes, send simulated MQTT payloads, and simulate
click events — all without a running PxD instance.

---

## Size variants

| Variant | Size | Status |
|---|---|---|
| Standard *(this file)* | `1x1` | ✓ Available |
| Large | `2x2` | Planned — copy this directory, change `CONFIG.SIZE` to `"2x2"`, and adjust `.wd-lock-icon` size in `widget.css` |
