# Lineup Planner M5 — Drag/Drop + Poll + Manual-Add (+ backend migrate-to-spec)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire drag-drop placement, 5 s polling, stale-badge in sidebar, trash-to-remove, and manual-add modal end-to-end against a backend that now stores lineup state on the event JSON per the design spec.

**Spec source:** `docs/superpowers/specs/2026-05-12-lineup-planner-design.md` §4 (data model), §5 (API surface + validation + clamping), §6 (drag handling, poll, stale, manual-add, mobile), §8 (M5 row).

**Architecture:** Backend writes lineup array onto the event JSON inside `lockUtils.withLock`-style serialization (via existing `lockfile` lib, locking the event file). State route returns the raw event JSON. Frontend drags via `interact.js`; drag motion is local-only, network only on drop. A `poll.js` loop re-fetches every 5 s when the tab is visible and merges the result into the store — skipping the entry currently being dragged.

**Tech stack:** Node 20, Express 4, `node:test`, Vite 5, Vitest 2, `@discord/embedded-app-sdk`, **new dep: `interactjs` ^1.10 (frontend)**.

**Backend ↔ spec migration:** The current `lineupStore` writes a flat `participants` map to `src/data/lineups/<id>.json`. That file is dropped in this plan; lineup state moves onto the event JSON as the `lineup` array per spec §4. `mergeRoster` is no longer needed.

---

## What is already implemented (M4 + M4.5)

- Boot: SDK handshake → `/api/token` → role gate → picker (`/api/concerts`) → click → planner.
- Picker view + back button (`frontend/src/picker.js`, `main.js`, `state.js` with `concerts` / `selectedConcertId` / `clearSelectedConcert`).
- Backend routes: `/api/token`, `/api/me`, `/api/concerts`, `/api/state/:concertId`, `/api/lineup/{place,move,remove}`, `/api/guild/members`. **But place/move/remove use the wrong (flat-participants) shape — they will be rewritten here.**
- Frontend `canvas/stage.js` already reads `event.lineup` with `position.x/y`, `instrument`, `displayName`, `manuallyAdded`, plus an `isStale()` helper. Spec-shaped. Reused unchanged.
- Frontend `sidebar/available.js` already reads `event.signups` + `event.lineup`. Reused; stale-badge added here.

---

## File Map

### Backend

| File | Op | Responsibility |
|------|----|---------------|
| `src/services/lineupStore.js` | Rewrite | Read/mutate event JSON's `lineup` array via `lockfile` on the event file. New API: `loadEvent(concertId)`, `mutateEvent(concertId, fn)`. |
| `tests/services/lineupStore.test.js` | Rewrite | Cover new API: lazy-create `lineup: []`, lock serialization, concurrent mutate. |
| `src/routes/api/state.js` | Rewrite | Return full event JSON (with lazy `lineup: []` baked in). Drop `mergeRoster`. |
| `tests/routes/state.test.js` | Rewrite | Cover new return shape. |
| `src/routes/api/lineup.js` | Rewrite | `place / move / remove` routes use spec body shape + validations (instrument, coord clamp, dup-check, manual-add path). |
| `tests/routes/lineup.test.js` | Rewrite | Cover validations + 409 dup + manual-add success + coord clamp. |
| `src/routes/api/guildMembers.js` | Rewrite | Accept `?q=`, return `[{id, displayName, hasHarmonian}]` max 25; uses `guildMember` service for role check. |
| `tests/routes/guildMembers.test.js` | Rewrite | Filter + cap + hasHarmonian flag. |
| `src/features/lineup.js` | Delete | `mergeRoster` no longer needed (state route returns raw event JSON). |
| `tests/features/lineup-merge.test.js` | Delete | Covers deleted helper. |
| `src/core/express.js` | Modify | Drop `mergeRoster`/`features/lineup` import. Inject `instrumentList` + `guildMember` into route factories. |
| `src/data/lineups/` | Delete | Obsolete dir (now empty). |

### Frontend

| File | Op | Responsibility |
|------|----|---------------|
| `frontend/package.json` | Modify | Add `interactjs` dep. |
| `frontend/src/canvas/drag.js` | Create | `wireDrag({ stage, sidebar, trash, getEvent, onPlace, onMove, onRemove, setDraggingId })`. Pointer-event drags via `interact.js`. |
| `frontend/tests/canvas/drag.test.js` | Create | Synthetic pointer-event tests (jsdom + interact). |
| `frontend/src/canvas/stage.js` | Modify | Add `data-instrument` to dots so drag.js can read it. No other behaviour change. |
| `frontend/src/sidebar/available.js` | Modify | Mark `data-instrument` + add stale badge (already on stage.js). |
| `frontend/tests/sidebar/available.test.js` | Modify | Cover stale-badge in sidebar. |
| `frontend/src/sidebar/manualAdd.js` | Create | Render manual-add modal: search box → guild members → instrument picker → `onPlace`. |
| `frontend/tests/sidebar/manualAdd.test.js` | Create | Search debounce, result render, instrument-picker flow. |
| `frontend/src/poll.js` | Create | `startPoll({ fetchState, intervalMs, getDraggingId, onUpdate })` + `stopPoll(handle)`. Visibility-aware. |
| `frontend/tests/poll.test.js` | Create | Tick under fake timers; visibility-pause; drag-skip merge. |
| `frontend/src/api.js` | Modify | Add `getWithQuery(path, params, token)`. |
| `frontend/tests/api.test.js` | Modify | Cover query-string encoding. |
| `frontend/src/main.js` | Modify | After `loadPlanner`: wire drag + manual-add + start poll; on `backToPicker`: stop poll. |
| `frontend/index.html` | Modify | Add `#trash` drop zone + `#manual-add-btn` + `#manual-add-modal`. |
| `frontend/src/styles.css` | Modify | Drop-zone, modal, stale-badge in sidebar, manual-add button styles. |

---

## Task ordering

Backend first (tasks 1–7) so the frontend has a real API to integrate against. Frontend tasks 8–15. Manual verification at the end.

---

## Task 1: Backend — rewrite `lineupStore` to operate on event JSON

**Files:** Rewrite `src/services/lineupStore.js`, `tests/services/lineupStore.test.js`.

`lineupStore` becomes a thin wrapper around event-file I/O with a `lockfile`-backed serializer. Lazy-creates `lineup: []` on first mutation.

- [ ] **Step 1: Replace `tests/services/lineupStore.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { createLineupStore } = require('../../src/services/lineupStore');

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lineupstore-test-'));
}

function writeEvent(dir, fileName, payload) {
    fs.writeFileSync(path.join(dir, fileName), JSON.stringify(payload, null, 2));
    return path.join(dir, fileName);
}

function findFile(dir, concertId) {
    return path.join(dir, fs.readdirSync(dir).find(f => f.endsWith(`_${concertId}.json`)));
}

test('loadEvent returns parsed event JSON', async () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'a_111.json', { id: '111', name: 'X', date: '08/03/26', signups: {} });
        const store = createLineupStore({ activeDir: dir });
        const ev = await store.loadEvent('111');
        assert.strictEqual(ev.id, '111');
        assert.strictEqual(ev.name, 'X');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('loadEvent returns null when event not found', async () => {
    const dir = makeTmpDir();
    try {
        const store = createLineupStore({ activeDir: dir });
        assert.strictEqual(await store.loadEvent('missing'), null);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('mutateEvent lazy-creates lineup array on first call', async () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'a_111.json', { id: '111', name: 'X', date: '08/03/26', signups: {} });
        const store = createLineupStore({ activeDir: dir });
        const result = await store.mutateEvent('111', ev => {
            assert.ok(Array.isArray(ev.lineup));
            assert.strictEqual(ev.lineup.length, 0);
            ev.lineup.push({ userId: 'u1', displayName: 'A', instrument: '1:a',
                position: { x: 10, y: 20 }, manuallyAdded: false, placedAt: 'now' });
            return ev;
        });
        assert.strictEqual(result.lineup.length, 1);
        const onDisk = JSON.parse(fs.readFileSync(findFile(dir, '111'), 'utf8'));
        assert.strictEqual(onDisk.lineup.length, 1);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('mutateEvent serializes concurrent writers (no lost updates)', async () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'a_111.json', { id: '111', name: 'X', date: '08/03/26', signups: {} });
        const store = createLineupStore({ activeDir: dir });
        const pushes = [];
        for (let i = 0; i < 5; i++) {
            pushes.push(store.mutateEvent('111', ev => {
                ev.lineup.push({ userId: `u${i}`, displayName: `U${i}`, instrument: '1:a',
                    position: { x: i, y: i }, manuallyAdded: false, placedAt: 'now' });
                return ev;
            }));
        }
        await Promise.all(pushes);
        const onDisk = JSON.parse(fs.readFileSync(findFile(dir, '111'), 'utf8'));
        assert.strictEqual(onDisk.lineup.length, 5);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('mutateEvent rejects when event not found', async () => {
    const dir = makeTmpDir();
    try {
        const store = createLineupStore({ activeDir: dir });
        await assert.rejects(
            () => store.mutateEvent('missing', ev => ev),
            /event_not_found/
        );
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
node --test 'tests/services/lineupStore.test.js'
```

