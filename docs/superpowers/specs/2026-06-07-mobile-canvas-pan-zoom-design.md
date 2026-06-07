# Mobile canvas: single-finger pan + pinch-zoom

**Date:** 2026-06-07
**Scope:** `frontend/` Discord Activity lineup planner — mobile (`max-width: 767px`) canvas navigation only. Desktop unchanged.

## Problem

Mobile canvas navigation today:

- **Pan + zoom are both two-finger** (interact.js `gesturable` on `#stage-container`). No single-finger navigation.
- **Zoom baseline `z=1` = fit-to-height** (`MIN_Z=1`), so the canvas always fills viewport height and can only be panned sideways. You can never zoom out far enough to see the whole 1000×600 (landscape) canvas on a portrait phone.
- Zoom-in allowed up to `MAX_Z=3`.

## Desired behaviour

- **Single finger on the canvas background → pan.**
- **Pinch → zoom.**
- **Min zoom = canvas width fills viewport** (fit-to-width → whole canvas visible, letterboxed top/bottom on portrait).
- **Max zoom = canvas height fills viewport** (fit-to-height, the current `z=1` baseline).
- **Initial view = fit-width** (whole canvas on load).
- Dropping the current 3× zoom-in is accepted (decision recorded below).

## Geometry

Canvas `#stage` is 1000×600 (landscape, aspect 1.667). On mobile CSS sizes it to fit-to-height: `height: 100%` of `#stage-container`, `width: auto` via `aspect-ratio`. So `stageEl.clientWidth` (untransformed) = the fit-to-height width. Transform applied on top: `transform-origin: 0 0; transform: translate(pan) scale(z)`.

- `z = 1` → rendered height = viewport height (fit-to-height) = **max zoom**.
- fit-to-width: rendered width == viewport width → `z = viewportEl.clientWidth / stageEl.clientWidth` = **min zoom**.

On a portrait phone min `< 1 <` (no max above 1). Because the canvas is landscape and capped at fit-to-height, the rendered height is always `≤` viewport height → vertical axis always letterboxes/centers; only horizontal panning is meaningful (appears as you zoom in past min).

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Max zoom | Cap at fit-to-height (drop the 3× zoom-in) |
| 2 | Initial zoom on mobile | Fit-width (whole canvas visible) |
| 3 | Two-finger pan-while-pinch | Keep (existing `gesturable` midpoint translation) |

## Design

Three files. No backend / `devData.js` shape change (pure client-side viewport behaviour).

### 1. `src/canvas/viewport.js` — dynamic zoom bounds

- Replace static `MIN_Z`/`MAX_Z` constants. Keep `MAX_Z = 1` (fit-to-height baseline). Remove `MIN_Z`.
- `minZoom(stageWidthCss, viewWidth)` — pure: `min(viewWidth / stageWidthCss, MAX_Z)`. Guard `MAX_Z` cap so a viewport wider than the canvas aspect (e.g. landscape) never yields min > max. Returns `MAX_Z` if `stageWidthCss` is 0.
- `clampZoom(z, minZ, maxZ = MAX_Z)` — now takes bounds.
- `zoomBounds(stageEl, viewportEl)` — DOM helper: `{ minZ: minZoom(stageEl.clientWidth, viewportEl.clientWidth), maxZ: MAX_Z }`.
- `fitToWidth(stageEl, viewportEl)` — set `{ panX:0, panY:0, z: minZ }`, then `applyViewport` (its `clampPan` auto-centers the vertical letterbox).
- `refit(stageEl, viewportEl)` — re-clamp current `z` to fresh bounds and re-apply (resize / orientation).
- `clampPan`, `focalZoom`, `applyViewport`, `clearViewportTransform`, state getters/setters unchanged.

### 2. `src/canvas/drag.js` — `wireGestures`

- **Single-finger pan:** add
  ```js
  interact(viewportEl).draggable({
    ignoreFrom: '.stage-dot, .mestre-ghost',
    listeners: { move(evt) { /* mobile-gated: pan += evt.dx/dy, apply, refresh */ } },
  });
  ```
  `ignoreFrom` is the collision safeguard (verified against interact.js 1.10.27 `testIgnore` → `matchesUpTo`, which climbs ancestors to `viewportEl`): touching a dot/ghost or any of their children rejects the viewport draggable before it starts, so dot/ghost drag is untouched. Background touches pan. interact's one-interaction-per-pointer default backs this up.
- **Pinch zoom:** existing `gesturable` move uses dynamic bounds: `clampZoom(_startZ * evt.scale, minZ, maxZ)` from `zoomBounds(stageEl, viewportEl)`. Two-finger midpoint pan kept.
- **Return** `{ refreshPanAffordance, fit, refit, reset }` (was discarded by caller; now used).

### 3. `src/main.js`

- Capture `const gestures = wireGestures({...})`.
- After `applyResponsiveLayout()` at init: `if (isMobile()) gestures.fit();` → opens at fit-width.
- `mobileMQ` change: `isMobile() ? gestures.fit() : clearViewportTransform(stageEl)` (desktop still clears; mobile re-fits instead of bare clear).
- `resize` (covers `orientationchange`): rAF-coalesced `if (isMobile()) gestures.refit()`.

## Testing

- **Unit (vitest):** update `tests/canvas/viewport.test.js` for the new API — `minZoom` (portrait < 1, wide-viewport capped at `MAX_Z`, zero-width fallback), `clampZoom(z, minZ, maxZ)` with bounds. Keep `clampPan` / `focalZoom` / state tests. `drag.test.js` mocks interact and does not exercise `wireGestures` → unaffected (verify still green).
- **Manual (real device / responsive emulator):** single-finger background pan; dot drag still works (no pan bleed); pinch zoom between fit-width and fit-height; opens at fit-width; rotate / resize re-fits; desktop unaffected (no transform).
- **Prod-first per CLAUDE.md:** behaviour is client-only; verify `npm run dev` (flag on) and that the real-API path still compiles with the flag off.

## Out of scope

Desktop pan/zoom, vertical panning (moot — landscape canvas capped at fit-height), zoom-in past fit-height, momentum/inertia, double-tap-to-zoom.
