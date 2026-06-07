# Mobile Canvas Pan + Pinch-Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** Implemented and committed on branch `feat/mobile-canvas-pan-zoom` (`c94e0bf`). This plan is the canonical task breakdown — use it to re-derive, review, or verify the change. Spec: `docs/superpowers/specs/2026-06-07-mobile-canvas-pan-zoom-design.md`.

**Goal:** On the mobile (`max-width: 767px`) lineup-planner canvas, make single-finger background touches pan and pinch zoom between fit-to-width (whole canvas visible) and fit-to-height, opening at fit-to-width.

**Architecture:** The CSS already sizes `#stage` to fit-to-height (`z=1`); a transform (`translate(pan) scale(z)`, origin `0 0`) layers pan/zoom on top. Make the zoom range dynamic in `viewport.js` (min = fit-to-width factor, max = `1`). Add a single-finger `interact.js` draggable on the viewport with `ignoreFrom` for dots/ghosts so dot drags are untouched; keep the existing two-finger `gesturable` for pinch (now using dynamic bounds). Wire init/breakpoint/resize fitting in `main.js`. Desktop is untouched.

**Tech Stack:** Vanilla JS (Vite), interact.js 1.10.27, vitest (jsdom).

---

## File Structure

- `frontend/src/canvas/viewport.js` — pan/zoom state + pure math + transform application. Gains dynamic zoom bounds and fit helpers.
- `frontend/src/canvas/drag.js` — `wireGestures()` (touch handlers). Gains single-finger pan; pinch uses dynamic bounds; returns `fit`/`refit`.
- `frontend/src/main.js` — captures the gesture controller and drives fit on init / breakpoint / resize.
- `frontend/tests/canvas/viewport.test.js` — unit tests for the pure zoom math.

jsdom has no layout (`clientWidth === 0`), so only the pure math (`minZoom`, `clampZoom`, `clampPan`, `focalZoom`) is unit-tested. `fitToWidth`/`refit`/gesture handlers are DOM/layout-bound — verified by build + manual device QA (see Task 5).

---

## Task 1: Dynamic zoom bounds in viewport.js

**Files:**
- Modify: `frontend/src/canvas/viewport.js:1-16` (constants + `clampZoom`)
- Test: `frontend/tests/canvas/viewport.test.js:1-37`

- [ ] **Step 1: Replace the clampZoom tests with dynamic-bounds + minZoom tests**

In `frontend/tests/canvas/viewport.test.js`, change the import block and replace the old `describe('clampZoom', ...)`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
    clampPan, focalZoom, clampZoom, minZoom,
    MAX_Z,
    getViewport, setViewport, resetViewport, getZoom,
} from '../../src/canvas/viewport.js';

describe('minZoom — fit-to-width factor relative to the fit-to-height baseline', () => {
    it('portrait viewport: min < 1 (zoom out to see the whole landscape canvas)', () => {
        // stage CSS width 1333 (=800*1000/600 fit-height) in a 400 viewport
        // -> min = 400/1333 = 0.30 (fit-to-width)
        expect(minZoom(1333, 400)).toBeCloseTo(0.3, 2);
    });
    it('caps at MAX_Z when the viewport is wider than the canvas (never min > max)', () => {
        expect(minZoom(800, 2000)).toBe(MAX_Z);
    });
    it('returns MAX_Z when stage width is 0 (pre-layout safety)', () => {
        expect(minZoom(0, 400)).toBe(MAX_Z);
    });
});

