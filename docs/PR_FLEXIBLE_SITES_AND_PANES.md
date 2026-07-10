# Plan: Flexible Sites, Pages & Panes — PxD as a multi-site operator-UI generator

> **Status:** Proposed. Awaiting approval before implementation.
> **Schema impact:** Breaking. Introduces `pxdVersion: "2"`. No backward
> compatibility with v1 configs — the two existing rooms (Agent 22, Houdini's
> Challenge) are migrated as part of this work (pre-distribution, deliberate
> clean break to avoid legacy bloat).

---

## 1. Summary

PxD grows from "one templated dashboard page per room" into a small **static
site generator for operator UIs**. A single room config file can define one or
more **sites** (deployable UI variants — e.g. game-master, mobile), each made
of one or more **pages**, each composed from an ordered set of **panes** drawn
from a fixed **pane library**, skinned by a named **theme**.

Everything is still build-time assembled into plain static HTML/CSS/JS — no
runtime framework, no server-side rendering, no build step beyond the PxD
packager. Each generated page is its own HTML document (its own DOM); panes are
`<div>`s within it; no iframes except for genuinely external embeds.

This delivers the concrete layouts the operator asked for:
- A camera pane (two-thirds) beside a widget pane (one-third) for a chamber.
- Multiple chambers either as **scrolling panes on one page** or as **separate
  navigable pages** — the config author picks per site.
- Multiple site variants (gm / mobile / …) built into subfolders under one
  `/html/` root, with an auto-generated landing page linking them.

---

## 2. Definitions (canonical vocabulary)

These terms are used consistently across code, config, and docs. They will be
added to `docs/ROOMS.md` and the AI-instruction files.

| Term | Definition |
|---|---|
| **Site** | A deployable UI variant for a game (e.g. `gm`, `mobile`). Builds into its own subfolder under the room's `/html/`. A site is `pxd` (PxD-generated), `external` (a link to an off-PxD URL), or `manual` (an operator-maintained subfolder PxD never overwrites). |
| **Page** | One generated HTML file within a `pxd` site. Scrolls vertically. A site with several pages is navigated via an auto-built nav; a site with one page is a single scrolling screen. |
| **Pane** | A card/section within a page, instantiated from the **pane library** by `type`. Config order = on-screen order. Each pane has a configurable width and, if its type declares one, a gear-icon settings menu. |
| **Pane library** | The fixed set of pane types PxD ships (§5). Config selects and configures instances; variety comes from config, not new types. |
| **Widget** | An MQTT-bound prop/puzzle tile. Widgets live **inside** a `widget-grid` pane. Unchanged concept from today, just re-homed. |
| **Theme** | A named bundle of visual design tokens (colors, fonts, radius, shadow). Rooms reference a theme by name and may override individual tokens. Structural CSS lives in the framework; themes set only tokens; custom room CSS is discouraged. |
| **Header / Footer** | Optional site-level sticky regions. A header sticks to the top and a footer to the bottom while the page body scrolls. Each holds one pane (commonly a `nav` or `content` pane). Applied to every page in the site. |
| **Landing page** | The always-generated `/html/index.html`. For a single-site room it redirects to that site; for a multi-site room it shows the room logo and an auto-generated list of site links (plus any external links). |

> **Explicitly not introduced:** a general "elements" system. Reuse-once needs
> (navigation) are met by the auto-built `nav` pane; static text/image/button
> needs are met by the `content` pane. A general element/component system may
> be revisited later if a real need emerges — it is out of scope here.

---

## 3. Config model (`room.json`, `pxdVersion: "2"`)

Single file. Top-level room identity + a `sites` array. Illustrative shape
(field reference lands in `docs/ROOMS.md` during implementation):