Expected: API surface mismatch (no `loadEvent` / `mutateEvent`).

- [ ] **Step 3: Replace `src/services/lineupStore.js`**

```js
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const lockFile = require('lockfile');
const { dir_EventsActive } = require('../core/constants');

const lockAsync = promisify(lockFile.lock);
const unlockAsync = promisify(lockFile.unlock);

function createLineupStore({ activeDir = dir_EventsActive } = {}) {
    function findEventFile(concertId) {
        let files;
        try {
            files = fs.readdirSync(activeDir);
        } catch {
            return null;
        }
        const fileName = files.find(f => f.endsWith(`_${concertId}.json`));
        return fileName ? path.join(activeDir, fileName) : null;
    }

    async function loadEvent(concertId) {
        const file = findEventFile(concertId);
        if (!file) return null;
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.lineup)) parsed.lineup = [];
        return parsed;
    }

    async function mutateEvent(concertId, fn) {
        const file = findEventFile(concertId);
        if (!file) throw new Error('event_not_found');
        const lockPath = `${file}.lock`;

        await lockAsync(lockPath, { stale: 5 * 60 * 1000, retries: 50, retryWait: 50 });
        try {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!Array.isArray(parsed.lineup)) parsed.lineup = [];
            const patched = fn(parsed) || parsed;
            fs.writeFileSync(file, JSON.stringify(patched, null, 2));
            return patched;
        } finally {
            try { await unlockAsync(lockPath); } catch (_) { /* best effort */ }
        }
    }

    return { loadEvent, mutateEvent };
}

const lineupStore = createLineupStore();

module.exports = { createLineupStore, lineupStore };
```

- [ ] **Step 4: Run — confirm pass**

```bash
node --test 'tests/services/lineupStore.test.js'
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/lineupStore.js tests/services/lineupStore.test.js
git commit -m "refactor(lineupStore): operate on event JSON lineup array per spec §4"
```

---

## Task 2: Backend — rewrite `state` route, drop `mergeRoster`

**Files:** Rewrite `src/routes/api/state.js`, `tests/routes/state.test.js`. Delete `src/features/lineup.js`, `tests/features/lineup-merge.test.js`. Modify `src/core/express.js`.

State route now just returns whatever `loadEvent` produced (raw event JSON with lineup array).

- [ ] **Step 1: Replace `tests/routes/state.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const createStateRoute = require('../../src/routes/api/state');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

test('state: 200 returns full event JSON with lineup', async () => {
    const store = {
        async loadEvent(id) {
            if (id !== 'c1') return null;
            return { id: 'c1', name: 'Demo', date: '08/03/26', signups: { '1:a': [] }, lineup: [] };
        }
    };
    const handler = createStateRoute({ lineupStore: store });
    const req = { params: { concertId: 'c1' } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, {
        id: 'c1', name: 'Demo', date: '08/03/26', signups: { '1:a': [] }, lineup: []
    });
});

test('state: 404 when event not found', async () => {
    const store = { async loadEvent() { return null; } };
    const handler = createStateRoute({ lineupStore: store });
    const res = mockRes();
    await handler({ params: { concertId: 'gone' } }, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'event_not_found' });
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
node --test 'tests/routes/state.test.js'
```

Expected: fail (current route expects `getEventJSON`).

- [ ] **Step 3: Replace `src/routes/api/state.js`**

```js
function createStateRoute({ lineupStore }) {
    return async function stateRoute(req, res) {
        const event = await lineupStore.loadEvent(req.params.concertId);
        if (!event) return res.status(404).json({ error: 'event_not_found' });
        return res.json(event);
    };
}

module.exports = createStateRoute;
```

- [ ] **Step 4: Delete `mergeRoster` + its test**

```bash
git rm src/features/lineup.js tests/features/lineup-merge.test.js
```

- [ ] **Step 5: Edit `src/core/express.js`**

Remove the `getEventJSON` import (no longer used by state route) and update the state route wiring.

Diff in context:

```js
// Remove this line near the top:
const { getEventJSON } = require('../features/signup');
```

Keep `getEventJSON` only if other routes still use it — at this point Task 3 below also drops it. Re-add `lineupStore` injection only:

```js
app.get('/api/state/:concertId', authMiddleware,
    createStateRoute({ lineupStore }));
```

- [ ] **Step 6: Run state test + grep for stale refs**

```bash
node --test 'tests/routes/state.test.js'
grep -rn "mergeRoster\|features/lineup" src tests
```

Expected: state tests PASS. Grep returns no hits.

- [ ] **Step 7: Commit**

```bash
git add src/routes/api/state.js tests/routes/state.test.js src/core/express.js
git commit -m "refactor(api): state route returns raw event JSON; drop mergeRoster"
```

---

## Task 3: Backend — rewrite `lineup` routes (place/move/remove) per spec

**Files:** Rewrite `src/routes/api/lineup.js`, `tests/routes/lineup.test.js`. Modify `src/core/express.js`.

New bodies per spec §5:
- `POST /api/lineup/place` — `{ concertId, userId, displayName, instrument, x, y, manuallyAdded? }`
- `POST /api/lineup/move`  — `{ concertId, userId, x, y }`
- `POST /api/lineup/remove` — `{ concertId, userId }`

Validations:
- `instrument` must be a key in `instrumentList.json`.
- `x` clamped to `0..1000`, `y` clamped to `0..600` (do **not** reject; clamp silently).
- Place, non-manual: `userId` must appear in `event.signups[instrument]` with `response ∈ {ja, kanske}`.
- Place, manual: `userId` must be a current guild member (verified by injected `isGuildMember(userId)`; we already cache the member list in the guildMembers route, but here we keep injection simple).
- Already in `lineup` → place returns `409`.
- Move/remove: user must exist in `lineup` → `404` if not.

