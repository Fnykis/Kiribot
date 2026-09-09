# Årshjul Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser-based årshjul site where a Kiriaka member logs in with Discord and sees a read-only year wheel for each instrument section and workgroup they belong to.

**Architecture:** A new static frontend in `yearwheel/`, deployed by FTP to `kiribot.ollelindberg.se/yearwheel`, talks to the existing bot's Express API over the Cloudflare Tunnel. The bot authenticates users with a Discord OAuth redirect and issues its own HMAC-signed session in an `HttpOnly` cookie; it resolves Discord roles server-side on every request. Everything is additive — the Discord lineup Activity's auth, routes, build, and hosting are untouched.

**Tech Stack:** Node.js 26, Express 4, discord.js v14, `node:crypto` for session signing, `lockfile` for writes, `node:test` for backend tests; Vite 5 and vitest for the frontend, vanilla JS with no framework.

**Spec:** `docs/superpowers/specs/2026-09-09-arshjul-design.md`

## Global Constraints

- **Never modify** `src/middleware/auth.js`, `frontend/`, `frontend/vite.config.js`, or the Discord Activity's URL mapping. The Activity must keep working unchanged.
- **Never repoint** `config.oauthRedirectUri`. The web flow passes its own redirect URI per call.
- **Never rename** the `lineup-api.ollelindberg.se` tunnel hostname. Add `kiribot-api.ollelindberg.se` alongside it.
- Session cookie name: `kiribot_session`. Attributes: `HttpOnly; Secure; SameSite=Lax; Path=/`, **no `Domain` attribute** (host-only).
- Session lifetime: 30 days. The session payload carries a user ID and expiry only — **never roles**.
- Instrument role colour `#e91e63` (`hex_instr`), workgroup role colour `#f1c40f` (`hex_arbet`), both from `src/core/constants.js`.
- Site origin: `https://kiribot.ollelindberg.se`. API origin: `https://kiribot-api.ollelindberg.se`. OAuth redirect URI: `https://kiribot.ollelindberg.se/yearwheel/callback.html`.
- Wheels are addressed by Discord **role ID**, never role name.
- Error codes are exact strings: `401` with `{ error: 'no_session' }`, `403` with `{ error: 'not_in_guild' }`, `403` with `{ error: 'missing_role' }`.
- User-facing copy is Swedish. Member-without-groups text, verbatim:
  `Du måste ansluta till ett instrument eller en arbetsgrupp för att använda årshjulet. Har du nyligen ändrat din profil? Vänta då i några minuter och prova igen.`
  Non-member text, verbatim:
  `Du är inte medlem i Kiriakas Discord-server, så årshjulet är inte tillgängligt för dig.`
- Backend tests run with `npm test`. Frontend tests run with `cd yearwheel && npx vitest run`.
- Backend files use CommonJS (`require`/`module.exports`) and 4-space indents, matching `src/`. Frontend files use ESM and 4-space indents, matching `frontend/`.

## Manual prerequisites (the human must do these; no task can)

1. Create DNS record for `kiribot.ollelindberg.se` and for `kiribot-api.ollelindberg.se`.
2. Add `kiribot-api.ollelindberg.se` to the tunnel ingress in `config.yml` on the bot host, **above** the `http_status:404` catch-all, pointing at `http://localhost:3000`. Leave the `lineup-api` entry in place.
3. In the Discord Developer Portal, **add** `https://kiribot.ollelindberg.se/yearwheel/callback.html` as a second OAuth redirect URI. Do not remove the existing one.
4. Add to `config.json` on the bot host: `webOrigin`, `webRedirectUri`, `sessionSecret` (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).

## File Structure

**Backend — created:**
- `src/utils/cookies.js` — parse and serialize HTTP cookies. No dependencies.
- `src/services/webSession.js` — sign and verify session tokens.
- `src/middleware/webAuth.js` — cookie session → `req.webUser`.
- `src/services/memberGroups.js` — Discord member → their instrument and workgroup roles.
- `src/services/arshjulStore.js` — read/bootstrap `src/data/arshjul.json`.
- `src/routes/api/web/token.js`, `logout.js`, `me.js`, `yearwheel.js` — route factories.
- `src/features/arshjulPanel.js` — posts the permanent Link button in Discord.

**Backend — modified:**
- `src/services/oauth.js` — `exchangeCode` accepts a per-call redirect URI.
- `src/core/express.js` — CORS second origin, mount `/api/web/*`.
- `src/services/google/drive.js` — register `arshjul.json` for backup.
- `src/events/ready.js` — call `postArshjulPanel()` on startup.
- `config.example.json` — document the three new keys.

**Frontend — created:** `yearwheel/` as its own npm project (`package.json`, `vite.config.js`, `index.html`, `wheel.html`, `callback.html`, `src/api.js`, `src/auth.js`, `src/landing.js`, `src/wheel.js`, `src/styles.css`, `tests/`).

Route factories stay pure — dependencies injected, no `require` of the Discord client — so they test with a plain mock `res`, exactly like `tests/routes/concerts.test.js`.

---

### Task 1: Cookie parsing and serialization

**Files:**
- Create: `src/utils/cookies.js`
- Test: `tests/utils/cookies.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseCookies(header: string | undefined) => Record<string,string>`, `serializeCookie(name: string, value: string, opts: { maxAge?: number, expires?: Date }) => string`.

Express 4 does not parse cookies and we are not adding a dependency for ten lines.

- [ ] **Step 1: Write the failing test**

```js
// tests/utils/cookies.test.js
const test = require('node:test');
const assert = require('node:assert');
const { parseCookies, serializeCookie } = require('../../src/utils/cookies');

test('parses a single cookie', () => {
    assert.deepStrictEqual(parseCookies('kiribot_session=abc'), { kiribot_session: 'abc' });
});

test('parses several cookies and trims whitespace', () => {
    assert.deepStrictEqual(
        parseCookies('a=1; kiribot_session=abc.def; b=2'),
        { a: '1', kiribot_session: 'abc.def', b: '2' }
    );
});

test('returns an empty object for a missing or empty header', () => {
    assert.deepStrictEqual(parseCookies(undefined), {});
    assert.deepStrictEqual(parseCookies(''), {});
});

test('decodes percent-encoded values', () => {
    assert.deepStrictEqual(parseCookies('x=a%20b'), { x: 'a b' });
});

test('ignores malformed pairs without a name', () => {
    assert.deepStrictEqual(parseCookies('=nope; ok=1'), { ok: '1' });
});

test('serializes with the fixed security attributes', () => {
    const out = serializeCookie('kiribot_session', 'tok', { maxAge: 60 });
    assert.strictEqual(out, 'kiribot_session=tok; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=Lax');
});

test('serialized cookie never carries a Domain attribute', () => {
    const out = serializeCookie('kiribot_session', 'tok', { maxAge: 60 });
    assert.ok(!/Domain/i.test(out), `must be host-only, got: ${out}`);
});

test('serializes an expiry in the past to clear the cookie', () => {
    const out = serializeCookie('kiribot_session', '', { maxAge: 0 });
    assert.ok(out.startsWith('kiribot_session=; Max-Age=0'), out);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/utils/cookies.test.js`
Expected: FAIL — `Cannot find module '../../src/utils/cookies'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/utils/cookies.js
function parseCookies(header) {
    const out = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 1) continue;
        const name = part.slice(0, eq).trim();
        if (!name) continue;
        const raw = part.slice(eq + 1).trim();
        try {
            out[name] = decodeURIComponent(raw);
        } catch {
            out[name] = raw;
        }
    }
    return out;
}

function serializeCookie(name, value, opts = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
    parts.push('Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax');
    return parts.join('; ');
}

module.exports = { parseCookies, serializeCookie };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/utils/cookies.test.js`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/utils/cookies.js tests/utils/cookies.test.js
git commit -m "feat(arshjul): cookie parse/serialize helpers"
```

---

### Task 2: Signed session tokens

**Files:**
- Create: `src/services/webSession.js`
- Test: `tests/services/webSession.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `createWebSession({ secret, ttlMs?, now? }) => { sign(userId) => string, verify(token) => { userId: string } | null, ttlMs: number }`.

Token format is `<userId>.<expiryMs>.<base64url HMAC-SHA256 of "userId.expiryMs">`. The injected `now` makes expiry testable without waiting.

- [ ] **Step 1: Write the failing test**

```js
// tests/services/webSession.test.js
const test = require('node:test');
const assert = require('node:assert');
const createWebSession = require('../../src/services/webSession');

test('a freshly signed token verifies and returns the user id', () => {
    const s = createWebSession({ secret: 'topsecret' });
    const token = s.sign('123456789012345678');
    assert.deepStrictEqual(s.verify(token), { userId: '123456789012345678' });
});

test('a tampered user id fails verification', () => {
    const s = createWebSession({ secret: 'topsecret' });
    const [, exp, mac] = s.sign('111').split('.');
    assert.strictEqual(s.verify(`999.${exp}.${mac}`), null);
});

test('a tampered expiry fails verification', () => {
    const s = createWebSession({ secret: 'topsecret' });
    const [id, exp, mac] = s.sign('111').split('.');
    assert.strictEqual(s.verify(`${id}.${Number(exp) + 1000}.${mac}`), null);
});

test('a token signed with a different secret fails verification', () => {
    const a = createWebSession({ secret: 'secret-a' });
    const b = createWebSession({ secret: 'secret-b' });
    assert.strictEqual(b.verify(a.sign('111')), null);
});

test('an expired token fails verification', () => {
    let clock = 1_000_000;
    const s = createWebSession({ secret: 'topsecret', ttlMs: 1000, now: () => clock });
    const token = s.sign('111');
    clock += 1001;
    assert.strictEqual(s.verify(token), null);
});

test('a token one millisecond before expiry still verifies', () => {
    let clock = 1_000_000;
    const s = createWebSession({ secret: 'topsecret', ttlMs: 1000, now: () => clock });
    const token = s.sign('111');
    clock += 999;
    assert.deepStrictEqual(s.verify(token), { userId: '111' });
});

test('malformed tokens return null rather than throwing', () => {
    const s = createWebSession({ secret: 'topsecret' });
    for (const bad of [undefined, '', 'a', 'a.b', 'a.b.c.d', 'a.notanumber.c']) {
        assert.strictEqual(s.verify(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
});

test('constructing without a secret throws', () => {
    assert.throws(() => createWebSession({ secret: '' }), /secret/);
});

test('default ttl is 30 days', () => {
    const s = createWebSession({ secret: 'topsecret' });
    assert.strictEqual(s.ttlMs, 30 * 24 * 60 * 60 * 1000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/services/webSession.test.js`
