# Lineup Planner M4.5 — Concert Picker (replaces context-menu / pending-concert flow)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the Discord context-menu launch path and the in-memory pending-concert map. The Activity now boots into a picker listing every event in `src/events/active/` (sorted by date ascending). Clicking a concert enters the planner; a "Tillbaka till konserter" button returns to the picker.

**Spec source:** `docs/superpowers/specs/2026-05-12-lineup-planner-design.md` §2 (Concert selection row), §5 (`GET /api/concerts`), §6 (boot sequence + picker.js + back button), §8 (M2 reframed), §10 (drop pending-map risk).

**What is already implemented (M2 + M4 from prior plans):**
- `src/interactions/contextMenus/planLineup.js` — context menu handler.
- `src/events/interactionCreate.js` lines 31, 50–52 — wiring for `planLineup`.
- `src/services/registerCommands.js` — slash command registration `{ name: 'Lineup', type: 3 }`.
- `src/features/lineup.js` — `createPendingConcerts()` factory + `pendingConcerts` singleton + `module.exports.{createPendingConcerts, pendingConcerts}`.
- `src/routes/api/concert.js` — `GET /api/concert/pending` route.
- `src/core/express.js` lines 11, 19, 60 — wiring for the route and the singleton.
- `tests/routes/concert.test.js` — tests for the deleted route.
- `frontend/src/main.js` — boot flow assumes `GET /api/concert/pending` returns a single concertId.

All of the above need to be replaced or deleted. `mergeRoster` in `features/lineup.js` and the `lineupStore` are unaffected.

**Tech stack:** unchanged from M4 (Express + Vite + Vitest + node:test). No new dependencies.

---

## File Map

| File | Op | Responsibility |
|------|----|---------------|
| `src/routes/api/concerts.js` | Create | `GET /api/concerts` — read `dir_EventsActive`, parse JSON, sort by `parseEventDate`, return `[{ concertId, name, date }]` |
| `tests/routes/concerts.test.js` | Create | Unit tests for sorting, malformed JSON tolerance, empty dir |
| `src/core/express.js` | Modify | Wire `/api/concerts`. Remove `/api/concert/pending` wiring + `pendingConcerts` import + concert.js require |
| `src/routes/api/concert.js` | Delete | Old pending route |
| `tests/routes/concert.test.js` | Delete | Tests for old route |
| `src/features/lineup.js` | Modify | Remove `createPendingConcerts`, the `pendingConcerts` singleton, and their exports |
| `src/interactions/contextMenus/planLineup.js` | Delete | Context menu handler no longer needed |
| `src/interactions/contextMenus/` | Delete (if empty) | Whole dir if no other handlers |
| `src/events/interactionCreate.js` | Modify | Drop `planLineup` require + matches/execute branch |
| `src/services/registerCommands.js` | Modify | Drop `{ name: 'Lineup', type: 3 }` entry |
| `frontend/index.html` | Modify | Add `#picker` container + planner-header skeleton with back button |
| `frontend/src/state.js` | Modify | Add `concerts`, `selectedConcertId` getters/setters |
| `frontend/src/picker.js` | Create | `renderPicker(container, concerts, onSelect)` |
| `frontend/tests/picker.test.js` | Create | Render order, empty-list message, click handler invocation |
| `frontend/src/main.js` | Rewrite | New boot flow: SDK → token → `/api/concerts` → picker → click → state load → planner; back button stops at picker |
| `frontend/src/styles.css` | Modify | Picker grid + `#planner-header` + `.back-btn` styles |

**Not in M4.5:** poll loop (still M5), drag handlers, manual-add, switcher dropdown (back button is the v1 UX). Re-fetching `/api/concerts` after returning from planner is in scope so picker reflects fresh signups.

---

## Task 1: Backend — `GET /api/concerts`

**Files:** Create `src/routes/api/concerts.js`, `tests/routes/concerts.test.js`.

- [ ] **Step 1: Write failing test**

