# Lineup Planner — M1 Implementation Plan (Express + OAuth + Harmonian gate)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Express HTTP server inside the existing Kiribot Node process, do Discord OAuth code-exchange, verify caller is a guild member with the `Harmonian` role, and expose a trivial `/api/me` endpoint that proves the whole chain works.

**Architecture:** A single Node process runs both the bot and an Express app bound to `127.0.0.1:3000`. OAuth code exchange + token verification call Discord's REST API directly. Guild member + role lookup uses the existing `discord.js` client (already has `GuildMembers` intent). Auth middleware applies to every `/api/*` route. Dependency injection passes `fetch` and a guild lookup function so logic can be unit-tested without hitting Discord.

**Tech Stack:** Node 18+ (global `fetch`), `express` (new dep), built-in `node:test` + `node:assert` for tests, existing `discord.js` client, existing `core/logger`.

**Prereqs (M0 done before starting this plan):**
- Domain registered.
- Dev Discord Application created in portal.
- Cybrancee confirmed PM2 + cloudflared sidecar works.
- OAuth2 scopes enabled in dev app: `identify`, `guilds.members.read`.
- OAuth2 client secret copied.
- `Harmonian` role exists in the test guild; its **role ID** copied.

---

## File Structure

| File | Purpose | Status |
| :--- | :--- | :--- |
| `package.json` | Add `express` dep, add `test` script | Modify |
| `config.json` | Add `discordClientSecret`, `expressPort`, `harmonianRoleId`, `oauthRedirectUri` | Modify |
| `src/utils/ttlCache.js` | Small TTL map used by OAuth verify cache + role cache | Create |
| `src/services/oauth.js` | Factory: code-exchange + token-verify, fetch injected | Create |
| `src/services/guildMember.js` | Factory: fetch a guild member + role flags from `discord.js` client, cached | Create |
| `src/middleware/auth.js` | Express middleware: bearer → user → Harmonian gate, sets `req.user` | Create |
| `src/core/express.js` | Builds Express app, mounts routes + middleware, returns `start(port)` | Create |
| `src/routes/api/token.js` | `POST /api/token` route handler factory | Create |
| `src/routes/api/me.js` | `GET /api/me` route handler factory | Create |
| `src/index.js` | Start Express alongside bot | Modify |
| `tests/utils/ttlCache.test.js` | Unit tests for cache | Create |
| `tests/services/oauth.test.js` | Unit tests for OAuth service with mocked fetch | Create |
| `tests/middleware/auth.test.js` | Unit tests for middleware with stubbed deps | Create |
| `scripts/m1-smoke.js` | Manual smoke test: takes an OAuth code on CLI, hits `/api/token` then `/api/me` | Create |

---

## Task 1: Add dependencies + config schema

**Files:**
- Modify: `package.json`
- Modify: `config.json`

- [ ] **Step 1: Install express**

Run:
```bash
npm install express@^4.21.0
```

Expected: `express` added to `dependencies`, no audit errors fatal.

- [ ] **Step 2: Add test script to package.json**

Edit `package.json` `scripts` section to include:

```json
"scripts": {
    "test": "node --test tests/",
    "start": "node .",
    "register": "node src/services/registerCommands.js"
}
```

- [ ] **Step 3: Extend config.json with M1 fields**

Add these keys to `config.json` (use real values from M0 prereqs):

```json
{
    "token": "...",
    "clientId": "...",
    "guildId": "...",
    "discordClientSecret": "REPLACE_WITH_DEV_APP_CLIENT_SECRET",
    "expressPort": 3000,
    "harmonianRoleId": "REPLACE_WITH_HARMONIAN_ROLE_SNOWFLAKE",
    "oauthRedirectUri": "https://discord.com"
}
```

Note: `oauthRedirectUri` must match a Redirect URI registered in the Discord dev app's OAuth2 settings. For Activities this is a formality (the SDK handles redirects); `https://discord.com` is acceptable.

- [ ] **Step 4: Verify config loads**

Run:
```bash
node -e "console.log(Object.keys(require('./config.json')))"
```

