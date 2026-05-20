# binary-door

Passive binary widget. Shows a door icon that switches between closed (default)
and open states based on an MQTT message.

**Default size:** `1x1`
**Default icons:** Material Symbols `door_front` / `door_open` paths, embedded inline

> **Offline / kiosk note:** The default CONFIG contains the icon shapes as inline
> SVG strings. No font, CDN, or network access is required. Do **not** change the
> icons to ligature names (`'door_open'`) without first vendoring the Material
> Symbols font file locally — see [docs/WIDGETS.md §&nbsp;Offline assets](../../../docs/WIDGETS.md).

---

## Setup

1. Copy this directory to `rooms/<game>/pxd/widgets/<your-id>/`.
2. Edit the CONFIG block near the top of `widget.js`:

   | Key | Required | Default | Description |
   |---|---|---|---|
   | `STATE_TOPIC` | ✓ | — | MQTT topic carrying door state messages |
   | `STATE_FIELD` | | `"state"` | JSON field that holds the value; `null` for raw payload |
   | `OPEN_VALUE` | | `"open"` | String value that means the door is open |
   | `OPEN_LABEL` | | `"OPEN"` | Label shown in the open state |
   | `CLOSED_LABEL` | | `"CLOSED"` | Label shown in the closed state |
   | `OPEN_COLOR` | | `#dc3545` | CSS colour for open state (icon + label; not used for file icons) |
   | `CLOSED_COLOR` | | `#198754` | CSS colour for closed state |
   | `ICON_OPEN` | | *(inline SVG — door open)* | Icon for the open state — see **Icon formats** below |
   | `ICON_CLOSED` | | *(inline SVG — door closed)* | Icon for the closed state |
   | `HEARTBEAT_TIMEOUT_MS` | | `30000` | ms before card shows disconnected; `0` to disable |

3. Add to `room.json → widgets`:
   ```json
   { "id": "<your-id>", "type": "binary-door" }
   ```

4. Ensure `"widgets"` is in `room.json → panels.include`.
5. Run the packager.

---

## Payload shape

The widget expects a JSON payload. For a typical PxO/PFx state topic:

```json
{ "state": "open" }
```

To match a different field name, set `STATE_FIELD: 'yourField'`.  
To match a raw (non-JSON) string, set `STATE_FIELD: null`.

---

## Icon formats

Set `ICON_OPEN` and `ICON_CLOSED` to one of these three formats.
Both must be the same format — the type is auto-detected at load time.

> **Offline rule:** widgets run on air-gapped Pi kiosks. The first two formats
> below (inline SVG and file path) have **zero** network dependencies and are
> always acceptable. The ligature format requires either internet access or a
> locally vendored font file.

### 1. Inline SVG string (default — offline safe)

Paste any SVG string directly. Use `fill="currentColor"` (or
`stroke="currentColor"`) so the colour tokens apply automatically.
Inline SVGs support CSS animations and SMIL animations.

```js
ICON_OPEN:   '<svg xmlns="..." viewBox="0 -960 960 960" fill="currentColor"><path d="..."/></svg>',
ICON_CLOSED: '<svg xmlns="..." viewBox="0 -960 960 960" fill="currentColor"><path d="..."/></svg>',
```

The default CONFIG already contains the Material Symbols `door_open` /
`door_front` paths embedded this way — no changes needed for standard use.

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
ICON_OPEN:   'icons/door-open.gif',   // relative to the widget's directory
ICON_CLOSED: 'icons/door-closed.gif',
```

Note: when icons are file paths, `OPEN_COLOR` / `CLOSED_COLOR` are applied
only to the label — the image itself carries the visual state distinction.

### 3. Material Symbols ligature name (requires font)

```js
ICON_OPEN:   'door_open',
ICON_CLOSED: 'door_front',
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

The viewer lets you switch themes (or load any `room.json`), send simulated
MQTT payloads with one click, and test the stale/disconnected overlay —
all without a running PxD instance.

---

## Size variants

| Variant | Size | Status |
|---|---|---|
| Standard *(this file)* | `1x1` | ✓ Available |
| Large | `2x2` | Planned — copy this directory, change `CONFIG.SIZE` to `"2x2"`, and adjust `.wd-door-icon` size in `widget.css` |