```jsonc
{
  "pxdVersion": "2",
  "title": "Agent 22",
  "topicRoot": "paradox/agent22",
  "mqtt": { "broker": "auto", "port": "auto", "wsPath": "/mqtt" },

  // Named theme + optional per-token overrides.
  "theme": { "base": "midnight-teal", "overrides": { "accent": "#44e0cc" } },

  "media": { "logo": "media/logo.png", "favicon": "media/favicon.ico" },

  "sites": [
    {
      "id": "gm",                     // subfolder name + landing-page link id
      "title": "Game Master",
      "description": "Full operator control",   // landing-page hover tooltip
      "type": "pxd",                  // pxd | external | manual

      // Optional site-wide sticky regions (each is one pane).
      "header": { "type": "nav", "config": {} },
      "footer": null,

      "pages": [
        {
          "id": "general",
          "title": "General",
          "panes": [
            { "type": "game-control", "width": "full" },
            { "type": "camera-view",  "width": "two-thirds", "config": { "cameras": [ /* … */ ] } },
            { "type": "widget-grid",  "width": "third",      "config": { "widgets": [ /* … */ ] } }
          ]
        },
        {
          "id": "chamber-1",
          "title": "Chamber 1",
          "panes": [
            { "type": "camera-view", "width": "two-thirds", "config": { /* … */ } },
            { "type": "widget-grid", "width": "third",      "config": { /* … */ } }
          ]
        }
      ]
    },

    { "id": "mobile", "title": "Mobile", "type": "pxd", "pages": [ /* … */ ] },

    { "id": "cams", "title": "Legacy Amcrest", "type": "external",
      "url": "http://10.0.0.29/", "description": "Native camera app" },

    { "id": "tech", "title": "Technician Notes", "type": "manual",
      "description": "Hand-maintained reference page" }
  ]
}
```

Scroll-vs-multipage is expressed naturally: **one page with many panes = a
scrolling screen; many pages = navigable screens.** Both can coexist (a
multi-page site whose pages each scroll). Neither is required.

---

## 4. Sites, build layout & overwrite safety

Output under the room's existing `/html/`:

```
html/
  index.html            ← ALWAYS generated (landing page or single-site redirect)
  gm/                    ← type:pxd  — wiped + rebuilt every packager run
    index.html
    assets/ …
  mobile/                ← type:pxd  — wiped + rebuilt every packager run
  tech/                  ← type:manual — PxD NEVER writes or deletes here
  (external sites)       ← no files; landing-page link only
```

Rules:
- **`pxd` sites**: each builds into `/html/<id>/`. That subfolder is **cleaned
  and regenerated** on every build (removes stale files — a new behavior; the
  current packager only overwrites, never deletes).
- **`manual` sites**: PxD emits a landing-page link to `/html/<id>/` but never
  creates, writes, or deletes that folder. Operator owns it.
- **`external` sites**: no local files; landing-page link points at `url`.
- **Landing page** (`/html/index.html`) is always regenerated. One `pxd` site →
  instant redirect (`location.replace` + `<meta refresh>` fallback) into it.
  Multiple sites → logo + auto-generated link list (all `pxd`/`manual`/`external`
  sites), tooltips from each site's `description`.
- **Default single site**: if a room defines no `sites` array, PxD synthesizes
  one `pxd` site with id `control` (→ `/html/control/`), and root redirects to
  it. (Consistent one-code-path model; a room is always ≥1 site.)

---

## 5. Pane library (v1 — small, flexible set)

| Pane type | Purpose | Gear menu |
|---|---|---|
| `game-control` | Existing game-control panel, ported to the pane contract | — |
| `time-lights` | Existing time/lights panel | — |
| `hints` | Existing hint-delivery panel | — |
| `system` | Existing system/watch-zone panel | — |
| `camera-view` | Live go2rtc streams (main + sidebar, Half/Full, Single/Multi) — already multi-instance | URL overrides (session) |
| `widget-grid` | Grid of MQTT prop/puzzle widgets (today's `widgets` panel, renamed & made multi-instance) | Widget show/hide |
| `nav` | Auto-built navigation to the site's pages (+ optional extra external links). Rendered only when the site has >1 page or the author places it explicitly. | — |
| `content` | Static content: raw HTML, or a structured list of text / image / button items | — |

Each pane type is registered once via a **factory contract** and instantiated
per config entry (own DOM subtree, own config, own state). Variety = config, not
new types.

### Pane widths (Bootstrap 12-col basis, responsive)

Config values map to grid spans, with responsive collapse so pages stay usable
on desktop / tablet / phone:

| `width` | Desktop ≥992px | Tablet 768–991px | Phone <768px |
|---|---|---|---|
| `full` (12) | 12 | 12 | 12 |
| `two-thirds` (8) | 8 | 12 | 12 |
| `half` (6) | 6 | 6 | 12 |
| `third` (4) | 4 | 6 | 12 |

Panes flow left-to-right in config order and wrap. This enables the
"camera (two-thirds) + widgets (third)" chamber layout directly, while
guaranteeing full-width stacking on phones.

### Gear icon convention

If a pane type declares a settings menu, the framework renders a gear button in
that pane's top-right header (same icon as today's widgets panel). The pane
supplies the dialog contents. **All pane settings are session-only** — no
cross-session persistence is built (explicitly out of scope to avoid a
state-sync layer). The temporary `localStorage` used by the current camera-view
size/view toggles is removed in favor of session-only + config defaults.