Create `tests/routes/concerts.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const createConcertsRoute = require('../../src/routes/api/concerts');
const { parseEventDate } = require('../../src/utils/dateUtils');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'concerts-test-'));
}

function writeEvent(dir, fileName, payload) {
    fs.writeFileSync(path.join(dir, fileName), JSON.stringify(payload));
}

test('returns events sorted by date ascending (soonest first)', () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'a_111.json', { name: 'Senare',    id: '111', date: '01/06/26' });
        writeEvent(dir, 'b_222.json', { name: 'Tidigare',  id: '222', date: '08/03/26' });
        writeEvent(dir, 'c_333.json', { name: 'Mitten',    id: '333', date: '23/05/26' });

        const handler = createConcertsRoute({ activeDir: dir, parseEventDate });
        const res = mockRes();
        handler({}, res);

        assert.strictEqual(res.statusCode, 200);
        assert.deepStrictEqual(res.body, [
            { concertId: '222', name: 'Tidigare', date: '08/03/26' },
            { concertId: '333', name: 'Mitten',   date: '23/05/26' },
            { concertId: '111', name: 'Senare',   date: '01/06/26' }
        ]);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('returns empty array when directory is empty', () => {
    const dir = makeTmpDir();
    try {
        const handler = createConcertsRoute({ activeDir: dir, parseEventDate });
        const res = mockRes();
        handler({}, res);
        assert.deepStrictEqual(res.body, []);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('returns empty array when directory does not exist', () => {
    const handler = createConcertsRoute({ activeDir: '/nonexistent/path/xyz', parseEventDate });
    const res = mockRes();
    handler({}, res);
    assert.deepStrictEqual(res.body, []);
});

test('skips non-JSON files', () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'real_111.json', { name: 'Konsert', id: '111', date: '08/03/26' });
        fs.writeFileSync(path.join(dir, 'README.txt'), 'ignore me');
        const handler = createConcertsRoute({ activeDir: dir, parseEventDate });
        const res = mockRes();
        handler({}, res);
        assert.strictEqual(res.body.length, 1);
        assert.strictEqual(res.body[0].concertId, '111');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('skips malformed JSON without crashing', () => {
    const dir = makeTmpDir();
    try {
        fs.writeFileSync(path.join(dir, 'broken.json'), '{not json');
        writeEvent(dir, 'good_222.json', { name: 'OK', id: '222', date: '08/03/26' });
        const handler = createConcertsRoute({ activeDir: dir, parseEventDate });
        const res = mockRes();
        handler({}, res);
        assert.strictEqual(res.body.length, 1);
        assert.strictEqual(res.body[0].concertId, '222');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('skips events missing id, name, or date', () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'no_id.json',   { name: 'X',  date: '08/03/26' });
        writeEvent(dir, 'no_name.json', { id: '111', date: '08/03/26' });
        writeEvent(dir, 'no_date.json', { id: '222', name: 'Y' });
        writeEvent(dir, 'good.json',    { id: '333', name: 'OK', date: '08/03/26' });
        const handler = createConcertsRoute({ activeDir: dir, parseEventDate });
        const res = mockRes();
        handler({}, res);
        assert.strictEqual(res.body.length, 1);
        assert.strictEqual(res.body[0].concertId, '333');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('events with unparseable date sort to the end (stable)', () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'bad_111.json',  { id: '111', name: 'Bad',     date: 'TBD' });
        writeEvent(dir, 'good_222.json', { id: '222', name: 'Good',    date: '08/03/26' });
        const handler = createConcertsRoute({ activeDir: dir, parseEventDate });
        const res = mockRes();
        handler({}, res);
        assert.strictEqual(res.body[0].concertId, '222');
        assert.strictEqual(res.body[1].concertId, '111');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
```

- [ ] **Step 2: Run test — confirm fail**

```bash
node --test 'tests/routes/concerts.test.js'
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/routes/api/concerts.js`**

