# Årshjul Milestone 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members of an instrument section or workgroup create, edit and delete entries on their group's year wheel from the browser, and the bot opens a public discussion thread in that group's Discord channel on each entry's annual date.

**Architecture:** Milestone 1's read-only web app gains write routes and a dispatcher. The store grows lockfile-guarded writes with per-entry optimistic concurrency; new `POST`/`PATCH`/`DELETE` routes reuse the existing role gate; a new dispatcher module ticks once a day at 08:00 Europe/Stockholm, posts a role-mentioning starter message and opens a thread from it. Delivery is gated behind `config.arshjulLive`, which defaults to `false` and routes every thread to the bot-test channel with the mention stripped. Everything is additive — the Discord lineup Activity's auth, routes, build and hosting are untouched.

**Tech Stack:** Node.js 26, Express 4, discord.js v14, `lockfile` for writes, `node:test` for backend tests; Vite 5 and vitest for the frontend, vanilla JS with no framework.

**Spec:** `docs/superpowers/specs/2026-09-10-arshjul-m2-design.md` (parent: `docs/superpowers/specs/2026-09-09-arshjul-design.md`)

## Global Constraints

- **Never modify** `src/middleware/auth.js`, `frontend/`, or the Discord Activity's URL mapping. The Activity must keep working unchanged.
- **Never repoint** `config.oauthRedirectUri`.
- `config.arshjulLive` defaults to **`false`**. Treat any value other than the boolean `true` as false. While false, every thread goes to `ch_BotTest` with the role mention stripped.
- `config.arshjulSendHour` defaults to **`8`**.
- Timezone for every date decision is **`Europe/Stockholm`**, computed with `Intl`, never with the server's local timezone.
- Instrument role colour `#e91e63` (`hex_instr`), workgroup role colour `#f1c40f` (`hex_arbet`), moderator role `role_moderator`, categories `cat_Arbetsgrupper` and `cat_Sektioner`, bot-test channel `ch_BotTest` — all from `src/core/constants.js`. Never hardcode these values in a new file; import them.
- Error codes are exact strings: `401 { error: 'no_session' }`, `403 { error: 'not_in_guild' }`, `403 { error: 'missing_role' }`, `403 { error: 'not_moderator' }`, `403 { error: 'bad_origin' }`, `404 { error: 'not_found' }`, `409 { error: 'version_conflict', entry }`, `400 { error: 'invalid_input', field }`, `500 { error: 'internal' }`.
- Validation limits: `title` 1–100 characters after trimming, `body` 0–1500 characters after trimming, `monthDay` matches `^\d{2}-\d{2}$` **and** is a real calendar day (`02-29` valid, `02-30` and `04-31` invalid).
- User-facing copy is Swedish, verbatim from the spec's copy table.
- Backend files use CommonJS (`require`/`module.exports`) and **4-space indents**. Frontend files use ESM and 4-space indents.
- Backend tests: `npm test`. Frontend tests: `cd yearwheel && npx vitest run`.
- Route factories stay pure — dependencies injected, no `require` of the Discord client — so they test with a plain mock `res`, exactly like `tests/routes/webYearwheel.test.js`.

## File Structure

**Backend — created**
- `src/utils/arshjulDates.js` — every Europe/Stockholm date decision. Pure functions, no I/O.
- `src/utils/arshjulEntry.js` — input validation for an entry. Pure.
- `src/services/roleChannel.js` — role → its Discord channel, by the existing name convention.
- `src/routes/api/web/groups.js` — moderator-only group roster.
- `src/routes/api/web/yearwheelWrite.js` — create, update and delete handlers. Separate from the read route so neither file grows unwieldy.
- `src/middleware/webOrigin.js` — `Origin` allowlist for write routes.
- `src/services/arshjulDispatcher.js` — the daily tick and delivery.

**Backend — modified**
- `src/services/arshjulStore.js` — lockfile writes, optimistic concurrency, `sentYears`.
- `src/services/memberGroups.js` — `listAllGroups()`.
- `src/routes/api/web/me.js` — forward `isModerator`.
- `src/routes/api/web/yearwheel.js` — `hasChannel`, `viaModerator`, role name for moderators.
- `src/core/express.js` — mount the new routes, add a write limiter, allow `PATCH`/`DELETE` in CORS, start the dispatcher in `start()`.
- `config.example.json` — the two new keys.

`src/events/ready.js` is **not** modified — see Task 13 for why the dispatcher cannot start there.

**Frontend — created**
- `yearwheel/src/entryForm.js` — the create/edit form.

**Frontend — modified**
- `yearwheel/src/api.js` — `apiPatch`, `apiDelete`.
- `yearwheel/src/landing.js` — the Mod section.
- `yearwheel/src/wheel.js` — month grouping, banner, moderator line, CRUD wiring.
- `yearwheel/src/styles.css` — styles for the above.

---

### Task 1: Date utilities

**Files:**
- Create: `src/utils/arshjulDates.js`
- Test: `tests/utils/arshjulDates.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `todayInStockholm(now: Date) => { year: number, monthDay: string }`
  - `hourInStockholm(now: Date) => number`
  - `isRealMonthDay(md: string) => boolean`
  - `isLeapYear(year: number) => boolean`
  - `effectiveMonthDay(md: string, year: number) => string`
  - `dueWindow(year: number, monthDay: string, days: number) => string[]`
  - `isAheadOfToday(md: string, now: Date) => boolean`
  - `msUntilNextSendHour(now: Date, sendHour: number) => number`
  - `shouldTickOnStart(now: Date, sendHour: number) => boolean`

Every date rule in this milestone lives here so it can be tested without waiting for a real date. `sv-SE` formats as `YYYY-MM-DD`, which is why it is the locale used — this is the same trick `src/core/logger.js:30` uses.

`dueWindow` deliberately clamps at 1 January: on 01-01 the two preceding days belong to the previous year, and an entry unsent last year must not fire in the new one.

- [ ] **Step 1: Write the failing test**

```js
// tests/utils/arshjulDates.test.js
const test = require('node:test');
const assert = require('node:assert');
const {
    todayInStockholm, hourInStockholm, isRealMonthDay, isLeapYear,
    effectiveMonthDay, dueWindow, isAheadOfToday, msUntilNextSendHour, shouldTickOnStart
} = require('../../src/utils/arshjulDates');

test('todayInStockholm reads the Stockholm calendar day, not UTC', () => {
    // 22:30 UTC on 14 Jan is 23:30 in Stockholm the same day (CET, +1)
    assert.deepStrictEqual(
        todayInStockholm(new Date('2026-01-14T22:30:00Z')),
        { year: 2026, monthDay: '01-15' }
    );
});

test('todayInStockholm rolls over before UTC midnight in summer', () => {
    // 22:30 UTC on 14 Jun is 00:30 on 15 Jun in Stockholm (CEST, +2)
    assert.deepStrictEqual(
        todayInStockholm(new Date('2026-06-14T22:30:00Z')),
        { year: 2026, monthDay: '06-15' }
    );
});

test('hourInStockholm returns the local hour in 0-23', () => {
    assert.strictEqual(hourInStockholm(new Date('2026-01-15T07:30:00Z')), 8);
    assert.strictEqual(hourInStockholm(new Date('2026-01-15T23:30:00Z')), 0);
});

test('isRealMonthDay accepts real days and rejects impossible ones', () => {
    assert.strictEqual(isRealMonthDay('01-15'), true);
    assert.strictEqual(isRealMonthDay('02-29'), true);
    assert.strictEqual(isRealMonthDay('02-30'), false);
    assert.strictEqual(isRealMonthDay('04-31'), false);
    assert.strictEqual(isRealMonthDay('13-01'), false);
    assert.strictEqual(isRealMonthDay('00-10'), false);
    assert.strictEqual(isRealMonthDay('1-15'), false);
    assert.strictEqual(isRealMonthDay('2026-01-15'), false);
    assert.strictEqual(isRealMonthDay(''), false);
    assert.strictEqual(isRealMonthDay(undefined), false);
});

test('isLeapYear follows the century rule', () => {
    assert.strictEqual(isLeapYear(2024), true);
    assert.strictEqual(isLeapYear(2026), false);
    assert.strictEqual(isLeapYear(1900), false);
    assert.strictEqual(isLeapYear(2000), true);
});

test('effectiveMonthDay maps 02-29 to 02-28 only in non-leap years', () => {
    assert.strictEqual(effectiveMonthDay('02-29', 2026), '02-28');
    assert.strictEqual(effectiveMonthDay('02-29', 2024), '02-29');
    assert.strictEqual(effectiveMonthDay('03-01', 2026), '03-01');
});

test('dueWindow returns today and the preceding days', () => {
    assert.deepStrictEqual(dueWindow(2026, '03-03', 2), ['03-03', '03-02', '03-01']);
});

test('dueWindow crosses a month boundary', () => {
    assert.deepStrictEqual(dueWindow(2026, '03-01', 2), ['03-01', '02-28', '02-27']);
});

test('dueWindow clamps at 1 January so last year does not fire in this one', () => {
    assert.deepStrictEqual(dueWindow(2026, '01-01', 2), ['01-01']);
    assert.deepStrictEqual(dueWindow(2026, '01-02', 2), ['01-02', '01-01']);
});

test('isAheadOfToday compares against the Stockholm day', () => {
    const now = new Date('2026-03-03T09:00:00Z');
    assert.strictEqual(isAheadOfToday('03-04', now), true);
    assert.strictEqual(isAheadOfToday('03-03', now), false);
    assert.strictEqual(isAheadOfToday('03-02', now), false);
});

test('msUntilNextSendHour waits for today when the hour is still ahead', () => {
    // 05:00 Stockholm, send hour 8 => 3 hours
    const now = new Date('2026-01-15T04:00:00Z');
    assert.strictEqual(msUntilNextSendHour(now, 8), 3 * 60 * 60 * 1000);
});

test('msUntilNextSendHour waits for tomorrow once the hour has passed', () => {
    // 08:30 Stockholm, send hour 8 => 23.5 hours
    const now = new Date('2026-01-15T07:30:00Z');
    assert.strictEqual(msUntilNextSendHour(now, 8), 23.5 * 60 * 60 * 1000);
});

test('shouldTickOnStart is true only once the send hour has arrived', () => {
    assert.strictEqual(shouldTickOnStart(new Date('2026-01-15T02:00:00Z'), 8), false); // 03:00
    assert.strictEqual(shouldTickOnStart(new Date('2026-01-15T10:00:00Z'), 8), true);  // 11:00
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/utils/arshjulDates.test.js`
Expected: FAIL — `Cannot find module '../../src/utils/arshjulDates'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/utils/arshjulDates.js
const TZ = 'Europe/Stockholm';

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// sv-SE formats as YYYY-MM-DD, which is why it is used here rather than the
// user's locale — see src/core/logger.js:30 for the same trick.
const dayFormatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
});
const clockFormatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

function todayInStockholm(now = new Date()) {
    const [year, month, day] = dayFormatter.format(now).split('-');
    return { year: Number(year), monthDay: `${month}-${day}` };
}

function clockInStockholm(now = new Date()) {
    const [hour, minute, second] = clockFormatter.format(now).split(':').map(Number);
    return { hour, minute, second };
}

function hourInStockholm(now = new Date()) {
    return clockInStockholm(now).hour;
}

