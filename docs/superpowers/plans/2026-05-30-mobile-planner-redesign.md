# Mobile Lineup-Planner Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Discord-Activity lineup planner usable on mobile (<768px) — collapsed header, overlay drawer, fit-to-height canvas with two-finger pan + pinch-zoom, and a sliver-drawer drag model for placing/removing members — while leaving the desktop (≥768px) layout and behavior byte-for-byte unchanged.

**Architecture:** A new pure module `src/canvas/viewport.js` holds pan/zoom state + math (TDD'd). Gestures are wired with `interact.gesturable` on `#stage-container`, which applies a CSS `transform: translate() scale()` to `#stage`. All mobile layout is additive CSS behind `@media (max-width:767px)` plus a JS node-relocation step (`src/responsive.js`) that moves the existing header buttons into a drawer action-row / overflow popover on mobile and back to the header on desktop — single DOM nodes, handlers bound by reference survive re-parenting. Existing dot/placement math is rect-proportional so it survives the transform; the only correctness fix is dividing in-drag pixel translations by the zoom factor.

**Tech Stack:** Vanilla JS (ES modules), Vite, interact.js 1.10, CSS, Vitest + jsdom.

---

## File Structure

- **Create** `frontend/src/canvas/viewport.js` — pan/zoom state + pure math (`clampPan`, `focalZoom`, `clampZoom`) + `applyViewport`/`getZoom`/`resetViewport`. One responsibility: the canvas viewport transform.
- **Create** `frontend/src/responsive.js` — `mobileMQ`, `isMobile()`, and `applyResponsiveLayout()` (relocates header buttons between header / drawer / overflow popover). One responsibility: responsive DOM placement.
- **Create** `frontend/tests/canvas/viewport.test.js` — unit tests for the pure math.
- **Modify** `frontend/index.html` — add overflow button + menu container, drawer action-row container.
- **Modify** `frontend/src/styles.css` — add the `@media (max-width:767px)` block (drawer overlay, stage sizing, header collapse, overflow popover, sliver, safe-areas, dvh).
- **Modify** `frontend/src/canvas/drag.js` — wire gestures, divide in-drag translate by zoom, sliver-during-drag + live-rect removal, disable mobile marquee. Accept optional `getZoom`.
- **Modify** `frontend/src/main.js` — call `applyResponsiveLayout()` + wire overflow menu and drawer open/close + pass `getZoom` to `wireDrag` + call `wireGestures`.

---

## Task 1: Viewport pan/zoom math module (TDD)

**Files:**
- Create: `frontend/src/canvas/viewport.js`
- Test: `frontend/tests/canvas/viewport.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/canvas/viewport.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
    clampPan, focalZoom, clampZoom,
    MIN_Z, MAX_Z,
    getViewport, setViewport, resetViewport, getZoom,
} from '../../src/canvas/viewport.js';

describe('clampZoom', () => {
    it('clamps below MIN_Z up to MIN_Z', () => {
        expect(clampZoom(0.5)).toBe(MIN_Z);
    });
    it('clamps above MAX_Z down to MAX_Z', () => {
        expect(clampZoom(99)).toBe(MAX_Z);
    });
    it('passes values inside the range unchanged', () => {
        expect(clampZoom(2)).toBe(2);
    });
});

describe('clampPan', () => {
    it('clamps pan to [view-rendered, 0] when content overflows the viewport', () => {
        // rendered 1670 wide in a 400 viewport -> pan range [-1270, 0]
        expect(clampPan(50, 0, 1670, 1000, 400, 1000).panX).toBe(0);
        expect(clampPan(-2000, 0, 1670, 1000, 400, 1000).panX).toBe(-1270);
        expect(clampPan(-500, 0, 1670, 1000, 400, 1000).panX).toBe(-500);
    });
    it('centers an axis when rendered content is smaller than the viewport', () => {
        // 300 wide in a 400 viewport -> centered at (400-300)/2 = 50
        expect(clampPan(0, 0, 300, 1000, 400, 1000).panX).toBe(50);
    });
    it('clamps the Y axis independently', () => {
        expect(clampPan(0, 999, 400, 1000, 400, 1000).panY).toBe(0); // equal -> centered at 0
        expect(clampPan(0, -300, 400, 1500, 400, 1000).panY).toBe(-300);
        expect(clampPan(0, -9999, 400, 1500, 400, 1000).panY).toBe(-500);
    });
});

describe('focalZoom — keeps the focal point stationary on screen', () => {
    it('recomputes pan so the focal screen point maps to the same canvas point', () => {
        const out = focalZoom({ panX: 0, panY: 0, z: 1 }, 200, 100, 2);
        expect(out).toEqual({ z: 2, panX: -200, panY: -100 });
        // verify: canvas point under focal pre = (200-0)/1 = 200; post screen = -200 + 200*2 = 200 = focal
    });
    it('is a no-op for pan when zoom does not change', () => {
        const out = focalZoom({ panX: -50, panY: -20, z: 2 }, 100, 100, 2);
        expect(out).toEqual({ z: 2, panX: -50, panY: -20 });
    });
});

describe('viewport state', () => {
    beforeEach(() => resetViewport());
    it('defaults to identity', () => {
        expect(getViewport()).toEqual({ panX: 0, panY: 0, z: 1 });
        expect(getZoom()).toBe(1);
    });
    it('round-trips through setViewport', () => {
        setViewport({ panX: -10, panY: -5, z: 1.5 });
        expect(getViewport()).toEqual({ panX: -10, panY: -5, z: 1.5 });
        expect(getZoom()).toBe(1.5);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/canvas/viewport.test.js`
Expected: FAIL — `Failed to resolve import "../../src/canvas/viewport.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/canvas/viewport.js`:

```js
// Canvas pan/zoom viewport: shared state + pure math + transform application.
// z is the zoom factor on top of the CSS-fit stage (z=1 = fit-to-height baseline).

export const MIN_Z = 1;
export const MAX_Z = 3;

let _state = { panX: 0, panY: 0, z: 1 };

export function getViewport() { return { ..._state }; }
export function getZoom() { return _state.z; }
export function setViewport(s) { _state = { panX: s.panX, panY: s.panY, z: s.z }; }
export function resetViewport() { _state = { panX: 0, panY: 0, z: 1 }; }

export function clampZoom(z) {
    return Math.max(MIN_Z, Math.min(MAX_Z, z));
}

// Clamp pan so the stage edges cannot pass the viewport interior.
// If rendered content is smaller than the viewport on an axis, center it.
function clampAxis(pan, rendered, view) {
    if (rendered <= view) return (view - rendered) / 2;
    return Math.min(0, Math.max(view - rendered, pan));
}

export function clampPan(panX, panY, renderedW, renderedH, viewW, viewH) {
    return {
        panX: clampAxis(panX, renderedW, viewW),
        panY: clampAxis(panY, renderedH, viewH),
    };
}

// Given a new zoom, recompute pan so the focal screen point (relative to the
// viewport top-left) stays over the same canvas point. transform-origin is 0 0.
export function focalZoom(prev, focalX, focalY, nextZ) {
    const ratio = nextZ / prev.z;
    return {
        z: nextZ,
        panX: focalX - (focalX - prev.panX) * ratio,
        panY: focalY - (focalY - prev.panY) * ratio,
    };
}

// Apply the current (clamped) viewport to the stage element.
// viewportEl = the clipping container (#stage-container).
export function applyViewport(stageEl, viewportEl) {
    const vw = viewportEl.clientWidth;
    const vh = viewportEl.clientHeight;
    const renderedW = stageEl.clientWidth * _state.z;
    const renderedH = stageEl.clientHeight * _state.z;
    const { panX, panY } = clampPan(_state.panX, _state.panY, renderedW, renderedH, vw, vh);
    _state.panX = panX;
    _state.panY = panY;
    stageEl.style.transformOrigin = '0 0';
    stageEl.style.transform = `translate(${panX}px, ${panY}px) scale(${_state.z})`;
}

// Remove the transform (used when leaving mobile / desktop baseline).
export function clearViewportTransform(stageEl) {
    resetViewport();
    stageEl.style.transform = '';
    stageEl.style.transformOrigin = '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/canvas/viewport.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/canvas/viewport.js frontend/tests/canvas/viewport.test.js
git commit -m "feat(planner): add pan/zoom viewport math module"
```

---

## Task 2: Mobile CSS — breakpoint, stage sizing, drawer, header, popover, sliver

**Files:**
- Modify: `frontend/src/styles.css` (append a new block at end of file; add one `:root` var)

This task is pure CSS — verified visually in Task 7. No transform is applied to `#stage` by CSS; the transform comes from JS (Task 4). On mobile we override the stage to fit height and stop flex-centering so `transform-origin: 0 0` panning starts at the top-left.

- [ ] **Step 1: Add a header-height custom property**

In `frontend/src/styles.css`, find the `:root { ... }` block at the top. Add this line inside it (next to the other variables):

```css
    --header-h: 52px;
```

- [ ] **Step 2: Append the mobile block at the END of `frontend/src/styles.css`**

```css
/* ===================== MOBILE (<768px) ===================== */
@media (max-width: 767px) {
    body, #app { height: 100vh; height: 100dvh; } /* vh fallback, dvh where supported */

    /* --- Header collapses to: ☰ | title | ⋮ --- */
    #planner-header {
        padding: 0.4rem 0.5rem;
        padding-top: calc(0.4rem + env(safe-area-inset-top));
        gap: 0.25rem;
        min-height: var(--header-h);
        box-sizing: border-box;
    }
    #planner-title {
        white-space: normal;
        font-size: 0.82rem;
        line-height: 1.15;
        max-height: 2.4em;
        overflow: hidden;
        flex: 1 1 auto;
    }
    .header-left, .header-right { flex: 0 0 auto; gap: 0.25rem; }

    /* Show the overflow button, hide the inline right-side action buttons. */
    #overflow-btn { display: inline-flex; }
    /* Overflow popover (positioned under the ⋮ button). */
    #overflow-menu {
        position: absolute;
        top: calc(var(--header-h) + env(safe-area-inset-top));
        right: 0.5rem;
        display: none;
        flex-direction: column;
        gap: 0.4rem;
        padding: 0.5rem;
        background: var(--bg-raised);
        border: 1px solid var(--border-strong);
        border-radius: 10px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5);
        z-index: 60;
    }
    #overflow-menu.open { display: flex; }
    #overflow-menu .manual-add-btn {
        width: 100%;
        white-space: nowrap;
        min-height: 44px;
    }

    /* --- Drawer (was the always-on sidebar) overlays the canvas --- */
    #planner-body { position: relative; display: block; }
    #sidebar {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        width: min(82vw, 320px);
        z-index: 50;
        transform: translateX(-100%);
        transition: transform 0.22s ease;
        padding-bottom: env(safe-area-inset-bottom);
        box-shadow: 4px 0 24px rgba(0,0,0,0.45);
    }
    #sidebar.open { transform: translateX(0); }
    /* The desktop .collapsed width-zeroing is irrelevant on mobile (overlay), neutralize it. */
    #sidebar.collapsed { width: min(82vw, 320px); padding: 0; }

    /* Drawer action row (Back / Rensa / Debug) at the top of the drawer. */
    #drawer-actions {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.6rem 0.6rem 0.4rem;
        padding-top: calc(0.6rem + env(safe-area-inset-top));
    }
    #drawer-actions .back-btn,
    #drawer-actions .rensa-btn,
    #drawer-actions .debug-btn { min-height: 40px; }

    /* Backdrop scrim behind the open drawer. */
    #drawer-scrim {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.45);
        z-index: 45;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.22s ease;
    }
    #drawer-scrim.show { opacity: 1; pointer-events: auto; }

    /* --- Stage fills viewport height; wider-than-screen -> horizontal pan --- */
    #stage-container {
        display: block;          /* stop flex-centering so origin 0,0 panning works */
        width: 100%;
        height: calc(100vh - var(--header-h) - env(safe-area-inset-top));   /* vh fallback */
        height: calc(100dvh - var(--header-h) - env(safe-area-inset-top));
        touch-action: none;       /* gestures handled by interact.gesturable */
    }
    #stage {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: auto;
        aspect-ratio: 1000 / 600;  /* width = height * 1000/600 */
        will-change: transform;
    }

    /* --- Sliver: drawer never fully hides during a drag --- */
    body.dragging-active #sidebar {
        transform: translateX(calc(-100% + 36px));
        transition: transform 0.12s ease;
    }
    body.dragging-active #sidebar.expanded { transform: translateX(0); }
    body.dragging-active #drawer-scrim { opacity: 0; pointer-events: none; }

    /* --- Pan affordance: edge fades when more canvas exists that way --- */
    #stage-container.can-pan-left::before,
    #stage-container.can-pan-right::after {
        content: '';
        position: absolute;
        top: 0; bottom: 0;
        width: 28px;
        pointer-events: none;
        z-index: 10;
    }
    #stage-container.can-pan-left::before {
        left: 0;
        background: linear-gradient(90deg, rgba(13,8,20,0.55), transparent);
    }
    #stage-container.can-pan-right::after {
        right: 0;
        background: linear-gradient(270deg, rgba(13,8,20,0.55), transparent);
    }
}

/* The overflow button is hidden on desktop (shown only in the mobile block). */
#overflow-btn { display: none; }
```

- [ ] **Step 3: Verify desktop is unchanged**

Run: `cd frontend && npm run build`
Expected: build succeeds. Open the built app at ≥768px (or just confirm no syntax errors). All new rules are inside the media query except `#overflow-btn { display:none }`, which only hides an element that does not exist on desktop layout.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles.css
git commit -m "style(planner): add mobile layout (drawer overlay, fit-height stage, popover, sliver)"
```

---

## Task 3: HTML scaffolding for the new mobile controls

**Files:**
- Modify: `frontend/index.html`

We add empty containers (`#overflow-btn`, `#overflow-menu`, `#drawer-actions`, `#drawer-scrim`). The existing buttons keep their IDs; Task 4's JS relocates them into these containers on mobile and back to the header on desktop.

- [ ] **Step 1: Add the overflow button + menu to the header-right**

In `frontend/index.html`, find:

```html
      <div class="header-right">
        <button id="stall-upp-alla-btn" type="button" class="manual-add-btn">Placera alla</button>
        <button id="manual-add-btn" type="button" class="manual-add-btn">+ Medlem</button>
      </div>
```

Replace with:

```html
      <div class="header-right">
        <button id="stall-upp-alla-btn" type="button" class="manual-add-btn">Placera alla</button>
        <button id="manual-add-btn" type="button" class="manual-add-btn">+ Medlem</button>
        <button id="overflow-btn" type="button" class="sidebar-toggle-btn" title="Fler åtgärder" aria-label="Fler åtgärder">⋮</button>
        <div id="overflow-menu"></div>
      </div>
```

- [ ] **Step 2: Add the drawer action-row container at the top of the sidebar**

Find:

```html
      <aside id="sidebar">
        <div id="sidebar-inner"></div>
        <div id="sidebar-voice-slot"></div>
      </aside>
```

Replace with:

```html
      <aside id="sidebar">
        <div id="drawer-actions"></div>
        <div id="sidebar-inner"></div>
        <div id="sidebar-voice-slot"></div>
      </aside>
```

- [ ] **Step 3: Add the drawer scrim inside `#app` (after `#planner-body`)**

Find the closing of `#planner-body` (the `</div>` that closes `<div id="planner-body">`, right before `</div>` of `#app`). Add the scrim immediately after `#planner-body`'s closing `</div>`:

```html
      <div id="drawer-scrim"></div>
```

So the structure becomes:

```html
    <div id="planner-body">
      ... aside + main ...
    </div>
    <div id="drawer-scrim"></div>
  </div>  <!-- /#app -->
```

- [ ] **Step 4: Verify the page still loads**

Run: `cd frontend && npm run build`
Expected: build succeeds, no HTML errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/index.html
git commit -m "feat(planner): add mobile control containers (overflow menu, drawer actions, scrim)"
```

---

## Task 4: Responsive layout module + drawer/overflow wiring

**Files:**
- Create: `frontend/src/responsive.js`
- Modify: `frontend/src/main.js` (the `boot()` tail, around [main.js:751-760](../../../frontend/src/main.js#L751-L760))

- [ ] **Step 1: Create `frontend/src/responsive.js`**

```js
// Responsive DOM placement: on mobile, relocate the header action buttons into
// the drawer action-row and the overflow popover; on desktop, restore the
// original header layout. Single DOM nodes — handlers bound by reference survive.

export const mobileMQ = window.matchMedia('(max-width: 767px)');
export function isMobile() { return mobileMQ.matches; }

function byId(id) { return document.getElementById(id); }

export function applyResponsiveLayout() {
    const headerLeft  = document.querySelector('.header-left');
    const headerRight = document.querySelector('.header-right');
    const drawerActions = byId('drawer-actions');
    const overflowMenu  = byId('overflow-menu');

    const back   = byId('back-btn');
    const toggle = byId('sidebar-toggle-btn');
    const rensa  = byId('rensa-btn');
    const debug  = byId('debug-btn');
    const stall  = byId('stall-upp-alla-btn');
    const manual = byId('manual-add-btn');
    const overflowBtn = byId('overflow-btn');

    if (!headerLeft || !headerRight || !drawerActions || !overflowMenu) return;

    if (isMobile()) {
        // Header-left keeps only the drawer toggle.
        if (toggle) headerLeft.appendChild(toggle);
        // Back / Rensa / Debug move into the drawer action-row (in this order).
        [back, rensa, debug].forEach(el => { if (el) drawerActions.appendChild(el); });
        // Placera alla / + Medlem move into the overflow popover.
        [stall, manual].forEach(el => { if (el) overflowMenu.appendChild(el); });
    } else {
        // Restore desktop header order: [back, toggle, rensa, debug] | [stall, manual, overflowBtn].
        [back, toggle, rensa, debug].forEach(el => { if (el) headerLeft.appendChild(el); });
        [stall, manual, overflowBtn].forEach(el => { if (el) headerRight.appendChild(el); });
    }
}
```

- [ ] **Step 2: Wire layout + drawer + overflow in `main.js boot()`**

In `frontend/src/main.js`, add to the imports near the top (with the other local imports):

```js
import { applyResponsiveLayout, mobileMQ, isMobile } from './responsive.js';
import { clearViewportTransform } from './canvas/viewport.js';
```

Then replace the existing sidebar-toggle block ([main.js:754-760](../../../frontend/src/main.js#L754-L760)):

```js
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarEl = document.getElementById('sidebar');
    if (sidebarToggleBtn && sidebarEl) {
        sidebarToggleBtn.addEventListener('click', () => {
            sidebarEl.classList.toggle('collapsed');
        });
    }
```

with:

```js
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarEl = document.getElementById('sidebar');
    const scrim = document.getElementById('drawer-scrim');

    function openDrawer()  { sidebarEl.classList.add('open');    if (scrim) scrim.classList.add('show'); }
    function closeDrawer() { sidebarEl.classList.remove('open'); if (scrim) scrim.classList.remove('show'); }

    if (sidebarToggleBtn && sidebarEl) {
        sidebarToggleBtn.addEventListener('click', () => {
            if (isMobile()) {
                sidebarEl.classList.contains('open') ? closeDrawer() : openDrawer();
            } else {
                sidebarEl.classList.toggle('collapsed'); // desktop behavior unchanged
            }
        });
    }
    if (scrim) scrim.addEventListener('click', closeDrawer);

    // Overflow popover (mobile only).
    const overflowBtn = document.getElementById('overflow-btn');
    const overflowMenu = document.getElementById('overflow-menu');
    if (overflowBtn && overflowMenu) {
        overflowBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            overflowMenu.classList.toggle('open');
        });
        // Close the popover after choosing an action, or when tapping outside.
        overflowMenu.addEventListener('click', () => overflowMenu.classList.remove('open'));
        document.addEventListener('click', (e) => {
            if (!overflowMenu.contains(e.target) && e.target !== overflowBtn) {
                overflowMenu.classList.remove('open');
            }
        });
    }

    // Place buttons for the current breakpoint, and re-place on breakpoint change.
    applyResponsiveLayout();
    mobileMQ.addEventListener('change', () => {
        applyResponsiveLayout();
        closeDrawer();
        // Drop any stale pan/zoom transform when crossing the breakpoint
        // (desktop must never carry a transform; mobile re-fits on next gesture).
        const stageEl = document.getElementById('stage');
        if (stageEl) clearViewportTransform(stageEl);
    });