Inject `activeDir` and `parseEventDate` for testability. The production wiring in express.js will pass `dir_EventsActive` from `core/constants` and `parseEventDate` from `utils/dateUtils`.

```js
const fs = require('fs');
const path = require('path');

function createConcertsRoute({ activeDir, parseEventDate, logger = () => {} }) {
    return function concertsRoute(req, res) {
        let files;
        try {
            files = fs.readdirSync(activeDir);
        } catch {
            return res.json([]);
        }

        const concerts = [];
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            let data;
            try {
                data = JSON.parse(fs.readFileSync(path.join(activeDir, file), 'utf8'));
            } catch (err) {
                logger(`concerts route: skipping ${file}:`, err.message);
                continue;
            }
            if (!data || !data.id || !data.name || !data.date) continue;
            concerts.push({ concertId: data.id, name: data.name, date: data.date });
        }

        concerts.sort((a, b) => {
            const da = parseEventDate(a.date);
            const db = parseEventDate(b.date);
            if (!da && !db) return 0;
            if (!da) return 1;
            if (!db) return -1;
            return da.getTime() - db.getTime();
        });

        return res.json(concerts);
    };
}

module.exports = createConcertsRoute;
```

- [ ] **Step 4: Run test — confirm pass**

```bash
node --test 'tests/routes/concerts.test.js'
```

Expected: 7 assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/concerts.js tests/routes/concerts.test.js
git commit -m "feat(api): add GET /api/concerts route — list active events sorted by date"
```

---

## Task 2: Backend — wire `/api/concerts`, rip out `/api/concert/pending`

**Files:** Modify `src/core/express.js`, `src/features/lineup.js`. Delete `src/routes/api/concert.js`, `tests/routes/concert.test.js`.

- [ ] **Step 1: Edit `src/core/express.js`**

Remove (line 11): `const createConcertPendingRoute = require('../routes/api/concert');`
Remove (line 19): `const { pendingConcerts } = require('../features/lineup');`
Remove (line 60): the `app.get('/api/concert/pending', ...)` registration.

Add import alongside the other route imports:

```js
const createConcertsRoute = require('../routes/api/concerts');
const { dir_EventsActive } = require('../core/constants');
const { parseEventDate } = require('../utils/dateUtils');
```

(If `dir_EventsActive` or `parseEventDate` are already imported at top, dedupe.)

In the route registration block (roughly where `/api/concert/pending` was), add:

```js
app.get('/api/concerts', authMiddleware,
    createConcertsRoute({ activeDir: dir_EventsActive, parseEventDate, logger }));
```

Final state for that section:

```js
app.post('/api/token', createTokenRoute({ oauth, logger }));
app.get('/api/me', authMiddleware, createMeRoute());
app.get('/api/concerts', authMiddleware,
    createConcertsRoute({ activeDir: dir_EventsActive, parseEventDate, logger }));

app.get('/api/state/:concertId', authMiddleware,
    createStateRoute({ getEventJSON, lineupStore }));
// ...rest unchanged
```

- [ ] **Step 2: Edit `src/features/lineup.js`**

Strip the pending-concert factory and singleton entirely. The file becomes:

```js
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