Expected: array including all eight keys.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(lineup): add express dep + npm test script"
```

Note: `config.json` is gitignored — staging it is a no-op. Developer applies the placeholder values to their own copy.

---

## Task 2: TTL cache utility (TDD)

**Files:**
- Create: `src/utils/ttlCache.js`
- Test: `tests/utils/ttlCache.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/utils/ttlCache.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const createTtlCache = require('../../src/utils/ttlCache');

test('returns undefined for missing key', () => {
    const cache = createTtlCache({ ttlMs: 1000 });
    assert.strictEqual(cache.get('x'), undefined);
});

test('returns stored value within TTL', () => {
    const cache = createTtlCache({ ttlMs: 1000, now: () => 0 });
    cache.set('x', 42);
    assert.strictEqual(cache.get('x'), 42);
});

test('expires after ttl', () => {
    let t = 0;
    const cache = createTtlCache({ ttlMs: 100, now: () => t });
    cache.set('x', 42);
    t = 99;
    assert.strictEqual(cache.get('x'), 42);
    t = 101;
    assert.strictEqual(cache.get('x'), undefined);
});

test('delete removes key', () => {
    const cache = createTtlCache({ ttlMs: 1000 });
    cache.set('x', 42);
    cache.delete('x');
    assert.strictEqual(cache.get('x'), undefined);
});
```

- [ ] **Step 2: Run tests to verify fail**

Run:
```bash
npm test
```

Expected: 4 failures (`Cannot find module '../../src/utils/ttlCache'`).

- [ ] **Step 3: Implement TTL cache**

Create `src/utils/ttlCache.js`:

```js
function createTtlCache({ ttlMs, now = Date.now } = {}) {
    const store = new Map();
    return {
        get(key) {
            const entry = store.get(key);
            if (!entry) return undefined;
            if (now() >= entry.expiresAt) {
                store.delete(key);
                return undefined;
            }
            return entry.value;
        },
        set(key, value) {
            store.set(key, { value, expiresAt: now() + ttlMs });
        },
        delete(key) {
            store.delete(key);
        }
    };
}

module.exports = createTtlCache;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`

Expected: 4 passes.

- [ ] **Step 5: Commit**

```bash
git add src/utils/ttlCache.js tests/utils/ttlCache.test.js
git commit -m "feat(utils): add TTL cache utility"
```

---

## Task 3: OAuth service — exchangeCode + verifyToken (TDD)

**Files:**
- Create: `src/services/oauth.js`
- Test: `tests/services/oauth.test.js`

The service is a factory taking `{ fetch, clientId, clientSecret, redirectUri, verifyCache }`. Tests inject a mock fetch + a real TTL cache.

- [ ] **Step 1: Write failing tests**

Create `tests/services/oauth.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const createTtlCache = require('../../src/utils/ttlCache');
const createOAuthService = require('../../src/services/oauth');

function mockFetch(routes) {
    const calls = [];
    async function fakeFetch(url, opts) {
        calls.push({ url, opts });
        const handler = routes[url];
        if (!handler) throw new Error('unexpected fetch: ' + url);
        const res = handler(opts);
        return {
            ok: res.status >= 200 && res.status < 300,
            status: res.status,
            async json() { return res.body; }
        };
    }
    fakeFetch.calls = calls;
    return fakeFetch;
}

test('exchangeCode posts to discord token endpoint with form body', async () => {
    const fetch = mockFetch({
        'https://discord.com/api/oauth2/token': () => ({
            status: 200,
            body: { access_token: 'AT', expires_in: 604800, token_type: 'Bearer' }
        })
    });
    const oauth = createOAuthService({
        fetch,
        clientId: 'cid',
        clientSecret: 'csec',
        redirectUri: 'https://discord.com',
        verifyCache: createTtlCache({ ttlMs: 60000 })
    });

    const result = await oauth.exchangeCode('abc123');

    assert.strictEqual(result.access_token, 'AT');
    assert.strictEqual(fetch.calls[0].opts.method, 'POST');
    assert.match(fetch.calls[0].opts.headers['Content-Type'], /application\/x-www-form-urlencoded/);
    const body = fetch.calls[0].opts.body;
    assert.match(body, /client_id=cid/);
    assert.match(body, /client_secret=csec/);
    assert.match(body, /grant_type=authorization_code/);
    assert.match(body, /code=abc123/);
});

