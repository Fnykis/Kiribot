# Lineup Planner M5.1 — Drag/Poll Fixes + Grid + "Ställ upp alla" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix M5 drag/poll regressions, add grid + snap-to-grid, enlarge trash zone, kill text selection, add sidebar drag ghost, show instrument inside dot, ship "Ställ upp alla" modal + row-grouped auto-placement, verify `active:false` filter.

**Spec source:** `docs/superpowers/specs/2026-05-14-lineup-planner-m5-issues.md`.

**Architecture:**
- Drag-skip logic moves from "snap to stored server position" to "use live rendered position." `state.js` gets `draggingPosition` (live coords) and `draggingSidebarUserId` (active sidebar drag flag). `poll.js` uses both: substitutes live coords for active dot drag; defers render entirely if sidebar drag active.
- Drag offset bug fixed by capturing `pointerOffset` at `dragstart` and subtracting it in `clientToStage` on drop.
- Grid drawn via CSS `background-image: repeating-linear-gradient` on stage element; snap applied in `clientToStage` (or post-step in drag `end`).
- "Ställ upp alla" = sidebar button → modal listing every ja/kanske signup, one row per signup-instrument combo, instrument picker per row, OK button enabled when every row has selection. On OK: client computes positions via hardcoded row-group map + grid-step layout, POSTs each placement.
- `active:false` filter already in `concerts.js` (commit 5b27287). Plan verifies via test + visual.

**Tech stack:** Vite 5, Vitest 2, `interactjs` ^1.10, plain DOM, Node 20 + `node:test` for backend verification.

---

## Issue → Task Map

| Spec Issue | Task |
|------------|------|
| #9 Text selectable during drag | Task 1 |
| #5 Delete zone too small | Task 2 |
| #3 Dot jumps on drag start (offset) | Task 3 |
| #8 Sidebar drag item invisible | Task 4 |
| #1 Poll yanks dot mid-drag | Task 5 |
| #2 Poll aborts sidebar drag | Task 6 |
| #4 Grid + snap-to-grid | Task 7 |
| #10 Instrument name inside dot | Task 8 |
| #7 `active:false` events in list | Task 9 (verification only) |
| #6 "Ställ upp alla" | Tasks 10–13 |

---

## File Map

### Frontend

| File | Op | Responsibility |
|------|----|---------------|
| `frontend/src/styles.css` | Modify | Global `user-select: none`. Enlarge `.trash` (≥80×80). Style `.drag-ghost`. Style stage grid background. Style `.dot-instrument` label. Style "Ställ upp alla" button + modal. |
| `frontend/src/state.js` | Modify | Add `draggingPosition` ({x,y} or null), `draggingSidebarUserId` (string or null), with getters/setters. |
| `frontend/src/canvas/drag.js` | Modify | Capture `pointerOffset` at dragstart. Apply offset in `clientToStage` on end. Update `setDraggingPosition` on each move. Set/clear `setDraggingSidebarUserId` for sidebar drags. Create + position drag-ghost element. Snap drop coords to grid step. |
| `frontend/src/canvas/stage.js` | Modify | Export `GRID_STEP` const. Render `.dot-instrument` sub-label inside each dot. |
| `frontend/src/poll.js` | Modify | Use live `draggingPosition` instead of `prevEntry.position`. If `draggingSidebarUserId` set, skip `onUpdate` entirely. |
| `frontend/src/main.js` | Modify | Pass `setDraggingPosition` / `setDraggingSidebarUserId` / `getDraggingSidebarUserId` into `wireDrag` + `startPoll`. Wire "Ställ upp alla" button. |
| `frontend/src/sidebar/stallUppAlla.js` | Create | Modal: list signups, per-member instrument picker, OK enabled when all chosen, invoke placement on OK. |
| `frontend/src/canvas/autoPlace.js` | Create | Pure fn `computeAutoPositions(members, gridStep, stageW, stageH)` returning `[{userId, displayName, instrument, x, y}]`. Hardcoded instrument→row map. |
| `frontend/index.html` | Modify | Add `<button id="stall-upp-alla-btn">` in sidebar header. Add `<div id="stall-upp-alla-modal" hidden>` container. |

### Tests (frontend)

| File | Op | Responsibility |
|------|----|---------------|
| `frontend/tests/state.test.js` | Create or modify | Cover new draggingPosition / draggingSidebarUserId state. |
| `frontend/tests/poll.test.js` | Modify | Live-position merge + sidebar-drag skip. |
| `frontend/tests/canvas/autoPlace.test.js` | Create | Row mapping + grid step + no overlap. |
| `frontend/tests/canvas/drag.test.js` | Create or modify | `clientToStage` with offset; snap-to-grid math. |
| `frontend/tests/sidebar/stallUppAlla.test.js` | Create | Modal renders rows per signup, OK gating, submit invokes placement. |

### Backend (verification only)

| File | Op | Responsibility |
|------|----|---------------|
| `tests/routes/concerts.test.js` | Verify | Existing test for `active:false` filter present (commit 5b27287). Add coverage gap if any. |

---

## Task 1: Disable Text Selection Globally (Issue #9)

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Add user-select rule to styles.css**

Append at top of file (or in a `:root`/global block):

```css
* {
    user-select: none;
    -webkit-user-select: none;
}

input, textarea, [contenteditable="true"] {
    user-select: text;
    -webkit-user-select: text;
}
```

- [ ] **Step 2: Manual verify in dev server**

