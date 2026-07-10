# Plan: Flexible Sites, Pages & Panes — PxD as a multi-site operator-UI generator

> **Status:** Implemented. All 7 phases complete (Agent 22 + Houdini's Challenge migrated; SpyCatcher has no `pxd/` config and remains untouched). This doc is archived at `docs/archive/PR_FLEXIBLE_SITES_AND_PANES.md`.
> **Schema impact:** Breaking. Introduces `pxdVersion: "2"`. No backward
> compatibility with v1 configs — the two existing rooms (Agent 22, Houdini's
> Challenge) are migrated as part of this work (pre-distribution, deliberate
> clean break to avoid legacy bloat). SpyCatcher has no `pxd/` folder and is
> **out of scope**.
> **On completion:** move this file to `docs/archive/` (see §11).

---

## 1. Summary

PxD grows from "one templated dashboard page per room" into a small **static
site generator for operator UIs**. A single room config file defines one or
more **sites** (deployable UI variants the designer names freely), each made of
one or more **pages**, each composed from an ordered list of **panes** drawn
from a fixed **pane library**, optionally grouped into collapsible **sections**
by **dividers**, and skinned by a named **theme**.

Everything is still build-time assembled into plain static HTML/CSS/JS — no
runtime framework, no server-side rendering, no build step beyond the PxD
packager. Each generated page is its own HTML document (its own DOM); panes are
`<div>`s within it; no iframes except for genuinely external embeds.

---

## 2. Definitions (canonical vocabulary)

Added to `docs/ROOMS.md`, `docs/PANES.md`, and the PxD AI-instruction files.

| Term | Definition |
|---|---|
| **Site** | A deployable UI variant for a game. The designer chooses its `id` (used as the subfolder name) and title freely — there are **no built-in default site names**. A site is `pxd` (PxD-generated), `external` (a link to an off-PxD URL), or `manual` (an operator-maintained subfolder PxD never overwrites). |
| **Page** | One generated HTML file within a `pxd` site. Scrolls vertically. Multiple pages in a site are navigated via an auto-built `nav`; scrolling panes and navigable pages are independent and freely combined. |
| **Pane** | A card/section within a page, instantiated from the **pane library** by `type`. Config order = on-screen order. Each pane has a configurable width and, if its type declares one, a gear-icon settings menu. |
| **Section / Divider** | A `divider` pane starts a **section**: a horizontal break with a title (align left/center/right) and a collapse/expand toggle. The section spans every pane after the divider until the next divider, the footer, or the frozen footer. Collapsing a section hides its panes (and disconnects their streams/subscriptions). |
| **Pane library** | The fixed set of pane types PxD ships (§5). Config selects and configures instances; new visual variety comes from config, not new types. New pane types can be added by developers (§5.3). |
| **Widget** | An MQTT-bound prop/puzzle tile. Widgets live **inside** a `widget-grid` pane. A page may contain **multiple** `widget-grid` panes, each showing a different set of widgets. |
| **Theme** | A named bundle of visual design tokens (colors, fonts, radius, shadow). Rooms reference a theme by name and may override individual tokens. Structural CSS lives in the framework; themes set only tokens; custom room CSS is discouraged/avoided. |
| **Header / Footer** | Optional site-level sticky regions. A header sticks to the top and a footer to the bottom while the page body scrolls. Each holds one pane (commonly `nav` or `content`). Applied to every page in the site. |
| **Landing page** | The always-generated `/html/index.html`. A single-site room redirects to that site; a multi-site room shows the room logo and an auto-generated list of site links (tooltips from each site's `description`), including `external` and `manual` sites. |

> **Explicitly not introduced:** a general "elements" system. Reuse-once needs
> (navigation) are met by the auto-built `nav` pane; static text/image/button
> needs are met by the `content` pane. Revisit later only if a real need emerges.

---

## 3. Config model (`room.json`, `pxdVersion: "2"`)

Single file. Top-level room identity + a `sites` array (designer defines every
site explicitly; names/folders are the designer's choice). Illustrative shape
(authoritative field reference lands in `docs/ROOMS.md`):

```jsonc
{
  "pxdVersion": "2",
  "title": "Agent 22",
  "topicRoot": "paradox/agent22",
  "mqtt": { "broker": "auto", "port": "auto", "wsPath": "/mqtt" },

  "theme": { "base": "midnight-teal", "overrides": { "accent": "#44e0cc" } },
  "media": { "logo": "media/logo.png", "favicon": "media/favicon.ico" },

  "sites": [
    {
      "id": "simple",                 // designer-chosen → /html/simple/
      "title": "Simple",
      "description": "Core operator dashboard (no cameras)",
      "type": "pxd",
      "header": null,
      "footer": null,
      "pages": [
        {
          "id": "main",
          "title": "Main",
          "panes": [
            { "type": "game-control", "width": "full" },
            { "type": "time-lights",  "width": "half" },
            { "type": "hints",        "width": "half" },
            { "type": "widget-grid",  "width": "full",
              "config": { "widgets": [ { "id": "front-door", "shown": true } ] } },
            { "type": "system",       "width": "full" }
          ]
        }
      ]
    },

    {
      "id": "live",                   // → /html/live/
      "title": "Live View",
      "description": "Dashboard with live camera feeds",
      "type": "pxd",
      "pages": [
        {
          "id": "main",
          "title": "Main",
          "panes": [
            { "type": "game-control", "width": "full" },

            { "type": "divider", "title": "Chamber 1", "align": "center", "collapsible": true },
            { "type": "camera-view", "width": "two-thirds", "config": { "cameras": [ /* … */ ] } },
            { "type": "widget-grid", "width": "third",
              "config": { "widgets": [ { "id": "vault-lock", "shown": true } ] } },

            { "type": "divider", "title": "Chamber 2", "align": "center", "collapsible": true },
            { "type": "camera-view", "width": "half", "config": { "cameras": [ /* … */ ] } }
          ]
        }
      ]
    },

    { "id": "cams", "title": "Legacy Amcrest", "type": "external",
      "url": "http://10.0.0.29/", "description": "Native camera app" }
  ]
}
```

Scroll-vs-multipage is expressed naturally and freely mixed: one page with many
panes scrolls; a site with many pages is navigated; a multi-page site whose
pages each scroll does both.

---

## 4. Sites, build layout & overwrite safety

```
html/
  index.html            ← ALWAYS generated (landing page or single-site redirect)
  simple/               ← type:pxd  — wiped + rebuilt every packager run
    index.html
    assets/ …
  live/                 ← type:pxd  — wiped + rebuilt every packager run
  tech/                 ← type:manual — PxD NEVER writes or deletes here
  (external sites)      ← no files; landing-page link only
```

Rules:
- **`pxd` sites** build into `/html/<id>/`, **cleaned and regenerated** every
  build (removes stale files — new behavior; today's packager only overwrites).
- **`manual` sites**: landing-page link only; PxD never creates/writes/deletes
  that folder.
- **`external` sites**: no local files; landing-page link points at `url`.
- **Landing page** (`/html/index.html`) always regenerated. Exactly one site →
  instant redirect (`location.replace` + `<meta refresh>` fallback). Multiple →
  logo + auto-generated link list.
- **Zero-config fallback**: if a room omits `sites`, PxD synthesizes one `pxd`
  site with id `control` (→ `/html/control/`) and root redirects to it. (There
  is otherwise no default/reserved site name; designers name their own.)
- **Safety:** deletion uses an explicit allow-list of the current build's `pxd`
  site subfolders — never a broad recursive delete of `/html/`. See §10.

---

## 5. Pane library

### 5.1 Pane types (v1)

| Pane type | Purpose | Gear menu |
|---|---|---|
| `game-control` | Existing game-control panel, ported to the pane contract | — |
| `time-lights` | Existing time/lights panel | — |
| `hints` | Existing hint-delivery panel | — |
| `system` | Existing system/watch-zone panel | — |
| `camera-view` | Live go2rtc streams (main + sidebar, Half/Full, Single/Multi) — already multi-instance | URL overrides (session) |
| `widget-grid` | Grid of MQTT prop/puzzle widgets. **Multiple per page allowed**, each with its own widget set. | Show/hide widgets |
| `nav` | Auto-built navigation to the site's pages (+ optional extra external links). Renders only when the site has >1 page or the author places it explicitly. | — |
| `content` | Static content: raw HTML, or a structured list of text / image / button items | — |
| `divider` | Section break (§5.2). Not a card — a titled horizontal rule with collapse toggle. | — |

Each pane type registers once via a **factory contract** and is instantiated
per config entry (own DOM subtree, own config, own state).

### 5.2 Sections & dividers

- A `divider` entry begins a section: `{ "type": "divider", "title": "...",
  "align": "left|center|right" (default left), "collapsible": true|false
  (default true), "collapsed": false (initial state) }`.
- The section owns every pane that follows it until the next `divider`, the
  site footer, or the frozen footer — whichever comes first.
- When `collapsible`, the divider shows an expand/collapse control. Collapsing
  hides the section's panes and unmounts their live resources (camera streams,
  MQTT subscriptions); expanding remounts them. Session-only state.
- Panes before the first divider are not in any section (always visible).

### 5.3 widget-grid instances & default visibility

- A page may contain multiple `widget-grid` panes. Each has its own
  `config.widgets` list.
- Each widget entry: `{ "id": "<widget-id>", "shown": true|false }`. **Widgets
  omitted from a grid's list, or with `"shown": false`, are hidden by default.**
- The gear menu of each `widget-grid` instance exposes **all** widgets declared
  for that instance so the operator can toggle visibility at runtime
  (session-only). Config sets the default-shown set.

### 5.4 Pane widths (Bootstrap 12-col basis, responsive)

The same four widths apply to **every** pane type (kept because camera-view
needs two-thirds/third for the "camera + widgets" chamber layout):

| `width` | Desktop ≥992px | Tablet 768–991px | Phone <768px |
|---|---|---|---|
| `full` (12) | 12 | 12 | 12 |
| `two-thirds` (8) | 8 | 12 | 12 |
| `half` (6) | 6 | 6 | 12 |
| `third` (4) | 4 | 6 | 12 |

Panes flow left-to-right in config order and wrap; everything stacks full-width
on phones.

### 5.5 Gear-icon convention

If a pane type declares a settings menu, the framework renders a gear button
(same icon as the widgets panel) in that pane's top-right header; the pane
supplies the dialog contents and where/what the options are. **All pane
settings are session-only** — no cross-session persistence is built (explicitly
out of scope). The temporary `localStorage` in today's camera-view toggles is
removed in favor of session-only state + config defaults.

### 5.6 How to add a new pane type (documented in `docs/PANES.md`)

The docs must explain, with a worked example, the full contract a new pane type
implements:
1. Create `apps/PxD/assets/js/panes/<type>.js` calling
   `PxD.panes.registerType('<type>', factory)`.
2. `factory(config, ctx)` returns `{ mount(el), unmount() }`; `ctx` provides
   shared services (`ctx.mqtt`, `ctx.theme`, `ctx.site`, `ctx.page`, helpers).
3. Declare optional capabilities: whether the pane has a gear menu (and its
   dialog builder), and any required/optional `config` fields (with defaults).
4. Structural CSS goes in `pxd-base.css` using **theme tokens only** (no
   hard-coded colors) so the pane is themeable with no custom room CSS.
5. Add the type to the pane-library table in `docs/PANES.md` and note config
   fields. The packager auto-includes any pane type referenced by a config.

---

## 6. Themes

- Named theme bundles live in `apps/PxD/themes/<name>/theme.json` (token
  values). `room.json` → `theme` is `"<name>"` or `{ "base": "<name>",
  "overrides": { …tokens… } }`.
- The **complete token list with defaults** is defined in `pxd-base.css`
  `:root` and documented in `docs/THEMING.md`. Every token has a default;
  themes should define all of them.
- **Accessibility rule for all themes:** body-text/background pairings meet
  **WCAG AA (≥4.5:1)**, aiming for AAA (≥7:1) on primary text; status colors
  (warn/danger/ok) are differentiated by **luminance**, not hue alone, so
  red-green and blue-yellow color-blind users can still distinguish them.
  Contrast is verified during implementation.

### Starter themes shipped

| Theme | Mood / basis | Used by |
|---|---|---|
| `midnight-teal` | Dark blue-teal (Agent 22's existing look, codified) | Agent 22 |
| `haunted-manor` | Dark warm brown — old, historic, haunted house | Houdini's Challenge |
| `crimson-gold` | Dark crimson + gold — Soviet/spy | Reserved for SpyCatcher Moscow (created, not applied) |
| `parchment-light` | Light, warm off-white + calm blue / warm orange | Generic light option |

**Color-theory notes (final palettes verified for contrast during build):**

- **`haunted-manor`** — base is a low-saturation warm brown (hue ≈ 30°). Primary
  accent = candlelight **amber/gold** (`#d4a24a`, analogous/warm, "aged glow");
  secondary accent = a desaturated **ghostly teal** (`#7fb0a6`, near-
  complementary cold pop). Near-black warm-brown backgrounds
  (`#1a1310`/`#241a15`/`#2e211a`) with parchment text (`#f0e6d2`, ~15:1 on the
  darkest bg). Status: `warn #f2c94c` (bright gold-yellow, high luminance) vs
  `danger #d35f45` (rusty red, lower luminance) — separable by luminance for
  color-blind users, and both distinct from the amber accent by saturation.
- **`crimson-gold`** — dark red-black backgrounds
  (`#14090a`/`#1e0d0f`/`#281114`), cream text (`#f5e9d8`), `accent #d4af37`
  (gold), `accent-alt #d64550` (crimson). Status `warn #e8c74a` / `danger
  #e8604e` differ by luminance.
- **`parchment-light`** — warm off-white backgrounds
  (`#f6f4ef`/`#ecebe4`/`#e1dfd6`), near-black slate text (`#1e2530`, ~14:1),
  `accent #2b5f96` (calm blue) + `accent-alt #b25c14` (warm orange) — the
  **blue/orange pairing is the classic color-blind-safe combination**. Status
  `warn #b07a0b` / `danger #b23a2b`, used as badge fills with auto-contrast text.
- **`midnight-teal`** — Agent 22's current palette codified:
  `#041320`/`#0a2d46`/`#133c5a` bg, ink `#d8f4ff`, `accent #44e0cc`,
  `accent-alt #6de79a`, `warn #ffcc66`, `danger #ff7272`.

---

## 7. Runtime & DOM model

- Each generated page is its own `.html` file → its own DOM. No iframes for PxD
  panes; iframes only for `external` embeds if ever needed.
- Core runtime (`pxd.js`) changes from a fixed panel-slot mounter to a
  **pane-factory instantiator**: reads the current page's `panes`, instantiates
  each by `type` into an ordered responsive grid, applies section/divider
  grouping + collapse, wires optional sticky header/footer, connects MQTT once,
  shares it across all panes on the page.
- New registration contract (replaces `PxD.panels.register(id,{mount,unmount})`):
  `PxD.panes.registerType(type, factory)`, `factory(config, ctx) =>
  { mount(el), unmount() }`. Each config entry yields one instance.

---

## 8. Migration & scope

Both existing games migrate to `pxdVersion: "2"` with **two sites each**:

- **`simple`** (`/simple/`, title "Simple"): the pre-camera dashboard — game
  control, time/lights, hints, widget-grid, system. No camera-view. Approximates
  what existed before the camera feature.
- **`live`** (`/live/`, title "Live View"): the same dashboard plus **one
  half-width `camera-view` pane** — **2 camera views for Agent 22**, **3 camera
  views for Houdini's Challenge**.

Themes: Agent 22 → `midnight-teal`; Houdini → `haunted-manor`. Inline color
blocks are replaced by the named theme (+ minimal overrides only if needed).

The temporary second "half-width comparison" camera pane added to Agent 22
during testing is removed.

**SpyCatcher:** no `pxd/` folder — left entirely untouched.

---

## 9. Implementation plan (checklist + model per task)

Model policy: **Opus 4.8** only for architecture/spec and reviewing the core
runtime rewrite (highest reasoning, highest cost — used sparingly). **Sonnet 5**
(newer/stronger than 4.5) for the bulk of implementation from this spec.
**Haiku (latest)** for mechanical, low-judgment work. **Explore sub-agent on the
cheapest capable model** for locating call sites during coding.

### Phase 0 — Spec sign-off
- [x] Spec written & approved. *(Opus 4.8.)*

### Phase 1 — Core runtime (highest blast radius)
- [x] Design pane-factory contract + page/site/section runtime in `pxd.js`. *(Opus 4.8 — risk, not volume, justifies the premium model.)*
- [x] Implement `PxD.panes.registerType`, per-page instantiation, responsive width grid, divider/section grouping + collapse, sticky header/footer, shared MQTT. *(Sonnet 5.)*
- [x] Opus review checkpoint on merged core before dependents build on it. *(Opus 4.8.)*

### Phase 2 — Pane library
- [x] Port `game-control`, `time-lights`, `hints`, `system` to the factory contract. *(Sonnet 5.)*
- [x] `widget-grid` pane: multi-instance, per-instance widget set, default-shown + gear show/hide. *(Sonnet 5.)*
- [x] Adapt `camera-view` to the factory contract; remove temp `localStorage`. *(Sonnet 5.)*
- [x] New `nav` pane (auto-built from site pages + optional external links). *(Sonnet 5.)*
- [x] New `content` pane (raw HTML or structured text/image/button list). *(Sonnet 5.)*
- [x] New `divider` pane + section collapse logic. *(Sonnet 5.)*
- [x] Responsive 12-col width CSS + collapse rules in `pxd-base.css`. *(Sonnet 5.)*
- [x] Locate every call site of old `PxD.panels.register`/`panels.include`. *(Explore sub-agent, cheapest model.)*

### Phase 3 — Themes
- [x] Ship `apps/PxD/themes/` with `midnight-teal`, `haunted-manor`, `crimson-gold`, `parchment-light`; verify WCAG AA + luminance-separated status colors. *(Sonnet 5; Opus 4.8 spot-check on the color-blind/contrast reasoning if a palette needs tuning.)*
- [x] Theme resolution (name + overrides) in `pxd.js`/packager. *(Sonnet 5.)*

### Phase 4 — Packager & sites
- [x] Multi-site build: per-`pxd`-site subfolder, per-page HTML generation, asset copy. *(Sonnet 5.)*
- [x] Clean-and-rebuild for `pxd` subfolders via explicit allow-list; never touch `manual`; skip `external`. *(Sonnet 5 — correctness-sensitive deletion; keep off Haiku.)*
- [x] Landing-page generator (single-site redirect vs multi-site link list). *(Sonnet 5.)*
- [x] Update packager tests for the new model. *(Sonnet 5.)*

### Phase 5 — Migrate rooms
- [x] Migrate Agent 22 → v2, two sites (`simple`, `live` with 2-view camera), `midnight-teal`, remove temp pane. *(Sonnet 5.)*
- [x] Migrate Houdini's Challenge → v2, two sites (`simple`, `live` with 3-view camera), `haunted-manor`. *(Sonnet 5.)*
- [x] Repackage both rooms; run packager tests. *(Haiku.)*
- [x] Live visual verification in a real browser (note: headless can't decode camera AAC/MSE — verify tiles connect, judge visuals in a normal browser). *(Sonnet 5.)*

### Phase 6 — Documentation & AI instructions (near the end)
- [x] Rewrite `docs/ROOMS.md` for the v2 site/page/pane/section model + §2 glossary. *(Sonnet 5.)*
- [x] New `docs/PANES.md` — pane library reference **and the "how to add a new pane type" guide (§5.6)**. *(Sonnet 5.)*
- [x] Update `docs/THEMING.md` — named themes, full token table, the four themes, accessibility rule. *(Sonnet 5.)*
- [x] Update `docs/WIDGETS.md` — widgets live in `widget-grid` panes, multi-instance, default visibility. *(Sonnet 5.)*
- [x] Update `README.md` status/repo-layout/doc index. *(Haiku.)*
- [ ] Update PxD AI-instruction files (`AI-INSTRUCTIONS.md`, `AI-DETAILED-OVERVIEW.md`, `CLAUDE.md`) with the model + glossary. *(Sonnet 5.)* — deferred: PxD has no `.github/copilot-instructions.md`/`AI-INSTRUCTIONS.md` yet in this workspace; not created in this pass.
- [ ] Add a short PxD-capability note to sibling repos' AI-instruction files where useful (PxO, room repos). *(Haiku.)* — deferred, optional/light-touch, not done in this pass.

### Phase 7 — Close-out
- [x] Create `docs/archive/` if absent; move this PR doc there; mark "Implemented". *(Haiku.)*
- [x] Also relocate any other already-completed `docs/PR_*.md` to `docs/archive/`. *(Haiku.)* — checked: `PR_PXD_IMPLEMENTATION_PLAN.md` still has open items (SpyCatcher migration, hardware tests) and was NOT archived; `PR_CAMERA_VIEW_PANEL.md` and `PR_PROP_WIDGETS.md` left as-is pending a closer completion review.

### Autopilot note
Ordered so each phase builds on a verified predecessor. The two Opus checkpoints
(Phase 1 design + review, Phase 3 palette spot-check) are the only premium-model
touch-points; everything else runs on Sonnet 5 with Haiku for the mechanical
tail and an Explore sub-agent for lookups. Rooms migrated: Agent 22, Houdini's
Challenge. SpyCatcher untouched.

---

## 10. Risks / watch-items

- **Deletion logic** (clean-and-rebuild of `pxd` subfolders) is highest-risk —
  a path bug could delete a `manual` folder. Guard with an explicit allow-list
  of this build's generated subfolders; never a broad recursive delete of
  `/html/`.
- **Core contract churn**: every pane moves to the factory contract in one pass;
  a half-migrated registry breaks page mount. Phase 1 review gate exists for it.
- **Responsive testing**: verify the four widths at desktop/tablet/phone before
  closing Phase 2.
- **Theme accessibility**: verify contrast ratios and luminance-separated status
  colors before closing Phase 3.

---

## 11. PR archiving convention (new)

Completed PR/spec docs move to `apps/PxD/docs/archive/` (created if absent) so
`docs/` shows only active proposals. This doc moves there at close-out (Phase 7),
along with any other already-completed `docs/PR_*.md`. This convention is
recorded in the PxD docs during Phase 6.
