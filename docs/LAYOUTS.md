# PxD Layout System (LAYOUTS.md)

A **layout** is a named HTML shell that defines the page structure and panel slot positions.

## Directory structure

```
apps/PxD/layouts/
  default-dashboard/
    layout.html      # HTML shell template (required)
    layout.css       # Optional layout-specific overrides
    layout.js        # Optional layout-specific JS
```

## Template placeholders

`layout.html` may contain:

| Placeholder | Replaced with |
|---|---|
| `{{PXD_TITLE}}` | `room.json → title` (HTML-escaped) |

## Panel slots

The layout declares empty `<div data-slot="<panelId>">` elements. `pxd.js` calls each panel's `mount(slotEl)` function, passing the `data-slot` element. Panels inject their own HTML into the slot.

### default-dashboard slot IDs

| Slot | Panel |
|---|---|
| `game-control` | Game state, commands, checklist |
| `time-lights` | Time adjustment, lighting, emergency |
| `hints` | Hint delivery |
| `system` | Warnings, zone heartbeats |

## Required page elements

`layout.html` must include:

```html
<div id="pxd-modals"></div>        <!-- modal portal for panels -->
<div id="pxd-toast-container"></div> <!-- toast portal -->
```

And load (in order):

```html
<script src="assets/js/jquery.min.js"></script>
<script src="assets/js/paho-mqtt.js"></script>
<script src="assets/js/bootstrap.bundle.min.js"></script>
<script src="assets/js/pxd.js"></script>
```

## Creating a new layout

1. Create `layouts/<name>/layout.html` with the HTML shell
2. Add `data-slot` elements for each panel the layout supports
3. Include required page elements listed above
4. Set `"layout": "<name>"` in `room.json`

New layouts do not need to support all four default panels; unused slots are simply never mounted.