Run: `cd frontend && npm run dev`
Expected: dragging a member name no longer selects text on the page. Search inputs in manual-add modal still allow text entry.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles.css
git commit -m "style(frontend): disable text selection globally; allow on form inputs"
```

---

## Task 2: Enlarge Trash Drop Zone (Issue #5)

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Grow `.trash` to ≥80×80**

Find existing `.trash` rule. Change `width`/`height` from `56px` to `96px`. Increase `font-size` proportionally (e.g. `2rem`). Keep bottom-right anchor.

```css
.trash {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    font-size: 2rem;
    /* keep existing position/colors */
}
```

- [ ] **Step 2: Keep dropzone overlap threshold at 0.5**

In `frontend/src/canvas/drag.js`, the existing `interact(trashEl).dropzone({ accept: '.stage-dot', overlap: 0.5 })` stays — larger zone makes the hit easier without changing threshold.

- [ ] **Step 3: Manual verify**

Drag a dot to bottom-right corner. Easier to land in trash now.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles.css
git commit -m "style(frontend): enlarge trash drop zone to 96x96 for easier hit"
```

---

## Task 3: Fix Drag-Start Pointer Offset on Dots (Issue #3)

**Files:**
- Modify: `frontend/src/canvas/drag.js`
- Create or modify: `frontend/tests/canvas/drag.test.js`

- [ ] **Step 1: Write failing test for clientToStage with offset**

Create `frontend/tests/canvas/drag.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { clientToStage } from '../../src/canvas/drag.js';
import { STAGE_W, STAGE_H } from '../../src/canvas/stage.js';

describe('clientToStage', () => {
    const rect = { left: 0, top: 0, width: 1000, height: 600 };

    it('returns logical coords without offset', () => {
        const { x, y } = clientToStage(rect, 500, 300);
        expect(x).toBe(500);
        expect(y).toBe(300);
    });

    it('subtracts pointer offset to give grab-point-anchored coords', () => {
        const { x, y } = clientToStage(rect, 540, 320, { x: 20, y: 10 });
        // offset removed: client (540,320) - offset(20,10) = effective (520,310)
        expect(x).toBe(520);
        expect(y).toBe(310);
    });

    it('clamps to stage bounds', () => {
        const out = clientToStage(rect, 5000, 5000, { x: 0, y: 0 });
        expect(out.x).toBe(STAGE_W);
        expect(out.y).toBe(STAGE_H);
    });
});
```

- [ ] **Step 2: Run — confirm fail**

Run: `cd frontend && npx vitest run tests/canvas/drag.test.js`
Expected: 2nd test fails (current `clientToStage` ignores offset).

- [ ] **Step 3: Update `clientToStage` signature**

Edit `frontend/src/canvas/drag.js`:

```js
export function clientToStage(rect, clientX, clientY, pointerOffset = { x: 0, y: 0 }) {
    const offX = (clientX - pointerOffset.x) - rect.left;
    const offY = (clientY - pointerOffset.y) - rect.top;
    const x = Math.round((offX / rect.width) * STAGE_W);
    const y = Math.round((offY / rect.height) * STAGE_H);
    return {
        x: Math.max(0, Math.min(STAGE_W, x)),
        y: Math.max(0, Math.min(STAGE_H, y))
    };
}
```

- [ ] **Step 4: Capture pointerOffset in dot dragstart, use in end**

In `wireDrag`, inside `interact('.stage-dot', ...).draggable({ listeners: { start, end } })`:

```js
start(evt) {
    const userId = evt.target.dataset.userId;
    setDraggingId(userId);
    const rect = evt.target.getBoundingClientRect();
    evt.target.dataset.pointerOffX = evt.client.x - rect.left;
    evt.target.dataset.pointerOffY = evt.client.y - rect.top;
    evt.target.dataset.dragX = 0;
    evt.target.dataset.dragY = 0;
},
```

In `end`:

```js
const pointerOffset = {
    x: parseFloat(evt.target.dataset.pointerOffX) || 0,
    y: parseFloat(evt.target.dataset.pointerOffY) || 0,
};
const rect = stageEl.getBoundingClientRect();
const { x, y } = clientToStage(rect, evt.client.x, evt.client.y, pointerOffset);
await onMove({ userId, x, y });
```

- [ ] **Step 5: Run tests — confirm pass**

Run: `cd frontend && npx vitest run tests/canvas/drag.test.js`
Expected: all pass.

- [ ] **Step 6: Manual verify**

Drag a dot — it stays under cursor at grab offset (no jump on grab, no jump on release).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/canvas/drag.js frontend/tests/canvas/drag.test.js
git commit -m "fix(frontend): preserve pointer offset through dot drag (no jump on grab/release)"
```

---

## Task 4: Sidebar Drag Ghost (Issue #8)

**Files:**
- Modify: `frontend/src/canvas/drag.js`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Add ghost styles**

Append to `frontend/src/styles.css`:

```css
.drag-ghost {
    position: fixed;
    pointer-events: none;
    z-index: 1000;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(40, 40, 40, 0.85);
    color: white;
    font-size: 0.9rem;
    white-space: nowrap;
    transform: translate(-50%, -50%);
}
```

- [ ] **Step 2: Create + position ghost in sidebar drag listeners**

Replace the sidebar `interact('.available-row', ...)` block in `frontend/src/canvas/drag.js`:

```js
let _sidebarGhost = null;

