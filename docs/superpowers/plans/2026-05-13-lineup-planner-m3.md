# Lineup Planner — M3 Implementation Plan (State CRUD + Guild Members)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the backend state layer for the Lineup Planner Activity: a JSON-backed placement store, REST endpoints to read merged roster + placement and to mutate placement (place/move/remove), and a cached guild-members endpoint for displayName resolution.

**Architecture:** Placement persists as `src/data/lineups/<concertId>.json` keyed by userId. A `lineupStore` service exposes `loadState` and a `mutate(fn)` helper that serializes writes via the existing `lockfile` package. `mergeRoster(eventJson, savedState)` fuses live signup data (`response ∈ {ja, kanske}`) with persisted placement to produce the response shape. Five new Express route factories are mounted in `core/express.js`; `/api/lineup/*` is rate-limited with `express-rate-limit` (30 req/sec per `req.user.id`). No WebSocket — REST only; realtime sync is M5.

**Tech Stack:** existing Express 4 + auth middleware (M1) + `lockfile` package; new dependency `express-rate-limit`; `node:test` for unit tests; placement persisted as plain JSON files.

**Prereqs (M2 done before starting this plan):**
- `npm test` passes for M1 + M2 suites.
- `npm start` brings up bot AND prints `Express listening on 127.0.0.1:3000`.
- `scripts/m2-smoke.js` end-to-end: context menu → `GET /api/concert/pending` returns `200 { concertId }`, second call returns `404`.
- An active signup post exists in `src/events/active/` (e.g. `8_mars_278194333.json`) for end-to-end testing.

**Spec reference:** `docs/superpowers/specs/2026-05-13-lineup-planner-m3-design.md`

---

## File Structure

| File | Purpose | Status |
| :--- | :--- | :--- |
| `src/services/lineupStore.js` | `loadState(concertId)`, `mutate(concertId, fn)` — JSON CRUD + `lockfile` serialization | Create |
| `src/features/lineup.js` | Add `mergeRoster(eventJson, savedState)` next to existing `pendingConcerts` | Modify |
| `src/routes/api/state.js` | Factory `createStateRoute({ getEventJSON, lineupStore })` | Create |
| `src/routes/api/lineup.js` | Factories `createPlaceRoute`, `createMoveRoute`, `createRemoveRoute` | Create |
| `src/routes/api/guildMembers.js` | Factory `createGuildMembersRoute({ client, guildId, ttlMs })` (60 s in-memory cache) | Create |
| `src/core/express.js` | Mount 5 new routes, wire `express-rate-limit` on `/api/lineup/*` | Modify |
| `src/data/lineups/.gitkeep` | Create lineup data dir (placement files live here) | Create |
| `tests/services/lineupStore.test.js` | Round-trip, missing file → empty, `mutate` patch + lock release | Create |
| `tests/features/lineup-merge.test.js` | `mergeRoster` filter + merge + duplicate-instrument behaviour | Create |
| `tests/routes/state.test.js` | Happy path + archived event 404 | Create |
| `tests/routes/lineup.test.js` | place/move/remove happy + error paths | Create |
| `tests/routes/guildMembers.test.js` | Cached fetch, cache expiry, fetch failure | Create |
| `scripts/m3-smoke.js` | End-to-end: GET state → POST place → GET state → POST move → POST remove | Create |
| `package.json` | Add `express-rate-limit` dependency | Modify |

Module contracts and data shapes locked in the spec; do not redesign during implementation.

---

## Task 1: Add `express-rate-limit` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run:
```bash
npm install express-rate-limit@^7
```

- [ ] **Step 2: Verify added to dependencies**

Run:
```bash
node -e "console.log(require('./package.json').dependencies['express-rate-limit'])"
```

Expected: a version string like `^7.4.0` (any 7.x).

- [ ] **Step 3: Verify it loads**

Run:
```bash
node -e "console.log(typeof require('express-rate-limit').rateLimit)"
```

Expected: `function`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(lineup): add express-rate-limit dependency for M3"
```

---

## Task 2: Create lineup data directory

**Files:**
- Create: `src/data/lineups/.gitkeep`

- [ ] **Step 1: Make the dir + placeholder**

```bash
mkdir -p src/data/lineups
touch src/data/lineups/.gitkeep
```

- [ ] **Step 2: Confirm directory exists**

Run:
```bash
ls src/data/lineups/
```

Expected: `.gitkeep` listed.

- [ ] **Step 3: Commit**

```bash
git add src/data/lineups/.gitkeep
git commit -m "chore(lineup): create src/data/lineups data dir"
```

---

## Task 3: `lineupStore` service (TDD)

**Files:**
- Create: `src/services/lineupStore.js`
- Test: `tests/services/lineupStore.test.js`

The store persists one file per concert at `src/data/lineups/<concertId>.json` and serializes writes with `lockfile` (already a project dependency, used the same way in `src/interactions/buttons/signup.js`). The factory takes `{ baseDir }` for testability so tests use a temp directory; the default singleton uses `path.join(__dirname, '..', 'data', 'lineups')`.

Semantics:

- `loadState(concertId)` — returns parsed JSON if the file exists; if missing returns `{ concertId, participants: {}, updatedAt: null }`. Never throws on missing file.
- `mutate(concertId, fn)` — acquires `<file>.lock`, calls `loadState`, runs `fn(state)` (synchronous), stamps `updatedAt = new Date().toISOString()` on the returned state, writes the file, releases the lock in `finally`. Returns the patched state. The `fn` may throw to abort — the lock is still released. `lockfile.lock` options: `{ stale: 5*60*1000, retries: 3, retryWait: 100 }`.

- [ ] **Step 1: Write failing tests**

Create `tests/services/lineupStore.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLineupStore } = require('../../src/services/lineupStore');

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lineup-store-'));
}