- [ ] **Step 1: Replace `tests/routes/lineup.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const {
    createPlaceRoute,
    createMoveRoute,
    createRemoveRoute
} = require('../../src/routes/api/lineup');

const INSTRUMENT_LIST = { '1:a': [], '2:a': [], 'tarol': [] };

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

function makeStore(event) {
    let current = JSON.parse(JSON.stringify(event));
    return {
        async loadEvent() { return JSON.parse(JSON.stringify(current)); },
        async mutateEvent(_id, fn) {
            const next = JSON.parse(JSON.stringify(current));
            const out = fn(next) || next;
            current = out;
            return out;
        },
        peek() { return current; }
    };
}

const baseEvent = {
    id: 'c1', name: 'Demo', date: '08/03/26',
    signups: {
        '1:a': [{ name: 'A', id: 'u1', response: 'ja', note: '' }],
        '2:a': [{ name: 'B', id: 'u2', response: 'nej', note: '' }]
    },
    lineup: []
};

// ---------- PLACE ----------

test('place: 200 + appends entry with placedAt', async () => {
    const store = makeStore(baseEvent);
    const handler = createPlaceRoute({
        lineupStore: store,
        instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true,
        now: () => '2026-05-13T12:00:00.000Z'
    });
    const req = { user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'u1', displayName: 'A', instrument: '1:a', x: 100, y: 200
    } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.lineup, [{
        userId: 'u1', displayName: 'A', instrument: '1:a',
        position: { x: 100, y: 200 }, manuallyAdded: false,
        placedAt: '2026-05-13T12:00:00.000Z'
    }]);
});

test('place: clamps coords to 0..1000 / 0..600', async () => {
    const store = makeStore(baseEvent);
    const handler = createPlaceRoute({
        lineupStore: store, instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true, now: () => 't'
    });
    const req = { user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'u1', displayName: 'A', instrument: '1:a', x: 5000, y: -50
    } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.body.lineup[0].position.x, 1000);
    assert.strictEqual(res.body.lineup[0].position.y, 0);
});

test('place: 400 invalid_body when x not number', async () => {
    const handler = createPlaceRoute({
        lineupStore: makeStore(baseEvent), instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true, now: () => 't'
    });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'u1', displayName: 'A', instrument: '1:a', x: 'no', y: 0
    } }, res);
    assert.strictEqual(res.statusCode, 400);
});

test('place: 400 unknown instrument', async () => {
    const handler = createPlaceRoute({
        lineupStore: makeStore(baseEvent), instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true, now: () => 't'
    });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'u1', displayName: 'A', instrument: 'bogus', x: 1, y: 1
    } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'invalid_instrument' });
});

test('place: 404 event_not_found', async () => {
    const store = { async loadEvent() { return null; }, async mutateEvent() { throw new Error('event_not_found'); } };
    const handler = createPlaceRoute({
        lineupStore: store, instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true, now: () => 't'
    });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: {
        concertId: 'gone', userId: 'u1', displayName: 'A', instrument: '1:a', x: 0, y: 0
    } }, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'event_not_found' });
});

test('place: 404 user_not_in_signups for non-manual', async () => {
    const handler = createPlaceRoute({
        lineupStore: makeStore(baseEvent), instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true, now: () => 't'
    });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'u2', displayName: 'B', instrument: '2:a', x: 0, y: 0
    } }, res);
    // u2 is signed up for 2:a but with response 'nej'
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'user_not_in_signups' });
});

test('place: manual-add succeeds even when not in signups', async () => {
    const store = makeStore(baseEvent);
    const handler = createPlaceRoute({
        lineupStore: store, instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true, now: () => 't'
    });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'guest1', displayName: 'Gäst', instrument: 'tarol',
        x: 50, y: 50, manuallyAdded: true
    } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.lineup[0].manuallyAdded, true);
});

test('place: manual-add 400 user_not_in_guild', async () => {
    const handler = createPlaceRoute({
        lineupStore: makeStore(baseEvent), instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => false, now: () => 't'
    });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'ghost', displayName: 'G', instrument: '1:a',
        x: 0, y: 0, manuallyAdded: true
    } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'user_not_in_guild' });
});

test('place: 409 when user already in lineup', async () => {
    const pre = { ...baseEvent, lineup: [{
        userId: 'u1', displayName: 'A', instrument: '1:a',
        position: { x: 0, y: 0 }, manuallyAdded: false, placedAt: 't0'
    }]};
    const handler = createPlaceRoute({
        lineupStore: makeStore(pre), instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true, now: () => 't'
    });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'u1', displayName: 'A', instrument: '1:a', x: 10, y: 10
    } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.deepStrictEqual(res.body, { error: 'already_placed' });
});

// ---------- MOVE ----------

test('move: 200 updates position + clamps', async () => {
    const pre = { ...baseEvent, lineup: [{
        userId: 'u1', displayName: 'A', instrument: '1:a',
        position: { x: 0, y: 0 }, manuallyAdded: false, placedAt: 't0'
    }]};
    const store = makeStore(pre);
    const handler = createMoveRoute({ lineupStore: store });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1', x: 9999, y: 999 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.lineup[0].position, { x: 1000, y: 600 });
});

test('move: 400 invalid_body', async () => {
    const handler = createMoveRoute({ lineupStore: makeStore(baseEvent) });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1', x: 'no', y: 0 } }, res);
    assert.strictEqual(res.statusCode, 400);
});

test('move: 404 user_not_placed', async () => {
    const handler = createMoveRoute({ lineupStore: makeStore(baseEvent) });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1', x: 5, y: 5 } }, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'user_not_placed' });
});

// ---------- REMOVE ----------

test('remove: 200 drops entry; idempotent for missing user', async () => {
    const pre = { ...baseEvent, lineup: [{
        userId: 'u1', displayName: 'A', instrument: '1:a',
        position: { x: 0, y: 0 }, manuallyAdded: false, placedAt: 't0'
    }]};
    const store = makeStore(pre);
    const handler = createRemoveRoute({ lineupStore: store });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.lineup.length, 0);

    const res2 = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1' } }, res2);
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.body.lineup.length, 0);
});

test('remove: 400 invalid_body when missing userId', async () => {
    const handler = createRemoveRoute({ lineupStore: makeStore(baseEvent) });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1' } }, res);
    assert.strictEqual(res.statusCode, 400);
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
node --test 'tests/routes/lineup.test.js'
```

Expected: fail across the board (signatures changed).

- [ ] **Step 3: Replace `src/routes/api/lineup.js`**

```js
const STAGE_W = 1000;
const STAGE_H = 600;

function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function isInSignups(event, userId, instrument) {
    const list = event.signups?.[instrument];
    if (!Array.isArray(list)) return false;
    return list.some(s => s.id === userId && (s.response === 'ja' || s.response === 'kanske'));
}

function createPlaceRoute({ lineupStore, instrumentList, isGuildMember, now = () => new Date().toISOString() }) {
    return async function placeRoute(req, res) {
        const { concertId, userId, displayName, instrument, x, y, manuallyAdded = false } = req.body || {};
        if (!concertId || !userId || !displayName || !instrument
            || !isFiniteNumber(x) || !isFiniteNumber(y)) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        if (!Object.prototype.hasOwnProperty.call(instrumentList, instrument)) {
            return res.status(400).json({ error: 'invalid_instrument' });
        }

        const event = await lineupStore.loadEvent(concertId);
        if (!event) return res.status(404).json({ error: 'event_not_found' });

        if (event.lineup.some(e => e.userId === userId)) {
            return res.status(409).json({ error: 'already_placed' });
        }
        if (manuallyAdded) {
            const ok = await isGuildMember(userId);
            if (!ok) return res.status(400).json({ error: 'user_not_in_guild' });
        } else {
            if (!isInSignups(event, userId, instrument)) {
                return res.status(404).json({ error: 'user_not_in_signups' });
            }
        }

        const entry = {
            userId,
            displayName,
            instrument,
            position: { x: clamp(x, 0, STAGE_W), y: clamp(y, 0, STAGE_H) },
            manuallyAdded: Boolean(manuallyAdded),
            placedAt: now()
        };

        const updated = await lineupStore.mutateEvent(concertId, ev => {
            ev.lineup.push(entry);
            return ev;
        });
        return res.json(updated);
    };
}

function createMoveRoute({ lineupStore }) {
    return async function moveRoute(req, res) {
        const { concertId, userId, x, y } = req.body || {};
        if (!concertId || !userId || !isFiniteNumber(x) || !isFiniteNumber(y)) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        const event = await lineupStore.loadEvent(concertId);
        if (!event) return res.status(404).json({ error: 'event_not_found' });
        if (!event.lineup.some(e => e.userId === userId)) {
            return res.status(404).json({ error: 'user_not_placed' });
        }
        const updated = await lineupStore.mutateEvent(concertId, ev => {
            for (const entry of ev.lineup) {
                if (entry.userId === userId) {
                    entry.position = { x: clamp(x, 0, STAGE_W), y: clamp(y, 0, STAGE_H) };
                    break;
                }
            }
            return ev;
        });
        return res.json(updated);
    };
}

function createRemoveRoute({ lineupStore }) {
    return async function removeRoute(req, res) {
        const { concertId, userId } = req.body || {};
        if (!concertId || !userId) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        const event = await lineupStore.loadEvent(concertId);
        if (!event) return res.status(404).json({ error: 'event_not_found' });
        const updated = await lineupStore.mutateEvent(concertId, ev => {
            ev.lineup = ev.lineup.filter(e => e.userId !== userId);
            return ev;
        });
        return res.json(updated);
    };
}

module.exports = { createPlaceRoute, createMoveRoute, createRemoveRoute };
```

- [ ] **Step 4: Wire in `src/core/express.js`**

Add imports near the others:

```js
const instrumentList = require('../data/instrumentList.json');
```

Update route registrations:

```js
app.post('/api/lineup/place', authMiddleware, lineupLimiter,
    createPlaceRoute({
        lineupStore,
        instrumentList,
        isGuildMember: (userId) => guildMember.exists(userId)
    }));
app.post('/api/lineup/move', authMiddleware, lineupLimiter,
    createMoveRoute({ lineupStore }));
app.post('/api/lineup/remove', authMiddleware, lineupLimiter,
    createRemoveRoute({ lineupStore }));
```