---

## 6. Themes

- Named theme bundles live in `apps/PxD/themes/<name>/theme.json` (token
  values). `room.json` → `theme` is either `"<name>"` or
  `{ "base": "<name>", "overrides": { …tokens… } }`.
- The **complete token list with defaults** is defined once in
  `pxd-base.css` `:root` (already the case) and documented in `THEMING.md`.
  Every token has a default; omitting one is allowed but the preference is that
  themes define all of them. Framework/pane structural CSS references only
  tokens, so it is fully themeable with **no custom room CSS**.
- A small starter set of themes ships (e.g. `midnight-teal`, `crimson-gold`) so
  the two games migrate to named themes rather than inline color blocks.

---

## 7. Runtime & DOM model

- Each generated page is its own `.html` file → its own DOM. No iframes for PxD
  panes; iframes only for `external` embeds if ever needed.
- Core runtime (`pxd.js`) changes from a single fixed panel-slot mounter to a
  **pane-factory instantiator**: reads the current page's `panes`, instantiates
  each by `type` into an ordered grid, wires the optional sticky header/footer,
  connects MQTT once, and shares it across all panes on the page.
- New registration contract (replaces `PxD.panels.register(id, {mount,unmount})`):
  `PxD.panes.registerType(type, factory)`, where
  `factory(config, ctx) => { mount(el), unmount() }`. Each config entry yields
  one instance.

---

## 8. Migration & scope

- **Agent 22** and **Houdini's Challenge**: migrate their `pxd/room.json` to
  `pxdVersion: "2"`, convert existing panels → a single `pxd` site with one
  page, port `cameraView`/`widgets` into `camera-view`/`widget-grid` panes,
  move inline theme colors into a named theme. Repackage and visually verify.
- **SpyCatcher**: **out of scope** — it has no `pxd/` folder. Leave untouched;
  operator will build it later.
- The temporary second "half-width comparison" camera pane added to Agent 22
  during testing is removed as part of the migration.

---

## 9. Implementation plan (checklist + model per task)

Model policy: **Opus 4.8** only for architecture/spec and reviewing the core
runtime rewrite (highest reasoning, highest cost — used sparingly). **Sonnet 5**
(newer/stronger than 4.5, per operator) for the bulk of implementation from this
spec. **Haiku (latest)** for mechanical, low-judgment work. **Explore
sub-agent on the cheapest capable model** for locating call sites during coding.
Each row notes the model and, where a switch happens, why.

### Phase 0 — Spec sign-off
- [ ] Operator approves this document. *(Model: Opus 4.8 — you are here.)*

### Phase 1 — Core runtime (the one genuinely tricky part)
- [ ] Design the pane-factory contract + page/site runtime in `pxd.js`. *(Opus 4.8 — high-blast-radius core design; justify the switch by risk, not volume.)*
- [ ] Implement `PxD.panes.registerType` + per-page pane instantiation + shared MQTT + sticky header/footer wiring. *(Sonnet 5 — mechanical once designed.)*
- [ ] Opus review checkpoint on the merged core before dependents build on it. *(Opus 4.8 — cheap insurance against a bad foundation.)*

