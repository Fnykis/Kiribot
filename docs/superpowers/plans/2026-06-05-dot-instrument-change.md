# Dot Instrument Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a drum icon to the dot radial menu that opens an instrument list; picking one changes that dot's color + abbreviation label (not the person's name) and persists to the backend.

**Architecture:** New backend `GET /api/instruments` (exposes `instrumentList.json` keys) and `POST /api/lineup/instrument` (updates a lineup entry's `instrument`). Frontend gets a `dataSource` pair mirrored in `devData`, a drum button in `showRadialMenu` that swaps the pill for a flyout instrument list (current instrument bold), and an optimistic `onChangeInstrument` callback in `main.js` that re-renders via the existing `renderStage`.

**Tech Stack:** Node/Express (backend, `node:test`), Vite + vanilla JS (frontend, Vitest), interactjs, lucide icons.

**Spec:** `docs/superpowers/specs/2026-06-05-dot-instrument-change-design.md`

---

## File Structure

- **Modify** `src/routes/api/lineup.js` — add `createInstrumentsRoute` + `createChangeInstrumentRoute` factories; export them.
- **Modify** `src/core/express.js` — import + register the two new routes.
- **Modify** `tests/routes/lineup.test.js` — tests for both new routes.
- **Modify** `frontend/src/devData.js` — add `getInstruments` + `changeInstrument`; export in the returned object.
- **Modify** `frontend/tests/devData.test.js` — tests for both dev adapters.
- **Modify** `frontend/src/dataSource.js` — add `fetchInstruments` + `changeInstrument`.
- **Modify** `frontend/src/canvas/drag.js` — export `buildInstrumentPicker`; add Drum button + flyout to `showRadialMenu`; thread `instruments` + `onChangeInstrument` through `wireDrag`/`selectAndMenu`.
- **Modify** `frontend/tests/canvas/drag.test.js` — test `buildInstrumentPicker`.
- **Modify** `frontend/src/styles.css` — flyout/picker styles.
- **Modify** `frontend/src/main.js` — import the two dataSource fns, fetch instruments at init, wire `onChangeInstrument`.

No change to `frontend/src/canvas/stage.js` — `renderStage` already derives color/glow/abbrev from `entry.instrument`.

---

## Task 1: Backend — `GET /api/instruments` route

**Files:**
- Modify: `src/routes/api/lineup.js` (add factory + export)
- Test: `tests/routes/lineup.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/routes/lineup.test.js`. First extend the destructured import at the top of the file (currently lines 3-8) to include the new factories:

```js
const {
    createPlaceRoute,
    createMoveRoute,
    createMestreRoute,
    createRemoveRoute,
    createInstrumentsRoute,
    createChangeInstrumentRoute
} = require('../../src/routes/api/lineup');
```

Then append these tests at the end of the file:

```js
// ---------- INSTRUMENTS ----------

test('instruments: 200 returns instrumentList keys', async () => {
    const handler = createInstrumentsRoute({ instrumentList: INSTRUMENT_LIST });
    const res = mockRes();
    await handler({ user: { id: 'me' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, ['1:a', '2:a', 'tarol']);
});

test('instruments: 200 empty array when no instrument list', async () => {
    const handler = createInstrumentsRoute({ instrumentList: {} });
    const res = mockRes();
    await handler({ user: { id: 'me' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routes/lineup.test.js`
Expected: FAIL — `createInstrumentsRoute is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/routes/api/lineup.js`, add this factory above the `module.exports` line (after `createRemoveRoute`):

```js
function createInstrumentsRoute({ instrumentList }) {
    return async function instrumentsRoute(_req, res) {
        return res.json(Object.keys(instrumentList || {}));
    };
}
```

And update the export at the bottom of the file:

```js
module.exports = {
    createPlaceRoute,
    createMoveRoute,
    createMestreRoute,
    createRemoveRoute,
    createInstrumentsRoute,
    createChangeInstrumentRoute
};
```

Note: `createChangeInstrumentRoute` is added in Task 2; if you run tests between tasks, temporarily omit it from the export until Task 2, or do Tasks 1 and 2 before running. (Recommended: keep the export list above and implement Task 2 next.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routes/lineup.test.js`
Expected: the two `instruments:` tests PASS. (Other tests may error on the missing `createChangeInstrumentRoute` export until Task 2 — proceed to Task 2.)

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/lineup.js tests/routes/lineup.test.js
git commit -m "feat(api): add GET /api/instruments route factory"
```

---

## Task 2: Backend — `POST /api/lineup/instrument` route

**Files:**
- Modify: `src/routes/api/lineup.js` (add factory; already exported in Task 1)
- Test: `tests/routes/lineup.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/routes/lineup.test.js`. These reuse the existing `INSTRUMENT_LIST`, `makeStore`, `mockRes`, and `baseEvent` helpers. Use an event that already has a placed entry:

```js
// ---------- CHANGE INSTRUMENT ----------

const placedEvent = {
    id: 'c1', name: 'Demo', date: '08/03/26',
    signups: {
        '1:a': [{ name: 'A', id: 'u1', response: 'ja', note: '' }],
        '2:a': [{ name: 'B', id: 'u2', response: 'ja', note: '' }]
    },
    lineup: [{
        userId: 'u1', displayName: 'A', instrument: '1:a',
        position: { x: 10, y: 20 }, manuallyAdded: false, placedAt: 't'
    }]
};

test('changeInstrument: 200 updates the entry instrument', async () => {
    const store = makeStore(placedEvent);
    const handler = createChangeInstrumentRoute({ lineupStore: store, instrumentList: INSTRUMENT_LIST });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1', instrument: 'tarol' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.lineup[0].instrument, 'tarol');
    assert.strictEqual(res.body.lineup[0].position.x, 10); // position untouched
});

test('changeInstrument: 400 invalid_body when instrument missing', async () => {
    const handler = createChangeInstrumentRoute({ lineupStore: makeStore(placedEvent), instrumentList: INSTRUMENT_LIST });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'invalid_body' });
});

test('changeInstrument: 400 unknown instrument', async () => {
    const handler = createChangeInstrumentRoute({ lineupStore: makeStore(placedEvent), instrumentList: INSTRUMENT_LIST });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1', instrument: 'bogus' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'invalid_instrument' });
});

test('changeInstrument: 404 user_not_placed', async () => {
    const handler = createChangeInstrumentRoute({ lineupStore: makeStore(placedEvent), instrumentList: INSTRUMENT_LIST });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'ghost', instrument: 'tarol' } }, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'user_not_placed' });
});

test('changeInstrument: 404 event_not_found', async () => {
    const store = { async loadEvent() { return null; }, async mutateEvent() { throw new Error('event_not_found'); } };
    const handler = createChangeInstrumentRoute({ lineupStore: store, instrumentList: INSTRUMENT_LIST });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'gone', userId: 'u1', instrument: 'tarol' } }, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'event_not_found' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routes/lineup.test.js`
Expected: FAIL — `createChangeInstrumentRoute is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/routes/api/lineup.js`, add this factory after `createInstrumentsRoute` (it follows the exact shape of `createMoveRoute`):

```js
function createChangeInstrumentRoute({ lineupStore, instrumentList }) {
    return async function changeInstrumentRoute(req, res) {
        const { concertId, userId, instrument } = req.body || {};
        if (!concertId || !userId || !instrument) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        if (!Object.prototype.hasOwnProperty.call(instrumentList, instrument)) {
            return res.status(400).json({ error: 'invalid_instrument' });
        }
        const event = await lineupStore.loadEvent(concertId);
        if (!event) return res.status(404).json({ error: 'event_not_found' });

        let updated;
        try {
            updated = await lineupStore.mutateEvent(concertId, ev => {
                const entry = ev.lineup.find(e => e.userId === userId);
                if (!entry) throw new Error('user_not_placed');
                entry.instrument = instrument;
                return ev;
            });
        } catch (err) {
            if (err.message === 'user_not_placed') return res.status(404).json({ error: 'user_not_placed' });
            if (err.message === 'event_not_found') return res.status(404).json({ error: 'event_not_found' });
            throw err;
        }
        return res.json(updated);
    };
}
```

(The `module.exports` block already lists `createChangeInstrumentRoute` from Task 1.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routes/lineup.test.js`
Expected: ALL tests PASS (including Task 1's `instruments:` tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/lineup.js tests/routes/lineup.test.js
git commit -m "feat(api): add POST /api/lineup/instrument route factory"
```

---

## Task 3: Backend — register both routes in express

**Files:**
- Modify: `src/core/express.js:15-20` (import), `src/core/express.js:72-86` (registration)

- [ ] **Step 1: Update the import block**

Replace the existing import (currently lines 15-20):

```js
const {
    createPlaceRoute,
    createMoveRoute,
    createMestreRoute,
    createRemoveRoute
} = require('../routes/api/lineup');
```

with:

```js
const {
    createPlaceRoute,
    createMoveRoute,
    createMestreRoute,
    createRemoveRoute,
    createInstrumentsRoute,
    createChangeInstrumentRoute
} = require('../routes/api/lineup');
```

- [ ] **Step 2: Register the GET instruments route**

After the state route registration (currently lines 72-73), add:

```js
    app.get('/api/instruments', authMiddleware,
        createInstrumentsRoute({ instrumentList }));
```

- [ ] **Step 3: Register the POST change-instrument route**

After the `app.post('/api/lineup/remove', ...)` block (currently lines 85-86), add:

```js
    app.post('/api/lineup/instrument', authMiddleware, lineupLimiter,
        asyncRoute(createChangeInstrumentRoute({ lineupStore, instrumentList })));
```

- [ ] **Step 4: Verify the app still builds**

Run: `node -e "require('./src/core/express.js'); console.log('express ok')"`
Expected: prints `express ok` with no throw.

- [ ] **Step 5: Commit**

```bash
git add src/core/express.js
git commit -m "feat(api): wire instruments + change-instrument routes"
```

---

## Task 4: Frontend devData — `getInstruments` + `changeInstrument`

**Files:**
- Modify: `frontend/src/devData.js`
- Test: `frontend/tests/devData.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/devData.test.js` (reuses `sampleEvents()` and `createDevData`):

```js
describe('getInstruments', () => {
    it('returns the sorted union of signup keys across events', () => {
        const dev = createDevData(sampleEvents());
        expect(dev.getInstruments()).toEqual(['1:a', 'timbal']);
    });
});

describe('changeInstrument', () => {
    function placedDev() {
        const dev = createDevData(sampleEvents());
        dev.place({ concertId: '100', userId: 'u1', displayName: 'Anna A', instrument: '1:a', x: 5, y: 5 });
        return dev;
    }

    it('updates the placed entry instrument and keeps position', () => {
        const dev = placedDev();
        const ev = dev.changeInstrument({ concertId: '100', userId: 'u1', instrument: 'timbal' });
        const entry = ev.lineup.find(e => e.userId === 'u1');
        expect(entry.instrument).toBe('timbal');
        expect(entry.position).toEqual({ x: 5, y: 5 });
    });

    it('throws 400 for invalid body', () => {
        const dev = placedDev();
        try { dev.changeInstrument({ concertId: '100', userId: 'u1' }); }
        catch (e) { expect(e.status).toBe(400); }
        expect(() => dev.changeInstrument({ concertId: '100', userId: 'u1' })).toThrow();
    });

    it('throws 400 for unknown instrument', () => {
        const dev = placedDev();
        try { dev.changeInstrument({ concertId: '100', userId: 'u1', instrument: 'bogus' }); }
        catch (e) { expect(e.status).toBe(400); }
    });

    it('throws 404 when user not placed', () => {
        const dev = placedDev();
        try { dev.changeInstrument({ concertId: '100', userId: 'ghost', instrument: 'timbal' }); }
        catch (e) { expect(e.status).toBe(404); }
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/devData.test.js`
Expected: FAIL — `dev.getInstruments is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/devData.js`, inside `createDevData`, add an `allInstruments` helper and the two functions (place them just before the `return { ... }` at the end). Then add both to the returned object.

```js
    function allInstruments() {
        const set = new Set();
        for (const event of Object.values(events)) {
            for (const key of Object.keys(event.signups || {})) set.add(key);
        }
        return Array.from(set).sort();
    }

    function getInstruments() {
        return allInstruments();
    }

    function changeInstrument({ concertId, userId, instrument }) {
        if (!concertId || !userId || !instrument) throw httpError('invalid_body', 400);
        if (!allInstruments().includes(instrument)) throw httpError('invalid_instrument', 400);
        const event = events[concertId];
        if (!event) throw httpError('event_not_found', 404);
        const entry = event.lineup.find(e => e.userId === userId);
        if (!entry) throw httpError('user_not_placed', 404);
        entry.instrument = instrument;
        return event;
    }
```

Update the return statement (currently the last line of `createDevData`):

```js
    return { getConcerts, getState, getMembers, getInstruments, place, move, changeInstrument, setMestre, remove, setMute, leaveVoice };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/devData.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/devData.js frontend/tests/devData.test.js
git commit -m "feat(frontend): devData getInstruments + changeInstrument adapters"
```

---

## Task 5: Frontend dataSource — `fetchInstruments` + `changeInstrument`

**Files:**
- Modify: `frontend/src/dataSource.js`

- [ ] **Step 1: Add the two functions**

In `frontend/src/dataSource.js`, after the `moveMember` function (currently ends line 36), add:

```js
export async function fetchInstruments(token) {
    return isDevMode ? dev().getInstruments() : get('/api/instruments', token);
}

export async function changeInstrument(body, token) {
    return isDevMode ? dev().changeInstrument(body) : post('/api/lineup/instrument', body, token);
}
```

- [ ] **Step 2: Verify it imports cleanly**

Run: `cd frontend && npx vitest run tests/api.test.js`
Expected: PASS (no import errors from the module graph).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/dataSource.js
git commit -m "feat(frontend): dataSource fetchInstruments + changeInstrument"
```

---

## Task 6: Frontend — Drum button + instrument flyout in radial menu

**Files:**
- Modify: `frontend/src/canvas/drag.js` (import `Drum`, export `buildInstrumentPicker`, update `showRadialMenu`, `selectAndMenu`, `wireDrag` signature)
- Test: `frontend/tests/canvas/drag.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/canvas/drag.test.js` (it already runs under jsdom and imports from `drag.js`). Add `buildInstrumentPicker` to the existing import line near the top:

```js
import { clientToStage, snapToGrid, buildInstrumentPicker } from '../../src/canvas/drag.js';
```

Then append:

```js
describe('buildInstrumentPicker', () => {
    const instruments = ['1:a', '2:a', 'tarol'];

    it('renders one row per instrument with name text', () => {
        const menu = document.createElement('div');
        buildInstrumentPicker(menu, { current: '1:a', instruments, onSelect: () => {} });
        const rows = menu.querySelectorAll('.instrument-row');
        expect(rows.length).toBe(3);
        expect([...rows].map(r => r.querySelector('.instrument-name').textContent))
            .toEqual(['1:a', '2:a', 'tarol']);
    });

    it('marks the current instrument row with the current class', () => {
        const menu = document.createElement('div');
        buildInstrumentPicker(menu, { current: 'tarol', instruments, onSelect: () => {} });
        const current = menu.querySelectorAll('.instrument-row.current');
        expect(current.length).toBe(1);
        expect(current[0].querySelector('.instrument-name').textContent).toBe('tarol');
    });

    it('fires onSelect with the instrument name on row click', () => {
        const menu = document.createElement('div');
        const onSelect = vi.fn();
        buildInstrumentPicker(menu, { current: '1:a', instruments, onSelect });
        menu.querySelectorAll('.instrument-row')[2].click();
        expect(onSelect).toHaveBeenCalledWith('tarol');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/canvas/drag.test.js`
Expected: FAIL — `buildInstrumentPicker is not exported` / not a function.

- [ ] **Step 3: Add the import and `buildInstrumentPicker`**

In `frontend/src/canvas/drag.js`, change the lucide import (currently line 2):

```js
import { Hand, Drum } from 'lucide';
```

Add the exported helper just above `let _radialMenu = null;` (currently line 59):

```js
export function buildInstrumentPicker(menuEl, { current, instruments, onSelect }) {
    menuEl.replaceChildren();
    menuEl.classList.add('instrument-picker');
    for (const name of instruments) {
        const row = document.createElement('button');
        row.className = name === current ? 'instrument-row current' : 'instrument-row';
        row.title = name;
        const swatch = document.createElement('span');
        swatch.className = 'instrument-swatch';
        swatch.style.backgroundColor = instrumentColor(name);
        row.appendChild(swatch);
        const label = document.createElement('span');
        label.className = 'instrument-name';
        label.textContent = name;
        row.appendChild(label);
        row.addEventListener('click', () => onSelect(name));
        menuEl.appendChild(row);
    }
    return menuEl;
}
```

(`instrumentColor` is already imported at the top of `drag.js`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/canvas/drag.test.js`
Expected: PASS.

- [ ] **Step 5: Add the Drum button to `showRadialMenu` and thread params**

Replace the entire `showRadialMenu` function (currently lines 70-95) with:

```js
function showRadialMenu(userId, cx, cy, stageEl, onMestre, instruments, onChangeInstrument) {
    dismissRadialMenu();
    _radialMenu = document.createElement('div');
    _radialMenu.className = 'radial-menu';
    _radialMenu.style.left = `${cx}px`;
    _radialMenu.style.top  = `${cy}px`;

    const mestreBtn = document.createElement('button');
    mestreBtn.className = getMestres().has(String(userId)) ? 'radial-btn active' : 'radial-btn';
    mestreBtn.title = 'Mestre';
    mestreBtn.appendChild(createLucideIcon(Hand));
    mestreBtn.addEventListener('click', () => {
        dismissRadialMenu();
        clearSelectedIds();
        applySelectionVisual(stageEl);
        if (onMestre) onMestre({ userId });
    });
    _radialMenu.appendChild(mestreBtn);

    if (instruments && instruments.length && onChangeInstrument) {
        const instrBtn = document.createElement('button');
        instrBtn.className = 'radial-btn';
        instrBtn.title = 'Byt instrument';
        instrBtn.appendChild(createLucideIcon(Drum));
        instrBtn.addEventListener('click', () => {
            const dot = stageEl.querySelector(`.stage-dot[data-user-id="${userId}"]`);
            const current = dot ? dot.dataset.instrument : null;
            buildInstrumentPicker(_radialMenu, {
                current,
                instruments,
                onSelect: (instrument) => {
                    dismissRadialMenu();
                    onChangeInstrument({ userId, instrument });
                }
            });
        });
        _radialMenu.appendChild(instrBtn);
    }

    document.body.appendChild(_radialMenu);

    _radialOutsideHandler = (e) => {
        if (_radialMenu && _radialMenu.contains(e.target)) return;
        dismissRadialMenu();
    };
    setTimeout(() => document.addEventListener('pointerdown', _radialOutsideHandler), 0);
}
```

- [ ] **Step 6: Thread the params through `wireDrag` and `selectAndMenu`**

In the `wireDrag` destructured params (currently lines 97-100), add `instruments` and `onChangeInstrument`:

```js
export function wireDrag({ stageEl, sidebarEl, sidebarContentEl, getEvent, setDraggingId,
                          setDraggingPosition, setDraggingSidebarUserId,
                          onPlace, onMove, onMoveMany, onRemove, onMestre, onMestreMove,
                          onChangeInstrument, instruments, onError,
                          renderLocal }) {
```

In `selectAndMenu` (currently line 551), update the `showRadialMenu` call:

```js
        setTimeout(() => {
            showRadialMenu(userId, dr.left + dr.width / 2, dr.top, stageEl, onMestre, instruments, onChangeInstrument);
        }, 300);
```

- [ ] **Step 7: Run the full drag test file to confirm no regressions**

Run: `cd frontend && npx vitest run tests/canvas/drag.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/canvas/drag.js frontend/tests/canvas/drag.test.js
git commit -m "feat(planner): drum button + instrument flyout in radial menu"
```

---

## Task 7: Frontend — flyout styles

**Files:**
- Modify: `frontend/src/styles.css` (after the `.radial-btn` block, currently around lines 692-727)

- [ ] **Step 1: Add picker styles**

Append after the existing `.radial-btn` rules in `frontend/src/styles.css`:

```css
.radial-menu.instrument-picker {
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    max-height: 240px;
    overflow-y: auto;
    padding: 6px;
    transform: translate(-50%, calc(-100% - 8px));
}

.radial-menu.instrument-picker .instrument-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: #fff;
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.radial-menu.instrument-picker .instrument-row:hover {
    background: rgba(255, 255, 255, 0.12);
}

.radial-menu.instrument-picker .instrument-row.current .instrument-name {
    font-weight: 700;
}

.radial-menu.instrument-picker .instrument-swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex: 0 0 auto;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
}

.radial-menu.instrument-picker .instrument-name {
    white-space: nowrap;
}
```

Note: confirm the `.radial-menu` base rule's `transform` (check the existing block) — the picker overrides it above to keep the list anchored above the dot. If the base `.radial-menu` uses a different transform, match its X centering so the picker stays aligned.

- [ ] **Step 2: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds with no CSS errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles.css
git commit -m "style(planner): instrument picker flyout styles"
```

---

## Task 8: Frontend — wire `onChangeInstrument` in main.js

**Files:**
- Modify: `frontend/src/main.js` (import block lines 31-43; `wireDrag` call lines 476-540)

- [ ] **Step 1: Import the two dataSource functions**

In the `from './dataSource.js'` import block (currently lines 31-43), add `fetchInstruments` and `changeInstrument`:

```js
import {
    isDevMode,
    fetchConcerts,
    fetchState,
    fetchMembers,
    placeMember,
    moveMember,
    removeMember,
    setMestre,
    setMute,
    leaveVoice,
    shareLineupImage,
    fetchInstruments,
    changeInstrument,
} from './dataSource.js';
```

- [ ] **Step 2: Fetch the instrument list before wiring drag**

Immediately before the `wireDrag({` call (currently line 476), add:

```js
    let instruments = [];
    try {
        instruments = await fetchInstruments(_accessToken);
    } catch (err) {
        instruments = [];
    }
```

- [ ] **Step 3: Pass the params + add the callback**

In the `wireDrag({ ... })` options object, add `instruments` to the options and add the `onChangeInstrument` callback. Insert the callback right after the `onMestreMove` block (currently ends line 534), and add `instruments,` near the other top-level options (e.g. after `getEvent,` on line 480):

```js
        instruments,
```

```js
        onChangeInstrument: async ({ userId, instrument }) => {
            const entry = (getEvent().lineup || []).find(e => String(e.userId) === String(userId));
            if (!entry || entry.instrument === instrument) return;
            const prev = entry.instrument;
            entry.instrument = instrument;          // optimistic
            renderStage(stage, getEvent());
            try {
                const updated = await changeInstrument({ concertId, userId, instrument }, _accessToken);
                setEvent(updated);
                renderStage(stage, updated);
            } catch (err) {
                entry.instrument = prev;            // rollback
                renderStage(stage, getEvent());
                showTransientError('Kunde inte ändra instrument');
            }
        },
```

(`renderStage`, `setEvent`, `getEvent`, `showTransientError`, and `concertId` are all already in scope here — `onMestre` directly above uses them.)

- [ ] **Step 4: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/main.js
git commit -m "feat(planner): wire instrument-change callback into planner"
```

---

## Task 9: Full verification (both modes)

**Files:** none (verification only)

- [ ] **Step 1: Backend tests green**

Run: `node --test 'tests/**/*.test.js'`
Expected: all PASS.

- [ ] **Step 2: Frontend tests green**

Run: `cd frontend && npx vitest run`
Expected: all PASS.

- [ ] **Step 3: Dev-mode manual check**

Set `frontend/.env.development` → `VITE_DEV_MODE=true`, run `cd frontend && npm run dev`.
Verify: tap a placed dot → radial menu shows Hand + Drum. Click Drum → instrument list appears,
the dot's current instrument is bold. Click a different instrument → dot color + abbreviation
change, the person's name stays the same. Reload → in dev mode the change is in-memory only
(expected; persistence is exercised against the real server).

- [ ] **Step 4: Restore prod default**

Confirm `frontend/.env.development` is back to `VITE_DEV_MODE=false` before finishing
(CLAUDE.md: `false` is the intended committed state). Verify a prod build still compiles:
`cd frontend && npm run build`.

- [ ] **Step 5: Commit any leftover (e.g. reverted env)**

```bash
git add -A
git commit -m "chore: restore dev-mode flag default after verification" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** GET instruments (Task 1/3), POST change-instrument (Task 2/3), dataSource pair (Task 5), devData mirror (Task 4), Drum button + flyout with bold current (Task 6/7), live dot update via optimistic mutate + `renderStage` (Task 8), both-modes test (Task 9). All spec sections mapped.
- **Type/name consistency:** `createInstrumentsRoute`, `createChangeInstrumentRoute`, `getInstruments`, `changeInstrument` (dev), `fetchInstruments`/`changeInstrument` (dataSource), `buildInstrumentPicker({ current, instruments, onSelect })`, `onChangeInstrument({ userId, instrument })`, `instruments` array — names match across all tasks.
- **No stage.js edit:** intentional; `renderStage` already redraws from `entry.instrument`.
- **Error path:** change-instrument returns full updated event (matches move/place), so `setEvent(updated)` works the same as existing callbacks.