`guildMember.exists` may not exist yet — check `src/services/guildMember.js`. If only `getMember(userId)` exists, use `(userId) => guildMember.getMember(userId).then(m => m.found)`.

Use whichever spelling fits the service (verify by reading the file). If you must add `exists`, do it as a tiny additional method on the service in this same step.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: green. If `getEventJSON` is still imported anywhere in express.js for the old place/move/remove signatures, delete that import.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api/lineup.js tests/routes/lineup.test.js src/core/express.js
git commit -m "feat(api): lineup place/move/remove operate on event.lineup with full spec validation"
```

---

## Task 4: Backend — rewrite `guildMembers` route with `?q=` filter

**Files:** Rewrite `src/routes/api/guildMembers.js`, `tests/routes/guildMembers.test.js`. Adjust wiring in `src/core/express.js`.

Spec §5: returns up to 25 `{ id, displayName, hasHarmonian }` filtered by case-insensitive substring on `displayName`. Used by manual-add modal.

- [ ] **Step 1: Replace `tests/routes/guildMembers.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const createGuildMembersRoute = require('../../src/routes/api/guildMembers');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

function makeClient(members) {
    return {
        guilds: {
            cache: {
                get: () => ({
                    members: {
                        async fetch() {
                            return {
                                values: () => members
                            };
                        }
                    },
                    roles: { /* unused */ }
                })
            }
        }
    };
}

function member(id, name, roleIds = []) {
    return {
        id, displayName: name,
        roles: { cache: { has: (r) => roleIds.includes(r) } }
    };
}

test('returns max 25 results filtered by q (case-insensitive)', async () => {
    const all = [];
    for (let i = 0; i < 40; i++) all.push(member(`u${i}`, `Anna${i}`));
    all.push(member('zz', 'Zelda'));
    const handler = createGuildMembersRoute({
        client: makeClient(all), guildId: 'g', harmonianRoleId: 'role-h'
    });
    const res = mockRes();
    await handler({ query: { q: 'anna' } }, res);
    assert.strictEqual(res.body.length, 25);
    for (const m of res.body) assert.match(m.displayName, /^Anna/);
});

test('hasHarmonian reflects role membership', async () => {
    const handler = createGuildMembersRoute({
        client: makeClient([
            member('a', 'Alice', ['role-h']),
            member('b', 'Bob')
        ]),
        guildId: 'g', harmonianRoleId: 'role-h'
    });
    const res = mockRes();
    await handler({ query: { q: '' } }, res);
    const byId = Object.fromEntries(res.body.map(m => [m.id, m]));
    assert.strictEqual(byId.a.hasHarmonian, true);
    assert.strictEqual(byId.b.hasHarmonian, false);
});

test('no q returns up to 25', async () => {
    const all = [];
    for (let i = 0; i < 30; i++) all.push(member(`u${i}`, `Person${i}`));
    const handler = createGuildMembersRoute({
        client: makeClient(all), guildId: 'g', harmonianRoleId: 'role-h'
    });
    const res = mockRes();
    await handler({ query: {} }, res);
    assert.strictEqual(res.body.length, 25);
});

test('returns 500 on fetch failure', async () => {
    const client = { guilds: { cache: { get: () => ({ members: { fetch: () => { throw new Error('boom'); } } }) } } };
    const handler = createGuildMembersRoute({
        client, guildId: 'g', harmonianRoleId: 'role-h'
    });
    const res = mockRes();
    await handler({ query: { q: 'x' } }, res);
    assert.strictEqual(res.statusCode, 500);
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
node --test 'tests/routes/guildMembers.test.js'
```

- [ ] **Step 3: Replace `src/routes/api/guildMembers.js`**

```js
function createGuildMembersRoute({ client, guildId, harmonianRoleId, ttlMs = 60_000, now = Date.now }) {
    let cache = null;

    async function loadAll() {
        if (cache && now() - cache.at < ttlMs) return cache.members;
        const guild = client.guilds.cache.get(guildId);
        const collection = await guild.members.fetch();
        const members = Array.from(collection.values()).map(m => ({
            id: m.id,
            displayName: m.displayName,
            hasHarmonian: m.roles.cache.has(harmonianRoleId)
        }));
        cache = { at: now(), members };
        return members;
    }

    return async function guildMembersRoute(req, res) {
        let members;
        try {
            members = await loadAll();
        } catch {
            return res.status(500).json({ error: 'guild_fetch_failed' });
        }
        const q = String(req.query?.q ?? '').trim().toLowerCase();
        const filtered = q
            ? members.filter(m => m.displayName.toLowerCase().includes(q))
            : members;
        return res.json(filtered.slice(0, 25));
    };
}

module.exports = createGuildMembersRoute;
```

- [ ] **Step 4: Update wiring in `src/core/express.js`**

```js
app.get('/api/guild/members', authMiddleware,
    createGuildMembersRoute({
        client,
        guildId: config.guildId,
        harmonianRoleId: config.harmonianRoleId
    }));
```

- [ ] **Step 5: Frontend `getMembers` shape change**

The route used to return `{ members: [...] }`. It now returns the array directly. No frontend consumer exists yet (manual-add modal in Task 13 uses the new shape).

- [ ] **Step 6: Run all backend tests**

```bash
npm test
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/routes/api/guildMembers.js tests/routes/guildMembers.test.js src/core/express.js
git commit -m "feat(api): /api/guild/members supports ?q= filter, returns hasHarmonian, cap 25"
```

---

## Task 5: Backend — sweep stale references + delete obsolete data dir

**Files:** Modify `src/core/express.js`. Delete `src/data/lineups/` if empty.

- [ ] **Step 1: Grep for stale references**

```bash
grep -rn "mergeRoster\|features/lineup\|getEventJSON.*lineupStore\|participants\b" src/routes src/core src/services
```

Expected: no hits in route/service files (the legacy `participants` term is fine inside Discord-bot feature files unrelated to lineup).

- [ ] **Step 2: Remove the obsolete lineups data dir**

```bash
ls src/data/lineups
rmdir src/data/lineups
```

If anything is in there (it should be empty per earlier scan), delete the files first only after confirming with the user.

- [ ] **Step 3: Run full backend suite**

```bash
npm test
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add -A src/core src/data
git commit -m "chore: drop obsolete src/data/lineups/ and stale imports"
```

---

## Task 6: Backend — `guildMember.exists()` helper (if needed for place route)

**Files:** Modify `src/services/guildMember.js`, `tests/services/guildMember.test.js` (or create the test if missing).

If the `place` route in Task 3 already works via `getMember(userId).then(m => m.found)`, **skip this task entirely**. Otherwise add a tiny method.

- [ ] **Step 1: Read current service**

```bash
cat src/services/guildMember.js
```

If `exists` already exists or `getMember` returns a `{found}` shape that the route can use, mark this task complete and move on.

- [ ] **Step 2 (if adding): write failing test**

```js
test('exists returns true when getMember reports found', async () => {
    const svc = createGuildMemberService({
        client: { guilds: { cache: { get: () => ({ members: { fetch: async () => ({ id: 'u1' }) } }) } } },
        guildId: 'g', harmonianRoleId: 'r',
        cache: { get: () => undefined, set: () => {} }
    });
    assert.strictEqual(await svc.exists('u1'), true);
});
```

- [ ] **Step 3 (if adding): implement**

```js
async function exists(userId) {
    const m = await getMember(userId);
    return m.found;
}
return { getMember, exists };
```

- [ ] **Step 4: Commit (only if changes)**

```bash
git add src/services/guildMember.js tests/services/guildMember.test.js
git commit -m "feat(guildMember): add exists() helper for manual-add validation"
```

---

## Task 7: Backend — manual smoke against a real event

**Goal:** End-to-end curl against a running local server, confirm event JSON gets `lineup` appended.

- [ ] **Step 1: Start backend**

```bash
npm start
```

Expected: `Express listening on 127.0.0.1:3000`.

- [ ] **Step 2: Get a token (use the existing dev OAuth flow)**

You should already have a debugging recipe from M1. Capture an access token into `$TOKEN`.

- [ ] **Step 3: Pick an active event**

```bash
ls src/events/active/
# Note one concertId, e.g. 278194333
```

- [ ] **Step 4: Place**

Use a userId that appears in that file under instrument `1:a` (or whichever you can confirm) with `response: 'ja'`.

```bash
curl -s -X POST http://127.0.0.1:3000/api/lineup/place \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"concertId":"278194333","userId":"<u>","displayName":"<n>","instrument":"1:a","x":100,"y":100}'
```

Expected: `200` with updated `lineup`.

- [ ] **Step 5: Confirm disk write**

```bash
jq '.lineup' "$(ls src/events/active/*_278194333.json)"
```

Expected: array contains one entry with `placedAt`.

- [ ] **Step 6: Move + remove**

```bash
curl -s -X POST .../api/lineup/move   -d '{"concertId":"278194333","userId":"<u>","x":250,"y":300}' ...
curl -s -X POST .../api/lineup/remove -d '{"concertId":"278194333","userId":"<u>"}' ...
```

Expected: `position` updates, then entry disappears.

- [ ] **Step 7: Done — no commit**

(Pure verification step.) If anything fails, drop back into tasks 1–6 and fix before continuing.

---

## Task 8: Frontend — install `interactjs` + extend `api.js`

**Files:** Modify `frontend/package.json`. Modify `frontend/src/api.js`, `frontend/tests/api.test.js`.

- [ ] **Step 1: Install**

```bash
cd frontend
npm install interactjs@^1.10.27
```

This pins a 1.10.x release. Verify the lockfile updated.

- [ ] **Step 2: Add failing `getWithQuery` test**

Append to `frontend/tests/api.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { getWithQuery } from '../src/api.js';

describe('getWithQuery', () => {
    it('encodes params as query string', async () => {
        const fetchFn = vi.fn(async () => ({ ok: true, json: async () => [] }));
        await getWithQuery('/api/guild/members', { q: 'Anna & co' }, 'tok', fetchFn);
        expect(fetchFn).toHaveBeenCalledWith(
            '/api/guild/members?q=Anna+%26+co',
            { headers: { 'Authorization': 'Bearer tok' } }
        );
    });

    it('omits ? when no params', async () => {
        const fetchFn = vi.fn(async () => ({ ok: true, json: async () => [] }));
        await getWithQuery('/api/guild/members', {}, 'tok', fetchFn);
        expect(fetchFn.mock.calls[0][0]).toBe('/api/guild/members');
    });
});
```

- [ ] **Step 3: Run — confirm fail**

```bash
npm test -- tests/api.test.js
```

- [ ] **Step 4: Add `getWithQuery` to `frontend/src/api.js`**

```js
export async function getWithQuery(path, params, token, fetchFn = fetch) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
        if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
    }
    const qs = usp.toString();
    const url = qs ? `${path}?${qs}` : path;
    const res = await fetchFn(url, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleResponse(res);
}
```

- [ ] **Step 5: Run — confirm pass**

```bash
npm test -- tests/api.test.js
```

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/api.js frontend/tests/api.test.js
git commit -m "feat(frontend): add interactjs + getWithQuery helper"
```

---

## Task 9: Frontend — `poll.js`

**Files:** Create `frontend/src/poll.js`, `frontend/tests/poll.test.js`.

API:
```js
const handle = startPoll({
    fetchState,        // async () => event JSON
    intervalMs,        // default 5000
    getDraggingId,     // () => null | userId — that user's position is preserved from the previous event
    onUpdate,          // (event) => void
    onError,           // optional (err) => void
    visibilityRef,     // optional { hidden: bool } — defaults to document
});
stopPoll(handle);
```

Drag-skip merge: if `getDraggingId()` returns a userId that exists in both the previous and the next event lineup, the new event keeps the **previous** entry's `position` for that user (so a remote update doesn't yank the dot out from under the user's finger).

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/poll.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startPoll, stopPoll } from '../src/poll.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function eventWith(lineup) {
    return { id: 'c1', name: 'X', date: 'd', signups: {}, lineup };
}