interact('.available-row', { context: sidebarEl }).draggable({
    listeners: {
        start(evt) {
            evt.target.classList.add('dragging');
            setDraggingSidebarUserId(evt.target.dataset.userId);
            _sidebarGhost = document.createElement('div');
            _sidebarGhost.className = 'drag-ghost';
            _sidebarGhost.textContent = evt.target.textContent.trim();
            _sidebarGhost.style.left = `${evt.client.x}px`;
            _sidebarGhost.style.top = `${evt.client.y}px`;
            document.body.appendChild(_sidebarGhost);
        },
        move(evt) {
            if (_sidebarGhost) {
                _sidebarGhost.style.left = `${evt.client.x}px`;
                _sidebarGhost.style.top = `${evt.client.y}px`;
            }
        },
        async end(evt) {
            evt.target.classList.remove('dragging');
            if (_sidebarGhost) { _sidebarGhost.remove(); _sidebarGhost = null; }
            setDraggingSidebarUserId(null);
            if (evt.relatedTarget !== stageEl) return;
            const userId = evt.target.dataset.userId;
            const instrument = evt.target.dataset.instrument;
            const displayName = evt.target.textContent.trim();
            const rect = stageEl.getBoundingClientRect();
            const { x, y } = clientToStage(rect, evt.client.x, evt.client.y);
            try {
                await onPlace({ userId, displayName, instrument, x, y, manuallyAdded: false });
            } catch (err) {
                if (onError) onError(err);
            }
        }
    }
});
```

Note: drop the previous `evt.target.dataset.dragX/dragY` + `evt.target.style.transform` mutations on the source row — the ghost replaces the visual.

- [ ] **Step 3: Add `setDraggingSidebarUserId` + `setDraggingPosition` params to `wireDrag`**

Update `wireDrag` signature:

```js
export function wireDrag({ stageEl, sidebarEl, trashEl, getEvent,
                          setDraggingId, setDraggingPosition, setDraggingSidebarUserId,
                          onPlace, onMove, onRemove, onError }) {
    setDraggingSidebarUserId = setDraggingSidebarUserId || (() => {});
    setDraggingPosition = setDraggingPosition || (() => {});
    // ...
}
```

- [ ] **Step 4: Manual verify**

Drag a sidebar row — visible pill follows cursor; drops onto stage as before; sidebar row no longer translates around (the ghost does).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/canvas/drag.js frontend/src/styles.css
git commit -m "feat(frontend): drag-ghost for sidebar rows (visible during drag)"
```

---

## Task 5: Live Drag Position in State + Poll Merge (Issue #1)

**Files:**
- Modify: `frontend/src/state.js`
- Modify: `frontend/src/poll.js`
- Modify: `frontend/src/canvas/drag.js`
- Modify: `frontend/src/main.js`
- Modify: `frontend/tests/poll.test.js`

- [ ] **Step 1: Add draggingPosition to state.js**

Append to `frontend/src/state.js`:

```js
let _draggingPosition = null;
let _draggingSidebarUserId = null;

export function getDraggingPosition() { return _draggingPosition; }
export function setDraggingPosition(pos) { _draggingPosition = pos; }

export function getDraggingSidebarUserId() { return _draggingSidebarUserId; }
export function setDraggingSidebarUserId(id) { _draggingSidebarUserId = id; }
```

- [ ] **Step 2: Write failing test for live-position merge**

Open `frontend/tests/poll.test.js` (if missing, create). Add:

```js
import { describe, it, expect, vi } from 'vitest';
import { startPoll } from '../src/poll.js';

describe('startPoll mergeLivePosition', () => {
    it('uses live draggingPosition instead of server position for dragging dot', async () => {
        const server = { lineup: [{ userId: 'u1', position: { x: 100, y: 100 }, instrument: '1:a', displayName: 'A' }] };
        let received = null;
        const handle = startPoll({
            fetchState: async () => server,
            intervalMs: 10,
            getDraggingId: () => 'u1',
            getDraggingPosition: () => ({ x: 700, y: 500 }),
            onUpdate: (e) => { received = e; },
        });
        await new Promise(r => setTimeout(r, 30));
        handle.stop();
        const u1 = received.lineup.find(e => e.userId === 'u1');
        expect(u1.position).toEqual({ x: 700, y: 500 });
    });
});
```

- [ ] **Step 3: Run — confirm fail**

Run: `cd frontend && npx vitest run tests/poll.test.js`
Expected: fails (poll uses prev server position, not live).

- [ ] **Step 4: Update `poll.js` to accept `getDraggingPosition` + `getDraggingSidebarUserId`**

Replace `mergeDraggingPosition` + `startPoll` body in `frontend/src/poll.js`:

```js
const DEFAULT_INTERVAL_MS = 5000;

export function startPoll({
    fetchState,
    intervalMs = DEFAULT_INTERVAL_MS,
    getDraggingId,
    getDraggingPosition = () => null,
    getDraggingSidebarUserId = () => null,
    onUpdate,
    onError,
    visibilityRef = (typeof document !== 'undefined' ? document : { hidden: false })
}) {
    let stopped = false;

    async function tick() {
        if (stopped) return;
        if (visibilityRef.hidden) return;
        if (getDraggingSidebarUserId()) return; // defer entirely during sidebar drag
        try {
            const next = await fetchState();
            if (stopped) return;
            const merged = mergeLivePosition(next, getDraggingId(), getDraggingPosition());
            onUpdate(merged);
        } catch (err) {
            if (onError) onError(err);
        }
    }

    const id = setInterval(tick, intervalMs);
    return { id, stop() { stopped = true; clearInterval(id); } };
}

export function stopPoll(handle) {
    if (handle) handle.stop();
}

function mergeLivePosition(next, draggingId, livePos) {
    if (!draggingId || !livePos || !next || !Array.isArray(next.lineup)) return next;
    return {
        ...next,
        lineup: next.lineup.map(e => e.userId === draggingId ? { ...e, position: livePos } : e)
    };
}
```

- [ ] **Step 5: Update `drag.js` dot `move` listener to set live position**

In `interact('.stage-dot', ...).draggable({ listeners: { move } })`:

```js
move(evt) {
    const x = (parseFloat(evt.target.dataset.dragX) || 0) + evt.dx;
    const y = (parseFloat(evt.target.dataset.dragY) || 0) + evt.dy;
    evt.target.dataset.dragX = x;
    evt.target.dataset.dragY = y;
    evt.target.style.transform = `translate(${x}px, ${y}px)`;

    const pointerOffset = {
        x: parseFloat(evt.target.dataset.pointerOffX) || 0,
        y: parseFloat(evt.target.dataset.pointerOffY) || 0,
    };
    const rect = stageEl.getBoundingClientRect();
    const live = clientToStage(rect, evt.client.x, evt.client.y, pointerOffset);
    setDraggingPosition(live);
},
```

In the dot `end` handler, clear: `setDraggingPosition(null);` in the `finally` block (alongside `setDraggingId(null)`).

- [ ] **Step 6: Run test — confirm pass**

Run: `cd frontend && npx vitest run tests/poll.test.js`
Expected: pass.

- [ ] **Step 7: Wire main.js**

Update imports + `startPoll` call in `frontend/src/main.js`:

```js
import {
    // ...existing...
    getDraggingPosition,
    setDraggingPosition,
    getDraggingSidebarUserId,
    setDraggingSidebarUserId,
} from './state.js';
```

Pass to `wireDrag`:

```js
wireDrag({
    stageEl: stage,
    sidebarEl: sidebar,
    trashEl: trash,
    getEvent,
    setDraggingId,
    setDraggingPosition,
    setDraggingSidebarUserId,
    onPlace, onMove, onRemove, onError,
});
```

Pass to `startPoll`:

```js
_pollHandle = startPoll({
    fetchState: () => get(`/api/state/${concertId}`, _accessToken),
    intervalMs: 5000,
    getDraggingId,
    getDraggingPosition,
    getDraggingSidebarUserId,
    onUpdate: (updated) => {
        setEvent(updated);
        renderAvailable(sidebar, updated);
        renderStage(stage, updated);
    },
    onError: (err) => { console.warn('poll', err); }
});
```

- [ ] **Step 8: Manual verify — dot drag persists across poll**

Drag a dot slowly across 6+ seconds (spans one poll tick). Dot should not snap back to old position mid-drag.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/state.js frontend/src/poll.js frontend/src/canvas/drag.js frontend/src/main.js frontend/tests/poll.test.js
git commit -m "fix(frontend): poll uses live drag position, no mid-drag snapback"
```

---

## Task 6: Defer Render During Sidebar Drag (Issue #2)

**Files:**
- Modify: `frontend/tests/poll.test.js`

(Wiring already added in Task 5 step 4 — this task adds the test + manual verify.)

- [ ] **Step 1: Add test for sidebar-drag skip**

Append to `frontend/tests/poll.test.js`:

```js
it('skips onUpdate entirely when sidebar drag active', async () => {
    let called = 0;
    const handle = startPoll({
        fetchState: async () => ({ lineup: [] }),
        intervalMs: 10,
        getDraggingId: () => null,
        getDraggingSidebarUserId: () => 'u-sidebar',
        onUpdate: () => { called++; },
    });
    await new Promise(r => setTimeout(r, 30));
    handle.stop();
    expect(called).toBe(0);
});
```

- [ ] **Step 2: Run — confirm pass**

Run: `cd frontend && npx vitest run tests/poll.test.js`
Expected: all pass.

- [ ] **Step 3: Manual verify**

Start a sidebar drag, hold for >5s, drop on stage. Row remains visible (no recreation), dot lands correctly.

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/poll.test.js
git commit -m "test(frontend): cover sidebar-drag poll-skip"
```

---

## Task 7: Grid + Snap-to-Grid (Issue #4)

**Files:**
- Modify: `frontend/src/canvas/stage.js`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/canvas/drag.js`
- Modify: `frontend/tests/canvas/drag.test.js`

- [ ] **Step 1: Export GRID_STEP from stage.js**

Add to `frontend/src/canvas/stage.js`:

```js
export const DOT_SIZE = 40; // logical px, matches CSS --dot-size
export const GRID_STEP = Math.round(DOT_SIZE * 1.2); // 48
```

- [ ] **Step 2: Add grid background to .stage**

Append to `frontend/src/styles.css` (extend any existing `.stage` rule):

```css
.stage {
    --grid-step: 4.8%; /* 48/1000 = 4.8% of STAGE_W; keep in sync with GRID_STEP */
    background-image:
        repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px var(--grid-step)),
        repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px var(--grid-step));
}
```

- [ ] **Step 3: Write failing test for snap-to-grid**

Append to `frontend/tests/canvas/drag.test.js`:

```js
import { snapToGrid } from '../../src/canvas/drag.js';
import { GRID_STEP } from '../../src/canvas/stage.js';

describe('snapToGrid', () => {
    it('snaps to nearest grid intersection', () => {
        const step = GRID_STEP; // 48
        expect(snapToGrid(0, 0, step)).toEqual({ x: 0, y: 0 });
        expect(snapToGrid(25, 25, step)).toEqual({ x: 48, y: 48 });
        expect(snapToGrid(23, 23, step)).toEqual({ x: 0, y: 0 });
        expect(snapToGrid(100, 50, step)).toEqual({ x: 96, y: 48 });
    });
});
```

- [ ] **Step 4: Run — confirm fail**

Run: `cd frontend && npx vitest run tests/canvas/drag.test.js`
Expected: fail (`snapToGrid` undefined).

- [ ] **Step 5: Implement `snapToGrid` + apply at drop**

Add to `frontend/src/canvas/drag.js`:

```js
import { STAGE_W, STAGE_H, GRID_STEP } from './stage.js';