test('exchangeCode throws on non-2xx', async () => {
    const fetch = mockFetch({
        'https://discord.com/api/oauth2/token': () => ({
            status: 400, body: { error: 'invalid_grant' }
        })
    });
    const oauth = createOAuthService({
        fetch, clientId: 'c', clientSecret: 's', redirectUri: 'r',
        verifyCache: createTtlCache({ ttlMs: 1000 })
    });

    await assert.rejects(() => oauth.exchangeCode('bad'), /invalid_grant|400/);
});

test('verifyToken calls Discord /users/@me and returns user', async () => {
    const fetch = mockFetch({
        'https://discord.com/api/users/@me': () => ({
            status: 200, body: { id: 'u1', username: 'foo', global_name: 'Foo' }
        })
    });
    const oauth = createOAuthService({
        fetch, clientId: 'c', clientSecret: 's', redirectUri: 'r',
        verifyCache: createTtlCache({ ttlMs: 60000 })
    });

    const user = await oauth.verifyToken('AT');
    assert.strictEqual(user.id, 'u1');
});

test('verifyToken caches', async () => {
    let calls = 0;
    const fetch = mockFetch({
        'https://discord.com/api/users/@me': () => {
            calls++;
            return { status: 200, body: { id: 'u1', username: 'foo' } };
        }
    });
    const oauth = createOAuthService({
        fetch, clientId: 'c', clientSecret: 's', redirectUri: 'r',
        verifyCache: createTtlCache({ ttlMs: 60000 })
    });
    await oauth.verifyToken('AT');
    await oauth.verifyToken('AT');
    assert.strictEqual(calls, 1);
});

test('verifyToken throws on 401', async () => {
    const fetch = mockFetch({
        'https://discord.com/api/users/@me': () => ({ status: 401, body: {} })
    });
    const oauth = createOAuthService({
        fetch, clientId: 'c', clientSecret: 's', redirectUri: 'r',
        verifyCache: createTtlCache({ ttlMs: 1000 })
    });
    await assert.rejects(() => oauth.verifyToken('bad'), /401/);
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm test`

Expected: failures (`Cannot find module '../../src/services/oauth'`).

- [ ] **Step 3: Implement OAuth service**

Create `src/services/oauth.js`:

```js
function createOAuthService({ fetch, clientId, clientSecret, redirectUri, verifyCache }) {
    async function exchangeCode(code) {
        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri
        }).toString();

        const res = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const reason = err.error_description || err.error || `HTTP ${res.status}`;
            throw new Error(`Discord token exchange failed: ${reason}`);
        }
        return res.json();
    }

    async function verifyToken(accessToken) {
        const cached = verifyCache.get(accessToken);
        if (cached) return cached;

        const res = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) {
            throw new Error(`Discord verify failed: HTTP ${res.status}`);
        }
        const user = await res.json();
        verifyCache.set(accessToken, user);
        return user;
    }

    return { exchangeCode, verifyToken };
}

module.exports = createOAuthService;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`

Expected: all OAuth tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/oauth.js tests/services/oauth.test.js
git commit -m "feat(lineup): OAuth code exchange + token verify service"
```

---

## Task 4: Guild member + Harmonian role lookup

**Files:**
- Create: `src/services/guildMember.js`

This service wraps the bot's `discord.js` client. We do NOT unit-test the discord.js call itself (would require mocking the whole client surface); the module is kept thin and is exercised end-to-end by the manual smoke test.

- [ ] **Step 1: Write the implementation**

Create `src/services/guildMember.js`:

```js
function createGuildMemberService({ client, guildId, harmonianRoleId, cache }) {
    async function getMember(userId) {
        const cached = cache.get(userId);
        if (cached) return cached;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error(`Bot not in guild ${guildId}`);

        let member;
        try {
            member = await guild.members.fetch(userId);
        } catch (err) {
            if (err.code === 10007 /* Unknown Member */) {
                const result = { found: false };
                cache.set(userId, result);
                return result;
            }
            throw err;
        }

        const result = {
            found: true,
            id: member.id,
            displayName: member.displayName,
            hasHarmonian: member.roles.cache.has(harmonianRoleId)
        };
        cache.set(userId, result);
        return result;
    }

    return { getMember };
}

module.exports = createGuildMemberService;
```

- [ ] **Step 2: Commit**

```bash
git add src/services/guildMember.js
git commit -m "feat(lineup): guild member lookup with Harmonian role flag"
```

---

## Task 5: Auth middleware (TDD)

**Files:**
- Create: `src/middleware/auth.js`
- Test: `tests/middleware/auth.test.js`

Middleware extracts bearer token, calls `oauth.verifyToken`, then `guildMember.getMember`, then enforces `hasHarmonian`. Sets `req.user`.

- [ ] **Step 1: Write failing tests**

Create `tests/middleware/auth.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const createAuthMiddleware = require('../../src/middleware/auth');

function mockRes() {
    const res = {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
    return res;
}

test('401 when no Authorization header', async () => {
    const mw = createAuthMiddleware({
        oauth: { verifyToken: async () => ({}) },
        guildMember: { getMember: async () => ({}) }
    });
    const req = { headers: {} };
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(nextCalled, false);
});

test('401 when bearer token invalid', async () => {
    const mw = createAuthMiddleware({
        oauth: { verifyToken: async () => { throw new Error('Discord verify failed: HTTP 401'); } },
        guildMember: { getMember: async () => ({}) }
    });
    const req = { headers: { authorization: 'Bearer bad' } };
    const res = mockRes();
    await mw(req, res, () => {});
    assert.strictEqual(res.statusCode, 401);
});

test('403 when not in guild', async () => {
    const mw = createAuthMiddleware({
        oauth: { verifyToken: async () => ({ id: 'u1', username: 'foo' }) },
        guildMember: { getMember: async () => ({ found: false }) }
    });
    const req = { headers: { authorization: 'Bearer good' } };
    const res = mockRes();
    await mw(req, res, () => {});
    assert.strictEqual(res.statusCode, 403);
});

test('403 when missing Harmonian role', async () => {
    const mw = createAuthMiddleware({
        oauth: { verifyToken: async () => ({ id: 'u1', username: 'foo' }) },
        guildMember: { getMember: async () => ({ found: true, id: 'u1', displayName: 'Foo', hasHarmonian: false }) }
    });
    const req = { headers: { authorization: 'Bearer good' } };
    const res = mockRes();
    await mw(req, res, () => {});
    assert.strictEqual(res.statusCode, 403);
});

test('next called and req.user set when Harmonian', async () => {
    const mw = createAuthMiddleware({
        oauth: { verifyToken: async () => ({ id: 'u1', username: 'foo' }) },
        guildMember: { getMember: async () => ({ found: true, id: 'u1', displayName: 'Foo', hasHarmonian: true }) }
    });
    const req = { headers: { authorization: 'Bearer good' } };
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.deepStrictEqual(req.user, { id: 'u1', displayName: 'Foo', hasHarmonian: true });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm test`

Expected: 5 failures (`Cannot find module '../../src/middleware/auth'`).

- [ ] **Step 3: Implement middleware**

Create `src/middleware/auth.js`:

```js
function createAuthMiddleware({ oauth, guildMember, logger }) {
    return async function authMiddleware(req, res, next) {
        const header = req.headers.authorization || '';
        const match = header.match(/^Bearer\s+(.+)$/i);
        if (!match) {
            return res.status(401).json({ error: 'missing_bearer_token' });
        }
        const token = match[1];

        let discordUser;
        try {
            discordUser = await oauth.verifyToken(token);
        } catch (err) {
            if (logger) logger('auth: verifyToken failed:', err.message);
            return res.status(401).json({ error: 'invalid_token' });
        }

        let member;
        try {
            member = await guildMember.getMember(discordUser.id);
        } catch (err) {
            if (logger) logger('auth: guildMember lookup failed:', err);
            return res.status(500).json({ error: 'member_lookup_failed' });
        }

        if (!member.found) {
            return res.status(403).json({ error: 'not_in_guild' });
        }
        if (!member.hasHarmonian) {
            return res.status(403).json({ error: 'missing_role' });
        }

        req.user = {
            id: member.id,
            displayName: member.displayName,
            hasHarmonian: true
        };
        next();
    };
}

module.exports = createAuthMiddleware;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`

Expected: all 5 middleware tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/middleware/auth.js tests/middleware/auth.test.js
git commit -m "feat(lineup): auth middleware (token + guild + Harmonian)"
```

---

## Task 6: Route — POST /api/token

**Files:**
- Create: `src/routes/api/token.js`

- [ ] **Step 1: Write implementation**

Create `src/routes/api/token.js`:

```js
function createTokenRoute({ oauth, logger }) {
    return async function tokenRoute(req, res) {
        const { code } = req.body || {};
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'missing_code' });
        }
        try {
            const result = await oauth.exchangeCode(code);
            return res.json({
                access_token: result.access_token,
                expires_in: result.expires_in
            });
        } catch (err) {
            if (logger) logger('POST /api/token failed:', err.message);
            return res.status(400).json({ error: 'exchange_failed' });
        }
    };
}

module.exports = createTokenRoute;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/api/token.js
git commit -m "feat(lineup): POST /api/token route (OAuth code exchange)"
```

---

## Task 7: Route — GET /api/me

**Files:**
- Create: `src/routes/api/me.js`

- [ ] **Step 1: Write implementation**

Create `src/routes/api/me.js`:

```js
function createMeRoute() {
    return function meRoute(req, res) {
        return res.json({
            id: req.user.id,
            displayName: req.user.displayName,
            hasHarmonian: req.user.hasHarmonian
        });
    };
}

module.exports = createMeRoute;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/api/me.js
git commit -m "feat(lineup): GET /api/me route"
```

---

## Task 8: Express app + start function

**Files:**
- Create: `src/core/express.js`

- [ ] **Step 1: Write implementation**

Create `src/core/express.js`:

```js
const express = require('express');
const logger = require('./logger');
const createTtlCache = require('../utils/ttlCache');
const createOAuthService = require('../services/oauth');
const createGuildMemberService = require('../services/guildMember');
const createAuthMiddleware = require('../middleware/auth');
const createTokenRoute = require('../routes/api/token');
const createMeRoute = require('../routes/api/me');

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

    const app = express();
    app.use(express.json({ limit: '64kb' }));

    app.post('/api/token', createTokenRoute({ oauth, logger }));
    app.get('/api/me', authMiddleware, createMeRoute());

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

- [ ] **Step 2: Commit**

```bash
git add src/core/express.js
git commit -m "feat(lineup): Express app factory + start function"
```

---

## Task 9: Wire Express into index.js

**Files:**
- Modify: `src/index.js`

- [ ] **Step 1: Edit index.js to start Express alongside bot**

Replace `src/index.js` with:

```js
const fs = require('fs');
const path = require('path');
const client = require('./core/client');
const config = require('../config.json');
const logActivity = require('./core/logger');
const { register: registerErrorHandlers } = require('./events/errorHandlers');
const { start: startExpress } = require('./core/express');

// Register error handlers before anything else
registerErrorHandlers();

// Auto-load all event handlers
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js') && file !== 'errorHandlers.js');

for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));
    if (event.name) {
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }
}

// Start Express after bot is ready (needs client.guilds.cache populated)
client.once('ready', () => {
    startExpress({ client, config }).catch(err =>
        logActivity('Failed to start Express:', err)
    );
});

// Log in to Discord
client.login(config.token).catch(err => logActivity('Failed to login:', err));
```

- [ ] **Step 2: Smoke-start the bot locally**

Run:
```bash
npm start
```