Expected: FAIL — `Cannot find module '../../src/services/webSession'`

- [ ] **Step 3: Write minimal implementation**

`timingSafeEqual` throws on length mismatch, so compare lengths first.

```js
// src/services/webSession.js
const crypto = require('crypto');

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function createWebSession({ secret, ttlMs = DEFAULT_TTL_MS, now = Date.now }) {
    if (!secret) throw new Error('webSession: secret is required');

    function mac(payload) {
        return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    }

    function sign(userId) {
        const payload = `${userId}.${now() + ttlMs}`;
        return `${payload}.${mac(payload)}`;
    }

    function verify(token) {
        if (typeof token !== 'string') return null;
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const [userId, expRaw, given] = parts;
        if (!userId) return null;

        const exp = Number(expRaw);
        if (!Number.isFinite(exp)) return null;

        const expected = mac(`${userId}.${expRaw}`);
        const a = Buffer.from(expected);
        const b = Buffer.from(given);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

        if (now() >= exp) return null;
        return { userId };
    }

    return { sign, verify, ttlMs };
}

module.exports = createWebSession;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/services/webSession.test.js`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/services/webSession.js tests/services/webSession.test.js
git commit -m "feat(arshjul): HMAC-signed web session tokens"
```

---

### Task 3: webAuth middleware

**Files:**
- Create: `src/middleware/webAuth.js`
- Test: `tests/middleware/webAuth.test.js`

**Interfaces:**
- Consumes: `createWebSession` (Task 2), `parseCookies` (Task 1).
- Produces: `createWebAuthMiddleware({ webSession, cookieName? }) => (req, res, next)`. On success sets `req.webUser = { id }`. On failure responds `401 { error: 'no_session' }` and does not call `next`.

This middleware checks **only** that a valid session exists. Guild membership and roles are checked by the routes, because a non-member must still get a working session (spec: Session states).

- [ ] **Step 1: Write the failing test**

```js
// tests/middleware/webAuth.test.js
const test = require('node:test');
const assert = require('node:assert');
const createWebAuthMiddleware = require('../../src/middleware/webAuth');
const createWebSession = require('../../src/services/webSession');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

test('401 no_session when there is no cookie header', async () => {
    const mw = createWebAuthMiddleware({ webSession: createWebSession({ secret: 's' }) });
    const req = { headers: {} };
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.statusCode, 401);
    assert.deepStrictEqual(res.body, { error: 'no_session' });
    assert.strictEqual(nextCalled, false);
});

test('401 no_session when the cookie is present but invalid', async () => {
    const mw = createWebAuthMiddleware({ webSession: createWebSession({ secret: 's' }) });
    const req = { headers: { cookie: 'kiribot_session=garbage' } };
    const res = mockRes();
    await mw(req, res, () => {});
    assert.strictEqual(res.statusCode, 401);
    assert.deepStrictEqual(res.body, { error: 'no_session' });
});

test('401 when a different cookie is present but ours is absent', async () => {
    const mw = createWebAuthMiddleware({ webSession: createWebSession({ secret: 's' }) });
    const req = { headers: { cookie: 'other=1' } };
    const res = mockRes();
    await mw(req, res, () => {});
    assert.strictEqual(res.statusCode, 401);
});

test('sets req.webUser and calls next for a valid session', async () => {
    const session = createWebSession({ secret: 's' });
    const mw = createWebAuthMiddleware({ webSession: session });
    const req = { headers: { cookie: `kiribot_session=${session.sign('42')}` } };
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.deepStrictEqual(req.webUser, { id: '42' });
    assert.strictEqual(res.statusCode, 200);
});