export function snapToGrid(x, y, step) {
    return {
        x: Math.round(x / step) * step,
        y: Math.round(y / step) * step,
    };
}
```

In both dot `end` and sidebar `end` (after `clientToStage`):

```js
const raw = clientToStage(rect, evt.client.x, evt.client.y, pointerOffset);
const { x, y } = snapToGrid(raw.x, raw.y, GRID_STEP);
```

(For sidebar drag, omit `pointerOffset` arg — sidebar rows don't track it.)

- [ ] **Step 6: Run tests — confirm pass**

Run: `cd frontend && npx vitest run tests/canvas/drag.test.js`
Expected: all pass.

- [ ] **Step 7: Manual verify**

Grid visible on stage. Drop a dot anywhere — it lands on nearest intersection.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/canvas/stage.js frontend/src/canvas/drag.js frontend/src/styles.css frontend/tests/canvas/drag.test.js
git commit -m "feat(frontend): stage grid + snap-to-grid on drop"
```

---

## Task 8: Instrument Label Inside Dot (Issue #10)

**Files:**
- Modify: `frontend/src/canvas/stage.js`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Render instrument sub-label inside dot**

In `renderStage` (after the `displayName` label append, before stale-badge):

```js
const instLabel = document.createElement('span');
instLabel.className = 'dot-instrument';
instLabel.textContent = abbreviateInstrument(entry.instrument);
dot.appendChild(instLabel);
```

Add helper near top of `stage.js`:

```js
const INSTRUMENT_ABBREV = {
    '1:a': '1', '2:a': '2', '3:a': '3', '4:a': '4',
    'repenique': 'rep', 'skak/agogo': 'sk', 'tarol': 'tar', 'timbal': 'tim',
};

export function abbreviateInstrument(key) {
    return INSTRUMENT_ABBREV[key] ?? key.slice(0, 3);
}
```

- [ ] **Step 2: Style the sub-label**

Append to `frontend/src/styles.css`:

```css
.stage-dot .dot-instrument {
    position: absolute;
    bottom: 2px;
    right: 2px;
    font-size: 0.65rem;
    background: rgba(0,0,0,0.5);
    color: white;
    padding: 0 3px;
    border-radius: 4px;
    pointer-events: none;
}
```

- [ ] **Step 3: Manual verify**

Place a dot — abbreviated instrument visible in corner.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/canvas/stage.js frontend/src/styles.css
git commit -m "feat(frontend): show abbreviated instrument inside dot"
```

---

## Task 9: Verify `active:false` Filter (Issue #7)

**Files:**
- Verify: `tests/routes/concerts.test.js`

- [ ] **Step 1: Confirm filter present**

Run: `grep -n "active === false" src/routes/api/concerts.js`
Expected: line 23 hits.

- [ ] **Step 2: Run existing concerts test**

Run: `node --test tests/routes/concerts.test.js`
Expected: pass.

- [ ] **Step 3: Add regression test if missing**

Open `tests/routes/concerts.test.js`. Verify there is a test that creates an event JSON with `active: false` and asserts it does not appear in the response. If absent, add one (adjusting imports to match existing test style):

```js
test('excludes events with active: false', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'concerts-'));
    await writeFile(path.join(dir, 'a.json'), JSON.stringify({
        id: 'aktiv', name: 'Aktiv', date: '2026-06-01', active: true
    }));
    await writeFile(path.join(dir, 'b.json'), JSON.stringify({
        id: 'inaktiv', name: 'Inaktiv', date: '2026-06-02', active: false
    }));
    const route = createConcertsRoute({ activeDir: dir, parseEventDate: (d) => new Date(d) });
    const res = mockRes();
    route({}, res);
    assert.deepStrictEqual(res.body.map(c => c.concertId), ['aktiv']);
});
```

- [ ] **Step 4: Run test — confirm pass**

Run: `node --test tests/routes/concerts.test.js`
Expected: pass.

- [ ] **Step 5: Commit if test added**

```bash
git add tests/routes/concerts.test.js
git commit -m "test(api): regression coverage for active:false filter"
```

If no change needed, skip commit.

---

## Task 10: Auto-Place Algorithm (Issue #6 — math + pure fn)

**Files:**
- Create: `frontend/src/canvas/autoPlace.js`
- Create: `frontend/tests/canvas/autoPlace.test.js`

- [ ] **Step 1: Write failing test for autoPlace row mapping**

Create `frontend/tests/canvas/autoPlace.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { computeAutoPositions, ROW_MAP } from '../../src/canvas/autoPlace.js';
import { GRID_STEP, STAGE_W, STAGE_H } from '../../src/canvas/stage.js';