describe('clampZoom — dynamic bounds', () => {
    it('clamps below minZ up to minZ', () => {
        expect(clampZoom(0.1, 0.3, MAX_Z)).toBe(0.3);
    });
    it('clamps above maxZ down to maxZ', () => {
        expect(clampZoom(99, 0.3, MAX_Z)).toBe(MAX_Z);
    });
    it('passes values inside the range unchanged', () => {
        expect(clampZoom(0.6, 0.3, MAX_Z)).toBe(0.6);
    });
    it('maxZ defaults to MAX_Z (fit-to-height = 1)', () => {
        expect(clampZoom(5, 0.3)).toBe(MAX_Z);
        expect(MAX_Z).toBe(1);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/canvas/viewport.test.js`
Expected: FAIL — `minZoom` is not exported; `MIN_Z` import is now gone; old `MAX_Z` is `3` not `1`.

- [ ] **Step 3: Replace the constants + clampZoom in viewport.js**

In `frontend/src/canvas/viewport.js`, replace lines 1-16 (the header comment, `MIN_Z`/`MAX_Z`, state, getters, old `clampZoom`):

```js
// Canvas pan/zoom viewport: shared state + pure math + transform application.
// z is the zoom factor on top of the CSS-fit stage (z=1 = fit-to-height baseline).
//
// Zoom range is dynamic. The CSS sizes the stage to fit-to-height, so z=1 is the
// MAX zoom (canvas height fills the viewport). MIN zoom is fit-to-width (canvas
// width fills the viewport) — z<1 on a portrait phone, computed from live dims.

export const MAX_Z = 1; // fit-to-height baseline (z=1 = stage height fills viewport)

let _state = { panX: 0, panY: 0, z: 1 };

export function getViewport() { return { ..._state }; }
export function getZoom() { return _state.z; }
export function setViewport(s) { _state = { panX: s.panX, panY: s.panY, z: s.z }; }
export function resetViewport() { _state = { panX: 0, panY: 0, z: 1 }; }

// Minimum zoom = z where the rendered stage width equals the viewport width
// (fit-to-width). stageWidthCss = stageEl.clientWidth (untransformed CSS width,
// which the CSS sets to the fit-to-height width). Capped at MAX_Z so a viewport
// wider than the canvas aspect can never yield min > max.
export function minZoom(stageWidthCss, viewWidth) {
    if (!stageWidthCss) return MAX_Z;
    return Math.min(viewWidth / stageWidthCss, MAX_Z);
}

export function clampZoom(z, minZ, maxZ = MAX_Z) {
    return Math.max(minZ, Math.min(maxZ, z));
}

// Live zoom bounds from element dimensions.
export function zoomBounds(stageEl, viewportEl) {
    return { minZ: minZoom(stageEl.clientWidth, viewportEl.clientWidth), maxZ: MAX_Z };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/canvas/viewport.test.js`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/canvas/viewport.js frontend/tests/canvas/viewport.test.js
git commit -m "feat(planner): dynamic zoom bounds (fit-width min, fit-height max)"
```

---

## Task 2: fitToWidth + refit helpers in viewport.js

**Files:**
- Modify: `frontend/src/canvas/viewport.js` (insert before `clearViewportTransform`)

No unit test: both call `applyViewport`, which reads `clientWidth`/`clientHeight` (always 0 in jsdom). Covered by build + manual QA.

- [ ] **Step 1: Add the helpers**

In `frontend/src/canvas/viewport.js`, immediately above the `clearViewportTransform` function, insert:

```js
// Open at fit-to-width (whole canvas visible, vertical letterbox auto-centered
// by applyViewport's clampPan). Used for the initial mobile view.
export function fitToWidth(stageEl, viewportEl) {
    const { minZ } = zoomBounds(stageEl, viewportEl);
    _state = { panX: 0, panY: 0, z: minZ };
    applyViewport(stageEl, viewportEl);
}

// Re-clamp z to current bounds and re-apply (after resize / orientation change).
export function refit(stageEl, viewportEl) {
    const { minZ, maxZ } = zoomBounds(stageEl, viewportEl);
    _state.z = clampZoom(_state.z, minZ, maxZ);
    applyViewport(stageEl, viewportEl);
}
```

- [ ] **Step 2: Verify the module still parses**

Run: `cd frontend && npx vitest run tests/canvas/viewport.test.js`
Expected: PASS (14 tests, unchanged — import resolves, no regressions).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/canvas/viewport.js
git commit -m "feat(planner): add fitToWidth/refit viewport helpers"
```

---

## Task 3: Single-finger pan + dynamic pinch in drag.js

**Files:**
- Modify: `frontend/src/canvas/drag.js:4` (import) and `drag.js` `wireGestures` (the function near the end of the file)

`drag.test.js` mocks interact.js and does not exercise `wireGestures`, so it stays green. Gesture behaviour is verified by build + manual QA.

- [ ] **Step 1: Extend the viewport import**

In `frontend/src/canvas/drag.js`, replace the viewport import line:

```js
import { getViewport, setViewport, getZoom, clampZoom, zoomBounds, focalZoom, applyViewport, resetViewport, fitToWidth, refit } from './viewport.js';
```

- [ ] **Step 2: Replace the wireGestures body**

In `frontend/src/canvas/drag.js`, replace the entire `wireGestures` function (header comment through its `return`):

```js
// Single-finger pan (background) + two-finger pinch-zoom/pan on the stage
// viewport (mobile only). viewportEl = clipping container (#stage-container);
// stageEl = #stage. Zoom range is dynamic: fit-to-width (min) .. fit-to-height (max).
export function wireGestures({ viewportEl, stageEl }) {
    let _startZ = 1;

    function refreshPanAffordance() {
        const v = getViewport();
        const renderedW = stageEl.clientWidth * v.z;
        const vw = viewportEl.clientWidth;
        viewportEl.classList.toggle('can-pan-left', v.panX < -0.5);
        viewportEl.classList.toggle('can-pan-right', v.panX > vw - renderedW + 0.5);
    }

    // Single-finger pan on the canvas background. ignoreFrom keeps dot/ghost
    // drags intact: interact.js rejects this draggable before it starts when the
    // touch (or any descendant of it) is on a .stage-dot / .mestre-ghost.
    interact(viewportEl).draggable({
        ignoreFrom: '.stage-dot, .mestre-ghost',
        styleCursor: false, // pan is touch-only; no desktop pan cursor (mobile has none)
        listeners: {
            move(evt) {
                if (!isMobile()) return;
                const v = getViewport();
                setViewport({ panX: v.panX + evt.dx, panY: v.panY + evt.dy, z: v.z });
                applyViewport(stageEl, viewportEl);
                refreshPanAffordance();
            },
        },
    });

    interact(viewportEl).gesturable({
        listeners: {
            start() {
                if (!isMobile()) return;
                _startZ = getZoom();
            },
            move(evt) {
                if (!isMobile()) return;
                const rect = viewportEl.getBoundingClientRect();
                const focalX = evt.clientX - rect.left; // gesture midpoint, viewport-relative
                const focalY = evt.clientY - rect.top;
                const { minZ, maxZ } = zoomBounds(stageEl, viewportEl);
                const nextZ = clampZoom(_startZ * evt.scale, minZ, maxZ);
                const zoomed = focalZoom(getViewport(), focalX, focalY, nextZ);
                // Add the midpoint translation (two-finger pan).
                zoomed.panX += evt.dx;
                zoomed.panY += evt.dy;
                setViewport(zoomed);
                applyViewport(stageEl, viewportEl);
                refreshPanAffordance();
            },
        },
    });

    return {
        refreshPanAffordance,
        // Open at fit-to-width (initial mobile view).
        fit: () => { fitToWidth(stageEl, viewportEl); refreshPanAffordance(); },
        // Re-clamp to current bounds after resize / orientation change.
        refit: () => { refit(stageEl, viewportEl); refreshPanAffordance(); },
        // Reset to baseline + clear affordance when switching to desktop.
        reset: () => { resetViewport(); refreshPanAffordance(); },
    };
}
```

- [ ] **Step 3: Run drag tests to confirm no regression**

Run: `cd frontend && npx vitest run tests/canvas/drag.test.js`
Expected: PASS (11 tests) — interact is mocked; `wireGestures` is not invoked by the test.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/canvas/drag.js
git commit -m "feat(planner): single-finger background pan + dynamic pinch bounds"
```

---

## Task 4: Init + breakpoint + resize fitting in main.js

**Files:**
- Modify: `frontend/src/main.js` — capture `wireGestures` result (the `wireGestures({...})` call) and the `applyResponsiveLayout()` / `mobileMQ` block.

- [ ] **Step 1: Capture the gesture controller**

In `frontend/src/main.js`, change the `wireGestures` call to assign its return value:

```js
    const gestures = wireGestures({ viewportEl: document.getElementById('stage-container'), stageEl: stage });
```

- [ ] **Step 2: Fit on init + breakpoint + resize**

In `frontend/src/main.js`, replace the existing `applyResponsiveLayout()` + `mobileMQ.addEventListener('change', ...)` block with:

```js
    // Place buttons for the current breakpoint, and re-place on breakpoint change.
    applyResponsiveLayout();
    // Mobile opens at fit-to-width (whole canvas visible).
    if (isMobile()) gestures.fit();
    mobileMQ.addEventListener('change', () => {
        applyResponsiveLayout();
        closeDrawer();
        const stageEl = document.getElementById('stage');
        if (!stageEl) return;
        // Desktop must never carry a transform; mobile re-fits to fit-to-width.
        if (isMobile()) gestures.fit();
        else clearViewportTransform(stageEl);
    });
    // Re-fit on resize / orientation change while on mobile (rAF-coalesced).
    let _refitRaf = 0;
    window.addEventListener('resize', () => {
        if (!isMobile()) return;
        cancelAnimationFrame(_refitRaf);
        _refitRaf = requestAnimationFrame(() => gestures.refit());
    });
```

- [ ] **Step 3: Production build (compiles the real-API path)**

Run: `cd frontend && npm run build`
Expected: `✓ built` with no errors. (Prod build has no `VITE_DEV_MODE`, so this exercises the real-API code path per CLAUDE.md prod-first.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/main.js
git commit -m "feat(planner): fit canvas to width on mobile init/breakpoint/resize"
```

---

## Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `cd frontend && npx vitest run`
Expected: viewport (14) + drag (11) green. Pre-existing unrelated failures (`tests/poll.test.js` ×2, `tests/sidebar/available.test.js` ×1) may remain — confirm they also fail on clean `main` before this work (`git stash` → run → `git stash pop`); they are not introduced here.

- [ ] **Step 2: Manual device QA (real device or browser responsive emulator)**

Verify on a portrait phone viewport:
- [ ] Canvas opens at fit-to-width — whole 1000×600 canvas visible, letterboxed top/bottom.
- [ ] One finger dragging the background pans; horizontal pan appears as you zoom in past min.
- [ ] One finger on a dot drags the dot (no pan bleed); on a mestre ghost drags the ghost.
- [ ] Tap on a dot still selects + opens the radial menu.
- [ ] Pinch zooms between fit-to-width (min) and fit-to-height (max); cannot zoom in past fit-height.
- [ ] Rotating / resizing re-fits without leaving a broken transform.
- [ ] Desktop (≥768px) shows no transform and behaves exactly as before.

---

## Self-Review

- **Spec coverage:** single-finger pan (Task 3); pinch (Task 3); min=fit-width / max=fit-height bounds (Task 1); initial fit-width (Task 4); resize/orientation refit (Task 4); desktop untouched (Task 4 desktop branch + mobile-gated handlers). All spec sections mapped.
- **Placeholders:** none — every code step shows complete code.
- **Type/name consistency:** `minZoom`, `clampZoom(z, minZ, maxZ)`, `zoomBounds`, `fitToWidth`, `refit`, `MAX_Z` used identically across viewport.js, drag.js imports, and tests. Gesture controller methods `fit`/`refit`/`reset`/`refreshPanAffordance` match between `wireGestures` return (Task 3) and `main.js` calls (Task 4).