describe('startPoll', () => {
    it('calls fetchState on each interval and forwards to onUpdate', async () => {
        const events = [eventWith([]), eventWith([{ userId: 'u1', position: { x: 1, y: 1 } }])];
        let i = 0;
        const fetchState = vi.fn(async () => events[Math.min(i++, events.length - 1)]);
        const onUpdate = vi.fn();
        const handle = startPoll({ fetchState, intervalMs: 1000, getDraggingId: () => null, onUpdate });

        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(1000);

        expect(fetchState).toHaveBeenCalledTimes(2);
        expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ lineup: [{ userId: 'u1', position: { x: 1, y: 1 } }] }));
        stopPoll(handle);
    });

    it('skips fetch when visibilityRef.hidden is true', async () => {
        const fetchState = vi.fn(async () => eventWith([]));
        const visibilityRef = { hidden: true };
        const handle = startPoll({ fetchState, intervalMs: 500, getDraggingId: () => null, onUpdate: () => {}, visibilityRef });
        await vi.advanceTimersByTimeAsync(1500);
        expect(fetchState).toHaveBeenCalledTimes(0);
        stopPoll(handle);
    });

    it('preserves dragging user position from prior event', async () => {
        const prev = eventWith([{ userId: 'me', position: { x: 100, y: 100 } }, { userId: 'other', position: { x: 0, y: 0 } }]);
        const next = eventWith([{ userId: 'me', position: { x: 999, y: 999 } }, { userId: 'other', position: { x: 50, y: 50 } }]);
        const calls = [prev, next];
        let i = 0;
        const fetchState = vi.fn(async () => calls[Math.min(i++, calls.length - 1)]);
        const updates = [];
        const handle = startPoll({
            fetchState, intervalMs: 100,
            getDraggingId: () => 'me',
            onUpdate: (ev) => updates.push(ev)
        });
        await vi.advanceTimersByTimeAsync(100); // first tick → publishes prev
        await vi.advanceTimersByTimeAsync(100); // second tick → publishes next with 'me' position preserved from prev
        expect(updates).toHaveLength(2);
        const me = updates[1].lineup.find(e => e.userId === 'me');
        const other = updates[1].lineup.find(e => e.userId === 'other');
        expect(me.position).toEqual({ x: 100, y: 100 });
        expect(other.position).toEqual({ x: 50, y: 50 });
        stopPoll(handle);
    });

    it('calls onError when fetch rejects and continues polling', async () => {
        let i = 0;
        const fetchState = vi.fn(async () => {
            if (i++ === 0) throw new Error('boom');
            return eventWith([]);
        });
        const onError = vi.fn();
        const handle = startPoll({ fetchState, intervalMs: 100, getDraggingId: () => null, onUpdate: () => {}, onError });
        await vi.advanceTimersByTimeAsync(100);
        await vi.advanceTimersByTimeAsync(100);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(fetchState).toHaveBeenCalledTimes(2);
        stopPoll(handle);
    });
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
cd frontend
npm test -- tests/poll.test.js
```

- [ ] **Step 3: Implement `frontend/src/poll.js`**

```js
const DEFAULT_INTERVAL_MS = 5000;