function isRealMonthDay(md) {
    if (typeof md !== 'string' || !/^\d{2}-\d{2}$/.test(md)) return false;
    const month = Number(md.slice(0, 2));
    const day = Number(md.slice(3, 5));
    if (month < 1 || month > 12) return false;
    return day >= 1 && day <= DAYS_IN_MONTH[month - 1];
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function effectiveMonthDay(md, year) {
    return md === '02-29' && !isLeapYear(year) ? '02-28' : md;
}

function pad(n) {
    return String(n).padStart(2, '0');
}

function dueWindow(year, monthDay, days = 2) {
    const month = Number(monthDay.slice(0, 2));
    const day = Number(monthDay.slice(3, 5));
    const out = [];
    for (let back = 0; back <= days; back++) {
        // UTC arithmetic only — this is calendar maths on a MM-DD, not a wall clock.
        const dt = new Date(Date.UTC(year, month - 1, day - back));
        if (dt.getUTCFullYear() !== year) continue; // clamp at 1 January
        out.push(`${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`);
    }
    return out;
}

function isAheadOfToday(md, now = new Date()) {
    const today = todayInStockholm(now);
    // MM-DD strings sort correctly as text.
    return effectiveMonthDay(md, today.year) > today.monthDay;
}

function msUntilNextSendHour(now = new Date(), sendHour = 8) {
    const { hour, minute, second } = clockInStockholm(now);
    let hoursAhead = sendHour - hour;
    if (hoursAhead < 0 || (hoursAhead === 0 && (minute > 0 || second > 0))) hoursAhead += 24;
    return ((hoursAhead * 60 - minute) * 60 - second) * 1000;
}

function shouldTickOnStart(now = new Date(), sendHour = 8) {
    return hourInStockholm(now) >= sendHour;
}

module.exports = {
    todayInStockholm, clockInStockholm, hourInStockholm, isRealMonthDay, isLeapYear,
    effectiveMonthDay, dueWindow, isAheadOfToday, msUntilNextSendHour, shouldTickOnStart
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/utils/arshjulDates.test.js`
Expected: PASS, 13 tests

- [ ] **Step 5: Commit**

```bash
git add src/utils/arshjulDates.js tests/utils/arshjulDates.test.js
git commit -m "feat(arshjul): Europe/Stockholm date rules for the dispatcher"
```

---

### Task 2: Entry input validation

**Files:**
- Create: `src/utils/arshjulEntry.js`
- Test: `tests/utils/arshjulEntry.test.js`

**Interfaces:**
- Consumes: `isRealMonthDay` from `src/utils/arshjulDates.js` (Task 1).
- Produces: `validateEntryInput(input: object) => { ok: true, value: { title, body, monthDay } } | { ok: false, field: string }`, plus `MAX_TITLE_LENGTH = 100` and `MAX_BODY_LENGTH = 1500`.

The route turns `{ ok: false, field }` into `400 { error: 'invalid_input', field }`. `title` is capped at 100 because that is Discord's thread-name limit, so nothing has to be truncated at send time.

- [ ] **Step 1: Write the failing test**

```js
// tests/utils/arshjulEntry.test.js
const test = require('node:test');
const assert = require('node:assert');
const { validateEntryInput, MAX_TITLE_LENGTH, MAX_BODY_LENGTH } = require('../../src/utils/arshjulEntry');

test('accepts a valid entry and returns trimmed values', () => {
    const out = validateEntryInput({ title: '  Boka lokal  ', body: '  Ring dem  ', monthDay: '01-15' });
    assert.deepStrictEqual(out, { ok: true, value: { title: 'Boka lokal', body: 'Ring dem', monthDay: '01-15' } });
});

test('treats a missing body as an empty one', () => {
    const out = validateEntryInput({ title: 'A', monthDay: '01-15' });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.value.body, '');
});

test('rejects an empty or whitespace-only title', () => {
    assert.deepStrictEqual(validateEntryInput({ title: '', monthDay: '01-15' }), { ok: false, field: 'title' });
    assert.deepStrictEqual(validateEntryInput({ title: '   ', monthDay: '01-15' }), { ok: false, field: 'title' });
});

test('rejects a title over the limit but accepts one exactly at it', () => {
    assert.strictEqual(validateEntryInput({ title: 'x'.repeat(MAX_TITLE_LENGTH), monthDay: '01-15' }).ok, true);
    assert.deepStrictEqual(
        validateEntryInput({ title: 'x'.repeat(MAX_TITLE_LENGTH + 1), monthDay: '01-15' }),
        { ok: false, field: 'title' }
    );
});

test('rejects a body over the limit but accepts one exactly at it', () => {
    assert.strictEqual(validateEntryInput({ title: 'A', body: 'x'.repeat(MAX_BODY_LENGTH), monthDay: '01-15' }).ok, true);
    assert.deepStrictEqual(
        validateEntryInput({ title: 'A', body: 'x'.repeat(MAX_BODY_LENGTH + 1), monthDay: '01-15' }),
        { ok: false, field: 'body' }
    );
});

test('rejects an impossible or malformed date', () => {
    assert.deepStrictEqual(validateEntryInput({ title: 'A', monthDay: '02-30' }), { ok: false, field: 'monthDay' });
    assert.deepStrictEqual(validateEntryInput({ title: 'A', monthDay: 'nope' }), { ok: false, field: 'monthDay' });
    assert.deepStrictEqual(validateEntryInput({ title: 'A' }), { ok: false, field: 'monthDay' });
});

test('accepts 29 February', () => {
    assert.strictEqual(validateEntryInput({ title: 'A', monthDay: '02-29' }).ok, true);
});

test('rejects non-string fields and a non-object input', () => {
    assert.deepStrictEqual(validateEntryInput({ title: 5, monthDay: '01-15' }), { ok: false, field: 'title' });
    assert.deepStrictEqual(validateEntryInput({ title: 'A', body: 5, monthDay: '01-15' }), { ok: false, field: 'body' });
    assert.deepStrictEqual(validateEntryInput(undefined), { ok: false, field: 'title' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/utils/arshjulEntry.test.js`
Expected: FAIL — `Cannot find module '../../src/utils/arshjulEntry'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/utils/arshjulEntry.js
const { isRealMonthDay } = require('./arshjulDates');

// 100 is Discord's thread-name limit, so a validated title never needs truncating at send time.
const MAX_TITLE_LENGTH = 100;
// Discord's message limit is 2000; the rest is headroom for the role mention and the test prefix.
const MAX_BODY_LENGTH = 1500;

function validateEntryInput(input) {
    const src = input && typeof input === 'object' ? input : {};

    if (typeof src.title !== 'string') return { ok: false, field: 'title' };
    const title = src.title.trim();
    if (title.length < 1 || title.length > MAX_TITLE_LENGTH) return { ok: false, field: 'title' };

    const rawBody = src.body === undefined || src.body === null ? '' : src.body;
    if (typeof rawBody !== 'string') return { ok: false, field: 'body' };
    const body = rawBody.trim();
    if (body.length > MAX_BODY_LENGTH) return { ok: false, field: 'body' };

    if (!isRealMonthDay(src.monthDay)) return { ok: false, field: 'monthDay' };

    return { ok: true, value: { title, body, monthDay: src.monthDay } };
}

module.exports = { validateEntryInput, MAX_TITLE_LENGTH, MAX_BODY_LENGTH };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/utils/arshjulEntry.test.js`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/utils/arshjulEntry.js tests/utils/arshjulEntry.test.js
git commit -m "feat(arshjul): validate entry title, body and date"
```

---

### Task 3: Store — locked writes and create

**Files:**
- Modify: `src/services/arshjulStore.js`
- Test: `tests/services/arshjulStore.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces, added to the object `createArshjulStore` returns:
  - `listAll() => Promise<Array<{ id, ...entry }>>`
  - `getEntry(id) => Promise<{ id, ...entry } | null>`
  - `create(roleId, { monthDay, title, body, channelId, userId, id?, now? }) => Promise<{ id, ...entry }>`

`mutate` mirrors `src/services/lineupStore.js:33-53` — same lock options, same unlock-in-`finally`. `create` accepts `id` and `now` so tests are deterministic; production callers pass neither.

- [ ] **Step 1: Write the failing test**

Append to `tests/services/arshjulStore.test.js`:

```js
test('listAll returns every entry with its id', async () => {
    const file = tmpFile();
    write(file, {
        version: 1,
        entries: {
            e1: { roleId: 'r1', monthDay: '03-01', title: 'A', body: '', version: 1, sentYears: [] },
            e2: { roleId: 'r2', monthDay: '04-01', title: 'B', body: '', version: 1, sentYears: [] }
        }
    });
    const store = createArshjulStore({ filePath: file });
    assert.deepStrictEqual((await store.listAll()).map(e => e.id).sort(), ['e1', 'e2']);
});

test('getEntry returns the entry with its id, or null', async () => {
    const file = tmpFile();
    write(file, { version: 1, entries: { e1: { roleId: 'r1', monthDay: '03-01', title: 'A', body: '', version: 1, sentYears: [] } } });
    const store = createArshjulStore({ filePath: file });
    assert.strictEqual((await store.getEntry('e1')).title, 'A');
    assert.strictEqual((await store.getEntry('e1')).id, 'e1');
    assert.strictEqual(await store.getEntry('nope'), null);
});

test('create writes a complete entry and returns it', async () => {
    const file = tmpFile();
    const store = createArshjulStore({ filePath: file });
    const created = await store.create('r1', {
        monthDay: '01-15', title: 'Boka lokal', body: 'Ring dem',
        channelId: 'c1', userId: 'u1', id: 'fixed-id', now: new Date('2026-09-10T10:00:00Z')
    });
    assert.deepStrictEqual(created, {
        id: 'fixed-id',
        roleId: 'r1',
        channelId: 'c1',
        monthDay: '01-15',
        title: 'Boka lokal',
        body: 'Ring dem',
        version: 1,
        createdBy: 'u1',
        updatedBy: 'u1',
        updatedAt: '2026-09-10T10:00:00.000Z',
        sentYears: []
    });
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(onDisk.entries['fixed-id'].title, 'Boka lokal');
});

test('create stores a null channelId for a group with no channel', async () => {
    const store = createArshjulStore({ filePath: tmpFile() });
    const created = await store.create('r1', { monthDay: '01-15', title: 'A', body: '', channelId: null, userId: 'u1' });
    assert.strictEqual(created.channelId, null);
});

test('create generates a distinct id when none is supplied', async () => {
    const store = createArshjulStore({ filePath: tmpFile() });
    const a = await store.create('r1', { monthDay: '01-15', title: 'A', body: '', channelId: null, userId: 'u1' });
    const b = await store.create('r1', { monthDay: '01-16', title: 'B', body: '', channelId: null, userId: 'u1' });
    assert.notStrictEqual(a.id, b.id);
    assert.strictEqual((await store.listAll()).length, 2);
});

test('concurrent creates all land — no write is lost under the lock', async () => {
    const file = tmpFile();
    const store = createArshjulStore({ filePath: file });
    await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
            store.create('r1', { monthDay: '01-15', title: `T${i}`, body: '', channelId: null, userId: 'u1' }))
    );
    assert.strictEqual((await store.listAll()).length, 10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/services/arshjulStore.test.js`
Expected: FAIL — `store.listAll is not a function`

- [ ] **Step 3: Write minimal implementation**

Replace the body of `src/services/arshjulStore.js` with:

```js
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const lockFile = require('lockfile');
const { randomUUID } = require('crypto');

const lockAsync = promisify(lockFile.lock);
const unlockAsync = promisify(lockFile.unlock);

const DEFAULT_FILE = 'src/data/arshjul.json';

function createArshjulStore({ filePath = DEFAULT_FILE } = {}) {
    function readFile() {
        let raw;
        try {
            raw = fs.readFileSync(filePath, 'utf8');
        } catch (err) {
            if (err.code === 'ENOENT') return { version: 1, entries: {} };
            throw err;
        }
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.entries !== 'object' || parsed.entries === null) {
                throw new Error('bad shape');
            }
            return parsed;
        } catch {
            throw new Error('arshjul_file_corrupt');
        }
    }

    // Same lock options as src/services/lineupStore.js:33-53.
    async function mutate(fn) {
        const lockPath = `${filePath}.lock`;
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        await lockAsync(lockPath, { stale: 5 * 60 * 1000, retries: 50, retryWait: 50 });
        try {
            const data = readFile();
            const result = fn(data);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            return result;
        } finally {
            try { await unlockAsync(lockPath); } catch (_) { /* best effort */ }
        }
    }

    async function listByRole(roleId) {
        const data = readFile();
        return Object.entries(data.entries)
            .filter(([, e]) => e.roleId === roleId)
            .map(([id, e]) => ({ id, ...e }))
            .sort((a, b) => a.monthDay.localeCompare(b.monthDay));
    }

    async function listAll() {
        const data = readFile();
        return Object.entries(data.entries).map(([id, e]) => ({ id, ...e }));
    }

    async function getEntry(id) {
        const data = readFile();
        const entry = data.entries[id];
        return entry ? { id, ...entry } : null;
    }

    async function create(roleId, { monthDay, title, body, channelId, userId, id = randomUUID(), now = new Date() }) {
        return mutate(data => {
            const entry = {
                roleId,
                channelId: channelId ?? null,
                monthDay,
                title,
                body,
                version: 1,
                createdBy: userId,
                updatedBy: userId,
                updatedAt: now.toISOString(),
                sentYears: []
            };
            data.entries[id] = entry;
            return { id, ...entry };
        });
    }

    return { listByRole, listAll, getEntry, create };
}

module.exports = createArshjulStore;
module.exports.DEFAULT_FILE = DEFAULT_FILE;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/services/arshjulStore.test.js`
Expected: PASS — the six milestone 1 tests plus the six new ones

- [ ] **Step 5: Commit**

```bash
git add src/services/arshjulStore.js tests/services/arshjulStore.test.js
git commit -m "feat(arshjul): locked writes and entry creation in the store"
```

---

### Task 4: Store — update, delete and markSent

**Files:**
- Modify: `src/services/arshjulStore.js`
- Test: `tests/services/arshjulStore.test.js`

**Interfaces:**
- Consumes: `isAheadOfToday`, `todayInStockholm` from `src/utils/arshjulDates.js` (Task 1); `mutate` from Task 3.
- Produces:
  - `update(id, { monthDay, title, body, version, userId, now? }) => Promise<{ id, ...entry }>` — throws `Error('entry_not_found')` or `Error('version_conflict')`
  - `remove(id, version) => Promise<void>` — same two errors
  - `markSent(id, year) => Promise<void>`

The re-fire guard: moving `monthDay` to a date still ahead of today clears the current year from `sentYears`, so a corrected date fires this year. Moving it to a date already past leaves `sentYears` alone — otherwise nudging a date back and forth is a button that re-pings a whole role.

- [ ] **Step 1: Write the failing test**

Append to `tests/services/arshjulStore.test.js`:

```js
async function seeded(entry = {}) {
    const file = tmpFile();
    const store = createArshjulStore({ filePath: file });
    const created = await store.create('r1', {
        monthDay: '01-15', title: 'A', body: 'b', channelId: 'c1', userId: 'u1', id: 'e1',
        ...entry
    });
    return { file, store, created };
}

test('update changes the fields, bumps the version and records the editor', async () => {
    const { store } = await seeded();
    const out = await store.update('e1', {
        monthDay: '02-01', title: 'B', body: 'c', version: 1, userId: 'u2',
        now: new Date('2026-09-10T11:00:00Z')
    });
    assert.strictEqual(out.title, 'B');
    assert.strictEqual(out.monthDay, '02-01');
    assert.strictEqual(out.version, 2);
    assert.strictEqual(out.updatedBy, 'u2');
    assert.strictEqual(out.createdBy, 'u1');
    assert.strictEqual(out.updatedAt, '2026-09-10T11:00:00.000Z');
});

test('update throws version_conflict on a stale version and writes nothing', async () => {
    const { store, file } = await seeded();
    await assert.rejects(
        () => store.update('e1', { monthDay: '02-01', title: 'B', body: '', version: 99, userId: 'u2' }),
        /version_conflict/
    );
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(onDisk.entries.e1.title, 'A');
    assert.strictEqual(onDisk.entries.e1.version, 1);
});

test('update throws entry_not_found for an unknown id', async () => {
    const { store } = await seeded();
    await assert.rejects(
        () => store.update('nope', { monthDay: '02-01', title: 'B', body: '', version: 1, userId: 'u2' }),
        /entry_not_found/
    );
});

test('moving the date forward clears this year from sentYears', async () => {
    const { store } = await seeded();
    await store.markSent('e1', 2026);
    const out = await store.update('e1', {
        monthDay: '12-01', title: 'A', body: 'b', version: 1, userId: 'u1',
        now: new Date('2026-06-01T09:00:00Z')
    });
    assert.deepStrictEqual(out.sentYears, []);
});

test('moving the date backward leaves sentYears alone', async () => {
    const { store } = await seeded({ monthDay: '05-01' });
    await store.markSent('e1', 2026);
    const out = await store.update('e1', {
        monthDay: '03-01', title: 'A', body: 'b', version: 1, userId: 'u1',
        now: new Date('2026-06-01T09:00:00Z')
    });
    assert.deepStrictEqual(out.sentYears, [2026]);
});

test('an unchanged date leaves sentYears alone even when it is ahead', async () => {
    const { store } = await seeded({ monthDay: '12-01' });
    await store.markSent('e1', 2026);
    const out = await store.update('e1', {
        monthDay: '12-01', title: 'Ny titel', body: 'b', version: 1, userId: 'u1',
        now: new Date('2026-06-01T09:00:00Z')
    });
    assert.deepStrictEqual(out.sentYears, [2026]);
});

test('remove deletes the entry when the version matches', async () => {
    const { store } = await seeded();
    await store.remove('e1', 1);
    assert.strictEqual(await store.getEntry('e1'), null);
});

test('remove throws version_conflict on a stale version and keeps the entry', async () => {
    const { store } = await seeded();
    await assert.rejects(() => store.remove('e1', 99), /version_conflict/);
    assert.notStrictEqual(await store.getEntry('e1'), null);
});

test('remove throws entry_not_found for an unknown id', async () => {
    const { store } = await seeded();
    await assert.rejects(() => store.remove('nope', 1), /entry_not_found/);
});

test('markSent adds the year once and is idempotent', async () => {
    const { store } = await seeded();
    await store.markSent('e1', 2026);
    await store.markSent('e1', 2026);
    assert.deepStrictEqual((await store.getEntry('e1')).sentYears, [2026]);
    await store.markSent('e1', 2027);
    assert.deepStrictEqual((await store.getEntry('e1')).sentYears, [2026, 2027]);
});

test('markSent does not bump the version — it is not a user edit', async () => {
    const { store } = await seeded();
    await store.markSent('e1', 2026);
    assert.strictEqual((await store.getEntry('e1')).version, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/services/arshjulStore.test.js`
Expected: FAIL — `store.update is not a function`

- [ ] **Step 3: Write minimal implementation**

Add the import at the top of `src/services/arshjulStore.js`:

```js
const { isAheadOfToday, todayInStockholm } = require('../utils/arshjulDates');
```

Add these functions inside `createArshjulStore`, before the `return`:

```js
    async function update(id, { monthDay, title, body, version, userId, now = new Date() }) {
        return mutate(data => {
            const entry = data.entries[id];
            if (!entry) throw new Error('entry_not_found');
            if (entry.version !== version) throw new Error('version_conflict');

            // Re-fire guard: a corrected date that is still ahead may fire this year.
            // A date moved into the past must not, or nudging it back and forth re-pings the role.
            if (monthDay !== entry.monthDay && isAheadOfToday(monthDay, now)) {
                const { year } = todayInStockholm(now);
                entry.sentYears = entry.sentYears.filter(y => y !== year);
            }

            entry.monthDay = monthDay;
            entry.title = title;
            entry.body = body;
            entry.version += 1;
            entry.updatedBy = userId;
            entry.updatedAt = now.toISOString();
            return { id, ...entry };
        });
    }

    async function remove(id, version) {
        return mutate(data => {
            const entry = data.entries[id];
            if (!entry) throw new Error('entry_not_found');
            if (entry.version !== version) throw new Error('version_conflict');
            delete data.entries[id];
        });
    }

    // Dispatcher-only. Deliberately does not bump `version`: sending is not a user edit,
    // and bumping it would make every open editor's next save fail with a 409.
    async function markSent(id, year) {
        return mutate(data => {
            const entry = data.entries[id];
            if (!entry) throw new Error('entry_not_found');
            if (!Array.isArray(entry.sentYears)) entry.sentYears = [];
            if (!entry.sentYears.includes(year)) entry.sentYears.push(year);
        });
    }
```

Update the return statement:

```js
    return { listByRole, listAll, getEntry, create, update, remove, markSent };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/services/arshjulStore.test.js`
Expected: PASS, all tests

- [ ] **Step 5: Commit**

```bash
git add src/services/arshjulStore.js tests/services/arshjulStore.test.js
git commit -m "feat(arshjul): entry update, delete and send-marking with version guards"
```

---

### Task 5: Role → channel resolution

**Files:**
- Create: `src/services/roleChannel.js`
- Test: `tests/services/roleChannel.test.js`

**Interfaces:**
- Consumes: a discord.js client, a TTL cache (`src/utils/ttlCache.js`).
- Produces: `createRoleChannelService({ client, guildId, categoryIds, cache }) => { resolveChannelId(roleId): Promise<string|null> }`

The convention already used when a group is created: the channel name is the role name lowercased with runs of whitespace replaced by dashes, inside `cat_Arbetsgrupper` or `cat_Sektioner` (`src/interactions/modals/workgroups.js:36-38`, `:164-167`). Channel creation there is optional, so `null` is a normal answer, not an error — and it is cached like any other, since `ttlCache.get` distinguishes a stored `null` from a miss (`src/utils/ttlCache.js:6`).

- [ ] **Step 1: Write the failing test**

```js
// tests/services/roleChannel.test.js
const test = require('node:test');
const assert = require('node:assert');
const createRoleChannelService = require('../../src/services/roleChannel');
const createTtlCache = require('../../src/utils/ttlCache');

function fakeClient({ roles = [], channels = [] } = {}) {
    return {
        guilds: {
            cache: {
                get: () => ({
                    roles: { cache: new Map(roles.map(r => [r.id, r])) },
                    channels: { cache: new Map(channels.map(c => [c.id, c])) }
                })
            }
        }
    };
}

function service(client) {
    return createRoleChannelService({
        client,
        guildId: 'g1',
        categoryIds: ['cat-a', 'cat-b'],
        cache: createTtlCache({ ttlMs: 60_000 })
    });
}

test('finds the channel whose name matches the role name', async () => {
    const client = fakeClient({
        roles: [{ id: 'r1', name: 'tarol' }],
        channels: [{ id: 'c1', name: 'tarol', parentId: 'cat-a' }]
    });
    assert.strictEqual(await service(client).resolveChannelId('r1'), 'c1');
});

test('lowercases the role name and replaces spaces with dashes', async () => {
    const client = fakeClient({
        roles: [{ id: 'r1', name: 'Transport Gruppen' }],
        channels: [{ id: 'c1', name: 'transport-gruppen', parentId: 'cat-b' }]
    });
    assert.strictEqual(await service(client).resolveChannelId('r1'), 'c1');
});

test('ignores a name match outside the two categories', async () => {
    const client = fakeClient({
        roles: [{ id: 'r1', name: 'tarol' }],
        channels: [{ id: 'c1', name: 'tarol', parentId: 'some-other-category' }]
    });
    assert.strictEqual(await service(client).resolveChannelId('r1'), null);
});

test('returns null when the group has no channel', async () => {
    const client = fakeClient({ roles: [{ id: 'r1', name: 'tarol' }], channels: [] });
    assert.strictEqual(await service(client).resolveChannelId('r1'), null);
});

test('returns null for an unknown role', async () => {
    assert.strictEqual(await service(fakeClient()).resolveChannelId('nope'), null);
});

test('caches a null answer instead of re-scanning every call', async () => {
    let lookups = 0;
    const client = {
        guilds: {
            cache: {
                get: () => {
                    lookups++;
                    return { roles: { cache: new Map() }, channels: { cache: new Map() } };
                }
            }
        }
    };
    const svc = service(client);
    await svc.resolveChannelId('r1');
    await svc.resolveChannelId('r1');
    assert.strictEqual(lookups, 1);
});

test('throws when the bot is not in the guild', async () => {
    const client = { guilds: { cache: { get: () => undefined } } };
    await assert.rejects(() => service(client).resolveChannelId('r1'), /Bot not in guild/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/services/roleChannel.test.js`
Expected: FAIL — `Cannot find module '../../src/services/roleChannel'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/services/roleChannel.js
// Groups and their channels are created at runtime (src/interactions/modals/workgroups.js),
// and channel creation there is optional — so a role legitimately has no channel, and null
// is a normal answer rather than an error.
function createRoleChannelService({ client, guildId, categoryIds, cache }) {
    function channelNameFor(roleName) {
        return roleName.toLowerCase().replace(/\s+/g, '-');
    }

    async function resolveChannelId(roleId) {
        const cached = cache.get(roleId);
        if (cached !== undefined) return cached;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error(`Bot not in guild ${guildId}`);

        const role = guild.roles.cache.get(roleId);
        if (!role) {
            cache.set(roleId, null);
            return null;
        }

        const wanted = channelNameFor(role.name);
        const match = [...guild.channels.cache.values()]
            .find(c => categoryIds.includes(c.parentId) && c.name === wanted);

        const id = match ? match.id : null;
        cache.set(roleId, id);
        return id;
    }

    return { resolveChannelId };
}

module.exports = createRoleChannelService;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/services/roleChannel.test.js`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/services/roleChannel.js tests/services/roleChannel.test.js
git commit -m "feat(arshjul): resolve a group role to its Discord channel"
```

---

### Task 6: memberGroups.listAllGroups and me.isModerator

**Files:**
- Modify: `src/services/memberGroups.js`, `src/routes/api/web/me.js`
- Test: `tests/services/memberGroups.test.js`, `tests/routes/webMe.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `memberGroups.listAllGroups() => Promise<{ instruments: Array<{id,name}>, workgroups: Array<{id,name}> }>`; `GET /api/web/me` response gains `isModerator: boolean`.

`isModerator` is already computed (`src/services/memberGroups.js:32`) and simply not forwarded, which is why a moderator currently has no way to discover their extra reach. `listAllGroups` uses the same colour filter as `byColor`, cached under a fixed key so a run of Mod-section opens costs one scan a minute.

- [ ] **Step 1: Write the failing test**

Append to `tests/services/memberGroups.test.js`:

```js
test('listAllGroups returns every instrument and workgroup role in the guild', async () => {
    const client = {
        guilds: {
            cache: {
                get: () => ({
                    roles: {
                        cache: new Map([
                            ['i1', { id: 'i1', name: 'tarol', hexColor: '#e91e63' }],
                            ['w1', { id: 'w1', name: 'transportgruppen', hexColor: '#f1c40f' }],
                            ['w2', { id: 'w2', name: 'fikagruppen', hexColor: '#f1c40f' }],
                            ['x1', { id: 'x1', name: 'moderator', hexColor: '#992d22' }]
                        ])
                    }
                })
            }
        }
    };
    const service = createMemberGroupsService({
        client, guildId: 'g1', hexInstr: '#e91e63', hexArbet: '#f1c40f',
        moderatorRoleId: 'mod', cache: createTtlCache({ ttlMs: 60_000 })
    });
    const all = await service.listAllGroups();
    assert.deepStrictEqual(all.instruments, [{ id: 'i1', name: 'tarol' }]);
    assert.deepStrictEqual(all.workgroups, [
        { id: 'w2', name: 'fikagruppen' },
        { id: 'w1', name: 'transportgruppen' }
    ]);
});

test('listAllGroups caches so repeat calls do not rescan', async () => {
    let scans = 0;
    const client = {
        guilds: {
            cache: {
                get: () => {
                    scans++;
                    return { roles: { cache: new Map() } };
                }
            }
        }
    };
    const service = createMemberGroupsService({
        client, guildId: 'g1', hexInstr: '#e91e63', hexArbet: '#f1c40f',
        moderatorRoleId: 'mod', cache: createTtlCache({ ttlMs: 60_000 })
    });
    await service.listAllGroups();
    await service.listAllGroups();
    assert.strictEqual(scans, 1);
});
```

> If `tests/services/memberGroups.test.js` does not already import `createTtlCache` and `createMemberGroupsService`, add:
> ```js
> const createMemberGroupsService = require('../../src/services/memberGroups');
> const createTtlCache = require('../../src/utils/ttlCache');
> ```

Append to `tests/routes/webMe.test.js`:

```js
test('reports isModerator true for a moderator', async () => {
    const res = mockRes();
    await createWebMeRoute({
        memberGroups: {
            getGroups: async () => ({
                member: true, displayName: 'Mod', isModerator: true,
                instruments: [], workgroups: []
            })
        }
    })({ webUser: { id: 'u1' } }, res);
    assert.strictEqual(res.body.isModerator, true);
});

test('reports isModerator false for an ordinary member and still lists only their own groups', async () => {
    const res = mockRes();
    await createWebMeRoute({
        memberGroups: {
            getGroups: async () => ({
                member: true, displayName: 'Olle L', isModerator: false,
                instruments: [{ id: 'i1', name: 'tarol' }], workgroups: []
            })
        }
    })({ webUser: { id: 'u1' } }, res);
    assert.strictEqual(res.body.isModerator, false);
    assert.deepStrictEqual(res.body.instruments, [{ id: 'i1', name: 'tarol' }]);
    assert.deepStrictEqual(res.body.workgroups, []);
});

test('a non-member response still carries nothing but member:false', async () => {
    const res = mockRes();
    await createWebMeRoute({ memberGroups: { getGroups: async () => ({ member: false }) } })(
        { webUser: { id: 'u1' } }, res
    );
    assert.deepStrictEqual(res.body, { member: false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/services/memberGroups.test.js tests/routes/webMe.test.js`
Expected: FAIL — `service.listAllGroups is not a function`, and `res.body.isModerator` is `undefined`

- [ ] **Step 3: Write minimal implementation**

In `src/services/memberGroups.js`, add inside `createMemberGroupsService` before the `return`:

```js
    // Cached under a fixed key so a burst of Mod-section opens costs one role scan per TTL.
    const ALL_GROUPS_KEY = '__all_groups__';

    async function listAllGroups() {
        const cached = cache.get(ALL_GROUPS_KEY);
        if (cached) return cached;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error(`Bot not in guild ${guildId}`);

        const roles = guild.roles.cache;
        const result = {
            instruments: byColor(roles, hexInstr),
            workgroups: byColor(roles, hexArbet)
        };
        cache.set(ALL_GROUPS_KEY, result);
        return result;
    }
```

and change the return to:

```js
    return { getGroups, listAllGroups };
```

In `src/routes/api/web/me.js`, add `isModerator` to the response:

```js
        return res.json({
            member: true,
            displayName: groups.displayName,
            isModerator: groups.isModerator === true,
            instruments: groups.instruments,
            workgroups: groups.workgroups
        });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/services/memberGroups.test.js tests/routes/webMe.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/memberGroups.js src/routes/api/web/me.js tests/services/memberGroups.test.js tests/routes/webMe.test.js
git commit -m "feat(arshjul): expose isModerator and the full group roster"
```

---

### Task 7: GET /api/web/groups — moderator-only roster

**Files:**
- Create: `src/routes/api/web/groups.js`
- Test: `tests/routes/webGroups.test.js`

**Interfaces:**
- Consumes: `memberGroups.getGroups`, `memberGroups.listAllGroups` (Task 6).
- Produces: `createWebGroupsRoute({ memberGroups, logger }) => (req, res) => Promise<void>`

`403 not_moderator` is a distinct code from `missing_role` because the client's response differs: it is not a revocation, so the page must not redirect — the Mod section simply is not for that caller.

- [ ] **Step 1: Write the failing test**

```js
// tests/routes/webGroups.test.js
const test = require('node:test');
const assert = require('node:assert');
const createWebGroupsRoute = require('../../src/routes/api/web/groups');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

const ALL = {
    instruments: [{ id: 'i1', name: 'tarol' }],
    workgroups: [{ id: 'w1', name: 'transportgruppen' }, { id: 'w2', name: 'fikagruppen' }]
};

function route(groups, all = ALL) {
    return createWebGroupsRoute({
        memberGroups: { getGroups: async () => groups, listAllGroups: async () => all }
    });
}

const req = { webUser: { id: 'u1' } };

test('a moderator receives every instrument and workgroup', async () => {
    const res = mockRes();
    await route({ member: true, isModerator: true, instruments: [], workgroups: [] })(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, ALL);
});

test('403 not_moderator for an ordinary member who holds groups', async () => {
    const res = mockRes();
    await route({
        member: true, isModerator: false,
        instruments: [], workgroups: [{ id: 'w1', name: 'transportgruppen' }]
    })(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'not_moderator' });
});

test('403 not_in_guild for a non-member, checked before the moderator flag', async () => {
    const res = mockRes();
    await route({ member: false, isModerator: true })(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'not_in_guild' });
});

test('500 when the roster lookup fails', async () => {
    const res = mockRes();
    await createWebGroupsRoute({
        memberGroups: {
            getGroups: async () => ({ member: true, isModerator: true }),
            listAllGroups: async () => { throw new Error('Bot not in guild g1'); }
        }
    })(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'internal' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routes/webGroups.test.js`
Expected: FAIL — `Cannot find module '../../src/routes/api/web/groups'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/routes/api/web/groups.js
// The full group roster is moderator-only. An ordinary member's browser never receives the
// list of groups they are not in — see the parent spec's note on GET /api/web/me.
function createWebGroupsRoute({ memberGroups, logger }) {
    return async function webGroupsRoute(req, res) {
        let groups;
        try {
            groups = await memberGroups.getGroups(req.webUser.id);
        } catch (err) {
            if (logger) logger('GET /api/web/groups lookup failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }

        if (!groups.member) return res.status(403).json({ error: 'not_in_guild' });
        if (!groups.isModerator) return res.status(403).json({ error: 'not_moderator' });

        try {
            return res.json(await memberGroups.listAllGroups());
        } catch (err) {
            if (logger) logger('GET /api/web/groups roster failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }
    };
}

module.exports = createWebGroupsRoute;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routes/webGroups.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/web/groups.js tests/routes/webGroups.test.js
git commit -m "feat(arshjul): moderator-only group roster endpoint"
```

---

### Task 8: GET wheel gains hasChannel and viaModerator

**Files:**
- Modify: `src/routes/api/web/yearwheel.js`
- Test: `tests/routes/webYearwheel.test.js`

**Interfaces:**
- Consumes: `memberGroups.listAllGroups` (Task 6), `roleChannel.resolveChannelId` (Task 5).
- Produces: `createWebYearwheelRoute({ memberGroups, arshjulStore, resolveChannelId, logger })`. Response gains `role.hasChannel: boolean` and `role.viaModerator: boolean`.

A moderator opening a foreign wheel currently sees the raw role id as the heading (`src/routes/api/web/yearwheel.js:35`). They now get the real name, plus `viaModerator` so the page can say whose wheel it is. Every existing milestone 1 test must still pass unchanged.

- [ ] **Step 1: Write the failing test**

Append to `tests/routes/webYearwheel.test.js`:

```js
function routeWithChannel(groups, { entries = [], channelId = 'c1', all } = {}) {
    return createWebYearwheelRoute({
        memberGroups: {
            getGroups: async () => groups,
            listAllGroups: async () => all ?? { instruments: [], workgroups: [] }
        },
        arshjulStore: { listByRole: async () => entries },
        resolveChannelId: async () => channelId
    });
}

test('reports hasChannel true when the group has a channel', async () => {
    const res = mockRes();
    await routeWithChannel(MEMBER_OF_R1)(req('r1'), res);
    assert.strictEqual(res.body.role.hasChannel, true);
});

test('reports hasChannel false when the group has none', async () => {
    const res = mockRes();
    await routeWithChannel(MEMBER_OF_R1, { channelId: null })(req('r1'), res);
    assert.strictEqual(res.body.role.hasChannel, false);
});

test('a member reading their own wheel is not marked viaModerator', async () => {
    const res = mockRes();
    await routeWithChannel(MEMBER_OF_R1)(req('r1'), res);
    assert.strictEqual(res.body.role.viaModerator, false);
});

test('a moderator reading a foreign wheel gets viaModerator and the real role name', async () => {
    const mod = { member: true, displayName: 'Mod', isModerator: true, instruments: [], workgroups: [] };
    const res = mockRes();
    await routeWithChannel(mod, { all: { instruments: [], workgroups: [{ id: 'r-any', name: 'fikagruppen' }] } })(
        req('r-any'), res
    );
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.role.viaModerator, true);
    assert.strictEqual(res.body.role.name, 'fikagruppen');
});

test('a moderator reading a wheel for a role they also hold is not marked viaModerator', async () => {
    const mod = {
        member: true, displayName: 'Mod', isModerator: true,
        instruments: [], workgroups: [{ id: 'r1', name: 'transportgruppen' }]
    };
    const res = mockRes();
    await routeWithChannel(mod)(req('r1'), res);
    assert.strictEqual(res.body.role.viaModerator, false);
    assert.strictEqual(res.body.role.name, 'transportgruppen');
});

test('falls back to the role id when even the roster does not know the role', async () => {
    const mod = { member: true, displayName: 'Mod', isModerator: true, instruments: [], workgroups: [] };
    const res = mockRes();
    await routeWithChannel(mod)(req('r-unknown'), res);
    assert.strictEqual(res.body.role.name, 'r-unknown');
});

test('a channel lookup failure does not fail the read', async () => {
    const handler = createWebYearwheelRoute({
        memberGroups: { getGroups: async () => MEMBER_OF_R1, listAllGroups: async () => ({ instruments: [], workgroups: [] }) },
        arshjulStore: { listByRole: async () => [] },
        resolveChannelId: async () => { throw new Error('Bot not in guild g1'); }
    });
    const res = mockRes();
    await handler(req('r1'), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.role.hasChannel, false);
});
```

Update the existing `route()` helper in the same file so the milestone 1 tests keep working:

```js
function route(groups, entries = []) {
    return createWebYearwheelRoute({
        memberGroups: {
            getGroups: async () => groups,
            listAllGroups: async () => ({ instruments: [], workgroups: [] })
        },
        arshjulStore: { listByRole: async () => entries },
        resolveChannelId: async () => null
    });
}
```

And add `resolveChannelId: async () => null` plus `listAllGroups: async () => ({ instruments: [], workgroups: [] })` to the three tests that build a handler inline (`500 when the store fails`, `calls getGroups with the caller id…`, `500 when getGroups resolves a malformed shape…`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routes/webYearwheel.test.js`
Expected: FAIL — `res.body.role.hasChannel` is `undefined`

- [ ] **Step 3: Write minimal implementation**

Replace `src/routes/api/web/yearwheel.js` with:

```js
function createWebYearwheelRoute({ memberGroups, arshjulStore, resolveChannelId, logger }) {
    return async function webYearwheelRoute(req, res) {
        const roleId = req.params.roleId;

        let groups;
        try {
            groups = await memberGroups.getGroups(req.webUser.id);
        } catch (err) {
            if (logger) logger('GET /api/web/yearwheel lookup failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }

        let owned;
        try {
            if (!groups.member) return res.status(403).json({ error: 'not_in_guild' });

            owned = [...groups.instruments, ...groups.workgroups].find(g => g.id === roleId);
            if (!owned && !groups.isModerator) {
                return res.status(403).json({ error: 'missing_role' });
            }
        } catch (err) {
            if (logger) logger('GET /api/web/yearwheel group shape invalid:', err.message);
            return res.status(500).json({ error: 'internal' });
        }

        let entries;
        try {
            entries = await arshjulStore.listByRole(roleId);
        } catch (err) {
            if (logger) logger('GET /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }

        // A moderator reaching a wheel they do not hold gets the real role name from the
        // roster rather than the bare id, so the page can name whose wheel they are editing.
        let name = owned ? owned.name : roleId;
        if (!owned) {
            try {
                const all = await memberGroups.listAllGroups();
                const found = [...all.instruments, ...all.workgroups].find(g => g.id === roleId);
                if (found) name = found.name;
            } catch (err) {
                if (logger) logger('GET /api/web/yearwheel roster lookup failed:', err.message);
            }
        }

        // A missing channel is a normal state, never a reason to fail the read.
        let hasChannel = false;
        try {
            hasChannel = Boolean(await resolveChannelId(roleId));
        } catch (err) {
            if (logger) logger('GET /api/web/yearwheel channel lookup failed:', err.message);
        }

        return res.json({
            role: { id: roleId, name, hasChannel, viaModerator: !owned },
            entries
        });
    };
}

module.exports = createWebYearwheelRoute;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routes/webYearwheel.test.js`
Expected: PASS — the milestone 1 tests plus the seven new ones

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/web/yearwheel.js tests/routes/webYearwheel.test.js
git commit -m "feat(arshjul): report channel presence and moderator context on a wheel read"
```

---

### Task 9: Write routes — create, update, delete

**Files:**
- Create: `src/routes/api/web/yearwheelWrite.js`
- Test: `tests/routes/webYearwheelWrite.test.js`

**Interfaces:**
- Consumes: `validateEntryInput` (Task 2), store `create`/`update`/`remove`/`getEntry` (Tasks 3–4), `resolveChannelId` (Task 5), `memberGroups.getGroups`.
- Produces, all from one module:
  - `createWebYearwheelCreateRoute({ memberGroups, arshjulStore, resolveChannelId, logger })`
  - `createWebYearwheelUpdateRoute({ memberGroups, arshjulStore, logger })`
  - `createWebYearwheelDeleteRoute({ memberGroups, arshjulStore, logger })`

All three share one gate helper: not a guild member → `403 not_in_guild`; does not hold the role and is not a moderator → `403 missing_role`. `PATCH` and `DELETE` load the entry first — an unknown id is `404` before any permission work, so a probe cannot distinguish "exists but forbidden" from "does not exist" by timing or code.

Every write is audit-logged with the acting user, the entry and the values. That log is what makes the flat write model — anyone in the group may edit anything — accountable.

- [ ] **Step 1: Write the failing test**

```js
// tests/routes/webYearwheelWrite.test.js
const test = require('node:test');
const assert = require('node:assert');
const {
    createWebYearwheelCreateRoute,
    createWebYearwheelUpdateRoute,
    createWebYearwheelDeleteRoute
} = require('../../src/routes/api/web/yearwheelWrite');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        ended: false,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
        end() { this.ended = true; return this; }
    };
}

const MEMBER_OF_R1 = {
    member: true, displayName: 'Olle L', isModerator: false,
    instruments: [], workgroups: [{ id: 'r1', name: 'transportgruppen' }]
};
const MODERATOR = { member: true, displayName: 'Mod', isModerator: true, instruments: [], workgroups: [] };

const ENTRY = {
    id: 'e1', roleId: 'r1', channelId: 'c1', monthDay: '01-15',
    title: 'A', body: 'b', version: 1, createdBy: 'u1', updatedBy: 'u1',
    updatedAt: '2026-09-10T10:00:00.000Z', sentYears: []
};

function stores(overrides = {}) {
    return {
        getEntry: async id => (id === 'e1' ? { ...ENTRY } : null),
        create: async (roleId, opts) => ({ ...ENTRY, roleId, ...opts, id: 'new-id' }),
        update: async (id, opts) => ({ ...ENTRY, ...opts, id, version: 2 }),
        remove: async () => undefined,
        ...overrides
    };
}

function createRoute(groups, store = stores(), channelId = 'c1') {
    return createWebYearwheelCreateRoute({
        memberGroups: { getGroups: async () => groups },
        arshjulStore: store,
        resolveChannelId: async () => channelId
    });
}

function updateRoute(groups, store = stores()) {
    return createWebYearwheelUpdateRoute({
        memberGroups: { getGroups: async () => groups },
        arshjulStore: store
    });
}

function deleteRoute(groups, store = stores()) {
    return createWebYearwheelDeleteRoute({
        memberGroups: { getGroups: async () => groups },
        arshjulStore: store
    });
}

const postReq = (body, roleId = 'r1') => ({ webUser: { id: 'u1' }, params: { roleId }, body });
const entryReq = (body, id = 'e1') => ({ webUser: { id: 'u1' }, params: { id }, body });

// --- create ---

test('creates an entry and returns 201', async () => {
    const res = mockRes();
    await createRoute(MEMBER_OF_R1)(postReq({ title: 'Boka lokal', body: 'Ring', monthDay: '01-15' }), res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.title, 'Boka lokal');
    assert.strictEqual(res.body.id, 'new-id');
});

test('stores the resolved channel id on create', async () => {
    const calls = [];
    const store = stores({ create: async (roleId, opts) => { calls.push(opts); return { ...ENTRY, id: 'new-id' }; } });
    const res = mockRes();
    await createRoute(MEMBER_OF_R1, store, 'chan-1')(postReq({ title: 'A', monthDay: '01-15' }), res);
    assert.strictEqual(calls[0].channelId, 'chan-1');
    assert.strictEqual(calls[0].userId, 'u1');
});

test('a group with no channel still saves, with channelId null', async () => {
    const calls = [];
    const store = stores({ create: async (roleId, opts) => { calls.push(opts); return { ...ENTRY, id: 'new-id' }; } });
    const res = mockRes();
    await createRoute(MEMBER_OF_R1, store, null)(postReq({ title: 'A', monthDay: '01-15' }), res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(calls[0].channelId, null);
});

test('403 missing_role when creating on a wheel the caller does not hold', async () => {
    const res = mockRes();
    await createRoute(MEMBER_OF_R1)(postReq({ title: 'A', monthDay: '01-15' }, 'r-other'), res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'missing_role' });
});

test('403 not_in_guild when creating as a non-member', async () => {
    const res = mockRes();
    await createRoute({ member: false })(postReq({ title: 'A', monthDay: '01-15' }), res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'not_in_guild' });
});

test('a moderator may create on a wheel they do not hold', async () => {
    const res = mockRes();
    await createRoute(MODERATOR)(postReq({ title: 'A', monthDay: '01-15' }, 'r-any'), res);
    assert.strictEqual(res.statusCode, 201);
});

test('400 invalid_input names the offending field', async () => {
    const res = mockRes();
    await createRoute(MEMBER_OF_R1)(postReq({ title: 'A', monthDay: '02-30' }), res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'invalid_input', field: 'monthDay' });

    const res2 = mockRes();
    await createRoute(MEMBER_OF_R1)(postReq({ title: '', monthDay: '01-15' }), res2);
    assert.deepStrictEqual(res2.body, { error: 'invalid_input', field: 'title' });
});

test('validation runs after the permission gate, so a stranger learns nothing from it', async () => {
    const res = mockRes();
    await createRoute(MEMBER_OF_R1)(postReq({ title: '', monthDay: 'nope' }, 'r-other'), res);
    assert.strictEqual(res.statusCode, 403);
});

// --- update ---

test('updates an entry and returns it', async () => {
    const res = mockRes();
    await updateRoute(MEMBER_OF_R1)(entryReq({ title: 'B', body: 'c', monthDay: '02-01', version: 1 }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.title, 'B');
    assert.strictEqual(res.body.version, 2);
});

test('404 not_found for an unknown entry, before the permission gate', async () => {
    const res = mockRes();
    await updateRoute(MEMBER_OF_R1)(entryReq({ title: 'B', monthDay: '02-01', version: 1 }, 'nope'), res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'not_found' });
});

test('403 missing_role when updating an entry on a foreign wheel', async () => {
    const other = {
        member: true, displayName: 'X', isModerator: false,
        instruments: [], workgroups: [{ id: 'r-other', name: 'annan' }]
    };
    const res = mockRes();
    await updateRoute(other)(entryReq({ title: 'B', monthDay: '02-01', version: 1 }), res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'missing_role' });
});

test('409 version_conflict returns the current entry so the page can reload it', async () => {
    const store = stores({ update: async () => { throw new Error('version_conflict'); } });
    const res = mockRes();
    await updateRoute(MEMBER_OF_R1, store)(entryReq({ title: 'B', monthDay: '02-01', version: 1 }), res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error, 'version_conflict');
    assert.strictEqual(res.body.entry.id, 'e1');
});

test('400 invalid_input when the version is missing or not a number', async () => {
    const res = mockRes();
    await updateRoute(MEMBER_OF_R1)(entryReq({ title: 'B', monthDay: '02-01' }), res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'invalid_input', field: 'version' });
});

// --- delete ---

test('deletes an entry and returns 204', async () => {
    const res = mockRes();
    await deleteRoute(MEMBER_OF_R1)(entryReq({ version: 1 }), res);
    assert.strictEqual(res.statusCode, 204);
    assert.strictEqual(res.ended, true);
});

test('403 missing_role when deleting an entry on a foreign wheel', async () => {
    const other = {
        member: true, displayName: 'X', isModerator: false,
        instruments: [], workgroups: [{ id: 'r-other', name: 'annan' }]
    };
    const res = mockRes();
    await deleteRoute(other)(entryReq({ version: 1 }), res);
    assert.strictEqual(res.statusCode, 403);
});

test('409 version_conflict when deleting with a stale version', async () => {
    const store = stores({ remove: async () => { throw new Error('version_conflict'); } });
    const res = mockRes();
    await deleteRoute(MEMBER_OF_R1, store)(entryReq({ version: 1 }), res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.entry.id, 'e1');
});

test('a moderator may delete an entry on a wheel they do not hold', async () => {
    const res = mockRes();
    await deleteRoute(MODERATOR)(entryReq({ version: 1 }), res);
    assert.strictEqual(res.statusCode, 204);
});

test('500 when the store fails for an unexpected reason', async () => {
    const store = stores({ update: async () => { throw new Error('arshjul_file_corrupt'); } });
    const res = mockRes();
    await updateRoute(MEMBER_OF_R1, store)(entryReq({ title: 'B', monthDay: '02-01', version: 1 }), res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'internal' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routes/webYearwheelWrite.test.js`
Expected: FAIL — `Cannot find module '../../src/routes/api/web/yearwheelWrite'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/routes/api/web/yearwheelWrite.js
const { validateEntryInput } = require('../../../utils/arshjulEntry');

// Anyone holding the wheel's role may edit anything on it, and a moderator may reach any
// wheel. The audit log below — not per-entry ownership — is what makes that accountable.
async function gate({ memberGroups, userId, roleId, res, logger, label }) {
    let groups;
    try {
        groups = await memberGroups.getGroups(userId);
    } catch (err) {
        if (logger) logger(`${label} lookup failed:`, err.message);
        res.status(500).json({ error: 'internal' });
        return null;
    }

    if (!groups.member) {
        res.status(403).json({ error: 'not_in_guild' });
        return null;
    }

    const owned = [...(groups.instruments || []), ...(groups.workgroups || [])].find(g => g.id === roleId);
    if (!owned && !groups.isModerator) {
        res.status(403).json({ error: 'missing_role' });
        return null;
    }

    return groups;
}

function readVersion(body) {
    const version = body && body.version;
    return Number.isInteger(version) ? version : null;
}

function createWebYearwheelCreateRoute({ memberGroups, arshjulStore, resolveChannelId, logger }) {
    return async function webYearwheelCreateRoute(req, res) {
        const roleId = req.params.roleId;

        const groups = await gate({
            memberGroups, userId: req.webUser.id, roleId, res, logger,
            label: 'POST /api/web/yearwheel'
        });
        if (!groups) return;

        const validated = validateEntryInput(req.body);
        if (!validated.ok) return res.status(400).json({ error: 'invalid_input', field: validated.field });

        // A group with no channel still gets a working wheel; only delivery is withheld.
        let channelId = null;
        try {
            channelId = await resolveChannelId(roleId);
        } catch (err) {
            if (logger) logger('POST /api/web/yearwheel channel lookup failed:', err.message);
        }

        try {
            const entry = await arshjulStore.create(roleId, {
                ...validated.value,
                channelId,
                userId: req.webUser.id
            });
            if (logger) {
                logger(`arshjul: ${req.webUser.id} created entry ${entry.id} on role ${roleId} — ` +
                    `${entry.monthDay} "${entry.title}"`);
            }
            return res.status(201).json(entry);
        } catch (err) {
            if (logger) logger('POST /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }
    };
}

function createWebYearwheelUpdateRoute({ memberGroups, arshjulStore, logger }) {
    return async function webYearwheelUpdateRoute(req, res) {
        let existing;
        try {
            existing = await arshjulStore.getEntry(req.params.id);
        } catch (err) {
            if (logger) logger('PATCH /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }
        // Unknown id answers 404 before any permission work, so a probe cannot tell
        // "exists but forbidden" from "does not exist".
        if (!existing) return res.status(404).json({ error: 'not_found' });

        const groups = await gate({
            memberGroups, userId: req.webUser.id, roleId: existing.roleId, res, logger,
            label: 'PATCH /api/web/yearwheel'
        });
        if (!groups) return;

        const version = readVersion(req.body);
        if (version === null) return res.status(400).json({ error: 'invalid_input', field: 'version' });

        const validated = validateEntryInput(req.body);
        if (!validated.ok) return res.status(400).json({ error: 'invalid_input', field: validated.field });

        try {
            const entry = await arshjulStore.update(req.params.id, {
                ...validated.value,
                version,
                userId: req.webUser.id
            });
            if (logger) {
                logger(`arshjul: ${req.webUser.id} updated entry ${entry.id} on role ${entry.roleId} — ` +
                    `from ${existing.monthDay} "${existing.title}" to ${entry.monthDay} "${entry.title}"`);
            }
            return res.json(entry);
        } catch (err) {
            if (err.message === 'version_conflict') {
                return res.status(409).json({ error: 'version_conflict', entry: existing });
            }
            if (err.message === 'entry_not_found') return res.status(404).json({ error: 'not_found' });
            if (logger) logger('PATCH /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }
    };
}

function createWebYearwheelDeleteRoute({ memberGroups, arshjulStore, logger }) {
    return async function webYearwheelDeleteRoute(req, res) {
        let existing;
        try {
            existing = await arshjulStore.getEntry(req.params.id);
        } catch (err) {
            if (logger) logger('DELETE /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }
        if (!existing) return res.status(404).json({ error: 'not_found' });

        const groups = await gate({
            memberGroups, userId: req.webUser.id, roleId: existing.roleId, res, logger,
            label: 'DELETE /api/web/yearwheel'
        });
        if (!groups) return;

        const version = readVersion(req.body);
        if (version === null) return res.status(400).json({ error: 'invalid_input', field: 'version' });

        try {
            await arshjulStore.remove(req.params.id, version);
            if (logger) {
                logger(`arshjul: ${req.webUser.id} deleted entry ${existing.id} on role ${existing.roleId} — ` +
                    `${existing.monthDay} "${existing.title}"`);
            }
            return res.status(204).end();
        } catch (err) {
            if (err.message === 'version_conflict') {
                return res.status(409).json({ error: 'version_conflict', entry: existing });
            }
            if (err.message === 'entry_not_found') return res.status(404).json({ error: 'not_found' });
            if (logger) logger('DELETE /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }
    };
}

module.exports = {
    createWebYearwheelCreateRoute,
    createWebYearwheelUpdateRoute,
    createWebYearwheelDeleteRoute
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routes/webYearwheelWrite.test.js`
Expected: PASS, 18 tests

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/web/yearwheelWrite.js tests/routes/webYearwheelWrite.test.js
git commit -m "feat(arshjul): create, update and delete entry routes"
```

---

### Task 10: Origin allowlist middleware

**Files:**
- Create: `src/middleware/webOrigin.js`
- Test: `tests/middleware/webOrigin.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `createWebOriginMiddleware({ allowedOrigin, logger }) => (req, res, next) => void`

The årshjul is served from the same registrable domain as the rest of the user's site. A compromised sibling subdomain cannot read the host-only `kiribot_session` cookie, but the browser would still attach it to a forged same-site request. This check rejects those. A request with no `Origin` header at all is rejected too — every legitimate write comes from the site's own `fetch`, which always sends one.

- [ ] **Step 1: Write the failing test**

```js
// tests/middleware/webOrigin.test.js
const test = require('node:test');
const assert = require('node:assert');
const createWebOriginMiddleware = require('../../src/middleware/webOrigin');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

const ALLOWED = 'https://kiribot.ollelindberg.se';
const mw = createWebOriginMiddleware({ allowedOrigin: ALLOWED });

test('calls next for the allowed origin', () => {
    const res = mockRes();
    let called = false;
    mw({ headers: { origin: ALLOWED } }, res, () => { called = true; });
    assert.strictEqual(called, true);
    assert.strictEqual(res.statusCode, 200);
});

test('rejects a different origin', () => {
    const res = mockRes();
    let called = false;
    mw({ headers: { origin: 'https://evil.example' } }, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'bad_origin' });
});

test('rejects a sibling subdomain on the same registrable domain', () => {
    const res = mockRes();
    mw({ headers: { origin: 'https://something-else.ollelindberg.se' } }, res, () => {});
    assert.strictEqual(res.statusCode, 403);
});

test('rejects a request with no Origin header', () => {
    const res = mockRes();
    let called = false;
    mw({ headers: {} }, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res.statusCode, 403);
});

test('rejects everything when no allowed origin is configured', () => {
    const res = mockRes();
    createWebOriginMiddleware({ allowedOrigin: undefined })({ headers: { origin: ALLOWED } }, res, () => {});
    assert.strictEqual(res.statusCode, 403);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/middleware/webOrigin.test.js`
Expected: FAIL — `Cannot find module '../../src/middleware/webOrigin'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/middleware/webOrigin.js
// CSRF guard for the årshjul write routes. The session cookie is host-only and HttpOnly, so a
// sibling subdomain cannot read it — but the browser would still attach it to a forged
// same-site request, so the Origin header is checked explicitly on every write.
function createWebOriginMiddleware({ allowedOrigin, logger }) {
    return function webOrigin(req, res, next) {
        const origin = req.headers.origin;
        if (typeof allowedOrigin !== 'string' || allowedOrigin.length === 0 || origin !== allowedOrigin) {
            if (logger) logger(`arshjul: write rejected, bad origin ${origin === undefined ? '(none)' : origin}`);
            return res.status(403).json({ error: 'bad_origin' });
        }
        return next();
    };
}

module.exports = createWebOriginMiddleware;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/middleware/webOrigin.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/middleware/webOrigin.js tests/middleware/webOrigin.test.js
git commit -m "feat(arshjul): Origin allowlist on write routes"
```

---

### Task 11: Wire the routes into Express

**Files:**
- Modify: `src/core/express.js`
- Test: `tests/core/cors.test.js`

**Interfaces:**
- Consumes: everything from Tasks 5–10.
- Produces: `POST /api/web/yearwheel/:roleId`, `PATCH /api/web/yearwheel/entry/:id`, `DELETE /api/web/yearwheel/entry/:id`, `GET /api/web/groups`, all mounted inside the existing `if (webSession)` block.

Two things need care. The CORS config currently advertises `methods: ['GET', 'POST']` (`src/core/express.js:112`) — `PATCH` and `DELETE` must be added or every write preflight fails. The Activity is unaffected: its routes accept only `GET` and `POST`, so a `PATCH` aimed at one still 404s exactly as it does today.

- [ ] **Step 1: Write the failing test**

Append to `tests/core/cors.test.js`:

```js
const { buildApp } = require('../../src/core/express');

test('CORS advertises the methods the årshjul write routes need', async () => {
    const app = buildApp({
        client: { guilds: { cache: { get: () => undefined } } },
        config: { webOrigin: 'https://kiribot.ollelindberg.se', sessionSecret: 'x'.repeat(43) }
    });

    const res = await fetch(`http://127.0.0.1:${await listen(app)}/api/web/me`, {
        method: 'OPTIONS',
        headers: {
            origin: 'https://kiribot.ollelindberg.se',
            'access-control-request-method': 'PATCH'
        }
    });
    const allowed = (res.headers.get('access-control-allow-methods') || '').split(',').map(s => s.trim());
    assert.ok(allowed.includes('PATCH'), `expected PATCH in ${allowed}`);
    assert.ok(allowed.includes('DELETE'), `expected DELETE in ${allowed}`);
    assert.ok(allowed.includes('GET'));
    assert.ok(allowed.includes('POST'));
});
```

> If `tests/core/cors.test.js` has no `listen` helper, add one at the top of the file:
> ```js
> const servers = [];
> async function listen(app) {
>     const server = await new Promise(resolve => {
>         const s = app.listen(0, '127.0.0.1', () => resolve(s));
>     });
>     servers.push(server);
>     return server.address().port;
> }
> test.after(() => servers.forEach(s => s.close()));
> ```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/core/cors.test.js`
Expected: FAIL — `expected PATCH in [ 'GET', 'POST' ]`

- [ ] **Step 3: Write minimal implementation**

Add these requires near the existing web-route requires in `src/core/express.js`:

```js
const createRoleChannelService = require('../services/roleChannel');
const createWebOriginMiddleware = require('../middleware/webOrigin');
const createWebGroupsRoute = require('../routes/api/web/groups');
const {
    createWebYearwheelCreateRoute,
    createWebYearwheelUpdateRoute,
    createWebYearwheelDeleteRoute
} = require('../routes/api/web/yearwheelWrite');
```

Extend the constants import on line 21:

```js
const {
    dir_EventsActive, hex_instr, hex_arbet, role_moderator, cat_Arbetsgrupper, cat_Sektioner
} = require('./constants');
```

After the `arshjulStore` line (`src/core/express.js:89`), add:

```js
    const roleChannel = createRoleChannelService({
        client,
        guildId: config.guildId,
        categoryIds: [cat_Arbetsgrupper, cat_Sektioner],
        cache: createTtlCache({ ttlMs: 60_000 })
    });

    // A user-editable cron that pings a whole role is inherently a spam vector; this is one of
    // the four mitigations, alongside the role gate, restricted mentions and the audit log.
    const arshjulWriteLimiter = rateLimit({
        windowMs: 60_000,
        limit: 30,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        keyGenerator: req => req.webUser?.id || req.ip,
        message: { error: 'rate_limited' }
    });

    const webOrigin = createWebOriginMiddleware({ allowedOrigin: config.webOrigin, logger });
```

Change the CORS `methods` line (`src/core/express.js:112`) to:

```js
            methods: ['GET', 'POST', 'PATCH', 'DELETE'],
```

Inside the existing `if (webSession) { … }` block, replace the yearwheel line and add the rest:

```js
        app.get('/api/web/yearwheel/:roleId', webAuth,
            asyncRoute(createWebYearwheelRoute({
                memberGroups, arshjulStore, resolveChannelId: roleChannel.resolveChannelId, logger
            })));
        app.get('/api/web/groups', webAuth, asyncRoute(createWebGroupsRoute({ memberGroups, logger })));
        app.post('/api/web/yearwheel/:roleId', webAuth, webOrigin, arshjulWriteLimiter,
            asyncRoute(createWebYearwheelCreateRoute({
                memberGroups, arshjulStore, resolveChannelId: roleChannel.resolveChannelId, logger
            })));
        app.patch('/api/web/yearwheel/entry/:id', webAuth, webOrigin, arshjulWriteLimiter,
            asyncRoute(createWebYearwheelUpdateRoute({ memberGroups, arshjulStore, logger })));
        app.delete('/api/web/yearwheel/entry/:id', webAuth, webOrigin, arshjulWriteLimiter,
            asyncRoute(createWebYearwheelDeleteRoute({ memberGroups, arshjulStore, logger })));
```

Finally, put the store and the channel resolver on `app.locals` so Task 13 can build the dispatcher on the same instances. Note this assignment sits **outside** the `if (webSession)` block: entries already on disk must keep being delivered even if a missing `sessionSecret` leaves the web routes unmounted. Change the bottom of `buildApp` from `return app;` to:

```js
    app.locals.arshjul = { store: arshjulStore, resolveChannelId: roleChannel.resolveChannelId };
    return app;
```

- [ ] **Step 4: Run the whole backend suite**

Run: `npm test`
Expected: PASS — every test, including the milestone 1 ones

- [ ] **Step 5: Commit**

```bash
git add src/core/express.js tests/core/cors.test.js
git commit -m "feat(arshjul): mount write routes, roster route and the write limiter"
```

---

### Task 12: Dispatcher — the tick

**Files:**
- Create: `src/services/arshjulDispatcher.js`
- Test: `tests/services/arshjulDispatcher.test.js`

**Interfaces:**
- Consumes: `todayInStockholm`, `dueWindow`, `effectiveMonthDay`, `shouldTickOnStart`, `msUntilNextSendHour` (Task 1); store `listAll`/`markSent` (Tasks 3–4); `resolveChannelId` (Task 5).
- Produces: `createArshjulDispatcher({ client, store, resolveChannelId, testChannelId, isLive, sendHour, logger, now, sleep }) => { tick(): Promise<void>, start(): void, stop(): void }`

`isLive` is a **function** returning a boolean, read at send time, so the config can be reloaded without rebuilding the dispatcher. `now` is a function returning a `Date`, and `sleep` is injected, so tests neither wait nor depend on the real clock.

Delivery is send-then-mark: a crash between the two duplicates one thread at worst, which is visible and recoverable, where the reverse order silently drops a reminder.

The test-mode prefix uses a channel mention (`<#id>`), which Discord renders as `#channel-name` without the dispatcher having to fetch the real channel just to read its name.

**This module is what posts to the live Discord server.** With `isLive()` false it posts only to the bot-test channel and mentions no role.

- [ ] **Step 1: Write the failing test**

```js
// tests/services/arshjulDispatcher.test.js
const test = require('node:test');
const assert = require('node:assert');
const createArshjulDispatcher = require('../../src/services/arshjulDispatcher');

function fakeChannel(id, sends) {
    return {
        id,
        send: async payload => {
            sends.push({ channelId: id, payload });
            return {
                startThread: async opts => { sends[sends.length - 1].thread = opts; }
            };
        }
    };
}

function harness({ entries, live = true, nowIso = '2026-03-03T09:00:00Z', channelId = 'c1', testChannelId = 'bot-test' }) {
    const sends = [];
    const marked = [];
    const logs = [];
    const dispatcher = createArshjulDispatcher({
        client: { channels: { fetch: async id => fakeChannel(id, sends) } },
        store: {
            listAll: async () => entries.map(e => ({ ...e })),
            markSent: async (id, year) => { marked.push([id, year]); }
        },
        resolveChannelId: async () => channelId,
        testChannelId,
        isLive: () => live,
        sendHour: 8,
        logger: (...args) => logs.push(args.join(' ')),
        now: () => new Date(nowIso),
        sleep: async () => {}
    });
    return { dispatcher, sends, marked, logs };
}

const ENTRY = {
    id: 'e1', roleId: 'r1', channelId: 'c1', monthDay: '03-03',
    title: 'Boka lokal', body: 'Ring dem', version: 1, sentYears: []
};

test('posts to the role channel, mentions the role and opens a thread', async () => {
    const h = harness({ entries: [ENTRY] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 1);
    assert.strictEqual(h.sends[0].channelId, 'c1');
    assert.strictEqual(h.sends[0].payload.content, '<@&r1>\nRing dem');
    assert.deepStrictEqual(h.sends[0].payload.allowedMentions, { parse: [], roles: ['r1'] });
    assert.deepStrictEqual(h.sends[0].thread, { name: 'Boka lokal' });
});

test('marks the year as sent', async () => {
    const h = harness({ entries: [ENTRY] });
    await h.dispatcher.tick();
    assert.deepStrictEqual(h.marked, [['e1', 2026]]);
});

test('sends the mention alone when the body is empty', async () => {
    const h = harness({ entries: [{ ...ENTRY, body: '' }] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends[0].payload.content, '<@&r1>');
});

test('skips an entry already sent this year', async () => {
    const h = harness({ entries: [{ ...ENTRY, sentYears: [2026] }] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 0);
});

test('sends again in a new year', async () => {
    const h = harness({ entries: [{ ...ENTRY, sentYears: [2025] }] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 1);
    assert.deepStrictEqual(h.marked, [['e1', 2026]]);
});

test('catches up an entry up to two days late', async () => {
    const h = harness({ entries: [{ ...ENTRY, monthDay: '03-01' }] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 1);
});

test('skips an entry three days late and logs it once', async () => {
    const h = harness({ entries: [{ ...ENTRY, monthDay: '02-28' }] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 0);
    assert.ok(h.logs.some(l => l.includes('missed')), `expected a missed log in ${JSON.stringify(h.logs)}`);
});

test('does not send an entry dated in the future', async () => {
    const h = harness({ entries: [{ ...ENTRY, monthDay: '12-24' }] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 0);
});

test('29 February fires on 28 February in a non-leap year', async () => {
    const h = harness({ entries: [{ ...ENTRY, monthDay: '02-29' }], nowIso: '2026-02-28T09:00:00Z' });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 1);
});

test('29 February fires on its own day in a leap year', async () => {
    const h = harness({ entries: [{ ...ENTRY, monthDay: '02-29' }], nowIso: '2024-02-29T09:00:00Z' });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 1);
    assert.deepStrictEqual(h.marked, [['e1', 2024]]);
});

test('a second tick the same day sends nothing new', async () => {
    const entries = [{ ...ENTRY }];
    const sends = [];
    const dispatcher = createArshjulDispatcher({
        client: { channels: { fetch: async id => fakeChannel(id, sends) } },
        store: {
            listAll: async () => entries.map(e => ({ ...e })),
            markSent: async (id, year) => {
                const target = entries.find(e => e.id === id);
                if (!target.sentYears.includes(year)) target.sentYears.push(year);
            }
        },
        resolveChannelId: async () => 'c1',
        testChannelId: 'bot-test',
        isLive: () => true,
        sendHour: 8,
        logger: () => {},
        now: () => new Date('2026-03-03T09:00:00Z'),
        sleep: async () => {}
    });
    await dispatcher.tick();
    await dispatcher.tick();
    assert.strictEqual(sends.length, 1);
});

test('test mode posts to the bot-test channel, strips the mention and names the real target', async () => {
    const h = harness({ entries: [ENTRY], live: false });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends[0].channelId, 'bot-test');
    assert.strictEqual(h.sends[0].payload.content, '[TEST → <#c1>]\nRing dem');
    assert.deepStrictEqual(h.sends[0].payload.allowedMentions, { parse: [], roles: [] });
    assert.deepStrictEqual(h.sends[0].thread, { name: 'Boka lokal' });
});

test('test mode still marks the year, so nothing re-fires on go-live', async () => {
    const h = harness({ entries: [ENTRY], live: false });
    await h.dispatcher.tick();
    assert.deepStrictEqual(h.marked, [['e1', 2026]]);
});

test('an entry with no resolvable channel is skipped in both modes and not marked', async () => {
    for (const live of [true, false]) {
        const h = harness({ entries: [{ ...ENTRY, channelId: null }], channelId: null, live });
        await h.dispatcher.tick();
        assert.strictEqual(h.sends.length, 0);
        assert.deepStrictEqual(h.marked, []);
        assert.ok(h.logs.some(l => l.includes('no channel')));
    }
});

test('falls back to name resolution when the stored channel id is gone', async () => {
    const sends = [];
    const dispatcher = createArshjulDispatcher({
        client: {
            channels: {
                fetch: async id => {
                    if (id === 'stale') throw new Error('Unknown Channel');
                    return fakeChannel(id, sends);
                }
            }
        },
        store: { listAll: async () => [{ ...ENTRY, channelId: 'stale' }], markSent: async () => {} },
        resolveChannelId: async () => 'fresh',
        testChannelId: 'bot-test',
        isLive: () => true,
        sendHour: 8,
        logger: () => {},
        now: () => new Date('2026-03-03T09:00:00Z'),
        sleep: async () => {}
    });
    await dispatcher.tick();
    assert.strictEqual(sends.length, 1);
    assert.strictEqual(sends[0].channelId, 'fresh');
});

test('one entry failing to send does not stop the others', async () => {
    const sends = [];
    const marked = [];
    const dispatcher = createArshjulDispatcher({
        client: {
            channels: {
                fetch: async id => {
                    if (id === 'boom') throw new Error('Missing Permissions');
                    return fakeChannel(id, sends);
                }
            }
        },
        store: {
            listAll: async () => [
                { ...ENTRY, id: 'bad', channelId: 'boom' },
                { ...ENTRY, id: 'good', channelId: 'c1' }
            ],
            markSent: async (id, year) => { marked.push([id, year]); }
        },
        resolveChannelId: async () => null,
        testChannelId: 'bot-test',
        isLive: () => true,
        sendHour: 8,
        logger: () => {},
        now: () => new Date('2026-03-03T09:00:00Z'),
        sleep: async () => {}
    });
    await dispatcher.tick();
    assert.strictEqual(sends.length, 1);
    assert.deepStrictEqual(marked, [['good', 2026]]);
});

test('a title at the Discord limit is used unchanged', async () => {
    const title = 'x'.repeat(100);
    const h = harness({ entries: [{ ...ENTRY, title }] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends[0].thread.name, title);
    assert.strictEqual(h.sends[0].thread.name.length, 100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/services/arshjulDispatcher.test.js`
Expected: FAIL — `Cannot find module '../../src/services/arshjulDispatcher'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/services/arshjulDispatcher.js
const {
    todayInStockholm, dueWindow, effectiveMonthDay, msUntilNextSendHour, shouldTickOnStart
} = require('../utils/arshjulDates');

const CATCH_UP_DAYS = 2;
const SEND_STAGGER_MS = 1000;

// Posts to the live Discord server. While isLive() is false every thread goes to the
// bot-test channel with the role mention stripped — see config.arshjulLive.
function createArshjulDispatcher({
    client, store, resolveChannelId, testChannelId, isLive, sendHour = 8,
    logger = () => {}, now = () => new Date(), sleep = ms => new Promise(r => setTimeout(r, ms))
}) {
    let timer = null;

    async function fetchChannel(id) {
        if (!id) return null;
        try {
            return await client.channels.fetch(id);
        } catch {
            return null;
        }
    }

    async function channelFor(entry) {
        const stored = await fetchChannel(entry.channelId);
        if (stored) return stored;
        // The stored id is an optimisation, not the only lookup path: a group that gains a
        // channel after its entries were created starts delivering with no re-save.
        let resolvedId = null;
        try {
            resolvedId = await resolveChannelId(entry.roleId);
        } catch (err) {
            logger(`arshjul: channel lookup failed for role ${entry.roleId}:`, err.message);
        }
        return fetchChannel(resolvedId);
    }

    async function send(entry, year) {
        const target = await channelFor(entry);
        if (!target) {
            logger(`arshjul: entry ${entry.id} (role ${entry.roleId}) has no channel — skipped`);
            return;
        }

        const live = isLive() === true;
        const destination = live ? target : await fetchChannel(testChannelId);
        if (!destination) {
            logger(`arshjul: test channel ${testChannelId} unavailable — entry ${entry.id} skipped`);
            return;
        }

        // A channel mention renders as #name without another fetch just to read the name.
        const header = live ? `<@&${entry.roleId}>` : `[TEST → <#${target.id}>]`;
        const content = entry.body ? `${header}\n${entry.body}` : header;

        const message = await destination.send({
            content,
            allowedMentions: { parse: [], roles: live ? [entry.roleId] : [] }
        });
        // The thread is the deliverable — a place the group discusses the thing.
        await message.startThread({ name: entry.title });

        // Send, then mark. A crash between the two duplicates one visible thread; the
        // reverse order would silently drop a reminder.
        await store.markSent(entry.id, year);
        logger(`arshjul: sent entry ${entry.id} "${entry.title}" to ${destination.id}${live ? '' : ' (test mode)'}`);
    }

    async function tick() {
        const { year, monthDay } = todayInStockholm(now());
        const window = new Set(dueWindow(year, monthDay, CATCH_UP_DAYS));
        // The day that has just fallen out of the window — logged once, then never again.
        const justMissed = dueWindow(year, monthDay, CATCH_UP_DAYS + 1).at(-1);

        let entries;
        try {
            entries = await store.listAll();
        } catch (err) {
            logger('arshjul: dispatcher could not read the store:', err.message);
            return;
        }

        const pending = entries.filter(e => !(e.sentYears || []).includes(year));

        for (const entry of pending) {
            const due = effectiveMonthDay(entry.monthDay, year);
            if (due === justMissed && !window.has(due)) {
                logger(`arshjul: entry ${entry.id} "${entry.title}" missed its date ${entry.monthDay} — skipped`);
            }
        }

        const due = pending.filter(e => window.has(effectiveMonthDay(e.monthDay, year)));

        for (const entry of due) {
            try {
                await send(entry, year);
            } catch (err) {
                logger(`arshjul: failed to send entry ${entry.id}:`, err.message);
            }
            // Stagger, so a busy date does not hit Discord's rate limit.
            await sleep(SEND_STAGGER_MS);
        }
    }

    async function safeTick() {
        try {
            await tick();
        } catch (err) {
            logger('arshjul: dispatcher tick failed:', err.message);
        }
    }

    function scheduleNext() {
        // Recomputed after every run rather than setInterval(24h), which drifts an hour
        // twice a year when the clocks change.
        timer = setTimeout(async () => {
            // If a DST shift made the timer fire early, reschedule instead of sending.
            if (shouldTickOnStart(now(), sendHour)) await safeTick();
            scheduleNext();
        }, msUntilNextSendHour(now(), sendHour));
        if (timer.unref) timer.unref();
    }

    function start() {
        // A restart after the send hour delivers that same morning rather than falling
        // through to the catch-up window.
        if (shouldTickOnStart(now(), sendHour)) safeTick();
        scheduleNext();
    }

    function stop() {
        if (timer) clearTimeout(timer);
        timer = null;
    }

    return { tick, start, stop };
}

module.exports = createArshjulDispatcher;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/services/arshjulDispatcher.test.js`
Expected: PASS, 17 tests

- [ ] **Step 5: Commit**

```bash
git add src/services/arshjulDispatcher.js tests/services/arshjulDispatcher.test.js
git commit -m "feat(arshjul): daily dispatcher with test-channel gate and catch-up window"
```

---

### Task 13: Start the dispatcher, document the config

**Files:**
- Modify: `config.example.json`, `src/core/express.js`
- Test: manual — this is wiring, and its parts are covered by Tasks 11 and 12

**Interfaces:**
- Consumes: `createArshjulDispatcher` (Task 12), `app.locals.arshjul` (Task 11).
- Produces: a running dispatcher, started once when the Express server begins listening.

**Not `src/events/ready.js`, despite what a first reading of the spec suggests.** `src/index.js` registers every event handler in a loop (`src/index.js:17-26`) and only then adds its own `client.once('ready', …)` that starts Express (`src/index.js:40-44`). Listeners fire in registration order, so `events/ready.js` runs *before* Express exists — a dispatcher started there would find no `app` and silently never run. `start()` in `src/core/express.js` is the correct place: it already runs after `ready` for exactly this reason (the comment at `src/index.js:39` says so — `client.guilds.cache` must be populated), and it holds the same store and channel-resolver instances the routes use.

**This task is what makes the bot post on the live server.** With `arshjulLive` absent or `false` — the default, and what `config.example.json` documents — every thread goes to `ch_BotTest` and no role is mentioned.

- [ ] **Step 1: Add the config keys**

In `config.example.json`, alongside the existing `webOrigin`, `webRedirectUri` and `sessionSecret` keys:

```json
    "arshjulLive": false,
    "arshjulSendHour": 8
```

- [ ] **Step 2: Export a dispatcher factory from express.js**

Add to the requires in `src/core/express.js`:

```js
const createArshjulDispatcher = require('../services/arshjulDispatcher');
const { ch_BotTest } = require('./constants');
```

and extend the `app.locals.arshjul` assignment from Task 11:

```js
    app.locals.arshjul = {
        store: arshjulStore,
        resolveChannelId: roleChannel.resolveChannelId,
        createDispatcher: () => createArshjulDispatcher({
            client,
            store: arshjulStore,
            resolveChannelId: roleChannel.resolveChannelId,
            testChannelId: ch_BotTest,
            isLive: () => config.arshjulLive === true,
            sendHour: Number.isInteger(config.arshjulSendHour) ? config.arshjulSendHour : 8,
            logger
        })
    };
```

- [ ] **Step 3: Start it when the server listens**

In `src/core/express.js`, change `start` (`src/core/express.js:213-223`) so the dispatcher starts once the server is up:

```js
function start({ client, config }) {
    const app = buildApp({ client, config });
    const port = config.expressPort || 3000;
    return new Promise((resolve, reject) => {
        const server = app.listen(port, '127.0.0.1', () => {
            logger(`Express listening on 127.0.0.1:${port}`);
            // Started here, not in events/ready.js: index.js registers the event handlers
            // before its own ready listener that calls start(), so ready.js runs first and
            // would find no app. By here the client is ready and the guild cache populated.
            try {
                app.locals.arshjul.createDispatcher().start();
                logger(`Årshjul dispatcher started (${config.arshjulLive === true ? 'LIVE' : 'test channel'})`);
            } catch (err) {
                logger('Årshjul dispatcher failed to start:', err);
            }
            resolve(server);
        });
        server.on('error', reject);
    });
}
```

If `config.sessionSecret` is missing the web routes are not mounted, but `app.locals.arshjul` is still set by `buildApp` (it is assigned outside the `if (webSession)` block), so the dispatcher still runs. That is deliberate: entries already on disk must keep being delivered even when the web UI is unavailable.

- [ ] **Step 4: Verify nothing regressed**

Run: `npm test`
Expected: PASS

Then start the bot locally with no `arshjulLive` key set and confirm the log line `Årshjul dispatcher started` appears and **no message is posted anywhere**:

Run: `npm start`
Expected: the startup log line; no Discord message unless an entry is due today and the local hour is ≥ 8, in which case it appears in `#bot-test` with no role mention.

- [ ] **Step 5: Commit**

```bash
git add src/core/express.js config.example.json
git commit -m "feat(arshjul): start the dispatcher with the server, default to test-channel mode"
```

---

### Task 14: Frontend — apiPatch and apiDelete

**Files:**
- Modify: `yearwheel/src/api.js`
- Test: `yearwheel/tests/api.test.js`

**Interfaces:**
- Consumes: the existing `handle` and `API_BASE` in `yearwheel/src/api.js`.
- Produces: `apiPatch(path, body, fetchFn?) => Promise<any>`, `apiDelete(path, body, fetchFn?) => Promise<void>`

`apiDelete` returns `204` with no body, so it cannot go through `handle`, which always parses JSON. It shares the error path but returns `undefined` on success.

- [ ] **Step 1: Write the failing test**

Append to `yearwheel/tests/api.test.js`:

```js
import { apiPatch, apiDelete, ApiError } from '../src/api.js';

describe('apiPatch', () => {
    it('sends a PATCH with credentials and a JSON body', async () => {
        let seen;
        const fetchFn = async (url, opts) => {
            seen = { url, opts };
            return { ok: true, json: async () => ({ id: 'e1', version: 2 }) };
        };
        const out = await apiPatch('/api/web/yearwheel/entry/e1', { title: 'B', version: 1 }, fetchFn);
        expect(out).toEqual({ id: 'e1', version: 2 });
        expect(seen.opts.method).toBe('PATCH');
        expect(seen.opts.credentials).toBe('include');
        expect(seen.opts.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(seen.opts.body)).toEqual({ title: 'B', version: 1 });
    });

    it('throws an ApiError carrying the server error code', async () => {
        const fetchFn = async () => ({
            ok: false, status: 409,
            json: async () => ({ error: 'version_conflict', entry: { id: 'e1' } })
        });
        await expect(apiPatch('/x', {}, fetchFn)).rejects.toBeInstanceOf(ApiError);
        await expect(apiPatch('/x', {}, fetchFn)).rejects.toMatchObject({ status: 409, code: 'version_conflict' });
    });

    it('exposes the conflicting entry from a 409 body', async () => {
        const fetchFn = async () => ({
            ok: false, status: 409,
            json: async () => ({ error: 'version_conflict', entry: { id: 'e1', version: 7 } })
        });
        await expect(apiPatch('/x', {}, fetchFn)).rejects.toMatchObject({ body: { entry: { id: 'e1', version: 7 } } });
    });
});

describe('apiDelete', () => {
    it('sends a DELETE with the version and resolves with nothing on 204', async () => {
        let seen;
        const fetchFn = async (url, opts) => {
            seen = { url, opts };
            return { ok: true, status: 204 };
        };
        const out = await apiDelete('/api/web/yearwheel/entry/e1', { version: 1 }, fetchFn);
        expect(out).toBeUndefined();
        expect(seen.opts.method).toBe('DELETE');
        expect(JSON.parse(seen.opts.body)).toEqual({ version: 1 });
    });

    it('throws an ApiError on failure', async () => {
        const fetchFn = async () => ({ ok: false, status: 409, json: async () => ({ error: 'version_conflict' }) });
        await expect(apiDelete('/x', { version: 1 }, fetchFn)).rejects.toMatchObject({ code: 'version_conflict' });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yearwheel && npx vitest run tests/api.test.js`
Expected: FAIL — `apiPatch is not a function`

- [ ] **Step 3: Write minimal implementation**

Replace `ApiError` and add the two functions in `yearwheel/src/api.js`:

```js
export class ApiError extends Error {
    constructor(status, code, body) {
        super(`${status} ${code}`);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        // A 409 carries the current server entry so the page can reload the form onto it.
        this.body = body;
    }
}

async function fail(res) {
    let code = `http_${res.status}`;
    let body;
    try {
        body = await res.json();
        if (body && body.error) code = body.error;
    } catch { /* keep the http_ fallback */ }
    return new ApiError(res.status, code, body);
}

async function handle(res) {
    if (res.ok) return res.json();
    throw await fail(res);
}

function writeOptions(method, body) {
    return {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    };
}

export async function apiPatch(path, body, fetchFn = fetch) {
    return handle(await fetchFn(`${API_BASE}${path}`, writeOptions('PATCH', body)));
}

// DELETE answers 204 with no body, so it cannot go through handle().
export async function apiDelete(path, body, fetchFn = fetch) {
    const res = await fetchFn(`${API_BASE}${path}`, writeOptions('DELETE', body));
    if (!res.ok) throw await fail(res);
}
```

Rewrite `apiPost` to reuse the helper, keeping its existing behaviour:

```js
export async function apiPost(path, body, fetchFn = fetch) {
    return handle(await fetchFn(`${API_BASE}${path}`, writeOptions('POST', body)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd yearwheel && npx vitest run`
Expected: PASS — the existing api/auth/callback/landing/wheel tests plus the five new ones

- [ ] **Step 5: Commit**

```bash
git add yearwheel/src/api.js yearwheel/tests/api.test.js
git commit -m "feat(arshjul): PATCH and DELETE helpers in the web api client"
```

---

### Task 15: Frontend — the Mod section

**Files:**
- Modify: `yearwheel/src/landing.js`, `yearwheel/src/styles.css`
- Test: `yearwheel/tests/landing.test.js`

**Interfaces:**
- Consumes: `apiGet` (existing), `me.isModerator` (Task 6), `GET /api/web/groups` (Task 7).
- Produces: `MOD_SECTION_TEXT`, `MOD_LOAD_ERROR_TEXT` exported for tests; `toState` carries `isModerator`; `renderLanding` appends a `<details class="mod-section">` when it is true; `initLanding` fetches the roster on first open.

The section is closed by default and fetches on first open, so a moderator's ordinary visit costs exactly what everyone else's does. It lists all groups, their own included — "alla grupper" that quietly omits three is worse than a short duplicate.

- [ ] **Step 1: Write the failing test**

Append to `yearwheel/tests/landing.test.js`:

```js
import { renderLanding, toState, MOD_SECTION_TEXT, MOD_LOAD_ERROR_TEXT } from '../src/landing.js';

describe('the Mod section', () => {
    const OK_MOD = {
        kind: 'ok', displayName: 'Mod', isModerator: true,
        instruments: [{ id: 'i1', name: 'tarol' }], workgroups: []
    };

    it('uses the exact heading wording', () => {
        expect(MOD_SECTION_TEXT).toBe('Mod — alla gruppers årshjul');
        expect(MOD_LOAD_ERROR_TEXT).toBe('Kunde inte hämta grupplistan.');
    });

    it('is absent for an ordinary member', () => {
        renderLanding(root, {
            kind: 'ok', displayName: 'Olle L', isModerator: false,
            instruments: [{ id: 'i1', name: 'tarol' }], workgroups: []
        });
        expect(root.querySelector('.mod-section')).toBeNull();
    });

    it('is present and closed for a moderator', () => {
        renderLanding(root, OK_MOD);
        const details = root.querySelector('details.mod-section');
        expect(details).not.toBeNull();
        expect(details.open).toBe(false);
        expect(details.querySelector('summary').textContent).toBe(MOD_SECTION_TEXT);
    });

    it('renders no group links until it is filled', () => {
        renderLanding(root, OK_MOD);
        expect(root.querySelectorAll('.mod-section a.group-link').length).toBe(0);
    });

    it('shows a moderator with no groups both the no-groups text and the section', () => {
        renderLanding(root, { kind: 'no_groups', displayName: 'Mod', isModerator: true });
        expect(root.textContent).toContain(NO_GROUPS_TEXT);
        expect(root.querySelector('details.mod-section')).not.toBeNull();
    });

    it('toState carries isModerator through', () => {
        expect(toState({ member: true, displayName: 'M', isModerator: true, instruments: [], workgroups: [] }).isModerator).toBe(true);
        expect(toState({ member: true, displayName: 'O', isModerator: false, instruments: [{ id: 'i1', name: 'tarol' }], workgroups: [] }).isModerator).toBe(false);
    });
});

describe('fillModSection', () => {
    it('lists every instrument and workgroup as a wheel link', async () => {
        renderLanding(root, {
            kind: 'ok', displayName: 'Mod', isModerator: true,
            instruments: [{ id: 'i1', name: 'tarol' }], workgroups: []
        });
        const { fillModSection } = await import('../src/landing.js');
        await fillModSection(root.querySelector('details.mod-section'), async () => ({
            instruments: [{ id: 'i1', name: 'tarol' }],
            workgroups: [{ id: 'w1', name: 'transportgruppen' }]
        }));
        const links = [...root.querySelectorAll('.mod-section a.group-link')];
        expect(links.map(a => a.textContent)).toEqual(['tarol', 'transportgruppen']);
        expect(links[1].getAttribute('href')).toBe('wheel.html?role=w1');
    });

    it('fetches only once even if opened repeatedly', async () => {
        renderLanding(root, { kind: 'ok', displayName: 'Mod', isModerator: true, instruments: [], workgroups: [] });
        const { fillModSection } = await import('../src/landing.js');
        let calls = 0;
        const load = async () => { calls++; return { instruments: [], workgroups: [] }; };
        const details = root.querySelector('details.mod-section');
        await fillModSection(details, load);
        await fillModSection(details, load);
        expect(calls).toBe(1);
    });

    it('renders its error inside the section and leaves the rest of the page intact', async () => {
        renderLanding(root, {
            kind: 'ok', displayName: 'Mod', isModerator: true,
            instruments: [{ id: 'i1', name: 'tarol' }], workgroups: []
        });
        const { fillModSection } = await import('../src/landing.js');
        await fillModSection(root.querySelector('details.mod-section'), async () => { throw new Error('nope'); });
        expect(root.querySelector('.mod-section').textContent).toContain(MOD_LOAD_ERROR_TEXT);
        // The caller's own group link is untouched.
        expect(root.querySelector('.group-section a.group-link').textContent).toBe('tarol');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yearwheel && npx vitest run tests/landing.test.js`
Expected: FAIL — `MOD_SECTION_TEXT` is `undefined`

- [ ] **Step 3: Write minimal implementation**

Add to `yearwheel/src/landing.js`:

```js
export const MOD_SECTION_TEXT = 'Mod — alla gruppers årshjul';
export const MOD_LOAD_ERROR_TEXT = 'Kunde inte hämta grupplistan.';

function modSection() {
    const details = el('details', 'mod-section');
    details.appendChild(el('summary', null, MOD_SECTION_TEXT));
    details.appendChild(el('div', 'mod-body'));
    return details;
}

// Fetches on first open, not on page load, so a moderator's ordinary visit costs what
// everyone else's does. Lists all groups, their own included.
export async function fillModSection(details, loadGroups) {
    if (!details || details.dataset.loaded === 'true') return;
    details.dataset.loaded = 'true';

    const body = details.querySelector('.mod-body');
    body.replaceChildren();

    let all;
    try {
        all = await loadGroups();
    } catch {
        details.dataset.loaded = 'false'; // allow a retry on the next open
        body.replaceChildren(el('p', 'notice', MOD_LOAD_ERROR_TEXT));
        return;
    }

    if (all.instruments.length) body.appendChild(groupSection('Instrument', all.instruments));
    if (all.workgroups.length) body.appendChild(groupSection('Arbetsgrupper', all.workgroups));
}
```

In `renderLanding`, append the section in both the `no_groups` and `ok` branches:

```js
    if (state.kind === 'no_groups') {
        root.appendChild(el('p', 'notice', NO_GROUPS_TEXT));
        if (state.isModerator) root.appendChild(modSection());
        root.appendChild(logoutButton());
        return;
    }

    root.appendChild(el('p', 'greeting', state.displayName));
    if (state.instruments.length) root.appendChild(groupSection('Instrument', state.instruments));
    if (state.workgroups.length) root.appendChild(groupSection('Arbetsgrupper', state.workgroups));
    if (state.isModerator) root.appendChild(modSection());
    root.appendChild(logoutButton());
```

Carry the flag through `toState`:

```js
export function toState(me) {
    if (!me.member) return { kind: 'not_member' };
    const isModerator = me.isModerator === true;
    if (!me.instruments.length && !me.workgroups.length) {
        return { kind: 'no_groups', displayName: me.displayName, isModerator };
    }
    return {
        kind: 'ok',
        displayName: me.displayName,
        isModerator,
        instruments: me.instruments,
        workgroups: me.workgroups
    };
}
```

And wire the toggle at the end of `initLanding`, before the login/logout handlers:

```js
    const mod = root.querySelector('details.mod-section');
    mod?.addEventListener('toggle', () => {
        if (mod.open) fillModSection(mod, () => apiGet('/api/web/groups'));
    });
```

Add to `yearwheel/src/styles.css`:

```css
.mod-section { margin-top: 2rem; border-top: 1px solid currentColor; padding-top: 1rem; opacity: 0.9; }
.mod-section > summary { cursor: pointer; font-weight: 600; }
.mod-section .mod-body { margin-top: 0.5rem; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd yearwheel && npx vitest run`
Expected: PASS, all frontend tests

- [ ] **Step 5: Commit**

```bash
git add yearwheel/src/landing.js yearwheel/src/styles.css yearwheel/tests/landing.test.js
git commit -m "feat(arshjul): collapsed Mod section listing every group's wheel"
```

---

### Task 16: Frontend — month grouping, banner and moderator line

**Files:**
- Modify: `yearwheel/src/wheel.js`, `yearwheel/src/styles.css`
- Test: `yearwheel/tests/wheel.test.js`

**Interfaces:**
- Consumes: `role.hasChannel`, `role.viaModerator` (Task 8).
- Produces: `MONTH_NAMES`, `NO_CHANNEL_TEXT`, `UNDELIVERABLE_TEXT`, `VIA_MODERATOR_TEXT` exported; `renderWheel(root, { role, entries }, handlers = {})` renders month-grouped entries with edit and delete buttons.

Rendering only in this task; the buttons are wired in Task 17. Months with no entries are not rendered — an empty JULI heading is noise.

- [ ] **Step 1: Write the failing test**

Append to `yearwheel/tests/wheel.test.js`:

```js
import { renderWheel, MONTH_NAMES, NO_CHANNEL_TEXT, UNDELIVERABLE_TEXT, VIA_MODERATOR_TEXT } from '../src/wheel.js';

const ROLE = { id: 'r1', name: 'tarol', hasChannel: true, viaModerator: false };
const entry = (over = {}) => ({ id: 'e1', roleId: 'r1', monthDay: '01-15', title: 'Boka lokal', body: '', version: 1, sentYears: [], ...over });

describe('month grouping', () => {
    let root;
    beforeEach(() => { root = document.createElement('div'); });

    it('uses the Swedish month names', () => {
        expect(MONTH_NAMES[0]).toBe('januari');
        expect(MONTH_NAMES[11]).toBe('december');
        expect(MONTH_NAMES.length).toBe(12);
    });

    it('groups entries under uppercase month headings in calendar order', () => {
        renderWheel(root, {
            role: ROLE,
            entries: [entry({ id: 'a', monthDay: '09-20', title: 'Terminsstart' }), entry({ id: 'b', monthDay: '01-15' })]
        });
        const headings = [...root.querySelectorAll('.month-heading')].map(h => h.textContent);
        expect(headings).toEqual(['JANUARI', 'SEPTEMBER']);
    });

    it('omits months with no entries', () => {
        renderWheel(root, { role: ROLE, entries: [entry()] });
        expect(root.querySelectorAll('.month-heading').length).toBe(1);
    });

    it('orders entries within a month by day', () => {
        renderWheel(root, {
            role: ROLE,
            entries: [entry({ id: 'a', monthDay: '01-20', title: 'Sen' }), entry({ id: 'b', monthDay: '01-05', title: 'Tidig' })]
        });
        expect([...root.querySelectorAll('.entry-title')].map(e => e.textContent)).toEqual(['Tidig', 'Sen']);
    });

    it('shows the day without the month on each row', () => {
        renderWheel(root, { role: ROLE, entries: [entry({ monthDay: '01-05' })] });
        expect(root.querySelector('.entry-date').textContent).toBe('05');
    });

    it('keeps the empty-wheel notice', () => {
        renderWheel(root, { role: ROLE, entries: [] });
        expect(root.textContent).toContain('Inga poster i årshjulet ännu.');
    });

    it('gives every entry an edit and a delete button', () => {
        renderWheel(root, { role: ROLE, entries: [entry()] });
        expect(root.querySelector('.entry button.entry-edit')).not.toBeNull();
        expect(root.querySelector('.entry button.entry-delete')).not.toBeNull();
    });

    it('offers a new-entry button', () => {
        renderWheel(root, { role: ROLE, entries: [] });
        expect(root.querySelector('#new-entry-btn').textContent).toBe('+ Ny post');
    });
});

describe('no-channel state', () => {
    let root;
    beforeEach(() => { root = document.createElement('div'); });

    it('uses the exact wording', () => {
        expect(NO_CHANNEL_TEXT).toBe('Gruppen saknar en egen kanal i Discord — inga påminnelser skickas förrän en kanal finns.');
        expect(UNDELIVERABLE_TEXT).toBe('(skickas ej)');
        expect(VIA_MODERATOR_TEXT).toBe('Du visar den här gruppens årshjul som moderator.');
    });

    it('shows the banner and marks each entry when the group has no channel', () => {
        renderWheel(root, { role: { ...ROLE, hasChannel: false }, entries: [entry()] });
        expect(root.textContent).toContain(NO_CHANNEL_TEXT);
        expect(root.querySelector('.entry-undeliverable').textContent).toBe(UNDELIVERABLE_TEXT);
    });

    it('shows neither when the group has a channel', () => {
        renderWheel(root, { role: ROLE, entries: [entry()] });
        expect(root.textContent).not.toContain(NO_CHANNEL_TEXT);
        expect(root.querySelector('.entry-undeliverable')).toBeNull();
    });

    it('still lets a channel-less group save — the new-entry button stays', () => {
        renderWheel(root, { role: { ...ROLE, hasChannel: false }, entries: [] });
        expect(root.querySelector('#new-entry-btn')).not.toBeNull();
    });
});

describe('moderator context', () => {
    let root;
    beforeEach(() => { root = document.createElement('div'); });

    it('names the situation when a moderator opens a foreign wheel', () => {
        renderWheel(root, { role: { ...ROLE, viaModerator: true }, entries: [] });
        expect(root.textContent).toContain(VIA_MODERATOR_TEXT);
    });

    it('says nothing on a wheel the caller holds themselves', () => {
        renderWheel(root, { role: ROLE, entries: [] });
        expect(root.textContent).not.toContain(VIA_MODERATOR_TEXT);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yearwheel && npx vitest run tests/wheel.test.js`
Expected: FAIL — `MONTH_NAMES` is `undefined`

- [ ] **Step 3: Write minimal implementation**

Replace `renderWheel` in `yearwheel/src/wheel.js` and add the constants:

```js
export const MONTH_NAMES = [
    'januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december'
];
export const NO_CHANNEL_TEXT = 'Gruppen saknar en egen kanal i Discord — inga påminnelser skickas förrän en kanal finns.';
export const UNDELIVERABLE_TEXT = '(skickas ej)';
export const VIA_MODERATOR_TEXT = 'Du visar den här gruppens årshjul som moderator.';
export const EMPTY_TEXT = 'Inga poster i årshjulet ännu.';

function entryRow(entry, { hasChannel }, handlers) {
    const li = el('li', 'entry');
    li.dataset.id = entry.id;
    li.appendChild(el('span', 'entry-date', entry.monthDay.slice(3, 5)));
    li.appendChild(el('span', 'entry-title', entry.title));
    if (!hasChannel) li.appendChild(el('span', 'entry-undeliverable', UNDELIVERABLE_TEXT));

    const edit = el('button', 'entry-edit', '✎');
    edit.type = 'button';
    edit.setAttribute('aria-label', `Redigera ${entry.title}`);
    if (handlers.onEdit) edit.addEventListener('click', () => handlers.onEdit(entry));
    li.appendChild(edit);

    const remove = el('button', 'entry-delete', '✕');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Ta bort ${entry.title}`);
    if (handlers.onDelete) remove.addEventListener('click', () => handlers.onDelete(entry));
    li.appendChild(remove);

    return li;
}

export function renderWheel(root, { role, entries }, handlers = {}) {
    root.replaceChildren();

    const back = el('a', 'back-link', '← Tillbaka');
    back.setAttribute('href', 'index.html');
    root.appendChild(back);

    const newBtn = el('button', 'btn', '+ Ny post');
    newBtn.id = 'new-entry-btn';
    newBtn.type = 'button';
    if (handlers.onNew) newBtn.addEventListener('click', () => handlers.onNew());
    root.appendChild(newBtn);

    root.appendChild(el('h1', null, role.name));

    if (role.viaModerator) root.appendChild(el('p', 'notice notice-mod', VIA_MODERATOR_TEXT));
    if (!role.hasChannel) root.appendChild(el('p', 'notice notice-warning', NO_CHANNEL_TEXT));

    const formSlot = el('div', 'form-slot');
    formSlot.id = 'form-slot';
    root.appendChild(formSlot);

    if (!entries.length) {
        root.appendChild(el('p', 'notice', EMPTY_TEXT));
        return;
    }

    // Grouped by month, in calendar order. A month with no entries is not rendered —
    // an empty JULI heading is noise.
    const sorted = [...entries].sort((a, b) => a.monthDay.localeCompare(b.monthDay));
    let currentMonth = null;
    let list = null;
    for (const entry of sorted) {
        const month = entry.monthDay.slice(0, 2);
        if (month !== currentMonth) {
            currentMonth = month;
            root.appendChild(el('h2', 'month-heading', MONTH_NAMES[Number(month) - 1].toUpperCase()));
            list = el('ul', 'entry-list');
            root.appendChild(list);
        }
        list.appendChild(entryRow(entry, role, handlers));
    }
}
```

Add to `yearwheel/src/styles.css`:

```css
.month-heading { font-size: 0.9rem; letter-spacing: 0.08em; margin: 1.5rem 0 0.25rem; opacity: 0.7; }
.entry { display: flex; align-items: center; gap: 0.75rem; }
.entry-date { font-variant-numeric: tabular-nums; opacity: 0.7; min-width: 2ch; }
.entry-title { flex: 1; }
.entry-undeliverable { font-size: 0.85em; opacity: 0.7; }
.notice-warning { border-left: 3px solid currentColor; padding-left: 0.75rem; }
.notice-mod { font-style: italic; opacity: 0.8; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd yearwheel && npx vitest run`
Expected: PASS — the milestone 1 `destinationFor` and polling tests plus the new rendering ones

- [ ] **Step 5: Commit**

```bash
git add yearwheel/src/wheel.js yearwheel/src/styles.css yearwheel/tests/wheel.test.js
git commit -m "feat(arshjul): month-grouped wheel with channel and moderator notices"
```

---

### Task 17: Frontend — the entry form and CRUD wiring

**Files:**
- Create: `yearwheel/src/entryForm.js`
- Modify: `yearwheel/src/wheel.js`, `yearwheel/src/styles.css`
- Test: `yearwheel/tests/entryForm.test.js`, `yearwheel/tests/wheel.test.js`

**Interfaces:**
- Consumes: `apiPost`, `apiPatch`, `apiDelete` (Task 14), `renderWheel` (Task 16).
- Produces:
  - `renderEntryForm({ entry, onSave, onCancel }) => HTMLFormElement`
  - `daysInMonth(month: number) => number`
  - `TITLE_TOO_LONG_TEXT`, `BODY_TOO_LONG_TEXT`, `INVALID_DATE_TEXT`, `SAVE_FAILED_TEXT`, `CONFLICT_TEXT`, `deleteConfirmText(title)` from `entryForm.js`
  - `initWheel` gains create/edit/delete, conflict reload and poll pausing

The date is a month `<select>` plus a day `<select>`, never a native date input — an årshjul entry has no year, and a date picker would force the user to pick one and imply it means something. February offers 29.

Polling pauses while a form is open and dirty; otherwise a poll redraws the DOM under an active cursor.

- [ ] **Step 1: Write the failing test**

```js
// yearwheel/tests/entryForm.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    renderEntryForm, daysInMonth, isFormDirty,
    TITLE_TOO_LONG_TEXT, INVALID_DATE_TEXT, deleteConfirmText
} from '../src/entryForm.js';

let host;
beforeEach(() => { host = document.createElement('div'); });

function mount(opts = {}) {
    const form = renderEntryForm({ onSave: () => {}, onCancel: () => {}, ...opts });
    host.appendChild(form);
    return form;
}

describe('daysInMonth', () => {
    it('offers 29 days in February so 02-29 can be chosen', () => {
        expect(daysInMonth(2)).toBe(29);
    });

    it('knows the short months', () => {
        expect(daysInMonth(4)).toBe(30);
        expect(daysInMonth(1)).toBe(31);
        expect(daysInMonth(12)).toBe(31);
    });
});

describe('renderEntryForm', () => {
    it('has a title input, month and day selects, and a body textarea', () => {
        const form = mount();
        expect(form.querySelector('input[name="title"]')).not.toBeNull();
        expect(form.querySelector('select[name="month"]')).not.toBeNull();
        expect(form.querySelector('select[name="day"]')).not.toBeNull();
        expect(form.querySelector('textarea[name="body"]')).not.toBeNull();
        expect(form.querySelector('input[type="date"]')).toBeNull();
    });

    it('uses Swedish labels and buttons', () => {
        const form = mount();
        expect(form.textContent).toContain('Titel');
        expect(form.textContent).toContain('Datum');
        expect(form.textContent).toContain('Beskrivning');
        expect(form.querySelector('button[type="submit"]').textContent).toBe('Spara');
        expect(form.querySelector('button.cancel').textContent).toBe('Avbryt');
    });

    it('starts empty for a new entry', () => {
        const form = mount();
        expect(form.querySelector('input[name="title"]').value).toBe('');
        expect(form.querySelector('textarea[name="body"]').value).toBe('');
    });

    it('prefills from an existing entry', () => {
        const form = mount({ entry: { id: 'e1', monthDay: '03-07', title: 'A', body: 'b', version: 2 } });
        expect(form.querySelector('input[name="title"]').value).toBe('A');
        expect(form.querySelector('textarea[name="body"]').value).toBe('b');
        expect(form.querySelector('select[name="month"]').value).toBe('03');
        expect(form.querySelector('select[name="day"]').value).toBe('07');
    });

    it('re-renders the day list when the month changes and keeps a valid day', () => {
        const form = mount({ entry: { id: 'e1', monthDay: '01-31', title: 'A', body: '', version: 1 } });
        const month = form.querySelector('select[name="month"]');
        month.value = '02';
        month.dispatchEvent(new Event('change'));
        const days = [...form.querySelectorAll('select[name="day"] option')].map(o => o.value);
        expect(days.length).toBe(29);
        expect(days.at(-1)).toBe('29');
    });

    it('clamps the selected day when moving to a shorter month', () => {
        const form = mount({ entry: { id: 'e1', monthDay: '01-31', title: 'A', body: '', version: 1 } });
        const month = form.querySelector('select[name="month"]');
        month.value = '04';
        month.dispatchEvent(new Event('change'));
        expect(form.querySelector('select[name="day"]').value).toBe('30');
    });

    it('submits the trimmed values and the version', () => {
        const onSave = vi.fn();
        const form = mount({ entry: { id: 'e1', monthDay: '03-07', title: 'A', body: 'b', version: 2 }, onSave });
        form.querySelector('input[name="title"]').value = '  Ny titel  ';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(onSave).toHaveBeenCalledWith({ title: 'Ny titel', body: 'b', monthDay: '03-07', version: 2 });
    });

    it('refuses to submit an empty title and says why', () => {
        const onSave = vi.fn();
        const form = mount({ onSave });
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(onSave).not.toHaveBeenCalled();
        expect(form.querySelector('.form-error').textContent).toBe(TITLE_TOO_LONG_TEXT);
    });

    it('refuses a title over 100 characters', () => {
        const onSave = vi.fn();
        const form = mount({ onSave });
        form.querySelector('input[name="title"]').value = 'x'.repeat(101);
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(onSave).not.toHaveBeenCalled();
        expect(form.querySelector('.form-error').textContent).toBe(TITLE_TOO_LONG_TEXT);
    });

    it('calls onCancel from the cancel button', () => {
        const onCancel = vi.fn();
        const form = mount({ onCancel });
        form.querySelector('button.cancel').click();
        expect(onCancel).toHaveBeenCalled();
    });

    it('reports dirty only after the user changes something', () => {
        const form = mount({ entry: { id: 'e1', monthDay: '03-07', title: 'A', body: 'b', version: 2 } });
        expect(isFormDirty(form)).toBe(false);
        const title = form.querySelector('input[name="title"]');
        title.value = 'A2';
        title.dispatchEvent(new Event('input'));
        expect(isFormDirty(form)).toBe(true);
    });

    it('names the entry in the delete confirmation', () => {
        expect(deleteConfirmText('Boka lokal')).toBe('Ta bort posten «Boka lokal»? Det går inte att ångra.');
    });

    it('exports the exact invalid-date wording', () => {
        expect(INVALID_DATE_TEXT).toBe('Välj ett giltigt datum.');
    });
});
```

Append to `yearwheel/tests/wheel.test.js`:

```js
import { initWheel } from '../src/wheel.js';
import { ApiError } from '../src/api.js';

describe('wheel CRUD wiring', () => {
    let root;
    beforeEach(() => { root = document.createElement('div'); });

    const wheelData = {
        role: { id: 'r1', name: 'tarol', hasChannel: true, viaModerator: false },
        entries: [{ id: 'e1', roleId: 'r1', monthDay: '01-15', title: 'Boka lokal', body: '', version: 1, sentYears: [] }]
    };

    it('opens a form when the new-entry button is clicked', async () => {
        await initWheel(root, '?role=r1', { get: async () => wheelData, poll: false });
        root.querySelector('#new-entry-btn').click();
        expect(root.querySelector('#form-slot form')).not.toBeNull();
    });

    it('posts a new entry and reloads the wheel', async () => {
        const posted = [];
        await initWheel(root, '?role=r1', {
            get: async () => wheelData,
            post: async (path, body) => { posted.push({ path, body }); return {}; },
            poll: false
        });
        root.querySelector('#new-entry-btn').click();
        const form = root.querySelector('#form-slot form');
        form.querySelector('input[name="title"]').value = 'Ny';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        await Promise.resolve();
        expect(posted[0].path).toBe('/api/web/yearwheel/r1');
        expect(posted[0].body.title).toBe('Ny');
    });

    it('patches an edited entry with its version', async () => {
        const patched = [];
        await initWheel(root, '?role=r1', {
            get: async () => wheelData,
            patch: async (path, body) => { patched.push({ path, body }); return {}; },
            poll: false
        });
        root.querySelector('button.entry-edit').click();
        const form = root.querySelector('#form-slot form');
        form.querySelector('input[name="title"]').value = 'Ändrad';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        await Promise.resolve();
        expect(patched[0].path).toBe('/api/web/yearwheel/entry/e1');
        expect(patched[0].body).toMatchObject({ title: 'Ändrad', version: 1 });
    });

    it('confirms before deleting and sends the version', async () => {
        const deleted = [];
        const confirmed = [];
        await initWheel(root, '?role=r1', {
            get: async () => wheelData,
            del: async (path, body) => { deleted.push({ path, body }); },
            confirm: msg => { confirmed.push(msg); return true; },
            poll: false
        });
        root.querySelector('button.entry-delete').click();
        await Promise.resolve();
        expect(confirmed[0]).toContain('Boka lokal');
        expect(deleted[0]).toEqual({ path: '/api/web/yearwheel/entry/e1', body: { version: 1 } });
    });

    it('deletes nothing when the confirmation is declined', async () => {
        const deleted = [];
        await initWheel(root, '?role=r1', {
            get: async () => wheelData,
            del: async (path, body) => { deleted.push({ path, body }); },
            confirm: () => false,
            poll: false
        });
        root.querySelector('button.entry-delete').click();
        await Promise.resolve();
        expect(deleted.length).toBe(0);
    });

    it('shows the conflict message and reopens the form on a 409', async () => {
        await initWheel(root, '?role=r1', {
            get: async () => wheelData,
            patch: async () => {
                throw new ApiError(409, 'version_conflict', {
                    entry: { id: 'e1', monthDay: '01-15', title: 'Serverns titel', body: '', version: 9 }
                });
            },
            poll: false
        });
        root.querySelector('button.entry-edit').click();
        const form = root.querySelector('#form-slot form');
        form.querySelector('input[name="title"]').value = 'Min ändring';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        await new Promise(r => setTimeout(r, 0));
        expect(root.textContent).toContain('Någon annan hann före — posten laddades om.');
        expect(root.querySelector('#form-slot input[name="title"]').value).toBe('Serverns titel');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yearwheel && npx vitest run`
Expected: FAIL — `Cannot find module '../src/entryForm.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// yearwheel/src/entryForm.js
export const TITLE_TOO_LONG_TEXT = 'Titeln får vara högst 100 tecken.';
export const BODY_TOO_LONG_TEXT = 'Beskrivningen får vara högst 1500 tecken.';
export const INVALID_DATE_TEXT = 'Välj ett giltigt datum.';
export const SAVE_FAILED_TEXT = 'Kunde inte spara. Försök igen.';
export const CONFLICT_TEXT = 'Någon annan hann före — posten laddades om.';

const MAX_TITLE = 100;
const MAX_BODY = 1500;
const MONTH_LABELS = [
    'januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december'
];
// February offers 29 so 02-29 can be chosen; the dispatcher fires it on 02-28 in non-leap years.
const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(month) {
    return DAYS[month - 1];
}

export function deleteConfirmText(title) {
    return `Ta bort posten «${title}»? Det går inte att ångra.`;
}

function pad(n) {
    return String(n).padStart(2, '0');
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function labelled(labelText, control) {
    const label = el('label');
    label.appendChild(el('span', 'field-label', labelText));
    label.appendChild(control);
    return label;
}

function fillDays(daySelect, month, keep) {
    const wanted = Number(keep);
    daySelect.replaceChildren();
    const max = daysInMonth(month);
    for (let d = 1; d <= max; d++) {
        const opt = el('option', null, pad(d));
        opt.value = pad(d);
        daySelect.appendChild(opt);
    }
    // Moving 31 January to April clamps to the 30th rather than silently resetting.
    daySelect.value = pad(Math.min(Number.isFinite(wanted) && wanted > 0 ? wanted : 1, max));
}

export function isFormDirty(form) {
    return form.dataset.dirty === 'true';
}

// The date is a month select plus a day select, never a native date input: an årshjul entry
// has no year, and a date picker would force the user to pick one and imply it means something.
export function renderEntryForm({ entry, onSave, onCancel }) {
    const form = document.createElement('form');
    form.className = 'entry-form';
    form.dataset.dirty = 'false';

    const title = el('input');
    title.name = 'title';
    title.type = 'text';
    title.maxLength = MAX_TITLE;
    title.value = entry ? entry.title : '';
    form.appendChild(labelled('Titel', title));

    const dateRow = el('div', 'date-row');
    const month = el('select');
    month.name = 'month';
    MONTH_LABELS.forEach((name, i) => {
        const opt = el('option', null, name);
        opt.value = pad(i + 1);
        month.appendChild(opt);
    });
    const day = el('select');
    day.name = 'day';
    month.value = entry ? entry.monthDay.slice(0, 2) : '01';
    fillDays(day, Number(month.value), entry ? entry.monthDay.slice(3, 5) : '01');
    month.addEventListener('change', () => fillDays(day, Number(month.value), day.value));
    dateRow.appendChild(month);
    dateRow.appendChild(day);
    form.appendChild(labelled('Datum', dateRow));

    const body = el('textarea');
    body.name = 'body';
    body.maxLength = MAX_BODY;
    body.rows = 4;
    body.value = entry ? entry.body : '';
    form.appendChild(labelled('Beskrivning', body));

    const error = el('p', 'form-error');
    form.appendChild(error);

    const save = el('button', 'btn', 'Spara');
    save.type = 'submit';
    form.appendChild(save);

    const cancel = el('button', 'cancel', 'Avbryt');
    cancel.type = 'button';
    cancel.addEventListener('click', () => onCancel());
    form.appendChild(cancel);

    form.addEventListener('input', () => { form.dataset.dirty = 'true'; });
    form.addEventListener('change', () => { form.dataset.dirty = 'true'; });

    form.addEventListener('submit', event => {
        event.preventDefault();
        error.textContent = '';

        const titleValue = title.value.trim();
        if (titleValue.length < 1 || titleValue.length > MAX_TITLE) {
            error.textContent = TITLE_TOO_LONG_TEXT;
            return;
        }
        const bodyValue = body.value.trim();
        if (bodyValue.length > MAX_BODY) {
            error.textContent = BODY_TOO_LONG_TEXT;
            return;
        }
        const monthDay = `${month.value}-${day.value}`;
        if (!/^\d{2}-\d{2}$/.test(monthDay) || Number(day.value) > daysInMonth(Number(month.value))) {
            error.textContent = INVALID_DATE_TEXT;
            return;
        }

        onSave({ title: titleValue, body: bodyValue, monthDay, version: entry ? entry.version : undefined });
    });

    return form;
}

export function showFormError(form, text) {
    const error = form.querySelector('.form-error');
    if (error) error.textContent = text;
}
```

Rewrite `initWheel` in `yearwheel/src/wheel.js`:

```js
import { apiGet, apiPost, apiPatch, apiDelete } from './api.js';
import {
    renderEntryForm, isFormDirty, deleteConfirmText, showFormError,
    SAVE_FAILED_TEXT, CONFLICT_TEXT
} from './entryForm.js';

export async function initWheel(root, search = window.location.search, deps = {}) {
    const {
        get = path => apiGet(path),
        post = (path, body) => apiPost(path, body),
        patch = (path, body) => apiPatch(path, body),
        del = (path, body) => apiDelete(path, body),
        confirm: confirmFn = message => window.confirm(message),
        poll = true
    } = deps;

    const roleId = new URLSearchParams(search).get('role');
    if (!roleId) {
        window.location.replace('index.html');
        return;
    }

    let data = null;
    let openEntry = null;   // the entry being edited, or null for a new one
    let formOpen = false;
    let notice = null;

    function currentForm() {
        return root.querySelector('#form-slot form');
    }

    function closeForm() {
        formOpen = false;
        openEntry = null;
        draw();
    }

    function openForm(entry) {
        formOpen = true;
        openEntry = entry || null;
        draw();
    }

    function draw() {
        renderWheel(root, data, {
            onNew: () => openForm(null),
            onEdit: entry => openForm(entry),
            onDelete: entry => remove(entry)
        });
        if (notice) {
            root.querySelector('#form-slot').before(el('p', 'notice notice-transient', notice));
            notice = null;
        }
        if (formOpen) {
            root.querySelector('#form-slot').appendChild(
                renderEntryForm({ entry: openEntry, onSave: save, onCancel: closeForm })
            );
        }
    }

    async function save(values) {
        const form = currentForm();
        try {
            if (openEntry) {
                await patch(`/api/web/yearwheel/entry/${encodeURIComponent(openEntry.id)}`, values);
            } else {
                await post(`/api/web/yearwheel/${encodeURIComponent(roleId)}`, {
                    title: values.title, body: values.body, monthDay: values.monthDay
                });
            }
            formOpen = false;
            openEntry = null;
            await load();
        } catch (err) {
            if (navigateOnError(err)) return;
            if (err && err.code === 'version_conflict') {
                // Reopen the form on the server's values — nothing typed is written over
                // someone else's edit.
                notice = CONFLICT_TEXT;
                openEntry = err.body?.entry ?? openEntry;
                await load({ keepForm: true });
                return;
            }
            if (form) showFormError(form, SAVE_FAILED_TEXT);
        }
    }

    async function remove(entry) {
        if (!confirmFn(deleteConfirmText(entry.title))) return;
        try {
            await del(`/api/web/yearwheel/entry/${encodeURIComponent(entry.id)}`, { version: entry.version });
            await load();
        } catch (err) {
            if (navigateOnError(err)) return;
            notice = err && err.code === 'version_conflict' ? CONFLICT_TEXT : SAVE_FAILED_TEXT;
            await load();
        }
    }

    function navigateOnError(err) {
        const dest = destinationFor(err);
        if (!dest) return false;
        window.location.replace(`${dest.url}?reason=${dest.reason}`);
        return true;
    }

    async function load({ keepForm = false } = {}) {
        try {
            data = await get(`/api/web/yearwheel/${encodeURIComponent(roleId)}`);
            if (keepForm) formOpen = true;
            draw();
        } catch (err) {
            if (navigateOnError(err)) return;
            root.replaceChildren(el('p', 'notice', 'Kunde inte hämta årshjulet. Försök igen senare.'));
        }
    }

    await load();

    if (poll) {
        // A poll must never redraw the DOM under an active cursor.
        const refresh = () => {
            const form = currentForm();
            if (form && isFormDirty(form)) return;
            load({ keepForm: formOpen });
        };
        setInterval(refresh, POLL_INTERVAL_MS);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') refresh();
        });
    }
}
```

Add to `yearwheel/src/styles.css`:

```css
.entry-form { display: grid; gap: 0.75rem; margin: 1rem 0; }
.entry-form label { display: grid; gap: 0.25rem; }
.entry-form .field-label { font-size: 0.85rem; opacity: 0.7; }
.entry-form .date-row { display: flex; gap: 0.5rem; }
.form-error:empty { display: none; }
.form-error { color: #b3261e; }
.notice-transient { font-style: italic; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd yearwheel && npx vitest run`
Expected: PASS, all frontend tests

- [ ] **Step 5: Commit**

```bash
git add yearwheel/src/entryForm.js yearwheel/src/wheel.js yearwheel/src/styles.css yearwheel/tests/entryForm.test.js yearwheel/tests/wheel.test.js
git commit -m "feat(arshjul): entry form with create, edit, delete and conflict recovery"
```

---

### Task 18: Full verification

**Files:** none changed unless a check fails.

- [ ] **Step 1: Run the backend suite**

Run: `npm test`
Expected: PASS, no skipped tests

- [ ] **Step 2: Run the frontend suite**

Run: `cd yearwheel && npx vitest run`
Expected: PASS

- [ ] **Step 3: Confirm the production build still works**

Run: `cd yearwheel && npm run build`
Expected: builds `dist/` with `index.html`, `wheel.html`, `callback.html` — the same three entry points as milestone 1. If it fails on missing env vars, `.env.production` is absent; that is a deploy-time file, not a code problem.

- [ ] **Step 4: Confirm the Activity is untouched**

Run: `git diff --stat main -- frontend/ src/middleware/auth.js`
Expected: no output. If either shows a change, it must be reverted — the Activity is a hard constraint.

- [ ] **Step 5: Confirm the dispatcher is off by default**

Run: `grep -n "arshjulLive" config.example.json src/core/express.js`
Expected: `config.example.json` sets it to `false`, and `express.js` reads it as `config.arshjulLive === true` — so anything but an explicit `true` keeps every thread in the bot-test channel.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "test(arshjul): verify milestone 2 end to end"
```

---

## Manual steps for the human — after this plan is complete

Ordinary implementation cannot do these.

1. **Deploy.** `cd yearwheel && npm run build`, then upload `yearwheel/dist/` over FTP — `assets/` before the HTML files. Deploy the bot as usual.
2. **First restart is safe.** With no `arshjulLive` key, the dispatcher runs but every thread goes to `#bot-test` with no role mention.
3. **Rehearse.** Create a few entries dated for the next couple of days and watch `#bot-test` across a few 08:00 ticks.
4. **Go live.** Set `"arshjulLive": true` in `config.json` on the bot host and restart. **From that point, entries post to real group channels and mention the whole role.**
5. **Independent decision:** whether to post the milestone 1 Discord panel button, which is what puts the app in front of members.
6. **Known gap:** `src/data/arshjul.json` exists only on the bot host. Drive backup produces no dated files for any subfolder and the årshjul entry in `src/services/google/drive.js` is commented out. Verify Drive backup, or arrange another copy, before step 4.