describe('computeAutoPositions', () => {
    it('places members in instrument-group rows from front to back', () => {
        const members = [
            { userId: 'a', displayName: 'A', instrument: '1:a' },
            { userId: 'b', displayName: 'B', instrument: '1:a' },
            { userId: 'c', displayName: 'C', instrument: 'tarol' },
        ];
        const placed = computeAutoPositions(members, GRID_STEP, STAGE_W, STAGE_H);
        expect(placed).toHaveLength(3);
        const row1a = placed.filter(p => p.instrument === '1:a').map(p => p.y);
        expect(new Set(row1a).size).toBe(1);
        const rowTar = placed.find(p => p.instrument === 'tarol').y;
        expect(rowTar).not.toBe(row1a[0]);
    });

    it('snaps all positions to grid', () => {
        const members = [{ userId: 'a', displayName: 'A', instrument: '1:a' }];
        const placed = computeAutoPositions(members, GRID_STEP, STAGE_W, STAGE_H);
        for (const p of placed) {
            expect(p.x % GRID_STEP).toBe(0);
            expect(p.y % GRID_STEP).toBe(0);
        }
    });

    it('avoids overlap by spacing along x within a row', () => {
        const members = Array.from({ length: 5 }, (_, i) => ({
            userId: `u${i}`, displayName: `U${i}`, instrument: '1:a'
        }));
        const placed = computeAutoPositions(members, GRID_STEP, STAGE_W, STAGE_H);
        const xs = placed.map(p => p.x).sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) {
            expect(xs[i] - xs[i-1]).toBeGreaterThanOrEqual(GRID_STEP);
        }
    });

    it('preserves userId/displayName/instrument on output', () => {
        const members = [{ userId: 'a', displayName: 'A', instrument: '1:a' }];
        const [p] = computeAutoPositions(members, GRID_STEP, STAGE_W, STAGE_H);
        expect(p.userId).toBe('a');
        expect(p.displayName).toBe('A');
        expect(p.instrument).toBe('1:a');
    });
});
```

- [ ] **Step 2: Run — confirm fail**

Run: `cd frontend && npx vitest run tests/canvas/autoPlace.test.js`
Expected: fail (module missing).

- [ ] **Step 3: Implement autoPlace.js**

Create `frontend/src/canvas/autoPlace.js`:

```js
// Rough M5.1 layout — refine in M5.2.
// Row indices: 0 = front of stage (audience side, bottom of canvas), higher = further back.
// Column hint: 'left' | 'center' | 'right' — bucket within a row.
//
// Layout from stakeholder:
//   Row 0 (front): 3:a (sides), 4:a (center)
//   Row 1:         tarol (center)
//   Row 2 (back):  1:a + 2:a (left/center), repenique (center), timbal (right), skak/agogo (right)
export const ROW_MAP = {
    '3:a':        0,
    '4:a':        0,
    'tarol':      1,
    '1:a':        2,
    '2:a':        2,
    'repenique':  2,
    'timbal':     2,
    'skak/agogo': 2,
};

export const COLUMN_HINT = {
    '3:a':        'left',    // sides of row 0; 4:a takes center
    '4:a':        'center',
    'tarol':      'center',
    '1:a':        'left',    // back row left side
    '2:a':        'left',
    'repenique':  'center',
    'timbal':     'right',
    'skak/agogo': 'right',
};

const TOTAL_ROWS = 3;
const COLUMN_FRACTIONS = { left: 0.25, center: 0.5, right: 0.75 };