export function startPoll({
    fetchState,
    intervalMs = DEFAULT_INTERVAL_MS,
    getDraggingId,
    onUpdate,
    onError,
    visibilityRef = (typeof document !== 'undefined' ? document : { hidden: false })
}) {
    let lastEvent = null;
    let stopped = false;

    async function tick() {
        if (stopped) return;
        if (visibilityRef.hidden) return;
        try {
            const next = await fetchState();
            if (stopped) return;
            const merged = mergeDraggingPosition(lastEvent, next, getDraggingId());
            lastEvent = merged;
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

function mergeDraggingPosition(prev, next, draggingId) {
    if (!draggingId || !prev || !next || !Array.isArray(next.lineup)) return next;
    const prevEntry = (prev.lineup || []).find(e => e.userId === draggingId);
    if (!prevEntry) return next;
    return {
        ...next,
        lineup: next.lineup.map(e => e.userId === draggingId ? { ...e, position: prevEntry.position } : e)
    };
}
```

- [ ] **Step 4: Run — confirm pass**

```bash
npm test -- tests/poll.test.js
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/poll.js frontend/tests/poll.test.js
git commit -m "feat(frontend): poll loop with visibility-pause and drag-aware merge"
```

---

## Task 10: Frontend — stale-badge in `sidebar/available.js`

**Files:** Modify `frontend/src/sidebar/available.js`, `frontend/tests/sidebar/available.test.js`.

A row in the sidebar represents an unplaced signed-up member. Stale only matters for placed entries (canvas) — but `available.js` rows are by definition unplaced. The spec calls out "placed-member representation in the sidebar" stale badge. In the current UI, the sidebar shows only available (unplaced) members, so the stale-badge requirement applies to the canvas only.

**Decision:** keep the sidebar unchanged for stale-badge purposes — only add `data-instrument` so drag.js can read the source instrument on drag-start. No new badge logic in this task.

- [ ] **Step 1: Read current `available.js`**

```bash
cat frontend/src/sidebar/available.js
```

Confirm rows already set `data-instrument`. (They do, per current code.) **Nothing to change.**

- [ ] **Step 2: Mark task done**

No commit.

---

## Task 11: Frontend — `canvas/stage.js` exposes data-instrument

**Files:** Modify `frontend/src/canvas/stage.js`.

Already sets `dataset.userId`. Add `dataset.instrument` for drag handlers.

- [ ] **Step 1: Edit `frontend/src/canvas/stage.js`**

Inside the loop body, after the existing `dot.dataset.userId = entry.userId;` line, add:

```js
dot.dataset.instrument = entry.instrument;
dot.dataset.displayName = entry.displayName;
```

- [ ] **Step 2: Run stage tests**

```bash
cd frontend
npm test -- tests/canvas/stage.test.js
```

Expected: still green. If a test asserts on attribute-set count, adjust the test minimally.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/canvas/stage.js
git commit -m "feat(frontend): expose instrument + displayName on stage dots for drag handlers"
```

---

## Task 12: Frontend — `canvas/drag.js` (interact.js bindings)

**Files:** Create `frontend/src/canvas/drag.js`, `frontend/tests/canvas/drag.test.js`.

API:
```js
wireDrag({
    stageEl,          // #stage
    sidebarEl,        // #sidebar
    trashEl,          // #trash
    getEvent,         // () => current event in store
    setDraggingId,    // (id|null) => void
    onPlace,          // async ({ userId, displayName, instrument, x, y, manuallyAdded }) => void
    onMove,           // async ({ userId, x, y }) => void
    onRemove,         // async ({ userId }) => void
    onError,          // (err) => void
});
```

Logical coordinate model:
- Stage is rendered with `position: relative`, fixed CSS aspect, and absolutely-positioned dots using `%` from `STAGE_W=1000` × `STAGE_H=600`.
- During drag of an existing dot: update `transform: translate3d(dx,dy,0)` locally; on drop, compute new logical x/y from cursor position relative to stage bounds and POST move.
- During drag of a sidebar row: clone the row visually; on drop inside stage, POST place; on drop outside, drop is no-op.
- During drag of an existing dot into trash: POST remove.

interact.js gives us `dropzone` events; we use the simple model: dropzones are `#stage` and `#trash`; draggables are `.available-row` and `.stage-dot`.

- [ ] **Step 1: Write failing tests**

Pointer-event drags in jsdom are awkward; we test the **pure helpers** here (coord conversion + click-driven place fallback for tests). The integration is verified manually in Task 16.

Create `frontend/tests/canvas/drag.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { clientToStage } from '../../src/canvas/drag.js';

describe('clientToStage', () => {
    it('converts client coords into stage logical coords', () => {
        const rect = { left: 100, top: 50, width: 500, height: 300 };
        // Cursor at (350, 200) on screen → stage offset (250, 150) → logical (500, 300)
        expect(clientToStage(rect, 350, 200)).toEqual({ x: 500, y: 300 });
    });

    it('clamps inside 0..1000 / 0..600 (route also clamps, but UI should not jitter)', () => {
        const rect = { left: 0, top: 0, width: 1000, height: 600 };
        expect(clientToStage(rect, -50, -50)).toEqual({ x: 0, y: 0 });
        expect(clientToStage(rect, 9999, 9999)).toEqual({ x: 1000, y: 600 });
    });
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
cd frontend
npm test -- tests/canvas/drag.test.js
```

- [ ] **Step 3: Create `frontend/src/canvas/drag.js`**

```js
import interact from 'interactjs';
import { STAGE_W, STAGE_H } from './stage.js';

export function clientToStage(rect, clientX, clientY) {
    const offX = clientX - rect.left;
    const offY = clientY - rect.top;
    const x = Math.round((offX / rect.width) * STAGE_W);
    const y = Math.round((offY / rect.height) * STAGE_H);
    return {
        x: Math.max(0, Math.min(STAGE_W, x)),
        y: Math.max(0, Math.min(STAGE_H, y))
    };
}

export function wireDrag({ stageEl, sidebarEl, trashEl, getEvent, setDraggingId,
                          onPlace, onMove, onRemove, onError }) {
    // ---- Drag a placed dot inside the stage ----
    interact('.stage-dot', { context: stageEl }).draggable({
        listeners: {
            start(evt) {
                const userId = evt.target.dataset.userId;
                setDraggingId(userId);
                evt.target.dataset.dragX = 0;
                evt.target.dataset.dragY = 0;
            },
            move(evt) {
                const x = (parseFloat(evt.target.dataset.dragX) || 0) + evt.dx;
                const y = (parseFloat(evt.target.dataset.dragY) || 0) + evt.dy;
                evt.target.dataset.dragX = x;
                evt.target.dataset.dragY = y;
                evt.target.style.transform = `translate(${x}px, ${y}px)`;
            },
            async end(evt) {
                const userId = evt.target.dataset.userId;
                const droppedOnTrash = evt.relatedTarget === trashEl;
                evt.target.style.transform = '';
                evt.target.dataset.dragX = 0;
                evt.target.dataset.dragY = 0;
                try {
                    if (droppedOnTrash) {
                        await onRemove({ userId });
                    } else {
                        const rect = stageEl.getBoundingClientRect();
                        const { x, y } = clientToStage(rect, evt.client.x, evt.client.y);
                        await onMove({ userId, x, y });
                    }
                } catch (err) {
                    if (onError) onError(err);
                } finally {
                    setDraggingId(null);
                }
            }
        }
    });

    // ---- Drag a sidebar row onto the stage ----
    interact('.available-row', { context: sidebarEl }).draggable({
        listeners: {
            start(evt) {
                evt.target.classList.add('dragging');
            },
            move(evt) {
                const x = (parseFloat(evt.target.dataset.dragX) || 0) + evt.dx;
                const y = (parseFloat(evt.target.dataset.dragY) || 0) + evt.dy;
                evt.target.dataset.dragX = x;
                evt.target.dataset.dragY = y;
                evt.target.style.transform = `translate(${x}px, ${y}px)`;
            },
            async end(evt) {
                evt.target.classList.remove('dragging');
                evt.target.style.transform = '';
                evt.target.dataset.dragX = 0;
                evt.target.dataset.dragY = 0;

                if (evt.relatedTarget !== stageEl) return; // only commit on stage drop
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

    // ---- Dropzones ----
    interact(stageEl).dropzone({ accept: '.stage-dot, .available-row', overlap: 0.05 });
    interact(trashEl).dropzone({ accept: '.stage-dot', overlap: 0.5 });
}
```

- [ ] **Step 4: Run drag test**

```bash
cd frontend
npm test -- tests/canvas/drag.test.js
```

Expected: PASS for `clientToStage`. interact.js itself isn't unit-tested here; we cover it manually in Task 16.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/canvas/drag.js frontend/tests/canvas/drag.test.js
git commit -m "feat(frontend): interact.js drag bindings — place, move, trash-to-remove"
```

---

## Task 13: Frontend — `sidebar/manualAdd.js`

**Files:** Create `frontend/src/sidebar/manualAdd.js`, `frontend/tests/sidebar/manualAdd.test.js`. Modify `frontend/index.html`, `frontend/src/styles.css`.

API:
```js
openManualAdd({
    modalEl,           // #manual-add-modal
    fetchMembers,      // async (q) => [{id, displayName, hasHarmonian}]
    instruments,       // string[]
    onSubmit           // async ({ userId, displayName, instrument }) => void
});
closeManualAdd(modalEl);
```

Flow inside the modal:
1. Text input — debounced 250 ms — calls `fetchMembers(q)`, renders result list.
2. Click result → reveal instrument picker (buttons for each instrument).
3. Click instrument → call `onSubmit({ userId, displayName, instrument })` → close modal.

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/sidebar/manualAdd.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openManualAdd, closeManualAdd } from '../../src/sidebar/manualAdd.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function makeModal() {
    const m = document.createElement('div');
    m.id = 'manual-add-modal';
    document.body.appendChild(m);
    return m;
}

describe('manualAdd', () => {
    it('debounces search to 250ms', async () => {
        const modal = makeModal();
        const fetchMembers = vi.fn(async () => []);
        openManualAdd({ modalEl: modal, fetchMembers, instruments: ['1:a'], onSubmit: () => {} });

        const input = modal.querySelector('input.manual-search');
        input.value = 'a';
        input.dispatchEvent(new Event('input'));
        input.value = 'an';
        input.dispatchEvent(new Event('input'));
        input.value = 'ann';
        input.dispatchEvent(new Event('input'));

        await vi.advanceTimersByTimeAsync(100);
        expect(fetchMembers).toHaveBeenCalledTimes(0);
        await vi.advanceTimersByTimeAsync(200);
        expect(fetchMembers).toHaveBeenCalledTimes(1);
        expect(fetchMembers).toHaveBeenCalledWith('ann');
    });

    it('renders results then transitions to instrument picker on click', async () => {
        const modal = makeModal();
        const onSubmit = vi.fn();
        const fetchMembers = vi.fn(async () => [{ id: 'g1', displayName: 'Gäst', hasHarmonian: false }]);
        openManualAdd({ modalEl: modal, fetchMembers, instruments: ['1:a', 'tarol'], onSubmit });

        const input = modal.querySelector('input.manual-search');
        input.value = 'gast';
        input.dispatchEvent(new Event('input'));
        await vi.advanceTimersByTimeAsync(300);
        await Promise.resolve();

        const result = modal.querySelector('.manual-result');
        expect(result.textContent).toContain('Gäst');
        result.click();

        const instButtons = modal.querySelectorAll('.manual-instrument');
        expect(instButtons.length).toBe(2);
        instButtons[1].click(); // tarol
        expect(onSubmit).toHaveBeenCalledWith({
            userId: 'g1', displayName: 'Gäst', instrument: 'tarol'
        });
    });

    it('closeManualAdd hides modal', () => {
        const modal = makeModal();
        modal.style.display = 'flex';
        closeManualAdd(modal);
        expect(modal.style.display).toBe('none');
    });
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
cd frontend
npm test -- tests/sidebar/manualAdd.test.js
```

- [ ] **Step 3: Implement `frontend/src/sidebar/manualAdd.js`**

```js
const DEBOUNCE_MS = 250;

export function openManualAdd({ modalEl, fetchMembers, instruments, onSubmit }) {
    modalEl.replaceChildren();
    modalEl.style.display = 'flex';

    const box = document.createElement('div');
    box.className = 'manual-box';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'manual-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => closeManualAdd(modalEl));

    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Sök medlem...';
    input.className = 'manual-search';

    const results = document.createElement('div');
    results.className = 'manual-results';

    box.appendChild(closeBtn);
    box.appendChild(input);
    box.appendChild(results);
    modalEl.appendChild(box);

    let timer = null;
    input.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
            const q = input.value.trim();
            const members = await fetchMembers(q);
            renderResults(results, members, (m) => {
                renderInstrumentPicker(results, instruments, (instrument) => {
                    onSubmit({ userId: m.id, displayName: m.displayName, instrument });
                    closeManualAdd(modalEl);
                });
            });
        }, DEBOUNCE_MS);
    });
}

function renderResults(container, members, onPick) {
    container.replaceChildren();
    if (!members || members.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'manual-empty';
        empty.textContent = 'Inga träffar';
        container.appendChild(empty);
        return;
    }
    for (const m of members) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'manual-result';
        row.textContent = m.displayName + (m.hasHarmonian ? '' : ' (gäst)');
        row.addEventListener('click', () => onPick(m));
        container.appendChild(row);
    }
}

function renderInstrumentPicker(container, instruments, onPick) {
    container.replaceChildren();
    const heading = document.createElement('p');
    heading.className = 'manual-instrument-heading';
    heading.textContent = 'Välj instrument';
    container.appendChild(heading);
    for (const inst of instruments) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'manual-instrument';
        btn.textContent = inst;
        btn.addEventListener('click', () => onPick(inst));
        container.appendChild(btn);
    }
}

export function closeManualAdd(modalEl) {
    modalEl.style.display = 'none';
    modalEl.replaceChildren();
}
```

- [ ] **Step 4: Run — confirm pass**

```bash
cd frontend
npm test -- tests/sidebar/manualAdd.test.js
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/sidebar/manualAdd.js frontend/tests/sidebar/manualAdd.test.js
git commit -m "feat(frontend): manual-add modal — debounced search + instrument picker"
```

---

## Task 14: Frontend — HTML + CSS for trash, manual-add button, modal

**Files:** Modify `frontend/index.html`, `frontend/src/styles.css`.

- [ ] **Step 1: Edit `frontend/index.html`**

In the `#app` body block (`#planner-body`), replace the `<main>` block so it contains the stage plus a trash element:

```html
<main id="stage-container">
    <div id="stage"></div>
    <div id="trash" title="Släpp här för att ta bort">🗑</div>
</main>
```

In `#planner-header`, add a button after `#planner-title`:

```html
<button id="manual-add-btn" type="button" class="manual-add-btn">+ Lägg till annan medlem</button>
```

Append before `</body>`:

```html
<div id="manual-add-modal" class="modal" style="display:none;"></div>
```

- [ ] **Step 2: Edit `frontend/src/styles.css`**

Append:

```css
#trash {
    position: absolute;
    right: 1rem;
    bottom: 1rem;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: #2a1a1a;
    border: 2px dashed #c0392b;
    color: #e74c3c;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    user-select: none;
}

.manual-add-btn {
    margin-left: auto;
    background: #1e3050;
    color: #eee;
    border: 1px solid #334;
    border-radius: 6px;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    cursor: pointer;
}
.manual-add-btn:hover { background: #274070; }

.modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    align-items: center;
    justify-content: center;
    z-index: 100;
}
.manual-box {
    background: #16213e;
    color: #eee;
    padding: 1rem;
    border-radius: 8px;
    width: min(90vw, 360px);
    max-height: 80vh;
    overflow-y: auto;
    position: relative;
}
.manual-close {
    position: absolute;
    top: 0.25rem;
    right: 0.5rem;
    background: transparent;
    border: 0;
    color: #aab;
    font-size: 1.4rem;
    cursor: pointer;
}
.manual-search {
    width: 100%;
    padding: 0.5rem;
    background: #0f3460;
    color: #eee;
    border: 1px solid #334;
    border-radius: 6px;
    margin-top: 0.5rem;
}
.manual-results {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.5rem;
}
.manual-result, .manual-instrument {
    background: #1e3050;
    color: #eee;
    border: 1px solid #334;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
}
.manual-result:hover, .manual-instrument:hover { background: #274070; }
.manual-empty, .manual-instrument-heading {
    color: #aab;
    font-size: 0.85rem;
    margin: 0.25rem 0;
}

.stage-dot.dragging { z-index: 50; opacity: 0.85; }
.available-row.dragging { opacity: 0.6; }
```

Make `#stage-container` position-relative so trash anchors inside it. Find the existing rule and ensure it has `position: relative;`. If absent:

```css
#stage-container {
    position: relative;
    flex: 1;
    min-height: 0;
}
```

- [ ] **Step 3: Build**

```bash
cd frontend
npm run build
```

Expected: green build.

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html frontend/src/styles.css
git commit -m "feat(frontend): trash dropzone, manual-add modal, drag styling"
```

---

## Task 15: Frontend — wire drag + poll + manual-add in `main.js`

**Files:** Modify `frontend/src/main.js`.

- [ ] **Step 1: Edit `frontend/src/main.js`**

Add imports near the existing ones:

```js
import { startPoll, stopPoll } from './poll.js';
import { wireDrag } from './canvas/drag.js';
import { openManualAdd } from './sidebar/manualAdd.js';
import { post, getWithQuery } from './api.js';
import { getEvent, setDraggingId, getDraggingId } from './state.js';
```

(Combine duplicate `state.js` imports.)

Add a module-scoped poll handle:

```js
let _pollHandle = null;
```

Replace `loadPlanner` and `backToPicker` with:

```js
async function loadPlanner(concertId) {
    let event;
    try {
        event = await get(`/api/state/${concertId}`, _accessToken);
    } catch (err) {
        if (err.status === 403) {
            showStatus('Åtkomst nekad. Harmonian-rollen krävs.', true);
        } else if (err.status === 404) {
            showStatus('Konserten är stängd eller hittades inte.');
        } else {
            showStatus('Kunde inte ladda evenemanget. Ladda om sidan.', true);
        }
        return;
    }

    setSelectedConcertId(concertId);
    setEvent(event);

    const concertMeta = (getConcerts() || []).find(c => c.concertId === concertId);
    const title = document.getElementById('planner-title');
    if (title) title.textContent = concertMeta ? `${concertMeta.name} — ${concertMeta.date}` : '';

    hideEl('picker');
    showEl('app', 'flex');

    const sidebar = document.getElementById('sidebar');
    const stage = document.getElementById('stage');
    const trash = document.getElementById('trash');

    renderAvailable(sidebar, event);
    renderStage(stage, event);

    wireDrag({
        stageEl: stage,
        sidebarEl: sidebar,
        trashEl: trash,
        getEvent,
        setDraggingId,
        onPlace: async (payload) => {
            const updated = await post('/api/lineup/place', { concertId, ...payload }, _accessToken);
            setEvent(updated);
            renderAvailable(sidebar, updated);
            renderStage(stage, updated);
        },
        onMove: async ({ userId, x, y }) => {
            const updated = await post('/api/lineup/move', { concertId, userId, x, y }, _accessToken);
            setEvent(updated);
            renderStage(stage, updated);
        },
        onRemove: async ({ userId }) => {
            const updated = await post('/api/lineup/remove', { concertId, userId }, _accessToken);
            setEvent(updated);
            renderAvailable(sidebar, updated);
            renderStage(stage, updated);
        },
        onError: (err) => {
            if (err.status === 409) {
                // already placed — refresh and let user retry
                refreshState(concertId, sidebar, stage);
            } else {
                showStatus('Något gick fel: ' + (err.message || err), true);
            }
        }
    });

    const manualBtn = document.getElementById('manual-add-btn');
    const modalEl = document.getElementById('manual-add-modal');
    if (manualBtn && modalEl) {
        manualBtn.onclick = () => openManualAdd({
            modalEl,
            fetchMembers: (q) => getWithQuery('/api/guild/members', { q }, _accessToken),
            instruments: Object.keys(event.signups || {}),
            onSubmit: async ({ userId, displayName, instrument }) => {
                try {
                    const updated = await post('/api/lineup/place',
                        { concertId, userId, displayName, instrument, x: 500, y: 300, manuallyAdded: true },
                        _accessToken);
                    setEvent(updated);
                    renderAvailable(sidebar, updated);
                    renderStage(stage, updated);
                } catch (err) {
                    showStatus('Kunde inte lägga till medlem: ' + (err.message || err), true);
                }
            }
        });
    }

    if (_pollHandle) stopPoll(_pollHandle);
    _pollHandle = startPoll({
        fetchState: () => get(`/api/state/${concertId}`, _accessToken),
        intervalMs: 5000,
        getDraggingId,
        onUpdate: (updated) => {
            setEvent(updated);
            renderAvailable(sidebar, updated);
            renderStage(stage, updated);
        },
        onError: (err) => { /* swallow transient poll errors */ console.warn('poll', err); }
    });
}

async function refreshState(concertId, sidebar, stage) {
    try {
        const fresh = await get(`/api/state/${concertId}`, _accessToken);
        setEvent(fresh);
        renderAvailable(sidebar, fresh);
        renderStage(stage, fresh);
    } catch (err) {
        console.warn('refresh failed', err);
    }
}

function backToPicker() {
    if (_pollHandle) { stopPoll(_pollHandle); _pollHandle = null; }
    clearSelectedConcert();
    fetchAndShowPicker();
}
```

The diagnostic block in `boot()` and the existing back-button wiring stay as in M4.5.

- [ ] **Step 2: Build**

```bash
cd frontend
npm run build
```

Expected: green build, no missing exports.

- [ ] **Step 3: Run full frontend suite**

```bash
cd frontend
npm test
```

Expected: every test green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/main.js
git commit -m "feat(frontend): wire drag/drop, 5s poll, manual-add modal in planner"
```

---

## Task 16: Manual verification in Discord (two devices)

No automated test exercises the live SDK + interact.js. Verify manually.

- [ ] **Step 1: Start backend locally**

```bash
npm start
```

Confirm: `Express listening on 127.0.0.1:3000` + cloudflared tunnel green.

- [ ] **Step 2: Push branch + wait for CF Pages build**

```bash
git push origin <branch>
```

Wait for preview deploy.

- [ ] **Step 3: Open Activity on two devices simultaneously**

Both should land on the picker, sorted soonest-first.

- [ ] **Step 4: Place a member via drag**

Device A: drag a row from the sidebar onto the stage.
- A: dot appears immediately, row vanishes from sidebar.
- B: within ~5 s the same dot appears for B.
- File on disk (`src/events/active/*_<id>.json`): `lineup` array contains the new entry with `placedAt`, `instrument`, `manuallyAdded:false`.

- [ ] **Step 5: Move a dot**

Device A: drag the placed dot to a new spot.
- A: dot follows cursor smoothly (no jitter — drag is local-only).
- B: dot relocates within ~5 s.
- During A's drag, B's poll must not yank the dot back if B is also viewing.

- [ ] **Step 6: Remove via trash**

Device A: drag a dot onto the trash icon.
- A: dot vanishes; row reappears in sidebar (if originally a signup, not manual-add).
- B: dot vanishes within ~5 s.

- [ ] **Step 7: Manual-add a guest**

Device A: click "+ Lägg till annan medlem". Search a guild member who is *not* in signups. Pick. Choose an instrument. Confirm `lineup` entry has `manuallyAdded:true` and stale badge is *not* shown.

- [ ] **Step 8: Stale-badge flip**

Backend: edit the event JSON manually to flip a placed (non-manual) member's `signups[…].response` from `'ja'` to `'nej'`.
- Within ~5 s the badge `!` appears on that dot on both devices.

- [ ] **Step 9: Visibility-pause**

Switch to a different browser tab on device A for ~30 s. Network panel: no `/api/state` calls during that window. Switch back: next call within 5 s.

- [ ] **Step 10: 409 dup-place is handled**

Device A drags row X onto stage. *Before* A finishes, device B drags the same row onto stage (e.g. by being very fast). Expected: one of the placements succeeds; the other yields a transient state refresh on the loser, with no stuck UI.

- [ ] **Step 11: Mobile pointer-event sanity (carry-over check to M6)**

Optional but recommended: open Activity on iOS Safari, drag a row by touch. Confirm it tracks the finger. If it doesn't, file a follow-up — full mobile polish is M6.

---

## Spec Coverage

| Spec requirement (§ in design doc) | Task |
|---|---|
| §4 Data model: `lineup` array on event JSON with full entry shape | Tasks 1, 3 |
| §4 Lazy-create `lineup: []` on first mutation | Task 1 |
| §5 `/api/state/:concertId` returns full event JSON | Task 2 |
| §5 `/api/lineup/place` validation: instrument, dup-check, signup-membership, manual-add | Task 3 |
| §5 Coordinate clamp 0..1000 × 0..600 | Task 3 |
| §5 `/api/lineup/move` requires user in lineup | Task 3 |
| §5 `/api/lineup/remove` idempotent | Task 3 |
| §5 `/api/guild/members?q=` returns 25 max with `hasHarmonian` | Task 4 |
| §5 Concurrency: serialize writes via lock on event file | Task 1 |
| §5 Manual-add user must be guild member | Task 3, 6 |
| §6 Drag motion local-only; network only on drop | Task 12 |
| §6 5 s poll, visibility-aware | Task 9 |
| §6 Drag-skip merge (don't clobber locally-dragged dot) | Task 9 |
| §6 Trash drop-zone for remove | Tasks 12, 14 |
| §6 Manual-add modal with debounced search + instrument picker | Task 13 |
| §6 Stale-badge logic (already in stage.js, sidebar untouched) | Task 10 |
| §6 Mobile pointer-events via interact.js | Task 12 (manual check Task 16) |
| §7 Manual-added user verified as current guild member | Task 3, 6 |
| §8 M5 exit gate (two devices sync ≤ 5 s, manual-add works, stale flips) | Task 16 |