### Phase 2 — Pane library
- [ ] Port `game-control`, `time-lights`, `hints`, `system` to the factory contract. *(Sonnet 5.)*
- [ ] Rename/adapt `widgets` → `widget-grid` pane, multi-instance. *(Sonnet 5.)*
- [ ] Adapt `camera-view` to the factory contract; drop temporary `localStorage`. *(Sonnet 5.)*
- [ ] New `nav` pane (auto-built from site pages + optional external links). *(Sonnet 5.)*
- [ ] New `content` pane (raw HTML or structured text/image/button list). *(Sonnet 5.)*
- [ ] Responsive 12-col width CSS + collapse rules in `pxd-base.css`. *(Sonnet 5.)*
- [ ] Locate every call site of the old `PxD.panels.register` / `panels.include`. *(Explore sub-agent, cheapest model.)*

### Phase 3 — Themes
- [ ] Extract token list, ship `apps/PxD/themes/` with a starter set. *(Sonnet 5.)*
- [ ] Theme resolution (name + overrides) in `pxd.js`/packager. *(Sonnet 5.)*

### Phase 4 — Packager & sites
- [ ] Multi-site build: per-`pxd`-site subfolder, page HTML generation, asset copy. *(Sonnet 5.)*
- [ ] Clean-and-rebuild for `pxd` subfolders; never touch `manual`; skip `external`. *(Sonnet 5 — correctness-sensitive deletion logic; keep out of Haiku's hands.)*
- [ ] Landing-page generator (single-site redirect vs multi-site link list). *(Sonnet 5.)*
- [ ] Update packager tests for the new model. *(Sonnet 5.)*

### Phase 5 — Migrate rooms
- [ ] Migrate Agent 22 `room.json` → v2; port panes; named theme; remove temp pane. *(Sonnet 5 — needs judgment mapping old→new.)*
- [ ] Migrate Houdini's Challenge `room.json` → v2; port panes; named theme. *(Sonnet 5.)*
- [ ] Repackage both rooms; run packager tests. *(Haiku — mechanical.)*
- [ ] Live visual verification of both rooms in a real browser. *(Sonnet 5 — uses browser tools + judgment. Note: automated headless browser can't decode camera AAC/MSE; verify stream tiles connect, judge visuals in a normal browser.)*

### Phase 6 — Documentation & AI instructions (near the end, per request)
- [ ] Rewrite `docs/ROOMS.md` for the v2 site/page/pane model + the §2 glossary. *(Sonnet 5.)*
- [ ] Update `docs/THEMING.md` (named themes + full token table). *(Sonnet 5.)*
- [ ] Update `docs/WIDGETS.md` (widgets now live in `widget-grid` panes). *(Sonnet 5.)*
- [ ] New `docs/PANES.md` (pane library reference). *(Sonnet 5.)*
- [ ] Update `README.md` phase/status table + repo-layout + doc index. *(Haiku — table edits.)*
- [ ] Update PxD AI-instruction files (`AI-INSTRUCTIONS.md`, `AI-DETAILED-OVERVIEW.md`, `CLAUDE.md`) with the site/page/pane/theme model + glossary. *(Sonnet 5.)*
- [ ] If needed, add a short PxD-capability note to sibling repos' AI-instruction files (PxO, PxP, room repos) so agents there describe PxD correctly. *(Haiku — small inserts.)*
- [ ] Mark this PR doc "Implemented"; record final decisions. *(Haiku.)*

### Autopilot note
Once approved, this is intended to run largely autonomously (Copilot Autopilot).
Phases 1→6 are ordered so each builds on a verified predecessor. The two Opus
checkpoints (Phase 1 design + review) are the only points that justify the
premium model; everything else should proceed on Sonnet 5 with Haiku for the
mechanical tail and an Explore sub-agent for lookups. Rooms migrated: Agent 22
and Houdini's Challenge. SpyCatcher intentionally left untouched.

---

## 10. Open risks / watch-items

- **Deletion logic** (clean-and-rebuild of `pxd` subfolders) is the highest-risk
  code — a path bug could delete a `manual` folder. Guard with an explicit
  allow-list of generated subfolders and never a broad recursive delete of
  `/html/`.
- **Core contract churn**: every pane must move to the factory contract in one
  pass; a half-migrated registry breaks page mount. Phase 1 review gate exists
  for this.
- **Responsive testing**: verify the four widths at desktop/tablet/phone widths
  before declaring Phase 2 done.
