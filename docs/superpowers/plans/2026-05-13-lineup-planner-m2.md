# Lineup Planner — M2 Implementation Plan (Context menu + concert resolution)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Discord message context menu command "Lineup" that, when triggered on a signup post, registers a pending concert for the caller. Expose `GET /api/concert/pending` so the Activity frontend (M4) can read the caller's pending concertId after they launch the Activity from the voice-channel shelf.

**Architecture:** A message-type application command ("Lineup") is registered for the guild. Its handler extracts the event ID from the target signup message's embed footer (`"ID: <id>"`), verifies the event exists via `getEventJSON`, then stores `(userId → concertId)` in an in-memory TTL map (`pendingConcerts`, 10 min). The same `pendingConcerts` singleton is consumed by the new `GET /api/concert/pending` Express route, which pops the entry on first successful read.

**Tech Stack:** Existing `discord.js` v14 (`MessageApplicationCommand`, type=3), existing Express + auth middleware from M1, `node:test`. No new dependencies.

**Prereqs (M1 done before starting this plan):**
- `npm test` passes for M1 (cache + OAuth + middleware).
- `npm start` brings up bot AND prints `Express listening on 127.0.0.1:3000`.
- `/api/me` smoke test returns `200 hasHarmonian: true` for a Harmonian member.
- A signup post exists in `src/events/active/` for end-to-end testing.

---

## File Structure

| File | Purpose | Status |
| :--- | :--- | :--- |
| `src/services/registerCommands.js` | Register new "Lineup" message context menu command (type=3) | Modify |
| `src/features/lineup.js` | `createPendingConcerts` factory + module singleton (`pendingConcerts`) | Create |
| `src/interactions/contextMenus/planLineup.js` | Context menu handler: validate target signup, store pending concert, ephemeral reply | Create |
| `src/events/interactionCreate.js` | Route "Lineup" command name to handler | Modify |
| `src/routes/api/concert.js` | `GET /api/concert/pending` route factory (pop pendingConcerts entry) | Create |
| `src/core/express.js` | Mount `/api/concert/pending` with auth middleware, wire `pendingConcerts` | Modify |
| `tests/features/lineup.test.js` | Unit tests for `createPendingConcerts` (set/pop/TTL/clear-on-read) | Create |
| `tests/routes/concert.test.js` | Unit tests for `/api/concert/pending` route factory with stubbed pendingConcerts | Create |
| `scripts/m2-smoke.js` | Manual smoke: poll `/api/concert/pending` until it returns the concertId | Create |

---

## Task 1: pendingConcerts factory + singleton (TDD)

**Files:**
- Create: `src/features/lineup.js`
- Test: `tests/features/lineup.test.js`

The factory takes `{ ttlMs, now }` for injectable time. Default singleton uses `ttlMs = 10 * 60 * 1000` and `Date.now`. Semantics:

- `set(userId, concertId)` → record entry with `expiresAt = now() + ttlMs`. Overwrites any prior entry for the same user.
- `pop(userId)` → return concertId and delete the entry. If missing OR expired return `null`. (Deletion happens whether or not it's expired — first read clears it either way.)

- [ ] **Step 1: Write failing tests**

Create `tests/features/lineup.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { createPendingConcerts } = require('../../src/features/lineup');

test('pop returns null for unknown user', () => {
    const pc = createPendingConcerts({ ttlMs: 1000 });
    assert.strictEqual(pc.pop('u1'), null);
});

test('set then pop returns the concertId', () => {
    const pc = createPendingConcerts({ ttlMs: 1000, now: () => 0 });
    pc.set('u1', 'concert-A');
    assert.strictEqual(pc.pop('u1'), 'concert-A');
});

test('pop clears the entry (second pop returns null)', () => {
    const pc = createPendingConcerts({ ttlMs: 1000, now: () => 0 });
    pc.set('u1', 'concert-A');
    pc.pop('u1');
    assert.strictEqual(pc.pop('u1'), null);
});

test('pop returns null after ttl expires', () => {
    let t = 0;
    const pc = createPendingConcerts({ ttlMs: 100, now: () => t });
    pc.set('u1', 'concert-A');
    t = 101;
    assert.strictEqual(pc.pop('u1'), null);
});

test('set overwrites previous entry for same user', () => {
    const pc = createPendingConcerts({ ttlMs: 1000, now: () => 0 });
    pc.set('u1', 'concert-A');
    pc.set('u1', 'concert-B');
    assert.strictEqual(pc.pop('u1'), 'concert-B');
});

test('separate users do not collide', () => {
    const pc = createPendingConcerts({ ttlMs: 1000, now: () => 0 });
    pc.set('u1', 'concert-A');
    pc.set('u2', 'concert-B');
    assert.strictEqual(pc.pop('u1'), 'concert-A');
    assert.strictEqual(pc.pop('u2'), 'concert-B');
});

test('default singleton is exported', () => {
    const { pendingConcerts } = require('../../src/features/lineup');
    assert.strictEqual(typeof pendingConcerts.set, 'function');
    assert.strictEqual(typeof pendingConcerts.pop, 'function');
});
```

- [ ] **Step 2: Run tests to verify fail**

Run:
```bash
npm test
```

Expected: 7 failures (`Cannot find module '../../src/features/lineup'`).

- [ ] **Step 3: Implement pendingConcerts**

Create `src/features/lineup.js`:

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

module.exports = { createPendingConcerts, pendingConcerts };
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`

Expected: all 7 pendingConcerts tests pass (plus M1 tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/features/lineup.js tests/features/lineup.test.js
git commit -m "feat(lineup): pendingConcerts TTL map (per-user concert reservation)"
```

---

## Task 2: GET /api/concert/pending route (TDD)

**Files:**
- Create: `src/routes/api/concert.js`
- Test: `tests/routes/concert.test.js`

Route factory takes `{ pendingConcerts }`. Reads `req.user.id` (set by M1 auth middleware), calls `pendingConcerts.pop(req.user.id)`. Returns `{ concertId }` on hit, `404 { error: 'no_pending_concert' }` on miss.

- [ ] **Step 1: Write failing tests**

Create `tests/routes/concert.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const createConcertPendingRoute = require('../../src/routes/api/concert');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

test('returns concertId from pendingConcerts.pop', () => {
    const calls = [];
    const pendingConcerts = {
        pop(userId) { calls.push(userId); return 'concert-A'; }
    };
    const handler = createConcertPendingRoute({ pendingConcerts });

    const req = { user: { id: 'u1' } };
    const res = mockRes();
    handler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { concertId: 'concert-A' });
    assert.deepStrictEqual(calls, ['u1']);
});

test('returns 404 when pop returns null', () => {
    const pendingConcerts = { pop: () => null };
    const handler = createConcertPendingRoute({ pendingConcerts });

    const req = { user: { id: 'u1' } };
    const res = mockRes();
    handler(req, res);

    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'no_pending_concert' });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm test`

Expected: 2 failures (`Cannot find module '../../src/routes/api/concert'`).

- [ ] **Step 3: Implement route**

Create `src/routes/api/concert.js`:

```js
function createConcertPendingRoute({ pendingConcerts }) {
    return function concertPendingRoute(req, res) {
        const concertId = pendingConcerts.pop(req.user.id);
        if (!concertId) {
            return res.status(404).json({ error: 'no_pending_concert' });
        }
        return res.json({ concertId });
    };
}

module.exports = createConcertPendingRoute;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`

Expected: all concert route tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/concert.js tests/routes/concert.test.js
git commit -m "feat(lineup): GET /api/concert/pending route"
```

---

## Task 3: Wire route into Express app

**Files:**
- Modify: `src/core/express.js`

- [ ] **Step 1: Edit express.js to mount /api/concert/pending**

Edit `src/core/express.js`. Add two imports near the top (after the existing route requires):

```js
const createConcertPendingRoute = require('../routes/api/concert');
const { pendingConcerts } = require('../features/lineup');
```

Then inside `buildApp`, after the existing `app.get('/api/me', ...)` line, add:

```js
    app.get('/api/concert/pending', authMiddleware, createConcertPendingRoute({ pendingConcerts }));
```

The final relevant section of `buildApp` should read:

```js
    app.post('/api/token', createTokenRoute({ oauth, logger }));
    app.get('/api/me', authMiddleware, createMeRoute());
    app.get('/api/concert/pending', authMiddleware, createConcertPendingRoute({ pendingConcerts }));

    app.use((err, req, res, _next) => {
        logger('express unhandled error:', err);
        res.status(500).json({ error: 'internal' });
    });
```

- [ ] **Step 2: Run tests to verify nothing regressed**

Run: `npm test`

Expected: all tests still pass.

- [ ] **Step 3: Smoke-start the bot locally**

Run:
```bash
npm start
```

Expected log lines (unchanged from M1):
- Existing bot ready log.
- `Express listening on 127.0.0.1:3000`.

Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add src/core/express.js
git commit -m "feat(lineup): mount /api/concert/pending in express app"
```

---

## Task 4: Context menu handler

**Files:**
- Create: `src/interactions/contextMenus/planLineup.js`

The handler validates that the right-clicked message is an active signup, then registers a pending concert for the caller. Pattern matches existing handlers (`matches(name) + execute(interaction)`).

Event ID extraction: signup messages carry an embed with footer text in the form `"ID: <eventId>"` (see `src/interactions/modals/signup.js:79-81`). Same parse as `src/features/signup.js:262`.

- [ ] **Step 1: Write handler**

Create `src/interactions/contextMenus/planLineup.js`:

```js
const { MessageFlags } = require('discord.js');
const { getEventJSON } = require('../../features/signup');
const { pendingConcerts } = require('../../features/lineup');
const logActivity = require('../../core/logger');

function matches(commandName) {
    return commandName === 'Lineup';
}

async function execute(interaction) {
    let targetMessage;
    try {
        targetMessage = await interaction.channel.messages.fetch(interaction.targetId);
    } catch (err) {
        logActivity('planLineup: failed to fetch target message:', err);
        await interaction.reply({
            content: 'Kunde inte hämta meddelandet.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const embed = targetMessage.embeds[0];
    const footerText = embed?.footer?.text || '';
    const parts = footerText.split(': ');
    const eventId = parts.length === 2 ? parts[1] : null;

    if (!eventId) {
        await interaction.reply({
            content: 'Det här är inte en signup-post.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const data = getEventJSON(eventId);
    if (!data) {
        await interaction.reply({
            content: 'Kunde inte hitta konserten. Är den arkiverad?',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    pendingConcerts.set(interaction.user.id, eventId);

    await interaction.reply({
        content:
            `Lineup för **${data.name}** är reserverad åt dig.\n\n` +
            `Öppna **Lineup Planner** från aktivitetsraden i en röstkanal inom 10 minuter.`,
        flags: MessageFlags.Ephemeral
    });
}

module.exports = { matches, execute };
```

- [ ] **Step 2: Commit**

```bash
git add src/interactions/contextMenus/planLineup.js
git commit -m "feat(lineup): Lineup context menu handler"
```

---

## Task 5: Route context menu in interactionCreate

**Files:**
- Modify: `src/events/interactionCreate.js`

- [ ] **Step 1: Add import**

In `src/events/interactionCreate.js`, after the existing context-menu-related comment (around line 30), add an import:

```js
const planLineup = require('../interactions/contextMenus/planLineup');
```

So the imports section near the top reads (existing lines unchanged):

```js
// Select menu handlers
const signupDropdowns = require('../interactions/menus/signupDropdowns');
const editSignupDropdown = require('../interactions/menus/editSignupDropdown');
const reminderDropdown = require('../interactions/menus/reminderDropdown');

// Commands
const infoCommand = require('../commands/info');
const executeOneTimeFunctionCommand = require('../commands/executeOneTimeFunction');

// Context menu handlers
const planLineup = require('../interactions/contextMenus/planLineup');

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
```

- [ ] **Step 2: Add routing branch**

In the `isContextMenuCommand()` block, add a branch for `planLineup.matches`. Change this:

```js
            } else if (interaction.isContextMenuCommand()) {
                if (interaction.commandName === 'Ändra signup') {
                    await handleChangeSignup(interaction);
                }
```

to:

```js
            } else if (interaction.isContextMenuCommand()) {
                if (interaction.commandName === 'Ändra signup') {
                    await handleChangeSignup(interaction);
                } else if (planLineup.matches(interaction.commandName)) {
                    await planLineup.execute(interaction);
                }
```

- [ ] **Step 3: Verify module loads**

Run:
```bash
node -e "require('./src/events/interactionCreate'); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/events/interactionCreate.js
git commit -m "feat(lineup): route Lineup context menu in interactionCreate"
```

---

## Task 6: Register the context menu command

**Files:**
- Modify: `src/services/registerCommands.js`

Discord application command type `3` = `MESSAGE` (right-click on message → Apps menu). Per discord.js v14 / Discord API: integer type values for application commands are `1` (CHAT_INPUT, default), `2` (USER), `3` (MESSAGE).

- [ ] **Step 1: Add the new command entry**

Edit `src/services/registerCommands.js`. Change the `commands` array to:

```js
const commands = [
    {
        name: 'info',
        description: 'Lägg till eller ändra viktig information'
    },
    {
        name: 'one-time',
        description: 'Kör en tillfällig engångsfunktion från lokal fil',
        default_member_permissions: '8'
    },
    {
        name: 'Lineup',
        type: 3
    }
];
```

Note: Context menu command names (type 2/3) can contain spaces and uppercase letters; description must be omitted.

- [ ] **Step 2: Run the registration script**

Run:
```bash
npm run register
```

Expected output:
```
Started refreshing application (/) commands.
Successfully registered application (/) commands.
```

- [ ] **Step 3: Verify in Discord client**

In the test guild, right-click any message → "Apps". `Lineup` should appear in the submenu (may take up to 1 minute for the client to refresh — try restarting the Discord client if not visible).

- [ ] **Step 4: Commit**

```bash
git add src/services/registerCommands.js
git commit -m "feat(lineup): register Lineup message context menu command"
```

---

## Task 7: End-to-end manual smoke test

**Files:**
- Create: `scripts/m2-smoke.js`

Proves the full chain: context menu → pendingConcerts → `/api/concert/pending`. Reuses the M1 OAuth flow.

- [ ] **Step 1: Write script**

Create `scripts/m2-smoke.js`:

```js
const config = require('../config.json');

async function main() {
    const code = process.argv[2];
    if (!code) {
        console.error('Usage: node scripts/m2-smoke.js <oauth-code>');
        console.error('');
        console.error('Get a code by visiting (in a browser):');
        const authorize = new URL('https://discord.com/oauth2/authorize');
        authorize.searchParams.set('client_id', config.clientId);
        authorize.searchParams.set('redirect_uri', config.oauthRedirectUri);
        authorize.searchParams.set('response_type', 'code');
        authorize.searchParams.set('scope', 'identify guilds.members.read');
        console.error('  ' + authorize.toString());
        console.error('');
        console.error('Workflow:');
        console.error('  1. In Discord, right-click an active signup post → Apps → "Lineup".');
        console.error('  2. Confirm you see the ephemeral reply.');
        console.error('  3. Authorize via the URL above and paste the resulting code here.');
        process.exit(1);
    }

    const base = `http://127.0.0.1:${config.expressPort || 3000}`;

    const tokenRes = await fetch(`${base}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    });
    const tokenBody = await tokenRes.json();
    console.log('POST /api/token →', tokenRes.status, tokenBody);
    if (!tokenRes.ok) process.exit(1);

    const pendingRes = await fetch(`${base}/api/concert/pending`, {
        headers: { Authorization: `Bearer ${tokenBody.access_token}` }
    });
    const pendingBody = await pendingRes.json();
    console.log('GET /api/concert/pending →', pendingRes.status, pendingBody);

    const pendingRes2 = await fetch(`${base}/api/concert/pending`, {
        headers: { Authorization: `Bearer ${tokenBody.access_token}` }
    });
    const pendingBody2 = await pendingRes2.json();
    console.log('GET /api/concert/pending (2nd call) →', pendingRes2.status, pendingBody2);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run the bot**

In one terminal:
```bash
npm start
```

Expected: bot logs ready + `Express listening on 127.0.0.1:3000`.

- [ ] **Step 3: Trigger the context menu**

In Discord, right-click an active signup post in the test guild → Apps → "Lineup".

Expected ephemeral reply (Swedish): `Lineup för **<concert name>** är reserverad åt dig. Öppna **Lineup Planner** från aktivitetsraden i en röstkanal inom 10 minuter.`

- [ ] **Step 4: Run the smoke script**

In another terminal, get an OAuth code via the URL printed by:
```bash
node scripts/m2-smoke.js
```

Then run with the code:
```bash
node scripts/m2-smoke.js <pasted-code>
```

Expected output:
```
POST /api/token → 200 { access_token: '...', expires_in: 604800 }
GET /api/concert/pending → 200 { concertId: '<message-id-of-signup-post>' }
GET /api/concert/pending (2nd call) → 404 { error: 'no_pending_concert' }
```

The second call returning `404` proves pop-on-read semantics.

- [ ] **Step 5: Negative case — non-signup message**

Right-click a regular text message (no embed footer with `ID: ...`) → Apps → "Lineup".

Expected ephemeral reply: `Det här är inte en signup-post.`

- [ ] **Step 6: Negative case — no pending concert**

Without triggering the context menu first, run the smoke script with a fresh OAuth code.

Expected:
```
POST /api/token → 200 { ... }
GET /api/concert/pending → 404 { error: 'no_pending_concert' }
```

- [ ] **Step 7: Commit**

```bash
git add scripts/m2-smoke.js
git commit -m "feat(lineup): M2 smoke test script for pending-concert flow"
```

---

## Task 8: M2 exit verification

- [ ] **Step 1: Confirm exit gate met**

All four conditions:

1. `npm test` passes (M1 tests + new `lineup.test.js` + `concert.test.js`).
2. `npm start` brings up bot AND Express (unchanged from M1).
3. Right-click signup post → Apps → "Lineup" produces the expected ephemeral reply.
4. Smoke script: first `GET /api/concert/pending` returns `200 { concertId }` matching the signup's footer ID; second call returns `404 no_pending_concert`.

- [ ] **Step 2: Tag the milestone (optional)**

```bash
git tag lineup-m2
```

M2 complete. Next milestone: M3 (lineup state CRUD — `services/lineupStore.js`, `/api/state/:concertId`, `/api/lineup/{place,move,remove}`, `/api/guild/members`).

---

## Notes for the implementer

- `pendingConcerts` is a module-singleton living in `src/features/lineup.js`. Both `interactions/contextMenus/planLineup.js` and `core/express.js` import the same instance — no DI plumbing into the bot side, since the bot side is not unit-tested for this code path.
- TTL is 10 minutes (per design spec §5). The window must comfortably cover: user dismisses ephemeral → opens voice channel → opens activity shelf → launches activity → SDK handshake → OAuth → first `/api/concert/pending` call.
- Pop-on-read is intentional: a single pending concert per user, consumed on launch. If the user closes the activity and reopens it, they need to re-trigger the context menu. Acceptable v1 per spec.
- Context menu commands (type 2 and 3) MUST omit `description` — Discord rejects the registration otherwise. Names may contain spaces and uppercase letters.
- The bot restart will wipe `pendingConcerts` in memory (spec §5: "Lost on bot restart — acceptable; user reruns the context menu").
- No rate limit on `/api/concert/pending` in M2 — only the smoke script and (later) the frontend boot will hit it. Rate limits arrive in M3 alongside mutation endpoints.
- Archived events: if a signup has been archived between the right-click and the API call, `getEventJSON` at right-click time would have returned `null` and no entry would have been set. If archival happens AFTER right-click, the route still returns the (now stale) concertId — M3 endpoints will reject mutations on archived files (spec §5).
- The route currently returns just `{ concertId }`. Spec §5 shows the same shape; the frontend (M4) will follow up with `GET /api/state/:concertId` to fetch the full event JSON.