module.exports = { mergeRoster };
```

- [ ] **Step 3: Delete the old route + test**

```bash
git rm src/routes/api/concert.js tests/routes/concert.test.js
```

- [ ] **Step 4: Run full backend suite — confirm green**

```bash
npm test
```

Expected: existing tests still pass. The deleted `concert.test.js` is gone; the new `concerts.test.js` passes. No remaining importer references `pendingConcerts` or `createPendingConcerts`.

If anything fails: grep for stale references — `grep -rn "pendingConcerts\|createPendingConcerts\|api/concert/pending\|routes/api/concert'" src tests`.

- [ ] **Step 5: Commit**

```bash
git add src/core/express.js src/features/lineup.js
git commit -m "refactor(api): replace /api/concert/pending with /api/concerts; drop pendingConcerts map"
```

---

## Task 3: Backend — remove context menu + slash command

**Files:** Delete `src/interactions/contextMenus/planLineup.js`. Modify `src/events/interactionCreate.js`, `src/services/registerCommands.js`.

- [ ] **Step 1: Edit `src/events/interactionCreate.js`**

Remove line 31: `const planLineup = require('../interactions/contextMenus/planLineup');`

Remove lines 50–52 (the `else if (planLineup.matches(...))` branch). Resulting `isContextMenuCommand` block:

```js
} else if (interaction.isContextMenuCommand()) {
    if (interaction.commandName === 'Ändra signup') {
        await handleChangeSignup(interaction);
    }

} else if (interaction.isButton()) {
```

- [ ] **Step 2: Edit `src/services/registerCommands.js`**

Remove the `{ name: 'Lineup', type: 3 }` entry from the `commands` array. The trailing comma on the previous entry should stay valid (or be removed — JS tolerates trailing commas in arrays).

- [ ] **Step 3: Delete handler file (and dir if empty)**

```bash
git rm src/interactions/contextMenus/planLineup.js
rmdir src/interactions/contextMenus 2>/dev/null || true
```

- [ ] **Step 4: Verify nothing else references it**

```bash
grep -rn "planLineup\|contextMenus" src tests
```

Expected: no output.

- [ ] **Step 5: Re-register slash commands against the dev guild**

```bash
npm run register
```

Expected: command list refreshes; "Lineup" context menu disappears in Discord. (Cached clients may take a few minutes.)

- [ ] **Step 6: Run full backend suite**

```bash
npm test
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/events/interactionCreate.js src/services/registerCommands.js
git commit -m "chore(bot): remove Lineup context menu — Activity now boots to picker"
```

---

## Task 4: Frontend — extend `state.js` with concerts + selectedConcertId

**Files:** Modify `frontend/src/state.js`. Modify `frontend/tests/state.test.js`.

- [ ] **Step 1: Add failing tests**

Append to `frontend/tests/state.test.js`:

```js
describe('concerts', () => {
    it('getConcerts returns null initially', async () => {
        const state = await freshState();
        expect(state.getConcerts()).toBeNull();
    });

    it('setConcerts / getConcerts round-trip', async () => {
        const state = await freshState();
        const concerts = [{ concertId: 'c1', name: 'A', date: '08/03/26' }];
        state.setConcerts(concerts);
        expect(state.getConcerts()).toBe(concerts);
    });
});

describe('selectedConcertId', () => {
    it('getSelectedConcertId returns null initially', async () => {
        const state = await freshState();
        expect(state.getSelectedConcertId()).toBeNull();
    });

    it('setSelectedConcertId / getSelectedConcertId round-trip', async () => {
        const state = await freshState();
        state.setSelectedConcertId('c123');
        expect(state.getSelectedConcertId()).toBe('c123');
    });

    it('clearSelectedConcert resets selection and event', async () => {
        const state = await freshState();
        state.setSelectedConcertId('c123');
        state.setEvent({ id: 'c123' });
        state.clearSelectedConcert();
        expect(state.getSelectedConcertId()).toBeNull();
        expect(state.getEvent()).toBeNull();
    });
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
cd frontend
npm test -- tests/state.test.js
```

- [ ] **Step 3: Update `frontend/src/state.js`**

```js
let _event = null;
let _draggingId = null;
let _concerts = null;
let _selectedConcertId = null;

export function getEvent() { return _event; }
export function setEvent(event) { _event = event; }

export function getDraggingId() { return _draggingId; }
export function setDraggingId(id) { _draggingId = id; }

export function getConcerts() { return _concerts; }
export function setConcerts(concerts) { _concerts = concerts; }

export function getSelectedConcertId() { return _selectedConcertId; }
export function setSelectedConcertId(id) { _selectedConcertId = id; }

export function clearSelectedConcert() {
    _selectedConcertId = null;
    _event = null;
}
```

- [ ] **Step 4: Run — confirm pass**

```bash
cd frontend
npm test -- tests/state.test.js
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/state.js frontend/tests/state.test.js
git commit -m "feat(frontend): state — concerts + selectedConcertId + clearSelectedConcert"
```

---

## Task 5: Frontend — `picker.js`

**Files:** Create `frontend/src/picker.js`, `frontend/tests/picker.test.js`.

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/picker.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderPicker } from '../src/picker.js';

const sample = [
    { concertId: 'c1', name: 'Tidigast', date: '08/03/26' },
    { concertId: 'c2', name: 'Senare',   date: '23/05/26' },
];

describe('renderPicker', () => {
    let container;
    beforeEach(() => { container = document.createElement('div'); });

    it('renders one card per concert in given order', () => {
        renderPicker(container, sample, () => {});
        const cards = container.querySelectorAll('.picker-card');
        expect(cards).toHaveLength(2);
        expect(cards[0].dataset.concertId).toBe('c1');
        expect(cards[1].dataset.concertId).toBe('c2');
    });

    it('renders concert name and date as text', () => {
        renderPicker(container, sample, () => {});
        const first = container.querySelector('.picker-card');
        expect(first.textContent).toContain('Tidigast');
        expect(first.textContent).toContain('08/03/26');
    });

    it('invokes onSelect with concertId on card click', () => {
        const onSelect = vi.fn();
        renderPicker(container, sample, onSelect);
        container.querySelector('[data-concert-id="c2"]').click();
        expect(onSelect).toHaveBeenCalledWith('c2');
    });

    it('shows empty-state message when concerts is empty', () => {
        renderPicker(container, [], () => {});
        expect(container.querySelectorAll('.picker-card')).toHaveLength(0);
        expect(container.textContent).toMatch(/inga kommande konserter/i);
    });

    it('clears previous content on re-render', () => {
        renderPicker(container, sample, () => {});
        renderPicker(container, [sample[0]], () => {});
        expect(container.querySelectorAll('.picker-card')).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
cd frontend
npm test -- tests/picker.test.js
```

- [ ] **Step 3: Implement `frontend/src/picker.js`**

```js
export function renderPicker(container, concerts, onSelect) {
    container.replaceChildren();

    if (!concerts || concerts.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'picker-empty';
        msg.textContent = 'Inga kommande konserter';
        container.appendChild(msg);
        return;
    }

    const list = document.createElement('div');
    list.className = 'picker-list';

    for (const c of concerts) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'picker-card';
        card.dataset.concertId = c.concertId;

        const name = document.createElement('span');
        name.className = 'picker-name';
        name.textContent = c.name;

        const date = document.createElement('span');
        date.className = 'picker-date';
        date.textContent = c.date;

        card.appendChild(name);
        card.appendChild(date);
        card.addEventListener('click', () => onSelect(c.concertId));
        list.appendChild(card);
    }

    container.appendChild(list);
}
```

- [ ] **Step 4: Run — confirm pass**

```bash
cd frontend
npm test -- tests/picker.test.js
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/picker.js frontend/tests/picker.test.js
git commit -m "feat(frontend): picker.js — concert list view + onSelect callback"
```

---

## Task 6: Frontend — `index.html` + `styles.css` for picker / planner header

**Files:** Modify `frontend/index.html`, `frontend/src/styles.css`.

- [ ] **Step 1: Edit `frontend/index.html`**

Replace the `<body>` content with:

```html
<body>
  <div id="loading">
    <p>Laddar...</p>
  </div>
  <div id="picker" style="display:none;"></div>
  <div id="app" style="display:none;">
    <header id="planner-header">
      <button id="back-btn" type="button" class="back-btn">← Tillbaka till konserter</button>
      <span id="planner-title"></span>
    </header>
    <div id="planner-body">
      <aside id="sidebar"></aside>
      <main id="stage-container">
        <div id="stage"></div>
      </main>
    </div>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
```

- [ ] **Step 2: Edit `frontend/src/styles.css`**

Adjust the existing `#app` rule from `display: flex` to a column layout (header + body), and append picker + back-button rules.

Replace the existing `#app { display: flex; height: 100vh; }` block with:

```css
#app {
    display: flex;
    flex-direction: column;
    height: 100vh;
}

#planner-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: #16213e;
    border-bottom: 1px solid #0f3460;
    flex-shrink: 0;
}

#planner-title {
    font-size: 0.95rem;
    color: #ddd;
}

.back-btn {
    background: #1e3050;
    color: #eee;
    border: 1px solid #334;
    border-radius: 6px;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    cursor: pointer;
}

.back-btn:hover { background: #274070; }

#planner-body {
    display: flex;
    flex: 1;
    min-height: 0;
}
```

(Existing `#sidebar` + `#stage-container` rules are still scoped fine since they remain children of `#planner-body`.)

Also append picker styles at the bottom:

```css
#picker {
    padding: 1.5rem;
    height: 100vh;
    overflow-y: auto;
}

.picker-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.75rem;
    max-width: 960px;
    margin: 0 auto;
}

.picker-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
    padding: 1rem;
    background: #1e3050;
    color: #eee;
    border: 1px solid #334;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
}

.picker-card:hover { background: #274070; }

.picker-name {
    font-size: 1rem;
    font-weight: 600;
}

.picker-date {
    font-size: 0.85rem;
    color: #aab;
}

.picker-empty {
    text-align: center;
    color: #aab;
    margin-top: 4rem;
    font-size: 1rem;
}
```

- [ ] **Step 3: Build — confirm no CSS/HTML errors**

```bash
cd frontend
npm run build
```

Expected: `dist/` produced cleanly.

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html frontend/src/styles.css
git commit -m "feat(frontend): picker container + planner header + back button styles"
```

---

## Task 7: Frontend — rewrite `main.js` boot flow

**Files:** Modify `frontend/src/main.js`.

No automated test (boot needs real Discord SDK). Manual verification at end of task.

New flow:
1. SDK ready + OAuth code (unchanged).
2. `/api/token` → access token (unchanged).
3. `/api/concerts` → render picker into `#picker`.
4. Card click → `loadPlanner(concertId)` → `/api/state/:concertId` → render planner into `#app`.
5. Back button → stop showing planner, refetch `/api/concerts`, show picker again.

- [ ] **Step 1: Replace contents of `frontend/src/main.js`**

```js
import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import { bootSdk, authenticateSdk } from './sdk.js';
import { exchangeCode, setToken } from './auth.js';
import { get } from './api.js';
import {
    setEvent,
    setConcerts,
    getConcerts,
    setSelectedConcertId,
    clearSelectedConcert,
} from './state.js';
import { renderPicker } from './picker.js';
import { renderAvailable } from './sidebar/available.js';
import { renderStage } from './canvas/stage.js';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

let _accessToken = null;

function showStatus(message, isError = false) {
    document.body.replaceChildren();
    const p = document.createElement('p');
    p.className = isError ? 'status-message error' : 'status-message';
    p.textContent = message;
    document.body.appendChild(p);
}

function hideEl(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}
function showEl(id, display = 'block') {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
}

async function fetchAndShowPicker() {
    let concerts;
    try {
        concerts = await get('/api/concerts', _accessToken);
    } catch (err) {
        if (err.status === 403) {
            showStatus('Åtkomst nekad. Harmonian-rollen krävs.', true);
        } else {
            showStatus('Kunde inte hämta konserter. Ladda om sidan.', true);
        }
        return;
    }
    setConcerts(concerts);

    hideEl('loading');
    hideEl('app');
    showEl('picker');

    renderPicker(
        document.getElementById('picker'),
        concerts,
        (concertId) => loadPlanner(concertId),
    );
}

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

    renderAvailable(document.getElementById('sidebar'), event);
    renderStage(document.getElementById('stage'), event);
}

function backToPicker() {
    clearSelectedConcert();
    fetchAndShowPicker();
}

async function boot() {
    let sdk, code;
    try {
        ({ sdk, code } = await bootSdk(DiscordSDK, CLIENT_ID, patchUrlMappings));
    } catch {
        return; // sdk.js already rendered standalone refusal
    }

    try {
        const result = await exchangeCode(code);
        _accessToken = result.access_token;
        setToken(_accessToken);
        await authenticateSdk(sdk, _accessToken);
    } catch (err) {
        const host = window.location.host;
        const fetchPatched = window.fetch.toString().indexOf('[native code]') === -1 ? 'PATCHED' : 'NATIVE';
        showStatus(
            'Auth fail [' + (err.status || 'no-status') + ']: ' + (err.message || String(err))
            + ' | code: ' + (code ? code.slice(0, 12) : 'EMPTY')
            + ' | host: ' + host
            + ' | fetch: ' + fetchPatched,
            true,
        );
        return;
    }

    const backBtn = document.getElementById('back-btn');
    if (backBtn) backBtn.addEventListener('click', backToPicker);

    await fetchAndShowPicker();
}

boot();
```

Notes on the rewrite:
- Removed all references to `/api/concert/pending`.
- The auth-fail diagnostic block (host / fetchPatched / code prefix) is preserved verbatim — was added during M4 cutover for prod debugging.
- Back button is wired once at boot (header element is static in the DOM).
- `loadPlanner` looks up name/date from the cached `getConcerts()` so the planner header shows context without an extra request.

- [ ] **Step 2: Build — confirm no errors**

```bash
cd frontend
npm run build
```

- [ ] **Step 3: Run full frontend suite**

```bash
cd frontend
npm test
```

Expected: every test green (sdk, auth, api, state, picker, sidebar/available, canvas/stage).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/main.js
git commit -m "feat(frontend): boot to picker, click to load planner, back button to return"
```

---

## Task 8: Manual verification in Discord

No automated tests cover the SDK handshake. Do this against the dev Activity app.

- [ ] **Step 1: Start backend locally**

```bash
npm start
```

Confirm Express logs `listening on 127.0.0.1:3000` and cloudflared tunnel is up.

- [ ] **Step 2: Push branch + wait for CF Pages build**

```bash
git push origin <branch>
```

Wait for Cloudflare Pages preview deploy to go green.

- [ ] **Step 3: Launch Activity from a voice channel shelf**

Expected sequence in the iframe:
1. "Laddar..." briefly.
2. Picker view: every event in `src/events/active/` shown as a card, sorted soonest first (e.g. `8 mars 2026 — 08/03/26` appears before `Blodomloppet — 01/06/26`).
3. Click a card → header shows `<concert name> — <date>`, sidebar lists Ja/Kanske grouped by instrument, stage shows any existing dots.
4. Click "← Tillbaka till konserter" → returns to picker (with refreshed list).
5. Non-Harmonian sees "Åtkomst nekad. Harmonian-rollen krävs."
6. Empty active dir → "Inga kommande konserter".

- [ ] **Step 4: Confirm Lineup context menu is gone**

In Discord, right-click any signup message → the "Lineup" entry should no longer appear (after slash-command sync).

---

## Spec Coverage

| Spec requirement (§ in design doc) | Task |
|---|---|
| §2 Concert selection — picker on boot, click to enter, back to picker | Tasks 5, 6, 7 |
| §5 `GET /api/concerts` — list active dir, sort by date asc | Tasks 1, 2 |
| §5 Pending-concert map removed | Tasks 2, 3 |
| §6 `picker.js` in file tree | Task 5 |
| §6 Boot sequence: SDK → token → `/api/concerts` → picker → click → state → planner | Task 7 |
| §6 State store gains `concerts` + `selectedConcertId` | Task 4 |
| §6 "Tillbaka till konserter" button stops poll, returns to picker | Tasks 6, 7 (poll itself is M5) |
| §8 M2 reframed: no context menu, no pendingConcerts | Tasks 2, 3 |
| §10 Pending-map risk dropped | Tasks 2, 3 |