test('loadState returns empty state when file is missing', async () => {
    const baseDir = tmpDir();
    const store = createLineupStore({ baseDir });
    const state = await store.loadState('c1');
    assert.deepStrictEqual(state, { concertId: 'c1', participants: {}, updatedAt: null });
});

test('mutate writes file then loadState round-trips it', async () => {
    const baseDir = tmpDir();
    const store = createLineupStore({ baseDir });

    await store.mutate('c1', state => {
        state.participants['u1'] = { placed: true, x: 10, y: 20 };
        return state;
    });

    const reloaded = await store.loadState('c1');
    assert.strictEqual(reloaded.concertId, 'c1');
    assert.deepStrictEqual(reloaded.participants['u1'], { placed: true, x: 10, y: 20 });
    assert.ok(reloaded.updatedAt, 'updatedAt should be set');
});

test('mutate stamps a fresh updatedAt on every write', async () => {
    const baseDir = tmpDir();
    const store = createLineupStore({ baseDir });

    const first = await store.mutate('c1', s => { s.participants['u1'] = { placed: true, x: 1, y: 2 }; return s; });
    await new Promise(r => setTimeout(r, 5));
    const second = await store.mutate('c1', s => { s.participants['u1'].x = 99; return s; });

    assert.notStrictEqual(first.updatedAt, second.updatedAt);
});

test('mutate releases lock when fn throws', async () => {
    const baseDir = tmpDir();
    const store = createLineupStore({ baseDir });

    await assert.rejects(() => store.mutate('c1', () => { throw new Error('boom'); }), /boom/);

    // A subsequent mutate must succeed (lock was released).
    const state = await store.mutate('c1', s => { s.participants['u1'] = { placed: false, x: null, y: null }; return s; });
    assert.deepStrictEqual(state.participants['u1'], { placed: false, x: null, y: null });
});