test('a session signed with another secret is rejected', async () => {
    const mw = createWebAuthMiddleware({ webSession: createWebSession({ secret: 'right' }) });
    const forged = createWebSession({ secret: 'wrong' }).sign('42');
    const req = { headers: { cookie: `kiribot_session=${forged}` } };
    const res = mockRes();
    await mw(req, res, () => {});
    assert.strictEqual(res.statusCode, 401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/middleware/webAuth.test.js`
Expected: FAIL — `Cannot find module '../../src/middleware/webAuth'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/middleware/webAuth.js
const { parseCookies } = require('../utils/cookies');

const COOKIE_NAME = 'kiribot_session';

function createWebAuthMiddleware({ webSession, cookieName = COOKIE_NAME }) {
    return function webAuth(req, res, next) {
        const cookies = parseCookies(req.headers.cookie);
        const session = webSession.verify(cookies[cookieName]);
        if (!session) {
            return res.status(401).json({ error: 'no_session' });
        }
        req.webUser = { id: session.userId };
        next();
    };
}

module.exports = createWebAuthMiddleware;
module.exports.COOKIE_NAME = COOKIE_NAME;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/middleware/webAuth.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/middleware/webAuth.js tests/middleware/webAuth.test.js
git commit -m "feat(arshjul): webAuth cookie session middleware"
```

---

### Task 4: Per-call redirect URI in the OAuth service

**Files:**
- Modify: `src/services/oauth.js:2-24`
- Test: `tests/services/oauth.test.js` (add cases to the existing file)

**Interfaces:**
- Consumes: nothing.
- Produces: `oauth.exchangeCode(code, redirectUriOverride?)`. Called with one argument it behaves exactly as before.

This is the change that protects the Activity. The web flow must send its own `redirect_uri` without touching `config.oauthRedirectUri`.

- [ ] **Step 1: Write the failing test**

Append to `tests/services/oauth.test.js`:

```js
test('exchangeCode uses the configured redirect_uri when no override is given', async () => {
    let sentBody = null;
    const oauth = createOAuthService({
        fetch: async (_url, opts) => { sentBody = opts.body; return { ok: true, json: async () => ({ access_token: 't' }) }; },
        clientId: 'cid',
        clientSecret: 'csecret',
        redirectUri: 'https://activity.example/callback',
        verifyCache: { get: () => undefined, set: () => {} }
    });

    await oauth.exchangeCode('the-code');

    const params = new URLSearchParams(sentBody);
    assert.strictEqual(params.get('redirect_uri'), 'https://activity.example/callback');
});

test('exchangeCode uses the override redirect_uri when one is given', async () => {
    let sentBody = null;
    const oauth = createOAuthService({
        fetch: async (_url, opts) => { sentBody = opts.body; return { ok: true, json: async () => ({ access_token: 't' }) }; },
        clientId: 'cid',
        clientSecret: 'csecret',
        redirectUri: 'https://activity.example/callback',
        verifyCache: { get: () => undefined, set: () => {} }
    });

    await oauth.exchangeCode('the-code', 'https://kiribot.ollelindberg.se/yearwheel/callback.html');

    const params = new URLSearchParams(sentBody);
    assert.strictEqual(params.get('redirect_uri'), 'https://kiribot.ollelindberg.se/yearwheel/callback.html');
    assert.strictEqual(params.get('code'), 'the-code');
});
```

If `createOAuthService` and `assert` are not already required at the top of that file, add:

```js
const createOAuthService = require('../../src/services/oauth');
const assert = require('node:assert');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/services/oauth.test.js`
Expected: the override test FAILS — `redirect_uri` is `https://activity.example/callback`. The default test passes.

- [ ] **Step 3: Write minimal implementation**

In `src/services/oauth.js`, change the `exchangeCode` signature and the two places `redirectUri` is used:

```js
    async function exchangeCode(code, redirectUriOverride) {
        const effectiveRedirectUri = redirectUriOverride || redirectUri;
        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: effectiveRedirectUri
        }).toString();

        if (logger) logger('token exchange payload:', { client_id: clientId, redirect_uri: effectiveRedirectUri, code });
```

Leave the rest of the function untouched.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — the whole suite, confirming the Activity's exchange path is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/services/oauth.js tests/services/oauth.test.js
git commit -m "feat(arshjul): allow a per-call redirect_uri in exchangeCode"
```

---

### Task 5: Member group resolution

**Files:**
- Create: `src/services/memberGroups.js`
- Test: `tests/services/memberGroups.test.js`

**Interfaces:**
- Consumes: nothing (the Discord client is injected).
- Produces: `createMemberGroupsService({ client, guildId, hexInstr, hexArbet, moderatorRoleId, cache }) => { getGroups(userId) => Promise<Result> }` where `Result` is `{ member: false }` or `{ member: true, displayName: string, isModerator: boolean, instruments: Array<{id,name}>, workgroups: Array<{id,name}> }`.

Deliberately a **separate** service from `src/services/guildMember.js`, which serves the Activity and must not change. Groups are sorted by name so the UI order is stable.

- [ ] **Step 1: Write the failing test**

```js
// tests/services/memberGroups.test.js
const test = require('node:test');
const assert = require('node:assert');
const createMemberGroupsService = require('../../src/services/memberGroups');

const HEX_INSTR = '#e91e63';
const HEX_ARBET = '#f1c40f';

function role(id, name, hexColor) {
    return { id, name, hexColor };
}

// Builds a client whose guild has the given roles on the member.
function mockClient(memberRoles, { displayName = 'Test T', found = true } = {}) {
    const cache = new Map(memberRoles.map(r => [r.id, r]));
    return {
        guilds: {
            cache: {
                get: () => ({
                    members: {
                        fetch: async () => {
                            if (!found) { const e = new Error('Unknown Member'); e.code = 10007; throw e; }
                            return { id: 'u1', displayName, roles: { cache } };
                        }
                    }
                })
            }
        }
    };
}

function noCache() {
    return { get: () => undefined, set: () => {} };
}

function service(client) {
    return createMemberGroupsService({
        client,
        guildId: 'g1',
        hexInstr: HEX_INSTR,
        hexArbet: HEX_ARBET,
        moderatorRoleId: 'mod',
        cache: noCache()
    });
}

test('returns member:false for someone not in the guild', async () => {
    const svc = service(mockClient([], { found: false }));
    assert.deepStrictEqual(await svc.getGroups('u1'), { member: false });
});

test('splits roles into instruments and workgroups by colour', async () => {
    const svc = service(mockClient([
        role('r1', 'tarol', HEX_INSTR),
        role('r2', 'transportgruppen', HEX_ARBET),
        role('r3', 'aktiv', '#000000')
    ]));
    const out = await svc.getGroups('u1');
    assert.strictEqual(out.member, true);
    assert.deepStrictEqual(out.instruments, [{ id: 'r1', name: 'tarol' }]);
    assert.deepStrictEqual(out.workgroups, [{ id: 'r2', name: 'transportgruppen' }]);
});

test('returns every group when a member holds several of each', async () => {
    const svc = service(mockClient([
        role('r1', 'tarol', HEX_INSTR),
        role('r2', 'timbal', HEX_INSTR),
        role('r3', 'transportgruppen', HEX_ARBET),
        role('r4', 'fikagruppen', HEX_ARBET)
    ]));
    const out = await svc.getGroups('u1');
    assert.strictEqual(out.instruments.length, 2);
    assert.strictEqual(out.workgroups.length, 2);
});

test('sorts groups by name', async () => {
    const svc = service(mockClient([
        role('r2', 'transportgruppen', HEX_ARBET),
        role('r1', 'fikagruppen', HEX_ARBET)
    ]));
    const out = await svc.getGroups('u1');
    assert.deepStrictEqual(out.workgroups.map(w => w.name), ['fikagruppen', 'transportgruppen']);
});

test('a member with no group roles gets empty arrays, not member:false', async () => {
    const svc = service(mockClient([role('r3', 'aktiv', '#000000')]));
    const out = await svc.getGroups('u1');
    assert.deepStrictEqual(out.instruments, []);
    assert.deepStrictEqual(out.workgroups, []);
    assert.strictEqual(out.member, true);
});

test('reports moderator status', async () => {
    const svc = service(mockClient([role('mod', 'moderator', '#111111')]));
    assert.strictEqual((await svc.getGroups('u1')).isModerator, true);
});

test('caches the result for the user id', async () => {
    let fetches = 0;
    const store = new Map();
    const client = {
        guilds: {
            cache: {
                get: () => ({
                    members: {
                        fetch: async () => { fetches++; return { id: 'u1', displayName: 'T', roles: { cache: new Map() } }; }
                    }
                })
            }
        }
    };
    const svc = createMemberGroupsService({
        client, guildId: 'g1', hexInstr: HEX_INSTR, hexArbet: HEX_ARBET, moderatorRoleId: 'mod',
        cache: { get: k => store.get(k), set: (k, v) => store.set(k, v) }
    });
    await svc.getGroups('u1');
    await svc.getGroups('u1');
    assert.strictEqual(fetches, 1);
});

test('throws when the bot is not in the guild', async () => {
    const client = { guilds: { cache: { get: () => undefined } } };
    const svc = service(client);
    await assert.rejects(() => svc.getGroups('u1'), /not in guild/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/services/memberGroups.test.js`
Expected: FAIL — `Cannot find module '../../src/services/memberGroups'`

- [ ] **Step 3: Write minimal implementation**

Mirrors the shape of `src/services/guildMember.js`, including the `10007` handling.

```js
// src/services/memberGroups.js
function createMemberGroupsService({ client, guildId, hexInstr, hexArbet, moderatorRoleId, cache }) {
    function byColor(memberRoles, hex) {
        return [...memberRoles.values()]
            .filter(r => r.hexColor === hex)
            .map(r => ({ id: r.id, name: r.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async function getGroups(userId) {
        const cached = cache.get(userId);
        if (cached) return cached;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error(`Bot not in guild ${guildId}`);

        let member;
        try {
            member = await guild.members.fetch(userId);
        } catch (err) {
            if (err.code === 10007 /* Unknown Member */) {
                const result = { member: false };
                cache.set(userId, result);
                return result;
            }
            throw err;
        }

        const roles = member.roles.cache;
        const result = {
            member: true,
            displayName: member.displayName,
            isModerator: roles.has(moderatorRoleId),
            instruments: byColor(roles, hexInstr),
            workgroups: byColor(roles, hexArbet)
        };
        cache.set(userId, result);
        return result;
    }

    return { getGroups };
}

module.exports = createMemberGroupsService;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/services/memberGroups.test.js`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/services/memberGroups.js tests/services/memberGroups.test.js
git commit -m "feat(arshjul): resolve a member's instrument and workgroup roles"
```

---

### Task 6: Årshjul store (read side)

**Files:**
- Create: `src/services/arshjulStore.js`
- Test: `tests/services/arshjulStore.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `createArshjulStore({ filePath }) => { listByRole(roleId) => Promise<Entry[]> }` where `Entry` is `{ id, roleId, channelId, monthDay, title, fields, version, updatedBy, updatedAt, sentYears }`.

Milestone 1 only reads. Writes arrive in milestone 2, which is why the file format carries `version` and `sentYears` from the start — the shape must not change later.

- [ ] **Step 1: Write the failing test**

```js
// tests/services/arshjulStore.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const createArshjulStore = require('../../src/services/arshjulStore');

function tmpFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arshjul-test-'));
    return path.join(dir, 'arshjul.json');
}

function write(file, data) {
    fs.writeFileSync(file, JSON.stringify(data));
}

test('returns an empty array when the file does not exist', async () => {
    const store = createArshjulStore({ filePath: tmpFile() });
    assert.deepStrictEqual(await store.listByRole('r1'), []);
});

test('returns only the entries for the requested role', async () => {
    const file = tmpFile();
    write(file, {
        version: 1,
        entries: {
            e1: { roleId: 'r1', monthDay: '03-01', title: 'A', fields: {}, version: 1, sentYears: [] },
            e2: { roleId: 'r2', monthDay: '04-01', title: 'B', fields: {}, version: 1, sentYears: [] }
        }
    });
    const store = createArshjulStore({ filePath: file });
    const out = await store.listByRole('r1');
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].title, 'A');
});

test('includes the entry id on each returned entry', async () => {
    const file = tmpFile();
    write(file, { version: 1, entries: { e1: { roleId: 'r1', monthDay: '03-01', title: 'A', fields: {}, version: 1, sentYears: [] } } });
    const store = createArshjulStore({ filePath: file });
    assert.strictEqual((await store.listByRole('r1'))[0].id, 'e1');
});

test('sorts entries by monthDay ascending', async () => {
    const file = tmpFile();
    write(file, {
        version: 1,
        entries: {
            e1: { roleId: 'r1', monthDay: '12-24', title: 'Jul', fields: {}, version: 1, sentYears: [] },
            e2: { roleId: 'r1', monthDay: '01-15', title: 'Januari', fields: {}, version: 1, sentYears: [] },
            e3: { roleId: 'r1', monthDay: '06-06', title: 'Juni', fields: {}, version: 1, sentYears: [] }
        }
    });
    const store = createArshjulStore({ filePath: file });
    assert.deepStrictEqual((await store.listByRole('r1')).map(e => e.monthDay), ['01-15', '06-06', '12-24']);
});

test('returns an empty array for a role with no entries', async () => {
    const file = tmpFile();
    write(file, { version: 1, entries: { e1: { roleId: 'r1', monthDay: '03-01', title: 'A', fields: {}, version: 1, sentYears: [] } } });
    const store = createArshjulStore({ filePath: file });
    assert.deepStrictEqual(await store.listByRole('nope'), []);
});

test('throws a clear error when the file is corrupt', async () => {
    const file = tmpFile();
    fs.writeFileSync(file, 'not json at all');
    const store = createArshjulStore({ filePath: file });
    await assert.rejects(() => store.listByRole('r1'), /arshjul_file_corrupt/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/services/arshjulStore.test.js`
Expected: FAIL — `Cannot find module '../../src/services/arshjulStore'`

- [ ] **Step 3: Write minimal implementation**

A missing file is a normal empty state, not an error — the file only appears once someone saves an entry in milestone 2. Corruption is loud, because silently returning `[]` would look like data loss.

```js
// src/services/arshjulStore.js
const fs = require('fs');

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

    async function listByRole(roleId) {
        const data = readFile();
        return Object.entries(data.entries)
            .filter(([, e]) => e.roleId === roleId)
            .map(([id, e]) => ({ id, ...e }))
            .sort((a, b) => a.monthDay.localeCompare(b.monthDay));
    }

    return { listByRole };
}

module.exports = createArshjulStore;
module.exports.DEFAULT_FILE = DEFAULT_FILE;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/services/arshjulStore.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/services/arshjulStore.js tests/services/arshjulStore.test.js
git commit -m "feat(arshjul): read-side store for arshjul.json"
```

---

### Task 7: Token and logout routes

**Files:**
- Create: `src/routes/api/web/token.js`, `src/routes/api/web/logout.js`
- Test: `tests/routes/webToken.test.js`

**Interfaces:**
- Consumes: `oauth.exchangeCode(code, redirectUri)` (Task 4), `webSession.sign` (Task 2), `serializeCookie` (Task 1).
- Produces: `createWebTokenRoute({ oauth, webSession, redirectUri, logger }) => handler`, `createWebLogoutRoute() => handler`.

The token route deliberately does **not** check guild membership — a non-member must receive a session so the page can explain why they cannot proceed and offer logout.

- [ ] **Step 1: Write the failing test**

```js
// tests/routes/webToken.test.js
const test = require('node:test');
const assert = require('node:assert');
const createWebTokenRoute = require('../../src/routes/api/web/token');
const createWebLogoutRoute = require('../../src/routes/api/web/logout');
const createWebSession = require('../../src/services/webSession');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

test('400 when the code is missing', async () => {
    const handler = createWebTokenRoute({
        oauth: { exchangeCode: async () => { throw new Error('should not be called'); }, verifyToken: async () => ({}) },
        webSession: createWebSession({ secret: 's' }),
        redirectUri: 'https://site.example/cb'
    });
    const res = mockRes();
    await handler({ body: {} }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'missing_code' });
});

test('exchanges the code with the web redirect uri and sets a session cookie', async () => {
    let seenRedirect = null;
    const handler = createWebTokenRoute({
        oauth: {
            exchangeCode: async (_code, redirectUri) => { seenRedirect = redirectUri; return { access_token: 'discord-token' }; },
            verifyToken: async () => ({ id: '4242' })
        },
        webSession: createWebSession({ secret: 's' }),
        redirectUri: 'https://site.example/cb'
    });
    const res = mockRes();
    await handler({ body: { code: 'abc' } }, res);

    assert.strictEqual(seenRedirect, 'https://site.example/cb');
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { ok: true });
    const cookie = res.headers['Set-Cookie'];
    assert.ok(cookie.startsWith('kiribot_session='), cookie);
    assert.ok(cookie.includes('HttpOnly'), cookie);
    assert.ok(!/Domain/i.test(cookie), cookie);
});

test('the cookie it sets contains a session for the discord user id', async () => {
    const session = createWebSession({ secret: 's' });
    const handler = createWebTokenRoute({
        oauth: { exchangeCode: async () => ({ access_token: 't' }), verifyToken: async () => ({ id: '4242' }) },
        webSession: session,
        redirectUri: 'https://site.example/cb'
    });
    const res = mockRes();
    await handler({ body: { code: 'abc' } }, res);

    const value = decodeURIComponent(res.headers['Set-Cookie'].split(';')[0].split('=')[1]);
    assert.deepStrictEqual(session.verify(value), { userId: '4242' });
});

test('400 exchange_failed when Discord rejects the code', async () => {
    const handler = createWebTokenRoute({
        oauth: { exchangeCode: async () => { throw new Error('Discord token exchange failed: invalid_grant'); }, verifyToken: async () => ({}) },
        webSession: createWebSession({ secret: 's' }),
        redirectUri: 'https://site.example/cb'
    });
    const res = mockRes();
    await handler({ body: { code: 'bad' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'exchange_failed');
});

test('a user who is not in the guild still receives a session', async () => {
    // The token route must not consult guild membership at all.
    const handler = createWebTokenRoute({
        oauth: { exchangeCode: async () => ({ access_token: 't' }), verifyToken: async () => ({ id: 'outsider' }) },
        webSession: createWebSession({ secret: 's' }),
        redirectUri: 'https://site.example/cb'
    });
    const res = mockRes();
    await handler({ body: { code: 'abc' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.headers['Set-Cookie']);
});

test('logout clears the cookie', async () => {
    const handler = createWebLogoutRoute();
    const res = mockRes();
    await handler({}, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { ok: true });
    assert.ok(res.headers['Set-Cookie'].startsWith('kiribot_session=;'), res.headers['Set-Cookie']);
    assert.ok(res.headers['Set-Cookie'].includes('Max-Age=0'), res.headers['Set-Cookie']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routes/webToken.test.js`
Expected: FAIL — `Cannot find module '../../src/routes/api/web/token'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/routes/api/web/token.js
const { serializeCookie } = require('../../../utils/cookies');
const { COOKIE_NAME } = require('../../../middleware/webAuth');

function createWebTokenRoute({ oauth, webSession, redirectUri, logger }) {
    return async function webTokenRoute(req, res) {
        const { code } = req.body || {};
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'missing_code' });
        }

        let discordUser;
        try {
            const result = await oauth.exchangeCode(code, redirectUri);
            discordUser = await oauth.verifyToken(result.access_token);
        } catch (err) {
            if (logger) logger('POST /api/web/token failed:', err.message);
            return res.status(400).json({ error: 'exchange_failed' });
        }

        const token = webSession.sign(discordUser.id);
        res.setHeader('Set-Cookie', serializeCookie(COOKIE_NAME, token, {
            maxAge: Math.floor(webSession.ttlMs / 1000)
        }));
        return res.json({ ok: true });
    };
}

module.exports = createWebTokenRoute;
```

```js
// src/routes/api/web/logout.js
const { serializeCookie } = require('../../../utils/cookies');
const { COOKIE_NAME } = require('../../../middleware/webAuth');

function createWebLogoutRoute() {
    return async function webLogoutRoute(req, res) {
        res.setHeader('Set-Cookie', serializeCookie(COOKIE_NAME, '', { maxAge: 0 }));
        return res.json({ ok: true });
    };
}

module.exports = createWebLogoutRoute;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routes/webToken.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/web/token.js src/routes/api/web/logout.js tests/routes/webToken.test.js
git commit -m "feat(arshjul): web token exchange and logout routes"
```

---

### Task 8: The `/api/web/me` route

**Files:**
- Create: `src/routes/api/web/me.js`
- Test: `tests/routes/webMe.test.js`

**Interfaces:**
- Consumes: `memberGroups.getGroups(userId)` (Task 5), `req.webUser.id` (Task 3).
- Produces: `createWebMeRoute({ memberGroups }) => handler`. Responds `200 { member: false }` or `200 { member: true, displayName, instruments, workgroups }`.

`isModerator` is deliberately **not** exposed. The frontend has no use for it in milestone 1, and moderator status is applied server-side.

- [ ] **Step 1: Write the failing test**

```js
// tests/routes/webMe.test.js
const test = require('node:test');
const assert = require('node:assert');
const createWebMeRoute = require('../../src/routes/api/web/me');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

test('returns member:false and nothing else for a non-member', async () => {
    const handler = createWebMeRoute({ memberGroups: { getGroups: async () => ({ member: false }) } });
    const res = mockRes();
    await handler({ webUser: { id: 'u1' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { member: false });
});

test('returns the member display name and both group lists', async () => {
    const handler = createWebMeRoute({
        memberGroups: {
            getGroups: async () => ({
                member: true,
                displayName: 'Olle L',
                isModerator: false,
                instruments: [{ id: 'r1', name: 'tarol' }],
                workgroups: [{ id: 'r2', name: 'transportgruppen' }]
            })
        }
    });
    const res = mockRes();
    await handler({ webUser: { id: 'u1' } }, res);
    assert.deepStrictEqual(res.body, {
        member: true,
        displayName: 'Olle L',
        instruments: [{ id: 'r1', name: 'tarol' }],
        workgroups: [{ id: 'r2', name: 'transportgruppen' }]
    });
});

test('does not leak moderator status', async () => {
    const handler = createWebMeRoute({
        memberGroups: {
            getGroups: async () => ({ member: true, displayName: 'M', isModerator: true, instruments: [], workgroups: [] })
        }
    });
    const res = mockRes();
    await handler({ webUser: { id: 'u1' } }, res);
    assert.strictEqual('isModerator' in res.body, false);
});

test('a member with no groups returns empty arrays', async () => {
    const handler = createWebMeRoute({
        memberGroups: { getGroups: async () => ({ member: true, displayName: 'N', isModerator: false, instruments: [], workgroups: [] }) }
    });
    const res = mockRes();
    await handler({ webUser: { id: 'u1' } }, res);
    assert.deepStrictEqual(res.body.instruments, []);
    assert.deepStrictEqual(res.body.workgroups, []);
});

test('500 member_lookup_failed when Discord lookup throws', async () => {
    const handler = createWebMeRoute({ memberGroups: { getGroups: async () => { throw new Error('discord down'); } } });
    const res = mockRes();
    await handler({ webUser: { id: 'u1' } }, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'member_lookup_failed' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routes/webMe.test.js`
Expected: FAIL — `Cannot find module '../../src/routes/api/web/me'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/routes/api/web/me.js
function createWebMeRoute({ memberGroups, logger }) {
    return async function webMeRoute(req, res) {
        let groups;
        try {
            groups = await memberGroups.getGroups(req.webUser.id);
        } catch (err) {
            if (logger) logger('GET /api/web/me lookup failed:', err.message);
            return res.status(500).json({ error: 'member_lookup_failed' });
        }

        if (!groups.member) return res.json({ member: false });

        return res.json({
            member: true,
            displayName: groups.displayName,
            instruments: groups.instruments,
            workgroups: groups.workgroups
        });
    };
}

module.exports = createWebMeRoute;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routes/webMe.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/web/me.js tests/routes/webMe.test.js
git commit -m "feat(arshjul): GET /api/web/me session state route"
```

---

### Task 9: The wheel route and its access gate

**Files:**
- Create: `src/routes/api/web/yearwheel.js`
- Test: `tests/routes/webYearwheel.test.js`

**Interfaces:**
- Consumes: `memberGroups.getGroups(userId)` (Task 5), `arshjulStore.listByRole(roleId)` (Task 6), `req.webUser.id` (Task 3).
- Produces: `createWebYearwheelRoute({ memberGroups, arshjulStore, logger }) => handler`, reading `req.params.roleId`.

This is the security-critical task. The gate lives here, in the endpoint, and applies to reads. Which links the frontend renders is irrelevant to it.

- [ ] **Step 1: Write the failing test**

```js
// tests/routes/webYearwheel.test.js
const test = require('node:test');
const assert = require('node:assert');
const createWebYearwheelRoute = require('../../src/routes/api/web/yearwheel');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

function req(roleId, userId = 'u1') {
    return { webUser: { id: userId }, params: { roleId } };
}

const MEMBER_OF_R1 = {
    member: true,
    displayName: 'Olle L',
    isModerator: false,
    instruments: [],
    workgroups: [{ id: 'r1', name: 'transportgruppen' }]
};

function route(groups, entries = []) {
    return createWebYearwheelRoute({
        memberGroups: { getGroups: async () => groups },
        arshjulStore: { listByRole: async () => entries }
    });
}

test('403 not_in_guild when the caller is not in the server', async () => {
    const res = mockRes();
    await route({ member: false })(req('r1'), res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'not_in_guild' });
});

test('403 missing_role when the caller does not hold that role', async () => {
    const res = mockRes();
    await route(MEMBER_OF_R1)(req('r-other'), res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'missing_role' });
});

test('200 with the entries when the caller holds the role', async () => {
    const entries = [{ id: 'e1', roleId: 'r1', monthDay: '01-15', title: 'Boka lokal', fields: {}, version: 1, sentYears: [] }];
    const res = mockRes();
    await route(MEMBER_OF_R1, entries)(req('r1'), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.role.id, 'r1');
    assert.strictEqual(res.body.role.name, 'transportgruppen');
    assert.deepStrictEqual(res.body.entries, entries);
});

test('an instrument role is accepted the same way as a workgroup role', async () => {
    const groups = { member: true, displayName: 'O', isModerator: false, instruments: [{ id: 'i1', name: 'tarol' }], workgroups: [] };
    const res = mockRes();
    await route(groups)(req('i1'), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.role.name, 'tarol');
});

test('a moderator may read a wheel for a role they do not hold', async () => {
    const groups = { member: true, displayName: 'Mod', isModerator: true, instruments: [], workgroups: [] };
    const res = mockRes();
    await route(groups)(req('r-any'), res);
    assert.strictEqual(res.statusCode, 200);
});

test('403 missing_role for an unknown role id', async () => {
    const res = mockRes();
    await route(MEMBER_OF_R1)(req('does-not-exist'), res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'missing_role' });
});

test('403 missing_role when roleId is absent', async () => {
    const res = mockRes();
    await route(MEMBER_OF_R1)({ webUser: { id: 'u1' }, params: {} }, res);
    assert.strictEqual(res.statusCode, 403);
});

test('500 when the store fails', async () => {
    const handler = createWebYearwheelRoute({
        memberGroups: { getGroups: async () => MEMBER_OF_R1 },
        arshjulStore: { listByRole: async () => { throw new Error('arshjul_file_corrupt'); } }
    });
    const res = mockRes();
    await handler(req('r1'), res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'internal' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routes/webYearwheel.test.js`
Expected: FAIL — `Cannot find module '../../src/routes/api/web/yearwheel'`

- [ ] **Step 3: Write minimal implementation**

A moderator reading a role they do not hold has no name available from their own group lists, so the role name falls back to the ID. Milestone 2 may resolve it from the guild; milestone 1 does not need it.

```js
// src/routes/api/web/yearwheel.js
function createWebYearwheelRoute({ memberGroups, arshjulStore, logger }) {
    return async function webYearwheelRoute(req, res) {
        const roleId = req.params.roleId;

        let groups;
        try {
            groups = await memberGroups.getGroups(req.webUser.id);
        } catch (err) {
            if (logger) logger('GET /api/web/yearwheel lookup failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }

        if (!groups.member) return res.status(403).json({ error: 'not_in_guild' });

        const owned = [...groups.instruments, ...groups.workgroups].find(g => g.id === roleId);
        if (!owned && !groups.isModerator) {
            return res.status(403).json({ error: 'missing_role' });
        }

        let entries;
        try {
            entries = await arshjulStore.listByRole(roleId);
        } catch (err) {
            if (logger) logger('GET /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }

        return res.json({
            role: { id: roleId, name: owned ? owned.name : roleId },
            entries
        });
    };
}

module.exports = createWebYearwheelRoute;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/routes/webYearwheel.test.js`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/web/yearwheel.js tests/routes/webYearwheel.test.js
git commit -m "feat(arshjul): wheel read route with per-role access gate"
```

---

### Task 10: Wire the web API into Express

**Files:**
- Modify: `src/core/express.js:33-70` (service construction and CORS), and the route registration block
- Modify: `config.example.json`
- Test: `tests/core/cors.test.js` (add cases to the existing file)

**Interfaces:**
- Consumes: every factory from Tasks 2, 3, 5, 6, 7, 8, 9.
- Produces: a running app serving `POST /api/web/token`, `POST /api/web/logout`, `GET /api/web/me`, `GET /api/web/yearwheel/:roleId`.

The CORS change is the one place where a mistake could affect the Activity, so it is tested from both sides.

- [ ] **Step 1: Write the failing test**

Add to `tests/core/cors.test.js`, and extend `minConfig()` in that file with the three new keys:

```js
// in minConfig(), add:
        webOrigin: 'https://kiribot.ollelindberg.se',
        webRedirectUri: 'https://kiribot.ollelindberg.se/yearwheel/callback.html',
        sessionSecret: 'test_session_secret',
```

```js
test('CORS still reflects the Discord Activity origin after adding the web origin', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/me`, {
            method: 'OPTIONS',
            headers: { 'Origin': 'https://abc123.discordsays.com', 'Access-Control-Request-Method': 'GET' }
        });
        assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://abc123.discordsays.com');
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('CORS reflects the årshjul origin and allows credentials', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/web/me`, {
            method: 'OPTIONS',
            headers: { 'Origin': 'https://kiribot.ollelindberg.se', 'Access-Control-Request-Method': 'GET' }
        });
        assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://kiribot.ollelindberg.se');
        assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('CORS does not reflect a lookalike origin', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/web/me`, {
            method: 'OPTIONS',
            headers: { 'Origin': 'https://kiribot.ollelindberg.se.evil.com', 'Access-Control-Request-Method': 'GET' }
        });
        const allow = res.headers.get('access-control-allow-origin');
        assert.ok(allow !== 'https://kiribot.ollelindberg.se.evil.com', `got: ${allow}`);
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('GET /api/web/me without a cookie is 401 no_session', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/web/me`);
        assert.strictEqual(res.status, 401);
        assert.deepStrictEqual(await res.json(), { error: 'no_session' });
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('GET /api/web/yearwheel/:roleId without a cookie is 401 no_session', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/web/yearwheel/r1`);
        assert.strictEqual(res.status, 401);
    } finally {
        await new Promise(res => server.close(res));
    }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/core/cors.test.js`
Expected: FAIL — the `/api/web/me` requests return 404, and the credentials assertion fails.

- [ ] **Step 3: Write minimal implementation**

In `src/core/express.js`, add the requires at the top alongside the existing ones:

```js
const createWebSession = require('../services/webSession');
const createWebAuthMiddleware = require('../middleware/webAuth');
const createMemberGroupsService = require('../services/memberGroups');
const createArshjulStore = require('../services/arshjulStore');
const createWebTokenRoute = require('../routes/api/web/token');
const createWebLogoutRoute = require('../routes/api/web/logout');
const createWebMeRoute = require('../routes/api/web/me');
const createWebYearwheelRoute = require('../routes/api/web/yearwheel');
const { hex_instr, hex_arbet, role_moderator } = require('./constants');
```

Inside `buildApp`, after the existing `authMiddleware` is constructed:

```js
    const webSession = createWebSession({ secret: config.sessionSecret });
    const webAuth = createWebAuthMiddleware({ webSession });

    const memberGroups = createMemberGroupsService({
        client,
        guildId: config.guildId,
        hexInstr: hex_instr,
        hexArbet: hex_arbet,
        moderatorRoleId: role_moderator,
        cache: createTtlCache({ ttlMs: 60_000 })
    });

    const arshjulStore = createArshjulStore({ filePath: 'src/data/arshjul.json' });
```

Replace the CORS block with one that keeps the Activity's regex and adds the exact web origin:

```js
    app.use(cors({
        origin: [/\.discordsays\.com$/, config.webOrigin],
        methods: ['GET', 'POST'],
        credentials: true,
    }));
```

Register the routes next to the existing ones:

```js
    app.post('/api/web/token', asyncRoute(createWebTokenRoute({
        oauth, webSession, redirectUri: config.webRedirectUri, logger
    })));
    app.post('/api/web/logout', asyncRoute(createWebLogoutRoute()));
    app.get('/api/web/me', webAuth, asyncRoute(createWebMeRoute({ memberGroups, logger })));
    app.get('/api/web/yearwheel/:roleId', webAuth,
        asyncRoute(createWebYearwheelRoute({ memberGroups, arshjulStore, logger })));
```

Add the three keys to `config.example.json`:

```json
  "webOrigin": "https://kiribot.ollelindberg.se",
  "webRedirectUri": "https://kiribot.ollelindberg.se/yearwheel/callback.html",
  "sessionSecret": "GENERATE_WITH_crypto.randomBytes(32).toString('base64url')"
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS — including every pre-existing Activity test.

- [ ] **Step 5: Commit**

```bash
git add src/core/express.js config.example.json tests/core/cors.test.js
git commit -m "feat(arshjul): mount /api/web routes and allow the site origin"
```

---

### Task 11: Frontend project and API client

**Files:**
- Create: `yearwheel/package.json`, `yearwheel/vite.config.js`, `yearwheel/.env.example`, `yearwheel/src/api.js`, `yearwheel/src/auth.js`
- Test: `yearwheel/tests/api.test.js`, `yearwheel/tests/auth.test.js`

**Interfaces:**
- Consumes: the backend routes from Tasks 7-10.
- Produces: `apiGet(path)`, `apiPost(path, body)` (both throwing `ApiError` with a `.status` and `.code`), `buildAuthorizeUrl({ clientId, redirectUri, state })`, `newState()`, `readState()`, `clearState()`.

`ApiError.code` is what the pages switch on to choose between the login, non-member, and missing-role outcomes.

- [ ] **Step 1: Write the failing test**

```js
// yearwheel/tests/api.test.js
import { describe, it, expect, vi } from 'vitest';
import { apiGet, apiPost, ApiError } from '../src/api.js';

describe('apiGet', () => {
    it('sends credentials so the session cookie travels', async () => {
        const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ member: true }) }));
        await apiGet('/api/web/me', fetchFn);
        expect(fetchFn.mock.calls[0][1].credentials).toBe('include');
    });

    it('returns the parsed body on success', async () => {
        const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ member: true }) });
        expect(await apiGet('/api/web/me', fetchFn)).toEqual({ member: true });
    });

    it('throws ApiError carrying status and error code', async () => {
        const fetchFn = async () => ({ ok: false, status: 403, json: async () => ({ error: 'missing_role' }) });
        await expect(apiGet('/api/web/yearwheel/r1', fetchFn)).rejects.toMatchObject({
            status: 403,
            code: 'missing_role'
        });
    });

    it('still throws ApiError when the error body is not JSON', async () => {
        const fetchFn = async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
        const err = await apiGet('/x', fetchFn).catch(e => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(502);
        expect(err.code).toBe('http_502');
    });
});

describe('apiPost', () => {
    it('posts JSON with credentials', async () => {
        const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
        await apiPost('/api/web/token', { code: 'abc' }, fetchFn);
        const [, opts] = fetchFn.mock.calls[0];
        expect(opts.method).toBe('POST');
        expect(opts.credentials).toBe('include');
        expect(opts.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(opts.body)).toEqual({ code: 'abc' });
    });
});
```

```js
// yearwheel/tests/auth.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { buildAuthorizeUrl, newState, readState, clearState } from '../src/auth.js';

beforeEach(() => sessionStorage.clear());

describe('buildAuthorizeUrl', () => {
    it('requests only the identify scope', () => {
        const url = new URL(buildAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://s.example/cb', state: 'st' }));
        expect(url.searchParams.get('scope')).toBe('identify');
    });

    it('carries client id, redirect uri, response type and state', () => {
        const url = new URL(buildAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://s.example/cb', state: 'st' }));
        expect(url.origin + url.pathname).toBe('https://discord.com/api/oauth2/authorize');
        expect(url.searchParams.get('client_id')).toBe('cid');
        expect(url.searchParams.get('redirect_uri')).toBe('https://s.example/cb');
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('state')).toBe('st');
    });
});

describe('state', () => {
    it('newState stores a value that readState returns', () => {
        const s = newState();
        expect(s.length).toBeGreaterThan(10);
        expect(readState()).toBe(s);
    });

    it('two states differ', () => {
        const a = newState();
        const b = newState();
        expect(a).not.toBe(b);
    });

    it('clearState removes it', () => {
        newState();
        clearState();
        expect(readState()).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yearwheel && npx vitest run`
Expected: FAIL — no `package.json` yet, so the command errors before any test runs.

- [ ] **Step 3: Write minimal implementation**

```json
// yearwheel/package.json
{
  "name": "kiribot-yearwheel",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "jsdom": "^25.0.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

```js
// yearwheel/vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    base: './',
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                index: resolve(__dirname, 'index.html'),
                wheel: resolve(__dirname, 'wheel.html'),
                callback: resolve(__dirname, 'callback.html'),
            },
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
    },
});
```

```
# yearwheel/.env.example
VITE_DISCORD_CLIENT_ID=1503873080961794068
VITE_API_BASE=https://kiribot-api.ollelindberg.se
VITE_REDIRECT_URI=https://kiribot.ollelindberg.se/yearwheel/callback.html
```

```js
// yearwheel/src/api.js
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
    constructor(status, code) {
        super(`${status} ${code}`);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

async function handle(res) {
    if (res.ok) return res.json();
    let code = `http_${res.status}`;
    try {
        const body = await res.json();
        if (body && body.error) code = body.error;
    } catch { /* keep the http_ fallback */ }
    throw new ApiError(res.status, code);
}

export async function apiGet(path, fetchFn = fetch) {
    return handle(await fetchFn(`${API_BASE}${path}`, { credentials: 'include' }));
}

export async function apiPost(path, body, fetchFn = fetch) {
    return handle(await fetchFn(`${API_BASE}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }));
}
```

```js
// yearwheel/src/auth.js
const STATE_KEY = 'kiribot_oauth_state';

export function buildAuthorizeUrl({ clientId, redirectUri, state }) {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'identify',
        state,
    });
    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

export function newState() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const state = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(STATE_KEY, state);
    return state;
}

export function readState() {
    return sessionStorage.getItem(STATE_KEY);
}

export function clearState() {
    sessionStorage.removeItem(STATE_KEY);
}
```

- [ ] **Step 4: Install and run tests**

Run: `cd yearwheel && npm install && npx vitest run`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add yearwheel/package.json yearwheel/package-lock.json yearwheel/vite.config.js yearwheel/.env.example yearwheel/src/api.js yearwheel/src/auth.js yearwheel/tests/api.test.js yearwheel/tests/auth.test.js
git commit -m "feat(arshjul): yearwheel frontend project, api client and oauth helpers"
```

---

### Task 12: Landing page with its four session states

**Files:**
- Create: `yearwheel/index.html`, `yearwheel/src/landing.js`, `yearwheel/src/styles.css`, `yearwheel/callback.html`, `yearwheel/src/callback.js`
- Test: `yearwheel/tests/landing.test.js`

**Interfaces:**
- Consumes: `apiGet`, `apiPost`, `ApiError` (Task 11), `buildAuthorizeUrl`, `newState`, `readState`, `clearState` (Task 11), `GET /api/web/me` (Task 8).
- Produces: `renderLanding(root, state)` where `state` is `{ kind: 'anonymous' | 'not_member' | 'no_groups' | 'ok', displayName?, instruments?, workgroups? }`.

Rendering is a pure function of state so it can be tested without a network, and the copy is asserted verbatim.

- [ ] **Step 1: Write the failing test**

```js
// yearwheel/tests/landing.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { renderLanding, NOT_MEMBER_TEXT, NO_GROUPS_TEXT } from '../src/landing.js';

let root;
beforeEach(() => { root = document.createElement('div'); });

describe('renderLanding', () => {
    it('shows a login button when anonymous', () => {
        renderLanding(root, { kind: 'anonymous' });
        const btn = root.querySelector('#login-btn');
        expect(btn).not.toBeNull();
        expect(btn.textContent).toBe('Logga in med Discord');
        expect(root.querySelector('#logout-btn')).toBeNull();
    });

    it('shows the non-member text and only a logout button', () => {
        renderLanding(root, { kind: 'not_member' });
        expect(root.textContent).toContain(NOT_MEMBER_TEXT);
        expect(root.querySelector('#logout-btn')).not.toBeNull();
        expect(root.querySelectorAll('a.group-link').length).toBe(0);
    });

    it('uses the exact non-member wording', () => {
        expect(NOT_MEMBER_TEXT).toBe('Du är inte medlem i Kiriakas Discord-server, så årshjulet är inte tillgängligt för dig.');
    });

    it('shows the join-a-group text when the member has no groups', () => {
        renderLanding(root, { kind: 'no_groups', displayName: 'Olle L' });
        expect(root.textContent).toContain(NO_GROUPS_TEXT);
        expect(root.querySelector('#logout-btn')).not.toBeNull();
        expect(root.querySelectorAll('a.group-link').length).toBe(0);
    });

    it('uses the exact no-groups wording', () => {
        expect(NO_GROUPS_TEXT).toBe('Du måste ansluta till ett instrument eller en arbetsgrupp för att använda årshjulet. Har du nyligen ändrat din profil? Vänta då i några minuter och prova igen.');
    });

    it('lists every group as a link to that wheel', () => {
        renderLanding(root, {
            kind: 'ok',
            displayName: 'Olle L',
            instruments: [{ id: 'i1', name: 'tarol' }],
            workgroups: [{ id: 'w1', name: 'transportgruppen' }, { id: 'w2', name: 'fikagruppen' }]
        });
        const links = [...root.querySelectorAll('a.group-link')];
        expect(links.length).toBe(3);
        expect(links.map(a => a.textContent)).toEqual(['tarol', 'transportgruppen', 'fikagruppen']);
        expect(links[0].getAttribute('href')).toBe('wheel.html?role=i1');
        expect(links[2].getAttribute('href')).toBe('wheel.html?role=w2');
    });

    it('omits the instrument heading when the member has no instruments', () => {
        renderLanding(root, { kind: 'ok', displayName: 'O', instruments: [], workgroups: [{ id: 'w1', name: 'a' }] });
        expect(root.textContent).not.toContain('Instrument');
        expect(root.textContent).toContain('Arbetsgrupper');
    });

    it('escapes group names rather than injecting HTML', () => {
        renderLanding(root, { kind: 'ok', displayName: 'O', instruments: [], workgroups: [{ id: 'w1', name: '<img src=x onerror=alert(1)>' }] });
        expect(root.querySelector('img')).toBeNull();
        expect(root.querySelector('a.group-link').textContent).toBe('<img src=x onerror=alert(1)>');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yearwheel && npx vitest run tests/landing.test.js`
Expected: FAIL — `Failed to resolve import "../src/landing.js"`

- [ ] **Step 3: Write minimal implementation**

Build DOM nodes with `textContent`, never `innerHTML` with interpolated names — that is what makes the escaping test pass.

```js
// yearwheel/src/landing.js
import { apiGet, apiPost } from './api.js';
import { buildAuthorizeUrl, newState } from './auth.js';

export const NOT_MEMBER_TEXT = 'Du är inte medlem i Kiriakas Discord-server, så årshjulet är inte tillgängligt för dig.';
export const NO_GROUPS_TEXT = 'Du måste ansluta till ett instrument eller en arbetsgrupp för att använda årshjulet. Har du nyligen ändrat din profil? Vänta då i några minuter och prova igen.';

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function groupSection(heading, groups) {
    const section = el('section', 'group-section');
    section.appendChild(el('h2', null, heading));
    const list = el('ul', 'group-list');
    for (const g of groups) {
        const li = el('li');
        const a = el('a', 'group-link', g.name);
        a.setAttribute('href', `wheel.html?role=${encodeURIComponent(g.id)}`);
        li.appendChild(a);
        list.appendChild(li);
    }
    section.appendChild(list);
    return section;
}

function logoutButton() {
    const btn = el('button', 'btn', 'Logga ut');
    btn.id = 'logout-btn';
    btn.type = 'button';
    return btn;
}

export function renderLanding(root, state) {
    root.replaceChildren();
    root.appendChild(el('h1', null, 'Årshjul'));

    if (state.kind === 'anonymous') {
        const btn = el('button', 'btn', 'Logga in med Discord');
        btn.id = 'login-btn';
        btn.type = 'button';
        root.appendChild(btn);
        return;
    }

    if (state.kind === 'not_member') {
        root.appendChild(el('p', 'notice', NOT_MEMBER_TEXT));
        root.appendChild(logoutButton());
        return;
    }

    if (state.kind === 'no_groups') {
        root.appendChild(el('p', 'notice', NO_GROUPS_TEXT));
        root.appendChild(logoutButton());
        return;
    }

    root.appendChild(el('p', 'greeting', state.displayName));
    if (state.instruments.length) root.appendChild(groupSection('Instrument', state.instruments));
    if (state.workgroups.length) root.appendChild(groupSection('Arbetsgrupper', state.workgroups));
    root.appendChild(logoutButton());
}

export function toState(me) {
    if (!me.member) return { kind: 'not_member' };
    if (!me.instruments.length && !me.workgroups.length) {
        return { kind: 'no_groups', displayName: me.displayName };
    }
    return { kind: 'ok', displayName: me.displayName, instruments: me.instruments, workgroups: me.workgroups };
}

export async function initLanding(root) {
    let state;
    try {
        state = toState(await apiGet('/api/web/me'));
    } catch (err) {
        if (err.status === 401) state = { kind: 'anonymous' };
        else throw err;
    }
    renderLanding(root, state);

    root.querySelector('#login-btn')?.addEventListener('click', () => {
        window.location.href = buildAuthorizeUrl({
            clientId: import.meta.env.VITE_DISCORD_CLIENT_ID,
            redirectUri: import.meta.env.VITE_REDIRECT_URI,
            state: newState(),
        });
    });

    root.querySelector('#logout-btn')?.addEventListener('click', async () => {
        await apiPost('/api/web/logout', {});
        window.location.reload();
    });
}
```

```html
<!-- yearwheel/index.html -->
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Årshjul — Kiriaka</title>
  <link rel="stylesheet" href="./src/styles.css" />
</head>
<body>
  <main id="app"></main>
  <script type="module">
    import { initLanding } from './src/landing.js';
    initLanding(document.getElementById('app'));
  </script>
</body>
</html>
```

```js
// yearwheel/src/callback.js
import { apiPost } from './api.js';
import { readState, clearState } from './auth.js';

export async function handleCallback(search, root) {
    const params = new URLSearchParams(search);
    const code = params.get('code');
    const state = params.get('state');
    const expected = readState();
    clearState();

    if (!code || !state || state !== expected) {
        root.textContent = 'Inloggningen misslyckades. Försök igen.';
        return;
    }

    try {
        await apiPost('/api/web/token', { code });
        window.location.replace('./index.html');
    } catch {
        root.textContent = 'Inloggningen misslyckades. Försök igen.';
    }
}
```

```html
<!-- yearwheel/callback.html -->
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Loggar in…</title>
  <link rel="stylesheet" href="./src/styles.css" />
</head>
<body>
  <main id="app">Loggar in…</main>
  <script type="module">
    import { handleCallback } from './src/callback.js';
    handleCallback(window.location.search, document.getElementById('app'));
  </script>
</body>
</html>
```

```css
/* yearwheel/src/styles.css */
:root { --bg: #1e1f22; --fg: #f2f3f5; --accent: #5865f2; --muted: #b5bac1; }
* { box-sizing: border-box; }
body { margin: 0; padding: 1.5rem; font-family: system-ui, sans-serif; background: var(--bg); color: var(--fg); }
main { max-width: 40rem; margin: 0 auto; }
h1 { font-size: 1.5rem; }
h2 { font-size: 1rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin-top: 2rem; }
.notice { line-height: 1.5; }
.group-list { list-style: none; padding: 0; display: grid; gap: .5rem; }
.group-link { display: block; padding: .9rem 1rem; background: #2b2d31; color: var(--fg); border-radius: .5rem; text-decoration: none; }
.group-link:hover { background: #35373c; }
.btn { margin-top: 2rem; padding: .75rem 1.25rem; background: var(--accent); color: #fff; border: 0; border-radius: .5rem; font-size: 1rem; cursor: pointer; }
.entry-list { list-style: none; padding: 0; display: grid; gap: .5rem; }
.entry { padding: .9rem 1rem; background: #2b2d31; border-radius: .5rem; }
.entry-date { color: var(--muted); font-variant-numeric: tabular-nums; margin-right: .75rem; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd yearwheel && npx vitest run`
Expected: PASS, 19 tests total

- [ ] **Step 5: Commit**

```bash
git add yearwheel/index.html yearwheel/callback.html yearwheel/src/landing.js yearwheel/src/callback.js yearwheel/src/styles.css yearwheel/tests/landing.test.js
git commit -m "feat(arshjul): landing page, session states and oauth callback"
```

---

### Task 13: Wheel page with revocation handling

**Files:**
- Create: `yearwheel/wheel.html`, `yearwheel/src/wheel.js`
- Test: `yearwheel/tests/wheel.test.js`

**Interfaces:**
- Consumes: `apiGet`, `ApiError` (Task 11), `GET /api/web/yearwheel/:roleId` (Task 9).
- Produces: `renderWheel(root, { role, entries })`, `destinationFor(error) => { url, reason } | null`, `POLL_INTERVAL_MS`.

`destinationFor` is the revocation logic isolated into a pure function, so every error code is testable without a browser navigation.

- [ ] **Step 1: Write the failing test**

```js
// yearwheel/tests/wheel.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { renderWheel, destinationFor, POLL_INTERVAL_MS } from '../src/wheel.js';
import { ApiError } from '../src/api.js';

let root;
beforeEach(() => { root = document.createElement('div'); });

describe('renderWheel', () => {
    it('shows the group name as the heading', () => {
        renderWheel(root, { role: { id: 'r1', name: 'transportgruppen' }, entries: [] });
        expect(root.querySelector('h1').textContent).toBe('transportgruppen');
    });

    it('renders one row per entry with its date and title', () => {
        renderWheel(root, {
            role: { id: 'r1', name: 'g' },
            entries: [
                { id: 'e1', monthDay: '01-15', title: 'Boka lokal' },
                { id: 'e2', monthDay: '06-06', title: 'Sommarfest' }
            ]
        });
        const rows = [...root.querySelectorAll('.entry')];
        expect(rows.length).toBe(2);
        expect(rows[0].textContent).toContain('01-15');
        expect(rows[0].textContent).toContain('Boka lokal');
    });

    it('shows an empty-state message when there are no entries', () => {
        renderWheel(root, { role: { id: 'r1', name: 'g' }, entries: [] });
        expect(root.textContent).toContain('Inga poster i årshjulet ännu.');
    });

    it('escapes entry titles rather than injecting HTML', () => {
        renderWheel(root, { role: { id: 'r1', name: 'g' }, entries: [{ id: 'e1', monthDay: '01-01', title: '<img src=x onerror=alert(1)>' }] });
        expect(root.querySelector('img')).toBeNull();
    });

    it('has a back link to the landing page', () => {
        renderWheel(root, { role: { id: 'r1', name: 'g' }, entries: [] });
        expect(root.querySelector('a.back-link').getAttribute('href')).toBe('index.html');
    });
});

describe('destinationFor', () => {
    it('sends an expired session to the landing page', () => {
        expect(destinationFor(new ApiError(401, 'no_session'))).toEqual({ url: 'index.html', reason: 'no_session' });
    });

    it('sends a kicked user to the landing page', () => {
        expect(destinationFor(new ApiError(403, 'not_in_guild'))).toEqual({ url: 'index.html', reason: 'not_in_guild' });
    });

    it('sends a user who lost the role to the landing page', () => {
        expect(destinationFor(new ApiError(403, 'missing_role'))).toEqual({ url: 'index.html', reason: 'missing_role' });
    });

    it('returns null for errors that should not navigate', () => {
        expect(destinationFor(new ApiError(500, 'internal'))).toBeNull();
        expect(destinationFor(new ApiError(502, 'http_502'))).toBeNull();
    });
});

describe('polling', () => {
    it('polls at most once a minute', () => {
        expect(POLL_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yearwheel && npx vitest run tests/wheel.test.js`
Expected: FAIL — `Failed to resolve import "../src/wheel.js"`

- [ ] **Step 3: Write minimal implementation**

```js
// yearwheel/src/wheel.js
import { apiGet } from './api.js';

export const POLL_INTERVAL_MS = 60_000;

const REDIRECTING_CODES = new Set(['no_session', 'not_in_guild', 'missing_role']);

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

export function destinationFor(error) {
    if (!error || !REDIRECTING_CODES.has(error.code)) return null;
    return { url: 'index.html', reason: error.code };
}

export function renderWheel(root, { role, entries }) {
    root.replaceChildren();

    const back = el('a', 'back-link', '← Tillbaka');
    back.setAttribute('href', 'index.html');
    root.appendChild(back);

    root.appendChild(el('h1', null, role.name));

    if (!entries.length) {
        root.appendChild(el('p', 'notice', 'Inga poster i årshjulet ännu.'));
        return;
    }

    const list = el('ul', 'entry-list');
    for (const entry of entries) {
        const li = el('li', 'entry');
        li.appendChild(el('span', 'entry-date', entry.monthDay));
        li.appendChild(el('span', 'entry-title', entry.title));
        list.appendChild(li);
    }
    root.appendChild(list);
}

export async function initWheel(root, search = window.location.search) {
    const roleId = new URLSearchParams(search).get('role');
    if (!roleId) {
        window.location.replace('index.html');
        return;
    }

    async function load() {
        try {
            renderWheel(root, await apiGet(`/api/web/yearwheel/${encodeURIComponent(roleId)}`));
        } catch (err) {
            const dest = destinationFor(err);
            if (dest) {
                window.location.replace(`${dest.url}?reason=${dest.reason}`);
                return;
            }
            root.replaceChildren(el('p', 'notice', 'Kunde inte hämta årshjulet. Försök igen senare.'));
        }
    }

    await load();
    setInterval(load, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') load();
    });
}
```

```html
<!-- yearwheel/wheel.html -->
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Årshjul — Kiriaka</title>
  <link rel="stylesheet" href="./src/styles.css" />
</head>
<body>
  <main id="app"></main>
  <script type="module">
    import { initWheel } from './src/wheel.js';
    initWheel(document.getElementById('app'));
  </script>
</body>
</html>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd yearwheel && npx vitest run`
Expected: PASS, 29 tests total

- [ ] **Step 5: Commit**

```bash
git add yearwheel/wheel.html yearwheel/src/wheel.js yearwheel/tests/wheel.test.js
git commit -m "feat(arshjul): wheel page with polling and revocation redirects"
```

---

### Task 14: Discord panel button and backup registration

**Files:**
- Create: `src/features/arshjulPanel.js`
- Modify: `src/events/ready.js`, `src/services/google/drive.js` (the `backupConfig` array beginning at line 504)
- Test: `tests/features/arshjulPanel.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `postArshjulPanel({ client, channelId, url, logger }) => Promise<'created' | 'exists' | 'skipped'>`.

Idempotent: it scans the channel for a message already carrying a Link button with the same URL, so restarting the bot does not post duplicates. Link buttons have no `custom_id`, so the URL is the marker.

- [ ] **Step 1: Write the failing test**

```js
// tests/features/arshjulPanel.test.js
const test = require('node:test');
const assert = require('node:assert');
const postArshjulPanel = require('../../src/features/arshjulPanel');

const URL = 'https://kiribot.ollelindberg.se/yearwheel/';

function mockChannel(messages, sent) {
    return {
        messages: { fetch: async () => new Map(messages.map((m, i) => [String(i), m])) },
        send: async (payload) => { sent.push(payload); return { id: 'new' }; }
    };
}

function messageWithUrl(url) {
    return { components: [{ components: [{ data: { url } }] }] };
}

test('posts the panel when the channel has no matching message', async () => {
    const sent = [];
    const client = { channels: { cache: { get: () => mockChannel([], sent) } } };
    const result = await postArshjulPanel({ client, channelId: 'c1', url: URL });
    assert.strictEqual(result, 'created');
    assert.strictEqual(sent.length, 1);
});

test('does not post again when a message with the same url exists', async () => {
    const sent = [];
    const client = { channels: { cache: { get: () => mockChannel([messageWithUrl(URL)], sent) } } };
    const result = await postArshjulPanel({ client, channelId: 'c1', url: URL });
    assert.strictEqual(result, 'exists');
    assert.strictEqual(sent.length, 0);
});

test('posts when the only existing button points somewhere else', async () => {
    const sent = [];
    const client = { channels: { cache: { get: () => mockChannel([messageWithUrl('https://other.example/')], sent) } } };
    assert.strictEqual(await postArshjulPanel({ client, channelId: 'c1', url: URL }), 'created');
});

test('tolerates messages with no components', async () => {
    const sent = [];
    const client = { channels: { cache: { get: () => mockChannel([{ components: [] }, {}], sent) } } };
    assert.strictEqual(await postArshjulPanel({ client, channelId: 'c1', url: URL }), 'created');
});

test('skips and logs when the channel is not found', async () => {
    const logs = [];
    const client = { channels: { cache: { get: () => undefined } } };
    const result = await postArshjulPanel({ client, channelId: 'missing', url: URL, logger: m => logs.push(m) });
    assert.strictEqual(result, 'skipped');
    assert.ok(logs.some(l => /missing/.test(l)), logs.join('\n'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/features/arshjulPanel.test.js`
Expected: FAIL — `Cannot find module '../../src/features/arshjulPanel'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/features/arshjulPanel.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function postArshjulPanel({ client, channelId, url, logger }) {
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
        if (logger) logger(`arshjulPanel: channel ${channelId} not found`);
        return 'skipped';
    }

    const messages = await channel.messages.fetch();
    const existing = [...messages.values()].find(msg =>
        (msg.components || []).some(row =>
            (row.components || []).some(c => c.data && c.data.url === url)
        )
    );
    if (existing) return 'exists';

    const button = new ButtonBuilder()
        .setLabel('Öppna årshjulet')
        .setStyle(ButtonStyle.Link)
        .setURL(url);

    await channel.send({
        content: '**Årshjul** — planera året för din sektion eller arbetsgrupp.',
        components: [new ActionRowBuilder().addComponents(button)]
    });
    if (logger) logger('arshjulPanel: posted panel message');
    return 'created';
}

module.exports = postArshjulPanel;
```

In `src/events/ready.js`, add the require next to the other feature requires:

```js
const postArshjulPanel = require('../features/arshjulPanel');
const { ch_YourProfile } = require('../core/constants');
```

`ch_YourProfile` may already be imported from `../core/constants` in that file — if so, extend the existing destructuring rather than adding a second require. Then, inside `execute`, after the existing startup calls and before `logActivity('Ready! ...')`:

```js
		try {
			await postArshjulPanel({
				client: readyClient,
				channelId: ch_YourProfile,
				url: 'https://kiribot.ollelindberg.se/yearwheel/',
				logger: logActivity
			});
		} catch (err) {
			logActivity(`arshjulPanel failed: ${err.message}`);
		}
```

In `src/services/google/drive.js`, add a fifth entry to the `backupConfig` array that begins at line 504, alongside the `permissions` and `detailsList` entries:

```js
			{
				subfolderName: 'arshjul',
				localPath: path.join(__dirname, '../../data/arshjul.json'),
				backupFileName: `${dateString}.json`
			},
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, including the five new panel tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/arshjulPanel.js src/events/ready.js src/services/google/drive.js tests/features/arshjulPanel.test.js
git commit -m "feat(arshjul): discord panel button and daily backup of arshjul.json"
```

---

### Task 15: End-to-end verification against the real server

**Files:** none created or modified. This task is a manual checklist run by a human with access to the bot host and the web host.

**Interfaces:**
- Consumes: everything from Tasks 1-14.
- Produces: a working deployment.

Automated tests cannot cover the OAuth round trip, the cookie's `SameSite` behaviour across subdomains, or Discord's redirect URI matching. Per the project's own rule, auth changes must be verified against the real server.

- [ ] **Step 1: Confirm the manual prerequisites are done**

Check all four items in "Manual prerequisites" above. Confirm `curl -sS https://kiribot-api.ollelindberg.se/api/web/me` returns `{"error":"no_session"}` with status 401 — that proves DNS, the tunnel, and the route are all live.

- [ ] **Step 2: Build and upload the frontend**

```bash
cd yearwheel
cp .env.example .env.production   # fill in the real values
npm run build
```

Upload the contents of `yearwheel/dist/` by FTP to `/yearwheel` on the web host, **assets first, HTML last**.

- [ ] **Step 3: Verify each session state by hand**

Confirm all four, using a Discord account for each case:
1. Visit `https://kiribot.ollelindberg.se/yearwheel/` signed out → "Logga in med Discord".
2. Log in with an account **not** in the guild → the non-member text and a logout button only.
3. Log in with a guild member holding **no** instrument or workgroup role → the join-a-group text and logout only.
4. Log in as a member with groups → every group listed, each linking to its wheel.

- [ ] **Step 4: Verify the access gate and persistence**

1. Open a wheel you belong to → it loads.
2. Edit the URL to another group's role ID → access-denied, then redirect to the landing page. Confirm the server returned `403 missing_role` in the network tab, not a client-side check.
3. Close the browser entirely, reopen the site → still logged in (proves the persistent cookie).
4. Have a moderator remove one of your roles, wait ~90 seconds with the wheel page open → the page redirects to the landing page.

- [ ] **Step 5: Verify the Activity still works**

Open the lineup planner inside Discord. Confirm login, the concert list, and dragging a dot all still work. This is the regression that matters most.

- [ ] **Step 6: Commit nothing; record the result**

If anything failed, open a task in the milestone 2 plan or fix it directly. If everything passed, milestone 1 is done.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Tunnel second hostname | Manual prerequisites |
| Host-only `HttpOnly` cookie | 1, 2, 7 |
| Session issued to non-members | 7, 8, 12 |
| OAuth per-flow redirect URI | 4, 7 |
| `config.oauthRedirectUri` untouched | 4 (test asserts the default path) |
| Role resolution by colour | 5 |
| One wheel per role, keyed by role ID | 6, 9, 12, 13 |
| Session-level gate | 3, 8, 12 |
| Resource-level gate | 9, 13 |
| Revocation while a page is open | 13 |
| Distinct error codes | 3, 8, 9, 11, 13 |
| Data model and `.gitignore` | 6, plus the `.gitignore` entry already committed in `90ff004` |
| CORS second origin with credentials | 10 |
| Frontend structure, `base: './'`, three entries | 11, 12, 13 |
| FTP deploy | 15 |
| Discord panel button | 14 |
| Backups | 14 |
| Swedish copy verbatim | 12 (asserted) |

**Deferred to milestone 2, by design:** the dispatcher, entry writes, optimistic concurrency, `Origin`/CSRF checks (no write routes exist yet), rate limiting on writes, `allowed_mentions`, role→channel resolution, preset field validation.

**Not covered by any task, and correctly so:** the `kiribot.ollelindberg.se/` hub page, which the spec places outside this deliverable.

**Type consistency check:** `getGroups` returns `{ member, displayName, isModerator, instruments, workgroups }` in Tasks 5, 8, 9 consistently. `listByRole` returns entries with `id` first in Tasks 6 and 9. `ApiError` exposes `.status` and `.code` in Tasks 11, 12, 13. `COOKIE_NAME` is exported from `webAuth` and consumed by both route files in Task 7. `webSession.ttlMs` is produced in Task 2 and consumed in Task 7.