Expected log lines:
- Existing bot ready log.
- `Express listening on 127.0.0.1:3000`.

Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat(lineup): start Express alongside bot in index.js"
```

---

## Task 10: Manual OAuth smoke test script

**Files:**
- Create: `scripts/m1-smoke.js`

This script proves the OAuth chain end-to-end with a real Discord user. Developer manually obtains an OAuth `code` via Discord's authorize URL, then passes it on the CLI.

- [ ] **Step 1: Write script**

Create `scripts/m1-smoke.js`:

```js
const config = require('../config.json');

async function main() {
    const code = process.argv[2];
    if (!code) {
        console.error('Usage: node scripts/m1-smoke.js <oauth-code>');
        console.error('');
        console.error('Get a code by visiting (in a browser):');
        const authorize = new URL('https://discord.com/oauth2/authorize');
        authorize.searchParams.set('client_id', config.clientId);
        authorize.searchParams.set('redirect_uri', config.oauthRedirectUri);
        authorize.searchParams.set('response_type', 'code');
        authorize.searchParams.set('scope', 'identify guilds.members.read');
        console.error('  ' + authorize.toString());
        console.error('');
        console.error('After authorizing, copy the `code` query parameter from the redirect URL.');
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

    const meRes = await fetch(`${base}/api/me`, {
        headers: { Authorization: `Bearer ${tokenBody.access_token}` }
    });
    const meBody = await meRes.json();
    console.log('GET /api/me →', meRes.status, meBody);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run the smoke test**

In one terminal:
```bash
npm start
```

In another terminal:
```bash
node scripts/m1-smoke.js
```

Expected: prints authorize URL + usage. Open URL in browser, complete OAuth, copy `code` from the redirect URL's `?code=...` parameter.

Then:
```bash
node scripts/m1-smoke.js <pasted-code>
```

Expected output (for a Harmonian member):

```
POST /api/token → 200 { access_token: '...', expires_in: 604800 }
GET /api/me → 200 { id: '...', displayName: '...', hasHarmonian: true }
```

Expected output (for a non-Harmonian guild member):

```
POST /api/token → 200 { access_token: '...', expires_in: 604800 }
GET /api/me → 403 { error: 'missing_role' }
```

Expected output (someone not in guild — test with second account):

```
POST /api/token → 200 { access_token: '...', expires_in: 604800 }
GET /api/me → 403 { error: 'not_in_guild' }
```

OAuth codes expire after ~30 seconds and are single-use — get a fresh one for each test.

- [ ] **Step 3: Commit**

```bash
git add scripts/m1-smoke.js
git commit -m "feat(lineup): M1 OAuth smoke test script"
```

---

## Task 11: M1 exit verification

- [ ] **Step 1: Confirm exit gate met**

All four conditions:

1. `npm test` passes (cache + OAuth + middleware tests).
2. `npm start` brings up bot AND prints `Express listening on 127.0.0.1:3000`.
3. Smoke test with a Harmonian's OAuth code prints `hasHarmonian: true` from `/api/me`.
4. Smoke test with a non-Harmonian guild member returns `403 missing_role`.

- [ ] **Step 2: Tag the milestone (optional)**

```bash
git tag lineup-m1
```

M1 complete. Next milestone: M2 (context menu + concert resolution).

---

## Notes for the implementer

- All services and middleware are factory functions taking dependencies. Tests fast (no Discord round-trips); forces dependency boundaries.
- `verifyCache` and the guild member cache are independent TTL maps (60s each). Two caches: different keys (access token vs userId) and may want different TTLs later.
- Express app binds to `127.0.0.1` only. No public listener; ingress comes via cloudflared (M0 work).
- Access tokens never persisted — verified per-request, 60s cache softens Discord API hit.
- No CORS yet; M1 only tests with localhost. M4 will add `*.discordsays.com` allow-list.
- No rate limiting yet; M1 traffic is only the smoke script.
- Auth middleware is unit-tested with stubs; `guildMember` service has no dedicated unit test (mocking discord.js Guild + GuildMemberManager surface is heavier than the code being tested). Manual smoke covers it.