test('default baseDir resolves under src/data/lineups (smoke)', () => {
    const { lineupStore } = require('../../src/services/lineupStore');
    assert.strictEqual(typeof lineupStore.loadState, 'function');
    assert.strictEqual(typeof lineupStore.mutate, 'function');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npm test
```

Expected: 5 failures with `Cannot find module '../../src/services/lineupStore'`.

- [ ] **Step 3: Implement `lineupStore`**

Create `src/services/lineupStore.js`:

```js
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const lockFile = require('lockfile');

const lockAsync = promisify(lockFile.lock);
const unlockAsync = promisify(lockFile.unlock);

function createLineupStore({ baseDir } = {}) {
    if (!baseDir) {
        throw new Error('createLineupStore requires baseDir');
    }

    function filePath(concertId) {
        return path.join(baseDir, `${concertId}.json`);
    }

    async function loadState(concertId) {
        const file = filePath(concertId);
        if (!fs.existsSync(file)) {
            return { concertId, participants: {}, updatedAt: null };
        }
        const raw = fs.readFileSync(file, 'utf8');
        return JSON.parse(raw);
    }

    async function mutate(concertId, fn) {
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        const file = filePath(concertId);
        const lockPath = `${file}.lock`;

        await lockAsync(lockPath, { stale: 5 * 60 * 1000, retries: 3, retryWait: 100 });
        try {
            const state = await loadState(concertId);
            const patched = fn(state) || state;
            patched.concertId = concertId;
            patched.updatedAt = new Date().toISOString();
            fs.writeFileSync(file, JSON.stringify(patched, null, 2));
            return patched;
        } finally {
            try { await unlockAsync(lockPath); } catch (_) { /* best-effort */ }
        }
    }

    return { loadState, mutate };
}

const lineupStore = createLineupStore({
    baseDir: path.join(__dirname, '..', 'data', 'lineups')
});

module.exports = { createLineupStore, lineupStore };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: all 5 lineupStore tests pass; M1 + M2 tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/services/lineupStore.js tests/services/lineupStore.test.js
git commit -m "feat(lineup): lineupStore service (loadState + lockfile-serialized mutate)"
```

---

## Task 4: `mergeRoster` in `features/lineup.js` (TDD)

**Files:**
- Modify: `src/features/lineup.js`
- Test: `tests/features/lineup-merge.test.js`

`mergeRoster` produces the participant list returned by `GET /api/state`. For each instrument key in `eventJson.signups`, for each signup with `response ∈ {ja, kanske}`, push `{ userId, displayName, instrument, response, placed, x, y }`. Multiple instruments → multiple entries (no de-dup). Placement comes from `savedState.participants[userId]`; missing entry → `placed:false, x:null, y:null`.

- [ ] **Step 1: Write failing tests**

Create `tests/features/lineup-merge.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { mergeRoster } = require('../../src/features/lineup');

const eventJson = {
    name: '[SOC] Demo',
    id: 'c1',
    signups: {
        '1:a': [
            { name: 'Andrea W', id: 'u1', response: 'kanske', note: '' },
            { name: 'Orietta R', id: 'u2', response: 'ja', note: '' },
            { name: 'Linnéa F', id: 'u3', response: 'nej', note: '' }
        ],
        '2:a': [
            { name: 'Orietta R', id: 'u2', response: 'ja', note: '' }
        ]
    }
};

test('filters out nej and unknown responses', () => {
    const out = mergeRoster(eventJson, { participants: {} });
    const ids = out.map(p => p.userId);
    assert.ok(!ids.includes('u3'), 'u3 (nej) must be excluded');
});

test('includes both ja and kanske', () => {
    const out = mergeRoster(eventJson, { participants: {} });
    assert.strictEqual(out.find(p => p.userId === 'u1').response, 'kanske');
    assert.strictEqual(out.find(p => p.userId === 'u2' && p.instrument === '1:a').response, 'ja');
});

test('produces one entry per (user, instrument) pair', () => {
    const out = mergeRoster(eventJson, { participants: {} });
    const u2Entries = out.filter(p => p.userId === 'u2');
    assert.strictEqual(u2Entries.length, 2);
    assert.deepStrictEqual(u2Entries.map(p => p.instrument).sort(), ['1:a', '2:a']);
});

test('unplaced participants default to placed:false / null coords', () => {
    const out = mergeRoster(eventJson, { participants: {} });
    out.forEach(p => {
        assert.strictEqual(p.placed, false);
        assert.strictEqual(p.x, null);
        assert.strictEqual(p.y, null);
    });
});

test('merges saved placement onto matching userId', () => {
    const saved = { participants: { u2: { placed: true, x: 100, y: 50 } } };
    const out = mergeRoster(eventJson, saved);
    const placedEntries = out.filter(p => p.userId === 'u2');
    placedEntries.forEach(p => {
        assert.strictEqual(p.placed, true);
        assert.strictEqual(p.x, 100);
        assert.strictEqual(p.y, 50);
    });
});

test('handles empty signups object', () => {
    assert.deepStrictEqual(mergeRoster({ signups: {} }, { participants: {} }), []);
});

test('shape exposes displayName from signup.name', () => {
    const out = mergeRoster(eventJson, { participants: {} });
    assert.strictEqual(out.find(p => p.userId === 'u1').displayName, 'Andrea W');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: 7 failures (`mergeRoster is not a function`).

- [ ] **Step 3: Implement `mergeRoster`**

Edit `src/features/lineup.js`. Append below the existing `module.exports` line. Replace the file with:

```js
function createPendingConcerts({ ttlMs = 10 * 60 * 1000, now = Date.now } = {}) {
    const store = new Map();
    return {
        set(userId, concertId) {
            store.set(userId, { concertId, expiresAt: now() + ttlMs });
        },
        pop(userId) {
            const entry = store.get(userId);
            if (!entry) return null;
            store.delete(userId);
            if (now() >= entry.expiresAt) return null;
            return entry.concertId;
        }
    };
}

const pendingConcerts = createPendingConcerts();

const ALLOWED_RESPONSES = new Set(['ja', 'kanske']);

function mergeRoster(eventJson, savedState) {
    const out = [];
    const signups = eventJson?.signups || {};
    const placements = savedState?.participants || {};
    for (const [instrument, entries] of Object.entries(signups)) {
        for (const signup of entries) {
            if (!ALLOWED_RESPONSES.has(signup.response)) continue;
            const userId = signup.id;
            const saved = placements[userId];
            out.push({
                userId,
                displayName: signup.name,
                instrument,
                response: signup.response,
                placed: saved?.placed ?? false,
                x: saved?.x ?? null,
                y: saved?.y ?? null
            });
        }
    }
    return out;
}

module.exports = { createPendingConcerts, pendingConcerts, mergeRoster };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: all 7 mergeRoster tests pass; existing pendingConcerts tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/features/lineup.js tests/features/lineup-merge.test.js
git commit -m "feat(lineup): mergeRoster (filter ja+kanske, merge placement)"
```

---

## Task 5: `GET /api/state/:concertId` route (TDD)

**Files:**
- Create: `src/routes/api/state.js`
- Test: `tests/routes/state.test.js`

Returns `{ concertId, name, updatedAt, participants }` where participants is the `mergeRoster` array. 404 if `getEventJSON(concertId)` returns null (archived or unknown). Reads are NOT serialized via the lock — stale reads acceptable per spec §Concurrency.

- [ ] **Step 1: Write failing tests**

Create `tests/routes/state.test.js`:

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

const eventJson = {
    name: '[SOC] Demo',
    id: 'c1',
    signups: {
        '1:a': [
            { name: 'Andrea W', id: 'u1', response: 'kanske', note: '' },
            { name: 'Orietta R', id: 'u2', response: 'ja', note: '' }
        ]
    }
};

test('returns merged state with concertId, name, updatedAt, participants', async () => {
    const lineupStore = {
        async loadState(id) {
            return { concertId: id, participants: { u2: { placed: true, x: 5, y: 6 } }, updatedAt: '2026-05-13T12:00:00Z' };
        }
    };
    const handler = createStateRoute({
        getEventJSON: id => (id === 'c1' ? eventJson : null),
        lineupStore
    });

    const req = { params: { concertId: 'c1' }, user: { id: 'caller' } };
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.concertId, 'c1');
    assert.strictEqual(res.body.name, '[SOC] Demo');
    assert.strictEqual(res.body.updatedAt, '2026-05-13T12:00:00Z');
    assert.strictEqual(Array.isArray(res.body.participants), true);
    const u2 = res.body.participants.find(p => p.userId === 'u2');
    assert.strictEqual(u2.placed, true);
    assert.strictEqual(u2.x, 5);
});

test('returns 404 event_not_found for unknown concertId', async () => {
    const handler = createStateRoute({
        getEventJSON: () => null,
        lineupStore: { async loadState() { return { participants: {}, updatedAt: null }; } }
    });

    const req = { params: { concertId: 'gone' }, user: { id: 'caller' } };
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'event_not_found' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: 2 failures (`Cannot find module '../../src/routes/api/state'`).

- [ ] **Step 3: Implement the route**

Create `src/routes/api/state.js`:

```js
const { mergeRoster } = require('../../features/lineup');

function createStateRoute({ getEventJSON, lineupStore }) {
    return async function stateRoute(req, res) {
        const concertId = req.params.concertId;
        const eventJson = getEventJSON(concertId);
        if (!eventJson) {
            return res.status(404).json({ error: 'event_not_found' });
        }
        const saved = await lineupStore.loadState(concertId);
        return res.json({
            concertId,
            name: eventJson.name,
            updatedAt: saved.updatedAt,
            participants: mergeRoster(eventJson, saved)
        });
    };
}

module.exports = createStateRoute;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: both state tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/state.js tests/routes/state.test.js
git commit -m "feat(lineup): GET /api/state/:concertId route"
```

---

## Task 6: `/api/lineup/place|move|remove` routes (TDD)

**Files:**
- Create: `src/routes/api/lineup.js`
- Test: `tests/routes/lineup.test.js`

All three routes share validation: 1) `getEventJSON(concertId)` non-null else `404 event_not_found`; 2) `userId` present in `mergeRoster(eventJson, savedState)` else `404 user_not_in_roster`; 3) for `place`/`move`, `x` and `y` must be numeric. `move` additionally requires `state.participants[userId]?.placed === true` else `404 user_not_placed`. All return `{ ok: true }` on success.

- [ ] **Step 1: Write failing tests**

Create `tests/routes/lineup.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const {
    createPlaceRoute,
    createMoveRoute,
    createRemoveRoute
} = require('../../src/routes/api/lineup');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

const eventJson = {
    name: 'Demo',
    id: 'c1',
    signups: {
        '1:a': [{ name: 'A', id: 'u1', response: 'ja', note: '' }]
    }
};

function makeStore(initial = {}) {
    let state = { concertId: 'c1', participants: { ...initial }, updatedAt: null };
    return {
        async loadState() { return JSON.parse(JSON.stringify(state)); },
        async mutate(_id, fn) {
            const next = JSON.parse(JSON.stringify(state));
            const out = fn(next) || next;
            out.updatedAt = '2026-05-13T00:00:00Z';
            state = out;
            return out;
        },
        peek() { return state; }
    };
}

// place
test('place: 200 on valid place', async () => {
    const store = makeStore();
    const handler = createPlaceRoute({
        getEventJSON: () => eventJson,
        lineupStore: store
    });

    const req = { body: { concertId: 'c1', userId: 'u1', x: 10, y: 20 } };
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { ok: true });
    assert.deepStrictEqual(store.peek().participants['u1'], { placed: true, x: 10, y: 20 });
});

test('place: 400 invalid_body when x is not a number', async () => {
    const handler = createPlaceRoute({
        getEventJSON: () => eventJson,
        lineupStore: makeStore()
    });
    const req = { body: { concertId: 'c1', userId: 'u1', x: 'abc', y: 20 } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'invalid_body' });
});

test('place: 404 event_not_found when concert is archived', async () => {
    const handler = createPlaceRoute({
        getEventJSON: () => null,
        lineupStore: makeStore()
    });
    const req = { body: { concertId: 'gone', userId: 'u1', x: 1, y: 2 } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'event_not_found' });
});

test('place: 404 user_not_in_roster for unknown user', async () => {
    const handler = createPlaceRoute({
        getEventJSON: () => eventJson,
        lineupStore: makeStore()
    });
    const req = { body: { concertId: 'c1', userId: 'nobody', x: 1, y: 2 } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'user_not_in_roster' });
});

// move
test('move: 200 on valid move of placed user', async () => {
    const store = makeStore({ u1: { placed: true, x: 1, y: 2 } });
    const handler = createMoveRoute({
        getEventJSON: () => eventJson,
        lineupStore: store
    });
    const req = { body: { concertId: 'c1', userId: 'u1', x: 99, y: 100 } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(store.peek().participants['u1'], { placed: true, x: 99, y: 100 });
});

test('move: 404 user_not_placed when user has no placement yet', async () => {
    const handler = createMoveRoute({
        getEventJSON: () => eventJson,
        lineupStore: makeStore()
    });
    const req = { body: { concertId: 'c1', userId: 'u1', x: 1, y: 2 } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'user_not_placed' });
});

// remove
test('remove: 200 clears placement', async () => {
    const store = makeStore({ u1: { placed: true, x: 1, y: 2 } });
    const handler = createRemoveRoute({
        getEventJSON: () => eventJson,
        lineupStore: store
    });
    const req = { body: { concertId: 'c1', userId: 'u1' } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(store.peek().participants['u1'], { placed: false, x: null, y: null });
});

test('remove: 400 invalid_body when userId missing', async () => {
    const handler = createRemoveRoute({
        getEventJSON: () => eventJson,
        lineupStore: makeStore()
    });
    const req = { body: { concertId: 'c1' } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'invalid_body' });
});

test('remove: 404 event_not_found for archived concert', async () => {
    const handler = createRemoveRoute({
        getEventJSON: () => null,
        lineupStore: makeStore()
    });
    const req = { body: { concertId: 'gone', userId: 'u1' } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'event_not_found' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: 9 failures (`Cannot find module '../../src/routes/api/lineup'`).

- [ ] **Step 3: Implement the routes**

Create `src/routes/api/lineup.js`:

```js
const { mergeRoster } = require('../../features/lineup');

function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
}

function userInRoster(eventJson, savedState, userId) {
    const roster = mergeRoster(eventJson, savedState);
    return roster.some(p => p.userId === userId);
}

function createPlaceRoute({ getEventJSON, lineupStore }) {
    return async function placeRoute(req, res) {
        const { concertId, userId, x, y } = req.body || {};
        if (!concertId || !userId || !isFiniteNumber(x) || !isFiniteNumber(y)) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        const eventJson = getEventJSON(concertId);
        if (!eventJson) return res.status(404).json({ error: 'event_not_found' });

        const saved = await lineupStore.loadState(concertId);
        if (!userInRoster(eventJson, saved, userId)) {
            return res.status(404).json({ error: 'user_not_in_roster' });
        }

        await lineupStore.mutate(concertId, state => {
            state.participants[userId] = { placed: true, x, y };
            return state;
        });
        return res.json({ ok: true });
    };
}

function createMoveRoute({ getEventJSON, lineupStore }) {
    return async function moveRoute(req, res) {
        const { concertId, userId, x, y } = req.body || {};
        if (!concertId || !userId || !isFiniteNumber(x) || !isFiniteNumber(y)) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        const eventJson = getEventJSON(concertId);
        if (!eventJson) return res.status(404).json({ error: 'event_not_found' });

        const saved = await lineupStore.loadState(concertId);
        if (!userInRoster(eventJson, saved, userId)) {
            return res.status(404).json({ error: 'user_not_in_roster' });
        }
        if (!saved.participants[userId]?.placed) {
            return res.status(404).json({ error: 'user_not_placed' });
        }

        await lineupStore.mutate(concertId, state => {
            state.participants[userId] = { placed: true, x, y };
            return state;
        });
        return res.json({ ok: true });
    };
}

function createRemoveRoute({ getEventJSON, lineupStore }) {
    return async function removeRoute(req, res) {
        const { concertId, userId } = req.body || {};
        if (!concertId || !userId) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        const eventJson = getEventJSON(concertId);
        if (!eventJson) return res.status(404).json({ error: 'event_not_found' });

        const saved = await lineupStore.loadState(concertId);
        if (!userInRoster(eventJson, saved, userId)) {
            return res.status(404).json({ error: 'user_not_in_roster' });
        }

        await lineupStore.mutate(concertId, state => {
            state.participants[userId] = { placed: false, x: null, y: null };
            return state;
        });
        return res.json({ ok: true });
    };
}

module.exports = { createPlaceRoute, createMoveRoute, createRemoveRoute };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: all 9 lineup route tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/lineup.js tests/routes/lineup.test.js
git commit -m "feat(lineup): place/move/remove routes with validation"
```

---

## Task 7: `GET /api/guild/members` route (TDD)

**Files:**
- Create: `src/routes/api/guildMembers.js`
- Test: `tests/routes/guildMembers.test.js`

Single in-memory cache entry `{ at, members }`. On request: if `now() - at < ttlMs`, return cached; else `client.guilds.cache.get(guildId).members.fetch()` → map to `{ id, displayName }` → cache → return. `ttlMs` defaults to `60_000`. On fetch failure: 500 `guild_fetch_failed`.

- [ ] **Step 1: Write failing tests**

Create `tests/routes/guildMembers.test.js`:

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

function makeMembersFetch(members) {
    return async () => new Map(members.map(m => [m.id, m]));
}

function makeClient(membersFetch) {
    return {
        guilds: {
            cache: {
                get() {
                    return { members: { fetch: membersFetch } };
                }
            }
        }
    };
}

test('returns members from a fresh fetch', async () => {
    const fetch = makeMembersFetch([
        { id: 'u1', displayName: 'Andrea' },
        { id: 'u2', displayName: 'Orietta' }
    ]);
    const handler = createGuildMembersRoute({ client: makeClient(fetch), guildId: 'g', ttlMs: 60_000 });

    const res = mockRes();
    await handler({}, res);

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, {
        members: [
            { id: 'u1', displayName: 'Andrea' },
            { id: 'u2', displayName: 'Orietta' }
        ]
    });
});

test('serves from cache within ttl (fetch called once across two requests)', async () => {
    let calls = 0;
    const fetch = async () => {
        calls += 1;
        return new Map([['u1', { id: 'u1', displayName: 'Andrea' }]]);
    };
    let t = 1000;
    const handler = createGuildMembersRoute({
        client: makeClient(fetch),
        guildId: 'g',
        ttlMs: 60_000,
        now: () => t
    });

    await handler({}, mockRes());
    t = 5000;
    await handler({}, mockRes());

    assert.strictEqual(calls, 1);
});

test('refetches after ttl expiry', async () => {
    let calls = 0;
    const fetch = async () => {
        calls += 1;
        return new Map([['u1', { id: 'u1', displayName: 'Andrea' }]]);
    };
    let t = 1000;
    const handler = createGuildMembersRoute({
        client: makeClient(fetch),
        guildId: 'g',
        ttlMs: 100,
        now: () => t
    });

    await handler({}, mockRes());
    t = 1200;
    await handler({}, mockRes());

    assert.strictEqual(calls, 2);
});

test('returns 500 guild_fetch_failed on fetch error', async () => {
    const fetch = async () => { throw new Error('discord down'); };
    const handler = createGuildMembersRoute({ client: makeClient(fetch), guildId: 'g', ttlMs: 60_000 });

    const res = mockRes();
    await handler({}, res);

    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'guild_fetch_failed' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: 4 failures (`Cannot find module '../../src/routes/api/guildMembers'`).

- [ ] **Step 3: Implement the route**

Create `src/routes/api/guildMembers.js`:

```js
function createGuildMembersRoute({ client, guildId, ttlMs = 60_000, now = Date.now }) {
    let cache = null;

    return async function guildMembersRoute(_req, res) {
        if (cache && now() - cache.at < ttlMs) {
            return res.json({ members: cache.members });
        }

        let members;
        try {
            const guild = client.guilds.cache.get(guildId);
            const collection = await guild.members.fetch();
            members = Array.from(collection.values()).map(m => ({
                id: m.id,
                displayName: m.displayName
            }));
        } catch (_err) {
            return res.status(500).json({ error: 'guild_fetch_failed' });
        }

        cache = { at: now(), members };
        return res.json({ members });
    };
}

module.exports = createGuildMembersRoute;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: all 4 guildMembers tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/guildMembers.js tests/routes/guildMembers.test.js
git commit -m "feat(lineup): GET /api/guild/members route with 60s cache"
```

---

## Task 8: Wire routes + rate limit into Express app

**Files:**
- Modify: `src/core/express.js`

Mount the 5 new routes. Apply `express-rate-limit` to `/api/lineup/*` only — 30 requests per second per `req.user.id` (so the limiter must run AFTER `authMiddleware`). State + members are unlimited.

- [ ] **Step 1: Edit `src/core/express.js`**

Replace the file with:

```js
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const logger = require('./logger');
const createTtlCache = require('../utils/ttlCache');
const createOAuthService = require('../services/oauth');
const createGuildMemberService = require('../services/guildMember');
const createAuthMiddleware = require('../middleware/auth');
const createTokenRoute = require('../routes/api/token');
const createMeRoute = require('../routes/api/me');
const createConcertPendingRoute = require('../routes/api/concert');
const createStateRoute = require('../routes/api/state');
const {
    createPlaceRoute,
    createMoveRoute,
    createRemoveRoute
} = require('../routes/api/lineup');
const createGuildMembersRoute = require('../routes/api/guildMembers');
const { pendingConcerts } = require('../features/lineup');
const { lineupStore } = require('../services/lineupStore');
const { getEventJSON } = require('../features/signup');

function buildApp({ client, config }) {
    const oauth = createOAuthService({
        fetch: globalThis.fetch,
        clientId: config.clientId,
        clientSecret: config.discordClientSecret,
        redirectUri: config.oauthRedirectUri,
        verifyCache: createTtlCache({ ttlMs: 60_000 })
    });

    const guildMember = createGuildMemberService({
        client,
        guildId: config.guildId,
        harmonianRoleId: config.harmonianRoleId,
        cache: createTtlCache({ ttlMs: 60_000 })
    });

    const authMiddleware = createAuthMiddleware({ oauth, guildMember, logger });

    const lineupLimiter = rateLimit({
        windowMs: 1000,
        limit: 30,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        keyGenerator: req => req.user?.id || req.ip,
        message: { error: 'rate_limited' }
    });

    const app = express();
    app.use(express.json({ limit: '64kb' }));

    app.post('/api/token', createTokenRoute({ oauth, logger }));
    app.get('/api/me', authMiddleware, createMeRoute());
    app.get('/api/concert/pending', authMiddleware, createConcertPendingRoute({ pendingConcerts }));

    app.get('/api/state/:concertId', authMiddleware,
        createStateRoute({ getEventJSON, lineupStore }));

    app.post('/api/lineup/place', authMiddleware, lineupLimiter,
        createPlaceRoute({ getEventJSON, lineupStore }));
    app.post('/api/lineup/move', authMiddleware, lineupLimiter,
        createMoveRoute({ getEventJSON, lineupStore }));
    app.post('/api/lineup/remove', authMiddleware, lineupLimiter,
        createRemoveRoute({ getEventJSON, lineupStore }));

    app.get('/api/guild/members', authMiddleware,
        createGuildMembersRoute({ client, guildId: config.guildId }));

    app.use((err, req, res, _next) => {
        logger('express unhandled error:', err);
        res.status(500).json({ error: 'internal' });
    });

    return app;
}

function start({ client, config }) {
    const app = buildApp({ client, config });
    const port = config.expressPort || 3000;
    return new Promise((resolve, reject) => {
        const server = app.listen(port, '127.0.0.1', () => {
            logger(`Express listening on 127.0.0.1:${port}`);
            resolve(server);
        });
        server.on('error', reject);
    });
}

module.exports = { buildApp, start };
```

- [ ] **Step 2: Run all tests**

Run: `npm test`

Expected: all M1 + M2 + M3 tests still pass.

- [ ] **Step 3: Verify express.js loads**

Run:
```bash
node -e "require('./src/core/express'); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 4: Smoke-start the bot**

Run:
```bash
npm start
```

Expected: existing bot ready log + `Express listening on 127.0.0.1:3000`. Stop with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add src/core/express.js
git commit -m "feat(lineup): mount M3 routes + rate-limit /api/lineup/*"
```

---

## Task 9: End-to-end smoke script

**Files:**
- Create: `scripts/m3-smoke.js`

Proves the full chain against the running bot. Reuses the M1/M2 OAuth flow and an existing active signup (e.g. `8_mars_278194333.json`).

- [ ] **Step 1: Write script**

Create `scripts/m3-smoke.js`:

```js
const config = require('../config.json');

async function main() {
    const code = process.argv[2];
    const concertId = process.argv[3];

    if (!code || !concertId) {
        console.error('Usage: node scripts/m3-smoke.js <oauth-code> <concertId>');
        console.error('');
        console.error('Get a code by visiting (in a browser):');
        const authorize = new URL('https://discord.com/oauth2/authorize');
        authorize.searchParams.set('client_id', config.clientId);
        authorize.searchParams.set('redirect_uri', config.oauthRedirectUri);
        authorize.searchParams.set('response_type', 'code');
        authorize.searchParams.set('scope', 'identify guilds.members.read');
        console.error('  ' + authorize.toString());
        console.error('');
        console.error('Pass the OAuth code AND a concertId from src/events/active/.');
        process.exit(1);
    }

    const base = `http://127.0.0.1:${config.expressPort || 3000}`;

    const tokenRes = await fetch(`${base}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    });
    const tokenBody = await tokenRes.json();
    console.log('POST /api/token →', tokenRes.status);
    if (!tokenRes.ok) process.exit(1);

    const auth = { Authorization: `Bearer ${tokenBody.access_token}` };

    // 1. GET state — pick a userId from roster.
    const r1 = await fetch(`${base}/api/state/${concertId}`, { headers: auth });
    const s1 = await r1.json();
    console.log('GET /api/state →', r1.status, 'participants:', s1.participants?.length);
    if (!r1.ok) process.exit(1);
    const target = s1.participants[0];
    if (!target) { console.error('No participants in roster — pick a different concertId.'); process.exit(1); }
    console.log('Target participant:', target.userId, target.displayName, target.instrument);
    console.log('  initial placed:', target.placed);

    // 2. POST place
    const placeRes = await fetch(`${base}/api/lineup/place`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ concertId, userId: target.userId, x: 100, y: 200 })
    });
    console.log('POST /api/lineup/place →', placeRes.status, await placeRes.json());

    // 3. GET state — confirm placed
    const r2 = await fetch(`${base}/api/state/${concertId}`, { headers: auth });
    const s2 = await r2.json();
    const after = s2.participants.find(p => p.userId === target.userId);
    console.log('After place: placed=' + after.placed + ' x=' + after.x + ' y=' + after.y);

    // 4. POST move
    const moveRes = await fetch(`${base}/api/lineup/move`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ concertId, userId: target.userId, x: 300, y: 400 })
    });
    console.log('POST /api/lineup/move →', moveRes.status, await moveRes.json());

    const r3 = await fetch(`${base}/api/state/${concertId}`, { headers: auth });
    const s3 = await r3.json();
    const moved = s3.participants.find(p => p.userId === target.userId);
    console.log('After move: x=' + moved.x + ' y=' + moved.y);

    // 5. POST remove
    const removeRes = await fetch(`${base}/api/lineup/remove`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ concertId, userId: target.userId })
    });
    console.log('POST /api/lineup/remove →', removeRes.status, await removeRes.json());

    const r4 = await fetch(`${base}/api/state/${concertId}`, { headers: auth });
    const s4 = await r4.json();
    const removed = s4.participants.find(p => p.userId === target.userId);
    console.log('After remove: placed=' + removed.placed + ' x=' + removed.x + ' y=' + removed.y);

    // 6. GET guild members
    const memRes = await fetch(`${base}/api/guild/members`, { headers: auth });
    const memBody = await memRes.json();
    console.log('GET /api/guild/members →', memRes.status, 'count:', memBody.members?.length);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run the bot in one terminal**

```bash
npm start
```

Expected: bot ready + `Express listening on 127.0.0.1:3000`.

- [ ] **Step 3: Run the smoke script**

Pick a concertId from `ls src/events/active/` (the trailing digits before `.json`). Get an OAuth code by visiting the URL printed when running with no args.

```bash
node scripts/m3-smoke.js <oauth-code> <concertId>
```

Expected output (counts will vary):
```
POST /api/token → 200
GET /api/state → 200 participants: <N>
Target participant: <userId> <displayName> <instrument>
  initial placed: false
POST /api/lineup/place → 200 { ok: true }
After place: placed=true x=100 y=200
POST /api/lineup/move → 200 { ok: true }
After move: x=300 y=400
POST /api/lineup/remove → 200 { ok: true }
After remove: placed=false x=null y=null
GET /api/guild/members → 200 count: <N>
```

- [ ] **Step 4: Negative case — archived event**

Move the active event file out of `src/events/active/` temporarily (e.g. `mv src/events/active/<file>.json /tmp/`). Then with a fresh OAuth code:

```bash
node scripts/m3-smoke.js <oauth-code> <concertId>
```

Expected: `GET /api/state → 404` and the script exits early. Restore the file: `mv /tmp/<file>.json src/events/active/`.

- [ ] **Step 5: Commit**

```bash
git add scripts/m3-smoke.js
git commit -m "feat(lineup): M3 smoke script (state + place/move/remove + members)"
```

---

## Task 10: M3 exit verification

- [ ] **Step 1: Confirm exit gate met**

All four conditions per spec §Exit Criteria:

1. `npm test` passes (M1 + M2 + new M3 suites).
2. `npm start` brings up bot + Express (unchanged log lines).
3. `scripts/m3-smoke.js` against a real signup + a real OAuth token:
   - `GET /api/state/<id>` returns merged roster, all `placed: false` on first call.
   - `POST /api/lineup/place` → 200; next `GET` shows that user `placed: true` with sent x/y.
   - `POST /api/lineup/move` → 200; x/y updates.
   - `POST /api/lineup/remove` → 200; user back to `placed: false`, x/y null.
   - `GET /api/guild/members` returns a non-empty list.
4. Archived event (move file out of `src/events/active/`) → mutations return `404 event_not_found`.

- [ ] **Step 2: Tag the milestone (optional)**

```bash
git tag lineup-m3
```

M3 complete. Next milestone: M4 (frontend Activity — React canvas, sidebar of unplaced participants, color-by-instrument).

---

## Notes for the implementer

- `lineupStore.mutate` writes via `fs.writeFileSync` for simplicity — acceptable per existing patterns (`src/interactions/buttons/signup.js` does the same). All concurrent writes serialize on `<file>.lock`.
- `mergeRoster` deliberately produces duplicate entries for users on multiple instruments — frontend renders each as a separate dot. Do not de-dup.
- Placement is keyed by `userId` only (not `userId + instrument`), so placing/moving a user updates ALL their instrument entries simultaneously in the merged response. This is intentional per spec.
- `express-rate-limit` v7's `keyGenerator` returns the key string. Using `req.user.id` requires the limiter to run AFTER `authMiddleware` — the route mount order does this.
- `req.ip` fallback in `keyGenerator` is just defence-in-depth; auth always runs first so `req.user.id` will be set.
- `getEventJSON` is imported from `src/features/signup.js` (existing M2 pattern).
- 60 s cache for `/api/guild/members` is per-process and resets on bot restart — acceptable for M3 (frontend hits it at boot only).
- Rate limit response body shape: `express-rate-limit` calls `res.status(429).json({ error: 'rate_limited' })` (matches the `message` option). Frontend should treat 429 as transient.
- CORS allowlist (`https://*.discordsays.com`) is deferred to M4 — M3 verification uses `curl` / the smoke script with a Bearer token from localhost.
- No role-gated mutations in M3 (any Harmonian may mutate) — spec §Out of Scope.