```

- [ ] **Step 3: Verify build + existing tests**

Run: `cd frontend && npm run build && npx vitest run`
Expected: build succeeds; all existing tests still pass (no test imports `responsive.js` or `main.js`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/responsive.js frontend/src/main.js
git commit -m "feat(planner): relocate header controls + drawer/overflow wiring on mobile"
```

---

## Task 5: Wire two-finger pan + pinch-zoom gestures

**Files:**
- Modify: `frontend/src/canvas/drag.js` (add a `wireGestures` export)
- Modify: `frontend/src/main.js` (call `wireGestures`)

- [ ] **Step 1: Add imports + `wireGestures` to `drag.js`**

In `frontend/src/canvas/drag.js`, add to the top imports:

```js
import { getViewport, setViewport, getZoom, clampZoom, focalZoom, applyViewport, resetViewport } from './viewport.js';
import { isMobile } from '../responsive.js';
```

At the END of `drag.js` (after `wireDrag`'s closing brace), add:

```js
// Two-finger pan + pinch-zoom on the stage viewport (mobile only).
// viewportEl is the clipping container (#stage-container); stageEl is #stage.
export function wireGestures({ viewportEl, stageEl }) {
    let _startZ = 1;

    function refreshPanAffordance() {
        const v = getViewport();
        const renderedW = stageEl.clientWidth * v.z;
        const vw = viewportEl.clientWidth;
        viewportEl.classList.toggle('can-pan-left', v.panX < -0.5);
        viewportEl.classList.toggle('can-pan-right', v.panX > vw - renderedW + 0.5);
    }

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
                const nextZ = clampZoom(_startZ * evt.scale);
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

    // Reset to fit + clear affordance when switching to desktop.
    return { refreshPanAffordance, reset: () => { resetViewport(); refreshPanAffordance(); } };
}
```

- [ ] **Step 2: Call `wireGestures` in `main.js`**

In `frontend/src/main.js`, find where `wireDrag(...)` is invoked (search for `wireDrag({`). Immediately after that call, add:

```js
    wireGestures({ viewportEl: document.getElementById('stage-container'), stageEl: stage });
```

And add `wireGestures` to the existing `drag.js` import in `main.js` (find the line importing from `./canvas/drag.js` and add `wireGestures` to the named imports).

- [ ] **Step 3: Update the interactjs unit-test mock to support `gesturable`**

The real-runtime mock `frontend/tests/__mocks__/interactjs.js` lacks `gesturable`. Update it:

```js
// Stub for interactjs — only used at runtime, not needed in unit tests
const interact = () => ({
    draggable: () => ({ on: () => {} }),
    dropzone: () => ({ on: () => {} }),
    gesturable: () => ({ on: () => {} }),
});
export default interact;
```

Also update the `vi.mock('interactjs', ...)` factory in `frontend/tests/canvas/drag.test.js` — add a `gesturable()` method to the returned object so importing `drag.js` (which now calls `interact(viewportEl).gesturable(...)` only inside `wireGestures`, not at import time) never throws if exercised:

Find the object returned by the mocked `interact` in `drag.test.js`:

```js
    const interact = vi.fn((selectorOrEl, _opts) => ({
        draggable({ listeners } = {}) {
            if (selectorOrEl === '.available-row' && listeners && listeners.end) {
                _sidebarEndListener = listeners.end;
            }
            return { draggable: () => {} };
        },
        dropzone() { return {}; },
    }));
```

Add a `gesturable` method:

```js
    const interact = vi.fn((selectorOrEl, _opts) => ({
        draggable({ listeners } = {}) {
            if (selectorOrEl === '.available-row' && listeners && listeners.end) {
                _sidebarEndListener = listeners.end;
            }
            return { draggable: () => {} };
        },
        dropzone() { return {}; },
        gesturable() { return {}; },
    }));
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run`
Expected: PASS — existing drag tests still green; `drag.js` imports `viewport.js` + `responsive.js` cleanly. (`responsive.js` reads `window.matchMedia`, which jsdom provides; if a test environment lacks it, it is only called inside handlers, not at import.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/canvas/drag.js frontend/src/main.js frontend/tests/__mocks__/interactjs.js frontend/tests/canvas/drag.test.js
git commit -m "feat(planner): two-finger pan + pinch-zoom gestures on mobile canvas"
```

---

## Task 6: Zoom-correct drag visuals + sliver-during-drag + removal + disable mobile marquee

**Files:**
- Modify: `frontend/src/canvas/drag.js`
- Modify: `frontend/src/main.js` (pass `getZoom` to `wireDrag`)

### 6a — Divide in-drag pixel translations by zoom

The dot/ghost in-drag visual uses `translate(...px)` on a child of the scaled `#stage`. Under `scale(z)` a translate of `Npx` renders as `N*z` screen px, but the accumulated delta is screen px. Divide by `z` so the dot tracks the finger at any zoom. `getZoom()` returns 1 on desktop, so desktop is unaffected.

- [ ] **Step 1: Use zoom in the dot `move` handler**

In `frontend/src/canvas/drag.js`, in the `.stage-dot` draggable `move(evt)` ([drag.js:260-294](../../../frontend/src/canvas/drag.js#L260-L294)), replace the two `translate` assignments. Find:

```js
                if (_groupDrag) {
                    stageEl.querySelectorAll('.stage-dot').forEach(dot => {
                        if (getSelectedIds().has(dot.dataset.userId)) {
                            dot.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
                            updateMestreVisual(dot.dataset.userId, x, y, dot);
                        }
                    });
                } else {
                    evt.target.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
                    updateMestreVisual(evt.target.dataset.userId, x, y, evt.target);
```

Replace with:

```js
                const z = getZoom();
                if (_groupDrag) {
                    stageEl.querySelectorAll('.stage-dot').forEach(dot => {
                        if (getSelectedIds().has(dot.dataset.userId)) {
                            dot.style.transform = `translate(calc(-50% + ${x / z}px), calc(-50% + ${y / z}px))`;
                            updateMestreVisual(dot.dataset.userId, x, y, dot);
                        }
                    });
                } else {
                    evt.target.style.transform = `translate(calc(-50% + ${x / z}px), calc(-50% + ${y / z}px))`;
                    updateMestreVisual(evt.target.dataset.userId, x, y, evt.target);
```

- [ ] **Step 2: Use zoom in the mestre-ghost `move` handler**

In the `.mestre-ghost` draggable `move(evt)` ([drag.js:452-474](../../../frontend/src/canvas/drag.js#L452-L474)), find:

```js
                    g.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
```

Replace with:

```js
                    g.style.transform = `translate(calc(-50% + ${x / getZoom()}px), calc(-50% + ${y / getZoom()}px))`;
```

> Note: the line-endpoint math (`x / r.width * 100`) divides by the transformed `getBoundingClientRect` width, so it stays correct without change. Only the visual `translate` needs `/z`.

### 6b — Sliver-during-drag + live-rect removal + mobile marquee disable

- [ ] **Step 3: Add a shared drawer-during-drag helper inside `wireDrag`**

In `frontend/src/canvas/drag.js`, inside `wireDrag(...)` near the top of the function body (after the `setDraggingPosition`/`setDraggingSidebarUserId` defaulting lines, ~[drag.js:99-100](../../../frontend/src/canvas/drag.js#L99-L100)), add:

```js
    const EXPAND_THRESHOLD = 48; // px from left edge that expands the drawer mid-drag
    function beginDrawerDragMode() {
        if (isMobile()) document.body.classList.add('dragging-active');
    }
    function updateDrawerDuringDrag(clientX) {
        if (!isMobile()) return;
        sidebarEl.classList.toggle('expanded', clientX < EXPAND_THRESHOLD);
    }
    function endDrawerDragMode() {
        document.body.classList.remove('dragging-active');
        sidebarEl.classList.remove('expanded');
    }
```

- [ ] **Step 4: Enter/maintain/exit drag mode in the dot draggable**

In the `.stage-dot` draggable `start(evt)`, find ([drag.js:240](../../../frontend/src/canvas/drag.js#L240)):

```js
                sidebarEl.classList.add('dot-drag-active');
```

Replace with:

```js
                sidebarEl.classList.add('dot-drag-active');
                beginDrawerDragMode();
```

In the dot `move(evt)`, at the very end of the handler (right before its closing `}`, after the `setDraggingPosition(live);` line ~[drag.js:293](../../../frontend/src/canvas/drag.js#L293)), add:

```js
                updateDrawerDuringDrag(evt.client.x);
```

In the dot `end(evt)` `finally` block ([drag.js:359-367](../../../frontend/src/canvas/drag.js#L359-L367)), find:

```js
                    sidebarEl.classList.remove('dot-drag-active');
```

Replace with:

```js
                    sidebarEl.classList.remove('dot-drag-active');
                    endDrawerDragMode();
```

> The removal hit-test at [drag.js:301-303](../../../frontend/src/canvas/drag.js#L301-L303) already reads `sidebarEl.getBoundingClientRect()` live. With the sliver parked via `translateX`, the visible strip's rect is what gets hit-tested, so dropping on the sliver (or the expanded drawer) registers as `droppedOnSidebar` → remove. No change needed there.

- [ ] **Step 5: Enter/maintain/exit drag mode in the sidebar-row draggable**

In the `.available-row` draggable `start(evt)` ([drag.js:378](../../../frontend/src/canvas/drag.js#L378)), after:

```js
                evt.target.classList.add('dragging');
                setDraggingSidebarUserId(evt.target.dataset.userId);
```

add:

```js
                beginDrawerDragMode();
```

In the `.available-row` `move(evt)` ([drag.js:404-409](../../../frontend/src/canvas/drag.js#L404-L409)), after updating the ghost position, add:

```js
                updateDrawerDuringDrag(evt.client.x);
```

In the `.available-row` `end(evt)` ([drag.js:410-413](../../../frontend/src/canvas/drag.js#L410-L413)), find:

```js
                evt.target.classList.remove('dragging');
                if (_sidebarGhost) { _sidebarGhost.remove(); _sidebarGhost = null; }
                setDraggingSidebarUserId(null);
```

Replace with:

```js
                evt.target.classList.remove('dragging');
                if (_sidebarGhost) { _sidebarGhost.remove(); _sidebarGhost = null; }
                setDraggingSidebarUserId(null);
                endDrawerDragMode();
```

> Place flow: the drawer is open when the user grabs a name; `beginDrawerDragMode()` parks it to a sliver (revealing the canvas), the `_sidebarGhost` follows the finger, and dropping on the revealed canvas runs the existing `insideStage` placement. Dropping back on the sliver/expanded drawer falls outside the stage rect → `return` (cancel), which is the desired no-op.

- [ ] **Step 6: Disable marquee selection on mobile**

In the `stageEl.addEventListener('pointerdown', ...)` handler ([drag.js:539-556](../../../frontend/src/canvas/drag.js#L539-L556)), find:

```js
        if (evt.target.closest('.mestre-ghost')) return;
        dismissRadialMenu();
        _selMoved = false;
```

Replace with:

```js
        if (evt.target.closest('.mestre-ghost')) return;
        dismissRadialMenu();
        if (isMobile()) return; // no marquee on touch; panning is the two-finger job
        _selMoved = false;
```

> Tapping a dot still selects + opens the radial menu (that path returns earlier at the `if (dot)` block), so badge taps and dot taps are unaffected.

- [ ] **Step 7: Pass `getZoom` is implicit (imported), confirm `main.js wireDrag` unchanged**

No change to the `wireDrag(...)` call is required — `drag.js` imports `getZoom` directly from `viewport.js`. Confirm there is no stray `getZoom` parameter expectation.

- [ ] **Step 8: Run the full test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS. The sidebar-drop tests in `drag.test.js` run with `isMobile()` false (jsdom default viewport width 1024, `matchMedia('(max-width:767px)')` → `matches:false`), so `beginDrawerDragMode`/`updateDrawerDuringDrag` are no-ops and `endDrawerDragMode` only removes absent classes — existing assertions unaffected.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/canvas/drag.js
git commit -m "feat(planner): zoom-correct drag, sliver-during-drag removal, disable mobile marquee"
```

---

## Task 7: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd frontend && npx vitest run`
Expected: all suites PASS, including the new `viewport.test.js`.

- [ ] **Step 2: Production build sanity**

Run: `cd frontend && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Manual desktop check (≥768px)**

Run: `cd frontend && npm run dev`. Open at a wide window.
Verify, comparing to current behavior:
- Header shows `← ☰ Rensa 🐛` (left) and `Placera alla` `+ Medlem` (right); no `⋮`.
- Stage is centered, fixed aspect, no transform applied.
- Drag a dot, drop on the sidebar to remove; place from sidebar; group-select via marquee — all work as before.

- [ ] **Step 4: Manual mobile check (<768px)**

In the browser devtools, switch to a phone viewport (e.g. 390×844).
Verify:
1. **Header:** collapses to `☰` | wrapping title | `⋮`. Tapping `⋮` opens a popover with full-text `Placera alla` / `+ Medlem`.
2. **Drawer:** `☰` slides the drawer over the canvas with a scrim; `←`/`Rensa`/`🐛` sit at the drawer top; voice controls at the bottom; tap scrim closes. Canvas does not resize when the drawer opens/closes.
3. **Pan/zoom:** two-finger drag pans the canvas (clamps at edges; edge fades appear); pinch zooms in/out centered on the fingers within `[1, 3]`.
4. **1-finger:** dragging a dot moves it (tracks the finger at any zoom); dragging empty canvas does nothing (no marquee).
5. **Place flow:** open drawer, drag a name → drawer collapses to a sliver → drop on canvas places the dot at the drop point.
6. **Remove flow:** drag a placed dot toward the left sliver → drawer expands → release inside it removes the member (returns to the list).
7. **Sliver invariant:** during any drag the drawer is never fully hidden.
8. **Badge tap:** tapping a stale/kanske badge opens its tooltip and does not start a pan.

> Note on touch emulation: devtools mouse-based "touch" emulates a single pointer, so pinch may need a real device or a multi-touch emulator. Single-finger drag, placement, removal, drawer, and popover are all verifiable with devtools device mode. Verify pinch on a real Discord mobile client if possible.

- [ ] **Step 5: Commit (only if verification surfaced fixes)**

If steps 3-4 required code changes, commit them with a descriptive message. Otherwise no commit.

---

## Notes for the implementer

- **Desktop invariance is the hard constraint.** Every mobile rule is inside `@media (max-width:767px)` or guarded by `isMobile()`. `getZoom()` returns `1` on desktop so the `/z` divisions are identity.
- **Why no change to `clientToStage`:** it divides client offsets by the *transformed* `getBoundingClientRect`, which already reflects pan+scale, so logical coordinates stay correct at any viewport.
- **`#stage-container` is the viewport** (it already has `overflow:hidden`); no element rename needed.
- **Data layer untouched** — per `CLAUDE.md`, no `devData.js` / API shape changes here; this is presentation/interaction only.
```
