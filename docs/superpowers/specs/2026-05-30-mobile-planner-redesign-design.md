# Mobile Redesign — Lineup Planner (Discord Activity)

**Date:** 2026-05-30
**Scope:** `frontend/` Discord Activity (lineup planner). Make the planner usable on
mobile (Discord mobile client). Desktop layout (≥768px) stays byte-for-byte
unchanged — all mobile rules are additive, behind a `max-width: 767px` media query.

## Problem

The frontend has zero responsive CSS. The stage is locked to a 5:3 aspect ratio via
`width: min(calc(100vw - 220px), calc((100vh - 52px) * (1000/600)))`
([styles.css:292](../../../frontend/src/styles.css#L292)), so on a narrow phone it
collapses to a tiny unusable square. The header buttons wrap and squish, the sidebar
eats horizontal space, and there is no touch panning. Result: unusable on mobile.

## Trigger

CSS `@media (max-width: 767px)` drives the mobile layout. Desktop (≥768px) unchanged.
Same codebase, additive CSS plus a few JS guards keyed off a `matchMedia('(max-width:767px)')`
check (and/or a body class set once on load + `resize`). Tablets/rotation handled
automatically by the width breakpoint.

## Layout — Mobile (<768px)

### Header (slim, fixed top)

```
[☰]        Kvinnodagen 8 mars        [⋮]
           08/03/26   (small, wraps)
```

- **Left `☰`** — toggles the drawer. Nothing else lives here.
- **Center `#planner-title`** — smaller font, `white-space: normal`, wraps to max 2
  lines, centered, line-clamped with ellipsis. (No title-content redesign — out of scope.)
- **Right `⋮`** — overflow menu. Tap opens a popover containing `Placera alla` and
  `+ Medlem` with **full-text labels** (fixes the current 2-line squish in tiny buttons).
- Header height respects `env(safe-area-inset-top)`.

### Drawer (was `#sidebar`)

On mobile the sidebar becomes an **off-canvas drawer** that slides from the left and
**overlays** the canvas (`position: absolute` + `transform`, never flexbox-push):

- **Top action row:** `←` Back, `Rensa`, `🐛` debug.
- **Middle:** existing member list (`#sidebar-inner`, instrument groups) — unchanged content.
- **Bottom:** voice controls (`Avsluta` + mic-mute) stay in `#sidebar-voice-slot`, respecting
  `env(safe-area-inset-bottom)`.
- **Backdrop scrim** behind the drawer; tap scrim / `←` / swipe-left closes.
- **Canvas is independent of the drawer** — the stage never resizes when the drawer
  opens/closes, because the drawer floats above it rather than participating in layout flow.

## Stage — sizing, pan, zoom

### Sizing

`#stage-container` becomes `#stage-viewport`: `overflow: hidden`, fills the area under the
header — `height: calc(100dvh - var(--header-h))` (with `vh` fallback; see "dvh note"),
full width, where `--header-h` is a CSS custom property set to the mobile header height. Inside it, `#stage` keeps the logical 1000×600 (5:3) coordinate space. On mobile
`#stage` height = viewport height ⇒ width ≈ `height × 1000/600` ≈ 1.67× height ⇒ wider than
the phone screen ⇒ horizontal pan reveals the remainder.

### Transform model (Approach A — transform wrapper + `interact.gesturable`)

- `#stage` gets `transform: translate(panX, panY) scale(z)`, `transform-origin: 0 0`.
- JS holds `{ panX, panY, z }` and applies the transform on each gesture frame.
- `#stage-viewport` gets `touch-action: none` so the browser doesn't hijack gestures.
- **Pan clamp:** after every pan/zoom, clamp `panX/panY` so stage edges can't pass the
  viewport interior. At fit-zoom, vertical is locked and horizontal is free; zoomed-in,
  both axes pan. (Optional rubber-band overscroll, default off.)
- **Zoom `z` range** ≈ `[fit, 3]`, where `fit` = the scale that makes stage height match the
  viewport (treated as `z = 1` baseline). Pinch zoom is centered on the two-finger focal
  point — `panX/panY` are adjusted so the focal canvas-point stays under the fingers.

### Why existing dot math survives

Drag/placement code reads `stage.getBoundingClientRect()` and divides client deltas by
rect width/height to get percentages ([drag.js](../../../frontend/src/canvas/drag.js)). A
CSS transform changes the rect (scaled W/H, shifted origin) but preserves proportions, so
`%` positions and drag deltas stay correct at any pan/zoom. Mestre connector lines (SVG
`viewBox 0 0 100 100`, `preserveAspectRatio: none`,
[stage.js:122](../../../frontend/src/canvas/stage.js#L122)) scale with the stage
automatically. Net change to `drag.js` is minimal.

### dvh note

The app runs **only inside Discord's iframe** (refuses standalone,
[sdk.js:19](../../../frontend/src/sdk.js#L19)). Inside that iframe there is no browser
address bar, so the mobile `vh`-collapse problem does not occur there (`dvh ≈ vh`). Local
dev (`npm run dev`) runs in a real browser where `dvh` does help. Use `100dvh` with a `vh`
fallback — zero cost in Discord, correct in the browser test path. Device notch/home-bar
insets are handled separately via `env(safe-area-inset-*)`.

## Gesture model

### Finger arbitration on `#stage-viewport`

- **1 finger on a dot / mestre-ghost** → drag that element (existing
  `interact('.stage-dot').draggable` / `.mestre-ghost` — touch already works).
- **1 finger on empty canvas** → on mobile: tap-to-deselect only. Marquee-select
  ([drag.js:539](../../../frontend/src/canvas/drag.js#L539)) is **disabled on mobile**
  (kept on desktop); panning is the 2-finger job.
- **2 fingers anywhere** → `interact('#stage-viewport').gesturable()` → pan (translate by
  mean finger delta) + pinch (scale by finger-distance ratio). Gesturable only triggers on
  the 2nd pointer, so it won't fight 1-finger dot drags.
- **Conflict guard:** on `gesturable` start, cancel any in-progress 1-finger marquee/drag.
  Verify `draggable` ignores multi-touch; if not, gate handlers on pointer/touch count.

### Drawer-during-drag — "sliver" model

Removal is done by dropping a dot back onto the list
([drag.js:301](../../../frontend/src/canvas/drag.js#L301), `droppedOnSidebar` via
`sidebarRect`). On mobile the drawer is normally hidden, so the drop target would vanish.
Fix: the **drawer never fully hides while a drag is in progress.**

- The instant **any** drag starts — a canvas dot **or** a list name — the drawer enters
  **drag mode** and parks as a **sliver**: a thin strip (~32–40px) pinned to the left edge
  with a grab-tab look and a subtle "släpp för att ta bort" hint. Parked via `translateX`,
  **not** `display:none`, so `getBoundingClientRect` stays valid for hit-testing.
- **Edge-triggered expand:** during `dragmove`, if the finger crosses into the sliver zone
  (`client.x < threshold`), the drawer animates **fully open**; dragging back toward the
  canvas collapses it back to a sliver.
- **Place** (name from list): drawer starts full (you opened it to grab a name) → on
  dragstart it collapses to a sliver → canvas revealed → drop on canvas places. The existing
  `_sidebarGhost` pointer-following element ([drag.js:383](../../../frontend/src/canvas/drag.js#L383))
  keeps following the finger. Dragging into the sliver re-expands (cancel / return).
- **Remove** (dot from canvas): drawer peeks as a sliver → drag the dot left onto the sliver
  → it expands full → release inside it = remove (existing `droppedOnSidebar` logic,
  now hit-tested against the drawer's **live** transformed rect).

### Drop resolution (drag end)

- Finger over the drawer rect (sliver or expanded) → **remove** (canvas dot) /
  **cancel placement** (list name — no-op).
- Finger over the canvas → place / move.
- Drag end → drawer returns to its pre-drag state (closed).

### Affordance

Subtle edge fade-gradient on the left/right of `#stage-viewport` when more canvas exists in
that direction (removed at clamp edges) so users discover the pan.

## Out of scope

Title content redesign; debug-button prod-gating; touch-target size audit; first-run pan
hint; mobile marquee-select. Desktop layout unchanged.

## Touch / badges note

Stale/kanske badge tooltips are tap-driven popovers
([stage.js:241](../../../frontend/src/canvas/stage.js#L241)) and already work on touch — the
new gesture layer must not swallow a single tap on a badge (tap ≠ pan).

## Testing

Per CLAUDE.md, the data layer is unchanged, so dev-mode prod-parity rules are not the focus;
this is a presentation/interaction change. Verify:

1. **Desktop unchanged:** at ≥768px, layout/behavior identical to before (visual + drag/place/remove).
2. **Mobile layout:** at <768px, header collapses to `☰` / title / `⋮`; drawer slides over
   canvas; canvas width does not change when the drawer opens/closes.
3. **Pan/zoom:** two-finger pan moves the canvas, clamps at edges; pinch zooms centered on
   fingers within `[fit, 3]`.
4. **1-finger drag:** dragging a dot moves it; dragging an empty area does not pan or marquee.
5. **Place flow:** drag a name from the (open) drawer → drawer collapses to sliver → drop on
   canvas places the dot at the drop point.
6. **Remove flow:** drag a placed dot toward the left sliver → drawer expands → release =
   member removed (returns to list).
7. **Sliver invariant:** during any drag the drawer is never fully hidden.
8. **Safe areas:** header clears the notch; voice controls clear the home indicator.
9. **Existing frontend tests still pass:** `cd frontend && npx vitest run`.
10. **Badge tap:** tapping a stale/kanske badge still opens its tooltip and doesn't trigger pan.
```