export function computeAutoPositions(members, gridStep, stageW, stageH) {
    const yPadding = gridStep * 2;
    const usableH = stageH - 2 * yPadding;
    const rowHeight = usableH / Math.max(1, TOTAL_ROWS - 1);

    // Bucket by (row, column).
    const buckets = new Map(); // key `${row}:${col}` -> [members]
    for (const m of members) {
        const row = ROW_MAP[m.instrument] ?? (TOTAL_ROWS - 1);
        const col = COLUMN_HINT[m.instrument] ?? 'center';
        const key = `${row}:${col}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(m);
    }

    const result = [];
    for (const [key, list] of buckets) {
        const [rowStr, col] = key.split(':');
        const row = Number(rowStr);
        const rawY = stageH - yPadding - row * rowHeight;
        const y = Math.round(rawY / gridStep) * gridStep;
        const centerX = stageW * COLUMN_FRACTIONS[col];
        const totalWidth = (list.length - 1) * gridStep;
        const startX = Math.max(gridStep, Math.round((centerX - totalWidth / 2) / gridStep) * gridStep);
        list.forEach((m, i) => {
            const x = Math.min(stageW - gridStep, startX + i * gridStep);
            result.push({
                userId: m.userId,
                displayName: m.displayName,
                instrument: m.instrument,
                x,
                y,
            });
        });
    }
    return result;
}
```

- [ ] **Step 4: Run tests — confirm pass**

Run: `cd frontend && npx vitest run tests/canvas/autoPlace.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/canvas/autoPlace.js frontend/tests/canvas/autoPlace.test.js
git commit -m "feat(frontend): autoPlace algorithm — row-per-instrument-group layout"
```

---

## Task 11: "Ställ upp alla" Modal UI (Issue #6 — modal)

**Files:**
- Create: `frontend/src/sidebar/stallUppAlla.js`
- Modify: `frontend/index.html`
- Modify: `frontend/src/styles.css`
- Create: `frontend/tests/sidebar/stallUppAlla.test.js`

- [ ] **Step 1: Add button + modal container to index.html**

Find the sidebar block in `frontend/index.html`. Above the manual-add button, add:

```html
<button id="stall-upp-alla-btn" type="button">Ställ upp alla</button>
<div id="stall-upp-alla-modal" hidden></div>
```

- [ ] **Step 2: Write failing test for modal rendering**

Create `frontend/tests/sidebar/stallUppAlla.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openStallUppAlla } from '../../src/sidebar/stallUppAlla.js';

function makeEvent() {
    return {
        signups: {
            '1:a': [
                { id: 'u1', name: 'Alice', response: 'ja' },
                { id: 'u2', name: 'Bob', response: 'kanske' },
            ],
            'tarol': [
                { id: 'u2', name: 'Bob', response: 'ja' },
            ],
        },
        lineup: [],
    };
}

function setupDom() {
    document.body.replaceChildren();
    const el = document.createElement('div');
    el.id = 'm';
    document.body.appendChild(el);
    return el;
}

describe('openStallUppAlla', () => {
    let modalEl;
    beforeEach(() => { modalEl = setupDom(); });

    it('renders one row per (user × instrument) signup combo', () => {
        openStallUppAlla({ modalEl, event: makeEvent(), onSubmit: () => {} });
        const rows = modalEl.querySelectorAll('.stua-row');
        expect(rows.length).toBe(3);
    });

    it('OK disabled until every member has one instrument selected', () => {
        openStallUppAlla({ modalEl, event: makeEvent(), onSubmit: () => {} });
        const ok = modalEl.querySelector('button.stua-ok');
        expect(ok.disabled).toBe(true);
        modalEl.querySelector('[data-user="u1"][data-instrument="1:a"]').click();
        expect(ok.disabled).toBe(true);
        modalEl.querySelector('[data-user="u2"][data-instrument="tarol"]').click();
        expect(ok.disabled).toBe(false);
    });

    it('OK click calls onSubmit with one selection per user', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        openStallUppAlla({ modalEl, event: makeEvent(), onSubmit });
        modalEl.querySelector('[data-user="u1"][data-instrument="1:a"]').click();
        modalEl.querySelector('[data-user="u2"][data-instrument="tarol"]').click();
        modalEl.querySelector('button.stua-ok').click();
        await new Promise(r => setTimeout(r, 0));
        expect(onSubmit).toHaveBeenCalledWith([
            { userId: 'u1', displayName: 'Alice', instrument: '1:a' },
            { userId: 'u2', displayName: 'Bob', instrument: 'tarol' },
        ]);
    });
});
```

- [ ] **Step 3: Run — confirm fail**

Run: `cd frontend && npx vitest run tests/sidebar/stallUppAlla.test.js`
Expected: fail (module missing).

- [ ] **Step 4: Implement `stallUppAlla.js`**

Create `frontend/src/sidebar/stallUppAlla.js`:

```js
const VALID = new Set(['ja', 'kanske']);

export function openStallUppAlla({ modalEl, event, onSubmit }) {
    modalEl.hidden = false;
    modalEl.replaceChildren();

    const userInstruments = new Map();
    for (const [instrument, entries] of Object.entries(event.signups || {})) {
        for (const e of entries) {
            if (!VALID.has(e.response)) continue;
            if (!userInstruments.has(e.id)) userInstruments.set(e.id, { name: e.name, instruments: new Set() });
            userInstruments.get(e.id).instruments.add(instrument);
        }
    }

    const selections = new Map();

    const wrap = document.createElement('div');
    wrap.className = 'stua-wrap';

    const title = document.createElement('h2');
    title.textContent = 'Ställ upp alla';
    wrap.appendChild(title);

    const list = document.createElement('div');
    list.className = 'stua-list';

    for (const [userId, { name, instruments }] of userInstruments) {
        for (const instrument of instruments) {
            const row = document.createElement('div');
            row.className = 'stua-row';
            row.dataset.user = userId;

            const label = document.createElement('span');
            label.textContent = `${name} — ${instrument}`;
            row.appendChild(label);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = instrument;
            btn.dataset.user = userId;
            btn.dataset.instrument = instrument;
            btn.className = 'stua-pick';
            btn.addEventListener('click', () => {
                selections.set(userId, { instrument, displayName: name });
                list.querySelectorAll(`button[data-user="${userId}"]`).forEach(b => {
                    b.classList.toggle('selected', b.dataset.instrument === instrument);
                });
                updateOkState();
            });
            row.appendChild(btn);
            list.appendChild(row);
        }
    }
    wrap.appendChild(list);

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'stua-ok';
    ok.textContent = 'OK';
    ok.disabled = true;
    ok.addEventListener('click', async () => {
        const payload = [];
        for (const [userId, { instrument, displayName }] of selections) {
            payload.push({ userId, displayName, instrument });
        }
        ok.disabled = true;
        try { await onSubmit(payload); } finally { closeModal(); }
    });
    wrap.appendChild(ok);

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'stua-cancel';
    cancel.textContent = 'Avbryt';
    cancel.addEventListener('click', closeModal);
    wrap.appendChild(cancel);

    modalEl.appendChild(wrap);

    function updateOkState() {
        ok.disabled = selections.size !== userInstruments.size;
    }
    function closeModal() {
        modalEl.hidden = true;
        modalEl.replaceChildren();
    }
}
```

- [ ] **Step 5: Add modal styles**

Append to `frontend/src/styles.css`:

```css
#stall-upp-alla-modal:not([hidden]) {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
}
.stua-wrap {
    background: #222;
    color: white;
    padding: 16px;
    border-radius: 8px;
    min-width: 320px;
    max-height: 80vh;
    overflow: auto;
}
.stua-row { display: flex; justify-content: space-between; padding: 4px 0; }
.stua-pick.selected { background: #2ecc71; color: black; }
.stua-ok:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 6: Run tests — confirm pass**

Run: `cd frontend && npx vitest run tests/sidebar/stallUppAlla.test.js`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/sidebar/stallUppAlla.js frontend/tests/sidebar/stallUppAlla.test.js frontend/index.html frontend/src/styles.css
git commit -m "feat(frontend): Ställ upp alla modal — per-member instrument picker with OK gating"
```

---

## Task 12: Wire "Ställ upp alla" Button into main.js

**Files:**
- Modify: `frontend/src/main.js`

- [ ] **Step 1: Import autoPlace + modal opener**

Top of `frontend/src/main.js`:

```js
import { openStallUppAlla } from './sidebar/stallUppAlla.js';
import { computeAutoPositions } from './canvas/autoPlace.js';
import { GRID_STEP, STAGE_W, STAGE_H } from './canvas/stage.js';
```

- [ ] **Step 2: Wire button at end of `loadPlanner`**

Append after manual-add wiring:

```js
const stuaBtn = document.getElementById('stall-upp-alla-btn');
const stuaModal = document.getElementById('stall-upp-alla-modal');
if (stuaBtn && stuaModal) {
    stuaBtn.onclick = () => openStallUppAlla({
        modalEl: stuaModal,
        event: getEvent(),
        onSubmit: async (selections) => {
            const positioned = computeAutoPositions(selections, GRID_STEP, STAGE_W, STAGE_H);
            for (const p of positioned) {
                try {
                    const updated = await post('/api/lineup/place', {
                        concertId, ...p, manuallyAdded: false
                    }, _accessToken);
                    setEvent(updated);
                } catch (err) {
                    showStatus(`Kunde inte placera ${p.displayName}: ${err.message || err}`, true);
                    break;
                }
            }
            renderAvailable(sidebar, getEvent());
            renderStage(stage, getEvent());
        }
    });
}
```

- [ ] **Step 3: Manual verify end-to-end**

1. Start dev: `cd frontend && npm run dev`.
2. Open planner.
3. Click "Ställ upp alla". Modal opens with one row per signup-instrument.
4. Each member: pick exactly one instrument (toggles visually).
5. OK enables when all picked. Click OK.
6. All members appear on canvas in instrument-group rows.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/main.js
git commit -m "feat(frontend): wire Ställ upp alla button → autoPlace → /api/lineup/place batch"
```

---

## Task 13: Polish & Edge Cases for "Ställ upp alla"

**Files:**
- Modify: `frontend/src/sidebar/stallUppAlla.js`
- Modify: `frontend/tests/sidebar/stallUppAlla.test.js`
- Modify: `frontend/src/main.js`

- [ ] **Step 1: Skip already-placed members + empty state**

In `stallUppAlla.js`, before listing instruments, filter out users already in `event.lineup`:

```js
const placed = new Set((event.lineup || []).map(e => e.userId));
// ... inside the signups loop:
for (const e of entries) {
    if (!VALID.has(e.response)) continue;
    if (placed.has(e.id)) continue;
    // ...
}
```

After building `userInstruments`, if size 0, append a paragraph + cancel button only:

```js
if (userInstruments.size === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Alla anmälda är redan utställda.';
    wrap.appendChild(empty);
    const cancelOnly = document.createElement('button');
    cancelOnly.type = 'button';
    cancelOnly.textContent = 'Stäng';
    cancelOnly.addEventListener('click', () => { modalEl.hidden = true; modalEl.replaceChildren(); });
    wrap.appendChild(cancelOnly);
    modalEl.appendChild(wrap);
    return;
}
```

- [ ] **Step 2: Add tests for skip + empty state**

Append to `frontend/tests/sidebar/stallUppAlla.test.js`:

```js
it('skips members already placed in lineup', () => {
    const event = makeEvent();
    event.lineup = [{ userId: 'u1', position: {x:0,y:0}, instrument: '1:a', displayName: 'Alice' }];
    openStallUppAlla({ modalEl, event, onSubmit: () => {} });
    const rows = modalEl.querySelectorAll('.stua-row');
    expect(rows.length).toBe(2); // only Bob (×2 instruments)
});

it('shows empty state when nobody left to place', () => {
    const event = makeEvent();
    event.lineup = [
        { userId: 'u1', position: {x:0,y:0}, instrument: '1:a', displayName: 'Alice' },
        { userId: 'u2', position: {x:0,y:0}, instrument: 'tarol', displayName: 'Bob' },
    ];
    openStallUppAlla({ modalEl, event, onSubmit: () => {} });
    expect(modalEl.textContent).toContain('redan utställda');
});
```

- [ ] **Step 3: Run tests — confirm pass**

Run: `cd frontend && npx vitest run tests/sidebar/stallUppAlla.test.js`
Expected: all pass.

- [ ] **Step 4: Pause poll during batch place (optional polish)**

In `main.js` `onSubmit` for stua, wrap the loop with poll pause:

```js
onSubmit: async (selections) => {
    if (_pollHandle) { stopPoll(_pollHandle); _pollHandle = null; }
    const positioned = computeAutoPositions(selections, GRID_STEP, STAGE_W, STAGE_H);
    for (const p of positioned) {
        try {
            const updated = await post('/api/lineup/place', { concertId, ...p, manuallyAdded: false }, _accessToken);
            setEvent(updated);
        } catch (err) {
            showStatus(`Kunde inte placera ${p.displayName}: ${err.message || err}`, true);
            break;
        }
    }
    renderAvailable(sidebar, getEvent());
    renderStage(stage, getEvent());
    _pollHandle = startPoll({
        fetchState: () => get(`/api/state/${concertId}`, _accessToken),
        intervalMs: 5000,
        getDraggingId,
        getDraggingPosition,
        getDraggingSidebarUserId,
        onUpdate: (u) => { setEvent(u); renderAvailable(sidebar, u); renderStage(stage, u); },
        onError: (err) => { console.warn('poll', err); }
    });
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/sidebar/stallUppAlla.js frontend/tests/sidebar/stallUppAlla.test.js frontend/src/main.js
git commit -m "feat(frontend): Ställ upp alla — skip already-placed, empty state, safe polling"
```

---

## Final Verification

- [ ] **Step 1: Full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: all pass.

- [ ] **Step 2: Full backend test suite**

Run: `node --test`
Expected: all pass.

- [ ] **Step 3: Manual smoke test against live bot**

1. Open Discord activity. Open planner.
2. Drag a dot — no jump on grab, no jump on release, no mid-drag snapback.
3. Drag for >5s — no poll snapback.
4. Drag a sidebar row — visible ghost, no mid-drag abort.
5. Drop on grid — lands on intersection.
6. Drop on trash — easy to hit.
7. Click "Ställ upp alla" → pick instruments → OK → members appear in rows.
8. Try to select text by clicking-and-dragging — no selection.
9. Each placed dot shows instrument abbreviation.
10. An event with `active: false` does not appear in picker.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git status
# If clean, done. Otherwise commit residual fixes.
```

---

## Out of Scope (Deferred)

- Mobile-specific drag handling.
- Row map refinement (current `ROW_MAP` is a first cut — refine after stakeholder review).
- Persisting "Ställ upp alla" selections across modal reopen.
- Undo/redo for batch place.
