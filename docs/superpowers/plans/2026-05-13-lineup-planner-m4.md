# Lineup Planner M4 — Frontend Scaffold + SDK Handshake

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Vite frontend Activity with Discord SDK boot, OAuth token exchange, role gate, and static sidebar + canvas render (no drag yet).

**Architecture:** Vite SPA deployed to Cloudflare Pages; at runtime the Discord Activity proxy routes `/api/*` through cloudflared to Express on `127.0.0.1:3000`. SDK calls `authorize()` → code → backend `/api/token` → `authenticate()`. Role gate rejects non-Harmonians before rendering.

**Tech Stack:** Vite 5, `@discord/embedded-app-sdk`, Vitest + jsdom (frontend tests), vanilla JS ES modules (no framework), Node `cors` package (backend addition).

---

## File Map

| File | New/Mod | Responsibility |
|------|---------|---------------|
| `package.json` | Modify | Add `cors` dependency |
| `src/core/express.js` | Modify | Add CORS middleware for `*.discordsays.com` |
| `tests/core/cors.test.js` | Create | Integration test: preflight returns CORS header |
| `frontend/package.json` | Create | Vite project deps + Vitest config |
| `frontend/vite.config.js` | Create | Build settings, dev proxy, Vitest env |
| `frontend/index.html` | Create | Shell HTML with loading state + app container |
| `frontend/.env.example` | Create | Template for CF Pages env vars |
| `frontend/src/sdk.js` | Create | `bootSdk(DiscordSDKClass, clientId)` + standalone refusal |
| `frontend/src/auth.js` | Create | `exchangeCode(code, fetchFn?)`, `setToken/getToken` |
| `frontend/src/api.js` | Create | `get/post` with auth header + error mapping |
| `frontend/src/state.js` | Create | Mutable store: `event`, `draggingId` |
| `frontend/src/sidebar/available.js` | Create | `computeAvailable(event)` + `renderAvailable(container, event)` |
| `frontend/src/canvas/stage.js` | Create | `instrumentColor`, `isStale`, `renderStage` |
| `frontend/src/styles.css` | Create | Stage + sidebar layout, dot styles |
| `frontend/src/main.js` | Create | Boot orchestrator: SDK → OAuth → state load → render |
| `frontend/tests/sdk.test.js` | Create | Standalone refusal + happy path |
| `frontend/tests/auth.test.js` | Create | exchangeCode success + failure |
| `frontend/tests/api.test.js` | Create | Auth header injection + 401/403/404/409 mapping |
| `frontend/tests/state.test.js` | Create | get/set event + draggingId |
| `frontend/tests/sidebar/available.test.js` | Create | computeAvailable + renderAvailable DOM |
| `frontend/tests/canvas/stage.test.js` | Create | instrumentColor + isStale + renderStage DOM |

**Not in M4 (deferred to M5):** `poll.js`, `canvas/drag.js`, `sidebar/manualAdd.js`.

---

## Task 1: CORS on Express

**Files:**
- Modify: `package.json`
- Modify: `src/core/express.js`
- Create: `tests/core/cors.test.js`

- [ ] **Step 1: Install cors package**

Run from the project root (not `frontend/`):

```bash
npm install cors
```

Expected: `package.json` now lists `"cors": "^2.x.x"` under `dependencies`.

- [ ] **Step 2: Write failing test**

Create `tests/core/cors.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { buildApp } = require('../../src/core/express');

function minConfig() {
    return {
        clientId: 'test_client',
        discordClientSecret: 'test_secret',
        guildId: 'test_guild',
        harmonianRoleId: 'test_role',
        oauthRedirectUri: 'https://discord.com',
        expressPort: 3000,
    };
}

function minClient() {
    return {
        guilds: { cache: { get: () => ({ members: { fetch: async () => null } }) } }
    };
}

test('CORS preflight reflects *.discordsays.com origin', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = app.listen(0, '127.0.0.1');
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/me`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'https://abc123.discordsays.com',
                'Access-Control-Request-Method': 'GET',
            }
        });
        const allow = res.headers.get('access-control-allow-origin');
        assert.strictEqual(allow, 'https://abc123.discordsays.com');
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('CORS does not reflect non-discordsays origin', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = app.listen(0, '127.0.0.1');
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/me`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'https://evil.example.com',
                'Access-Control-Request-Method': 'GET',
            }
        });
        const allow = res.headers.get('access-control-allow-origin');
        assert.ok(
            allow !== 'https://evil.example.com',
            `should not reflect untrusted origin, got: ${allow}`
        );
    } finally {
        await new Promise(res => server.close(res));
    }
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
node --test 'tests/core/cors.test.js'
```

Expected: FAIL — no CORS header present yet.

- [ ] **Step 4: Add cors middleware to Express**

In `src/core/express.js`, add at the top of the `require` block:

```js
const cors = require('cors');
```

In `buildApp`, before any route registrations, add:

```js
app.use(cors({
    origin: /\.discordsays\.com$/,
    methods: ['GET', 'POST'],
}));
```

The full relevant section of `buildApp` becomes:

```js
const app = express();
app.use(cors({
    origin: /\.discordsays\.com$/,
    methods: ['GET', 'POST'],
}));
app.use(express.json({ limit: '64kb' }));
// ...existing routes unchanged...
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
node --test 'tests/core/cors.test.js'
```

Expected: PASS both assertions.

- [ ] **Step 6: Run full backend test suite**

```bash
npm test
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/core/express.js tests/core/cors.test.js
git commit -m "feat(express): add CORS for *.discordsays.com Activity proxy"
```

---

## Task 2: Frontend Project Scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/.env.example`

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "kiribot-lineup-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@discord/embedded-app-sdk": "^1.7.0"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Create `frontend/vite.config.js`**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 3: Create `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kiriaka Lineup</title>
  <link rel="stylesheet" href="/src/styles.css" />
</head>
<body>
  <div id="loading">
    <p>Laddar...</p>
  </div>
  <div id="app" style="display:none;">
    <aside id="sidebar"></aside>
    <main id="stage-container">
      <div id="stage"></div>
    </main>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `frontend/.env.example`**

```
# Discord Application Client ID (from Developer Portal, your Activity app)
VITE_DISCORD_CLIENT_ID=your_application_client_id_here
```

- [ ] **Step 5: Install dependencies**

```bash
cd frontend
npm install
```

Expected: `frontend/node_modules/` created, no errors.

- [ ] **Step 6: Verify Vite starts**

```bash
cd frontend
npm run dev
```

Expected: Vite starts on `http://localhost:5173`. Open it in a browser — see "Laddar..." text (main.js will fail since no Discord SDK env, but no build errors). Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/index.html frontend/.env.example
git commit -m "feat(frontend): scaffold Vite project for Discord Activity"
```

---

## Task 3: `frontend/src/sdk.js` — SDK Wrapper

**Files:**
- Create: `frontend/src/sdk.js`
- Create: `frontend/tests/sdk.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/sdk.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bootSdk } from '../src/sdk.js';

function makeSdkClass({ readyThrows = false, authCode = 'code_abc' } = {}) {
    return class MockDiscordSDK {
        constructor(clientId) { this.clientId = clientId; }
        async ready() {
            if (readyThrows) throw new Error('not in discord');
        }
        commands = {
            authorize: vi.fn(async () => ({ code: authCode })),
            authenticate: vi.fn(async ({ access_token }) => ({ user: { id: 'u1' } })),
        };
    };
}

beforeEach(() => {
    document.body.replaceChildren();
});

describe('bootSdk', () => {
    it('returns sdk and code on success', async () => {
        const result = await bootSdk(makeSdkClass(), 'client_123');
        expect(result.code).toBe('code_abc');
        expect(result.sdk).toBeDefined();
    });

    it('calls authorize with correct params', async () => {
        const Cls = makeSdkClass();
        const { sdk } = await bootSdk(Cls, 'client_123');
        expect(sdk.commands.authorize).toHaveBeenCalledWith({
            client_id: 'client_123',
            response_type: 'code',
            state: '',
            prompt: 'none',
            scope: ['identify', 'guilds.members.read'],
        });
    });

    it('renders standalone refusal and throws when ready() rejects', async () => {
        await expect(bootSdk(makeSdkClass({ readyThrows: true }), 'client_123'))
            .rejects.toThrow('not_in_discord');
        expect(document.body.textContent).toMatch(/Discord/i);
    });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend
npm test -- tests/sdk.test.js
```

Expected: FAIL — `../src/sdk.js` not found.

- [ ] **Step 3: Implement `frontend/src/sdk.js`**

All DOM manipulation uses safe `createElement` / `textContent` — no `innerHTML`.

```js
function renderStandaloneRefusal() {
    document.body.replaceChildren();
    const p = document.createElement('p');
    p.style.cssText = 'padding:2rem;font-family:sans-serif;';
    p.textContent = 'Open this app inside Discord.';
    document.body.appendChild(p);
}

export async function bootSdk(DiscordSDKClass, clientId) {
    let sdk;
    try {
        sdk = new DiscordSDKClass(clientId);
        await sdk.ready();
    } catch {
        renderStandaloneRefusal();
        throw new Error('not_in_discord');
    }

    const { code } = await sdk.commands.authorize({
        client_id: clientId,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'guilds.members.read'],
    });

    return { sdk, code };
}

export async function authenticateSdk(sdk, accessToken) {
    return sdk.commands.authenticate({ access_token: accessToken });
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd frontend
npm test -- tests/sdk.test.js
```

Expected: PASS all 3 assertions.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/sdk.js frontend/tests/sdk.test.js
git commit -m "feat(frontend): sdk.js — Discord SDK boot + standalone refusal"
```

---

## Task 4: `frontend/src/auth.js` — Token Exchange

**Files:**
- Create: `frontend/src/auth.js`
- Create: `frontend/tests/auth.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/auth.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { exchangeCode, setToken, getToken } from '../src/auth.js';

function mockFetch(status, body) {
    return async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    });
}

describe('exchangeCode', () => {
    it('returns access_token and expires_in on success', async () => {
        const fetchFn = mockFetch(200, { access_token: 'tok_abc', expires_in: 604800 });
        const result = await exchangeCode('code_xyz', fetchFn);
        expect(result.access_token).toBe('tok_abc');
        expect(result.expires_in).toBe(604800);
    });

    it('POSTs to /api/token with code in body', async () => {
        let captured;
        const fetchFn = async (url, opts) => {
            captured = { url, opts };
            return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 600 }) };
        };
        await exchangeCode('my_code', fetchFn);
        expect(captured.url).toBe('/api/token');
        expect(JSON.parse(captured.opts.body)).toEqual({ code: 'my_code' });
        expect(captured.opts.method).toBe('POST');
    });

    it('throws with status on non-ok response', async () => {
        await expect(exchangeCode('bad_code', mockFetch(400, { error: 'exchange_failed' })))
            .rejects.toMatchObject({ status: 400 });
    });
});

describe('setToken / getToken', () => {
    it('stores and retrieves token', () => {
        setToken('abc123');
        expect(getToken()).toBe('abc123');
    });

    it('starts null after setToken(null)', () => {
        setToken(null);
        expect(getToken()).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend
npm test -- tests/auth.test.js
```

Expected: FAIL — `../src/auth.js` not found.

- [ ] **Step 3: Implement `frontend/src/auth.js`**

```js
let _token = null;

export function setToken(token) {
    _token = token;
}

export function getToken() {
    return _token;
}

export async function exchangeCode(code, fetchFn = fetch) {
    const res = await fetchFn('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error || 'exchange_failed'), { status: res.status });
    }
    return res.json();
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd frontend
npm test -- tests/auth.test.js
```

Expected: PASS all 5 assertions.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/auth.js frontend/tests/auth.test.js
git commit -m "feat(frontend): auth.js — token exchange + in-memory store"
```

---

## Task 5: `frontend/src/api.js` — Fetch Wrappers

**Files:**
- Create: `frontend/src/api.js`
- Create: `frontend/tests/api.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/api.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { get, post } from '../src/api.js';

function mockFetch(status, body) {
    return async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    });
}

describe('get', () => {
    it('sends Authorization header', async () => {
        let capturedOpts;
        const fetchFn = async (url, opts) => {
            capturedOpts = opts;
            return { ok: true, status: 200, json: async () => ({ ok: true }) };
        };
        await get('/api/me', 'my_token', fetchFn);
        expect(capturedOpts.headers['Authorization']).toBe('Bearer my_token');
    });

    it('returns parsed JSON on success', async () => {
        const result = await get('/api/me', 't', mockFetch(200, { id: 'u1' }));
        expect(result.id).toBe('u1');
    });

    it('throws with status 401', async () => {
        await expect(get('/api/me', 't', mockFetch(401, { error: 'invalid_token' })))
            .rejects.toMatchObject({ status: 401 });
    });

    it('throws with status 403', async () => {
        await expect(get('/api/me', 't', mockFetch(403, { error: 'missing_role' })))
            .rejects.toMatchObject({ status: 403 });
    });

    it('throws with status 404', async () => {
        await expect(get('/api/concert/pending', 't', mockFetch(404, { error: 'not_found' })))
            .rejects.toMatchObject({ status: 404 });
    });
});

describe('post', () => {
    it('sends Authorization header and JSON body', async () => {
        let capturedOpts;
        const fetchFn = async (url, opts) => {
            capturedOpts = opts;
            return { ok: true, status: 200, json: async () => ({}) };
        };
        await post('/api/lineup/place', { concertId: 'c1', userId: 'u1' }, 'tok', fetchFn);
        expect(capturedOpts.headers['Authorization']).toBe('Bearer tok');
        expect(capturedOpts.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(capturedOpts.body)).toEqual({ concertId: 'c1', userId: 'u1' });
    });

    it('throws with status 409 on conflict', async () => {
        await expect(post('/api/lineup/place', {}, 't', mockFetch(409, { error: 'conflict' })))
            .rejects.toMatchObject({ status: 409 });
    });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend
npm test -- tests/api.test.js
```

Expected: FAIL — `../src/api.js` not found.

- [ ] **Step 3: Implement `frontend/src/api.js`**

```js
async function handleResponse(res) {
    if (res.ok) return res.json();
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || `http_${res.status}`), { status: res.status });
}

export async function get(path, token, fetchFn = fetch) {
    const res = await fetchFn(path, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleResponse(res);
}

export async function post(path, body, token, fetchFn = fetch) {
    const res = await fetchFn(path, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    return handleResponse(res);
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd frontend
npm test -- tests/api.test.js
```

Expected: PASS all 7 assertions.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.js frontend/tests/api.test.js
git commit -m "feat(frontend): api.js — get/post with auth header + error mapping"
```

---

## Task 6: `frontend/src/state.js` — Client Store

**Files:**
- Create: `frontend/src/state.js`
- Create: `frontend/tests/state.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/state.test.js`:

```js
import { describe, it, expect } from 'vitest';

// Dynamic import with cache-busting isolates module state between tests.
async function freshState() {
    return import('../src/state.js?t=' + Math.random());
}

describe('state store', () => {
    it('getEvent returns null initially', async () => {
        const state = await freshState();
        expect(state.getEvent()).toBeNull();
    });

    it('setEvent / getEvent round-trip', async () => {
        const state = await freshState();
        const event = { id: 'c1', name: 'Test', signups: {}, lineup: [] };
        state.setEvent(event);
        expect(state.getEvent()).toBe(event);
    });

    it('getDraggingId returns null initially', async () => {
        const state = await freshState();
        expect(state.getDraggingId()).toBeNull();
    });

    it('setDraggingId / getDraggingId round-trip', async () => {
        const state = await freshState();
        state.setDraggingId('u999');
        expect(state.getDraggingId()).toBe('u999');
    });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend
npm test -- tests/state.test.js
```

Expected: FAIL — `../src/state.js` not found.

- [ ] **Step 3: Implement `frontend/src/state.js`**

```js
let _event = null;
let _draggingId = null;

export function getEvent() { return _event; }
export function setEvent(event) { _event = event; }

export function getDraggingId() { return _draggingId; }
export function setDraggingId(id) { _draggingId = id; }
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd frontend
npm test -- tests/state.test.js
```

Expected: PASS all 4 assertions.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/state.js frontend/tests/state.test.js
git commit -m "feat(frontend): state.js — client store for event + draggingId"
```

---

## Task 7: `frontend/src/sidebar/available.js` — Available List

**Files:**
- Create: `frontend/src/sidebar/available.js`
- Create: `frontend/tests/sidebar/available.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/sidebar/available.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { computeAvailable, renderAvailable } from '../../src/sidebar/available.js';

const sampleEvent = {
    lineup: [
        {
            userId: 'u2',
            displayName: 'Placed User',
            instrument: '1:a',
            position: { x: 100, y: 100 },
            manuallyAdded: false,
            placedAt: '',
        },
    ],
    signups: {
        '1:a': [
            { name: 'Andrea W',  id: 'u1', response: 'ja',     note: '' },
            { name: 'Orietta R', id: 'u2', response: 'ja',     note: '' }, // placed
            { name: 'Nina H',    id: 'u3', response: 'nej',    note: '' }, // excluded
            { name: 'Kalle H',   id: 'u4', response: 'kanske', note: '' },
        ],
        '2:a': [
            { name: 'Linn R', id: 'u5', response: 'ja', note: '' },
        ],
    },
};

describe('computeAvailable', () => {
    it('excludes placed users', () => {
        const result = computeAvailable(sampleEvent);
        const ids = result['1:a'].map(e => e.id);
        expect(ids).not.toContain('u2');
    });

    it('excludes nej responses', () => {
        const result = computeAvailable(sampleEvent);
        const ids = result['1:a'].map(e => e.id);
        expect(ids).not.toContain('u3');
    });

    it('includes ja and kanske responses not yet placed', () => {
        const result = computeAvailable(sampleEvent);
        const ids = result['1:a'].map(e => e.id);
        expect(ids).toContain('u1');
        expect(ids).toContain('u4');
    });

    it('includes second instrument section', () => {
        const result = computeAvailable(sampleEvent);
        expect(result['2:a']).toHaveLength(1);
        expect(result['2:a'][0].id).toBe('u5');
    });

    it('omits instrument key when all members placed or excluded', () => {
        const event = {
            lineup: [{
                userId: 'u5',
                displayName: 'Linn',
                instrument: '2:a',
                position: { x: 0, y: 0 },
                manuallyAdded: false,
                placedAt: '',
            }],
            signups: { '2:a': [{ name: 'Linn R', id: 'u5', response: 'ja', note: '' }] },
        };
        expect(computeAvailable(event)['2:a']).toBeUndefined();
    });

    it('handles missing lineup array gracefully', () => {
        const event = { signups: { '1:a': [{ name: 'A', id: 'u1', response: 'ja', note: '' }] } };
        expect(computeAvailable(event)['1:a']).toHaveLength(1);
    });
});

describe('renderAvailable', () => {
    let container;
    beforeEach(() => { container = document.createElement('div'); });

    it('creates one section per available instrument', () => {
        renderAvailable(container, sampleEvent);
        expect(container.querySelectorAll('.available-section')).toHaveLength(2);
    });

    it('renders instrument name as h3 header', () => {
        renderAvailable(container, sampleEvent);
        const headers = [...container.querySelectorAll('h3')].map(h => h.textContent);
        expect(headers).toContain('1:a');
        expect(headers).toContain('2:a');
    });

    it('renders rows with data-user-id and name as text', () => {
        renderAvailable(container, sampleEvent);
        const row = container.querySelector('[data-user-id="u1"]');
        expect(row).not.toBeNull();
        expect(row.textContent).toBe('Andrea W');
    });

    it('does not render placed users', () => {
        renderAvailable(container, sampleEvent);
        expect(container.querySelector('[data-user-id="u2"]')).toBeNull();
    });

    it('clears previous content on re-render', () => {
        renderAvailable(container, sampleEvent);
        renderAvailable(container, sampleEvent);
        expect(container.querySelectorAll('.available-section')).toHaveLength(2);
    });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend
npm test -- tests/sidebar/available.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/sidebar/available.js`**

All text output uses `textContent` — no `innerHTML`.

```js
const VALID_RESPONSES = new Set(['ja', 'kanske']);

export function computeAvailable(event) {
    const placed = new Set((event.lineup || []).map(e => e.userId));
    const result = {};
    for (const [instrument, entries] of Object.entries(event.signups || {})) {
        const filtered = entries.filter(e =>
            VALID_RESPONSES.has(e.response) && !placed.has(e.id)
        );
        if (filtered.length > 0) result[instrument] = filtered;
    }
    return result;
}

export function renderAvailable(container, event) {
    container.replaceChildren();
    const available = computeAvailable(event);
    for (const [instrument, entries] of Object.entries(available)) {
        const section = document.createElement('div');
        section.className = 'available-section';

        const header = document.createElement('h3');
        header.textContent = instrument;
        section.appendChild(header);

        for (const entry of entries) {
            const row = document.createElement('div');
            row.className = 'available-row';
            row.dataset.userId = entry.id;
            row.dataset.instrument = instrument;
            row.textContent = entry.name;
            section.appendChild(row);
        }

        container.appendChild(section);
    }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd frontend
npm test -- tests/sidebar/available.test.js
```

Expected: PASS all 11 assertions.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/sidebar/available.js frontend/tests/sidebar/available.test.js
git commit -m "feat(frontend): sidebar/available.js — available list projection + render"
```

---

## Task 8: `frontend/src/canvas/stage.js` — Static Canvas Render

**Files:**
- Create: `frontend/src/canvas/stage.js`
- Create: `frontend/tests/canvas/stage.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/canvas/stage.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { instrumentColor, isStale, renderStage } from '../../src/canvas/stage.js';

describe('instrumentColor', () => {
    it('returns a hex color for each known instrument', () => {
        for (const inst of ['1:a', '2:a', '3:a', '4:a', 'repenique', 'skak/agogo', 'tarol', 'timbal']) {
            expect(instrumentColor(inst)).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
    });

    it('returns default hex color for unknown instrument', () => {
        expect(instrumentColor('unknown_inst')).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
});

const baseEvent = {
    lineup: [
        {
            userId: 'u1',
            displayName: 'Andrea W',
            instrument: '1:a',
            position: { x: 200, y: 150 },
            manuallyAdded: false,
            placedAt: '2026-05-13T10:00:00Z',
        },
        {
            userId: 'u2',
            displayName: 'Gäst',
            instrument: 'tarol',
            position: { x: 500, y: 300 },
            manuallyAdded: true,
            placedAt: '2026-05-13T10:01:00Z',
        },
    ],
    signups: {
        '1:a': [
            { name: 'Andrea W', id: 'u1', response: 'ja', note: '' },
        ],
    },
};

describe('isStale', () => {
    it('returns false when signup entry has response ja', () => {
        expect(isStale(baseEvent.lineup[0], baseEvent)).toBe(false);
    });

    it('returns true when userId has no matching signup', () => {
        const entry = { ...baseEvent.lineup[0], userId: 'u99' };
        expect(isStale(entry, baseEvent)).toBe(true);
    });

    it('returns true when only nej signup exists for userId', () => {
        const event = {
            lineup: [],
            signups: { '1:a': [{ name: 'X', id: 'u1', response: 'nej', note: '' }] },
        };
        expect(isStale({ userId: 'u1', manuallyAdded: false }, event)).toBe(true);
    });

    it('returns false for manuallyAdded regardless of signups', () => {
        expect(isStale(baseEvent.lineup[1], baseEvent)).toBe(false);
    });
});

describe('renderStage', () => {
    let stage;
    beforeEach(() => { stage = document.createElement('div'); });

    it('renders one dot per lineup entry', () => {
        renderStage(stage, baseEvent);
        expect(stage.querySelectorAll('.stage-dot')).toHaveLength(2);
    });

    it('dot has data-user-id attribute', () => {
        renderStage(stage, baseEvent);
        expect(stage.querySelector('[data-user-id="u1"]')).not.toBeNull();
        expect(stage.querySelector('[data-user-id="u2"]')).not.toBeNull();
    });

    it('dot label shows displayName as text', () => {
        renderStage(stage, baseEvent);
        const dot = stage.querySelector('[data-user-id="u1"]');
        expect(dot.querySelector('.dot-label').textContent).toBe('Andrea W');
    });

    it('dot has non-empty background color', () => {
        renderStage(stage, baseEvent);
        const dot = stage.querySelector('[data-user-id="u1"]');
        expect(dot.style.backgroundColor).not.toBe('');
    });

    it('no stale badge when signup is ja', () => {
        renderStage(stage, baseEvent);
        expect(stage.querySelector('[data-user-id="u1"]').querySelector('.stale-badge')).toBeNull();
    });

    it('stale badge present when userId has no ja/kanske signup', () => {
        const staleEvent = {
            lineup: [{
                userId: 'u99',
                displayName: 'Ghost',
                instrument: '1:a',
                position: { x: 100, y: 100 },
                manuallyAdded: false,
                placedAt: '',
            }],
            signups: { '1:a': [{ name: 'Ghost', id: 'u99', response: 'nej', note: '' }] },
        };
        renderStage(stage, staleEvent);
        expect(stage.querySelector('[data-user-id="u99"]').querySelector('.stale-badge')).not.toBeNull();
    });

    it('no stale badge for manuallyAdded even with no signup', () => {
        renderStage(stage, baseEvent);
        expect(stage.querySelector('[data-user-id="u2"]').querySelector('.stale-badge')).toBeNull();
    });

    it('clears previous content on re-render', () => {
        renderStage(stage, baseEvent);
        renderStage(stage, baseEvent);
        expect(stage.querySelectorAll('.stage-dot')).toHaveLength(2);
    });

    it('renders empty stage when lineup is empty', () => {
        renderStage(stage, { lineup: [], signups: {} });
        expect(stage.querySelectorAll('.stage-dot')).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend
npm test -- tests/canvas/stage.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/canvas/stage.js`**

All text output uses `textContent` — no `innerHTML`.

```js
export const STAGE_W = 1000;
export const STAGE_H = 600;

const INSTRUMENT_COLORS = {
    '1:a':        '#e74c3c',
    '2:a':        '#e67e22',
    '3:a':        '#f1c40f',
    '4:a':        '#2ecc71',
    'repenique':  '#3498db',
    'skak/agogo': '#9b59b6',
    'tarol':      '#1abc9c',
    'timbal':     '#e91e63',
};
const DEFAULT_COLOR = '#95a5a6';

export function instrumentColor(instrument) {
    return INSTRUMENT_COLORS[instrument] ?? DEFAULT_COLOR;
}

export function isStale(entry, event) {
    if (entry.manuallyAdded) return false;
    for (const entries of Object.values(event.signups || {})) {
        if (entries.some(e =>
            e.id === entry.userId && (e.response === 'ja' || e.response === 'kanske')
        )) return false;
    }
    return true;
}

export function renderStage(stageEl, event) {
    stageEl.replaceChildren();
    for (const entry of (event.lineup || [])) {
        const dot = document.createElement('div');
        dot.className = 'stage-dot';
        dot.dataset.userId = entry.userId;
        dot.style.left = `${(entry.position.x / STAGE_W) * 100}%`;
        dot.style.top = `${(entry.position.y / STAGE_H) * 100}%`;
        dot.style.backgroundColor = instrumentColor(entry.instrument);

        const label = document.createElement('span');
        label.className = 'dot-label';
        label.textContent = entry.displayName;
        dot.appendChild(label);

        if (isStale(entry, event)) {
            const badge = document.createElement('span');
            badge.className = 'stale-badge';
            badge.textContent = '!';
            dot.appendChild(badge);
        }

        stageEl.appendChild(dot);
    }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd frontend
npm test -- tests/canvas/stage.test.js
```

Expected: PASS all 10 assertions.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/canvas/stage.js frontend/tests/canvas/stage.test.js
git commit -m "feat(frontend): canvas/stage.js — dot render, stale badge, instrument colors"
```

---

## Task 9: Full Frontend Test Suite Green

- [ ] **Step 1: Run all frontend tests**

```bash
cd frontend
npm test
```

Expected: All tests PASS across `sdk`, `auth`, `api`, `state`, `sidebar/available`, `canvas/stage`.

- [ ] **Step 2: Fix any failures**

Common issues:
- Wrong relative path in a test import → fix the `../../src/` prefix.
- `replaceChildren` not available in older jsdom → check Vitest is using `jsdom` environment (set in `vite.config.js`).

---

## Task 10: `frontend/src/styles.css` + `frontend/src/main.js` — Layout + Boot

**Files:**
- Create: `frontend/src/styles.css`
- Create: `frontend/src/main.js`
- Create: `frontend/.env.development`

No automated tests — boot sequence requires a real Discord SDK handshake. Verify in Discord after Task 11 deploy.

- [ ] **Step 1: Create `frontend/src/styles.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
    font-family: sans-serif;
    background: #1a1a2e;
    color: #eee;
    height: 100vh;
    overflow: hidden;
}

#loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-size: 1.2rem;
    color: #aaa;
}

#app {
    display: flex;
    height: 100vh;
}

#sidebar {
    width: 220px;
    flex-shrink: 0;
    background: #16213e;
    overflow-y: auto;
    padding: 0.75rem;
    border-right: 1px solid #0f3460;
}

.available-section { margin-bottom: 1rem; }

.available-section h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #8899aa;
    margin-bottom: 0.4rem;
}

.available-row {
    padding: 0.5rem 0.6rem;
    border-radius: 6px;
    cursor: grab;
    font-size: 0.9rem;
    background: #1e3050;
    margin-bottom: 0.25rem;
    user-select: none;
}

.available-row:hover { background: #274070; }

#stage-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0f0f1a;
    overflow: hidden;
}

#stage {
    position: relative;
    width: min(calc(100vw - 220px), calc(100vh * (1000 / 600)));
    aspect-ratio: 1000 / 600;
    background: #1c2940;
    border: 1px solid #334;
    border-radius: 4px;
}

.stage-dot {
    position: absolute;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}

.dot-label {
    position: absolute;
    top: 110%;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 0.7rem;
    color: #ddd;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.6);
    padding: 1px 4px;
    border-radius: 3px;
}

.stale-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 16px;
    height: 16px;
    background: #e74c3c;
    color: white;
    border-radius: 50%;
    font-size: 0.65rem;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
}

.status-message {
    padding: 2rem;
    font-size: 1rem;
    color: #aaa;
}

.status-message.error { color: #e74c3c; }
```

- [ ] **Step 2: Create `frontend/src/main.js`**

```js
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { bootSdk, authenticateSdk } from './sdk.js';
import { exchangeCode, setToken } from './auth.js';
import { get } from './api.js';
import { setEvent } from './state.js';
import { renderAvailable } from './sidebar/available.js';
import { renderStage } from './canvas/stage.js';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

function showStatus(message, isError = false) {
    document.body.replaceChildren();
    const p = document.createElement('p');
    p.className = isError ? 'status-message error' : 'status-message';
    p.textContent = message;
    document.body.appendChild(p);
}

async function boot() {
    let sdk, code;
    try {
        ({ sdk, code } = await bootSdk(DiscordSDK, CLIENT_ID));
    } catch {
        return; // sdk.js already rendered standalone refusal
    }

    let accessToken;
    try {
        const result = await exchangeCode(code);
        accessToken = result.access_token;
        setToken(accessToken);
        await authenticateSdk(sdk, accessToken);
    } catch {
        showStatus('Autentisering misslyckades. Ladda om sidan.', true);
        return;
    }

    let concertId;
    try {
        const result = await get('/api/concert/pending', accessToken);
        concertId = result.concertId;
    } catch (err) {
        if (err.status === 404) {
            showStatus('Inget väntande konsert. Högerklicka ett signup-meddelande och välj "Lineup" först.');
        } else {
            showStatus('Kunde inte hämta konsert. Ladda om sidan.', true);
        }
        return;
    }

    let event;
    try {
        event = await get(`/api/state/${concertId}`, accessToken);
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

    setEvent(event);

    const loading = document.getElementById('loading');
    if (loading) loading.remove();
    document.getElementById('app').style.display = 'flex';

    renderAvailable(document.getElementById('sidebar'), event);
    renderStage(document.getElementById('stage'), event);
}

boot();
```

- [ ] **Step 3: Create `frontend/.env.development`**

```
VITE_DISCORD_CLIENT_ID=your_dev_discord_client_id
```

Replace `your_dev_discord_client_id` with the Client ID of the dev Discord Application created in M0.

- [ ] **Step 4: Build and verify no errors**

```bash
cd frontend
npm run build
```

Expected: `frontend/dist/` created with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles.css frontend/src/main.js frontend/.env.development
git commit -m "feat(frontend): styles + boot orchestration"
```

---

## Task 11: Cloudflare Pages Deploy

No automated tests — manual verification in Discord.

- [ ] **Step 1: Create `frontend/.gitignore`**

```
node_modules/
dist/
.env
.env.local
.env.development
.env.production
```

Commit:

```bash
git add frontend/.gitignore
git commit -m "chore(frontend): gitignore for frontend project"
```

- [ ] **Step 2: Push branch to GitHub**

CF Pages builds from git:

```bash
git push origin main
```

- [ ] **Step 3: Configure Cloudflare Pages project** (CF dashboard, one-time)

1. Cloudflare → Workers & Pages → Create → Pages → Connect to Git.
2. Select the `Kiribot` repository.
3. **Root directory:** `frontend`
4. **Framework preset:** None
5. **Build command:** `npm run build`
6. **Build output directory:** `dist`
7. **Environment variables:** add `VITE_DISCORD_CLIENT_ID` = your dev app Client ID.
8. Save and deploy.

Expected: CF Pages build succeeds; deployment URL available (e.g. `https://kiribot-lineup.pages.dev`).

- [ ] **Step 4: Set URL mappings in Discord Developer Portal** (dev app)

1. Developer Portal → your dev Activity app → Activities → URL Mappings.
2. Prefix `/` → your CF Pages deployment URL.
3. Prefix `/api` → your cloudflared tunnel URL (e.g. `https://lineup-api.yourdomain.com`).
4. Save.

- [ ] **Step 5: Smoke-test the Activity end-to-end**

1. Start the bot + Express locally (`npm start` in project root).
2. Confirm cloudflared tunnel is running.
3. In Discord, right-click a signup message → **Lineup** (M2 context menu) to set a pending concert.
4. Open a voice channel → launch the Activity from the shelf.
5. Expected: Activity iframe shows "Laddar..." then renders sidebar with available members grouped by instrument, and stage with any previously placed dots.
6. Expected: A non-Harmonian user sees "Åtkomst nekad. Harmonian-rollen krävs."

---

## Spec Coverage

| Spec requirement | Task |
|---|---|
| Vite SPA in `frontend/` | Task 2 |
| `DiscordSDK.ready()` → standalone refusal | Task 3 |
| `commands.authorize()` → OAuth code | Task 3 |
| `POST /api/token` exchange | Task 4 |
| `authenticate()` with access token | Tasks 3 + 10 |
| Token memory-only, no localStorage | Task 4 (`setToken` = module var) |
| `GET /api/concert/pending` → 404 message | Task 10 |
| `GET /api/state/:concertId` → 403 lockout | Task 10 |
| Static sidebar + canvas render (no drag) | Tasks 7, 8, 10 |
| Available list: ja + kanske, excludes placed | Task 7 |
| Stale badge logic | Task 8 |
| Instrument dot colors | Task 8 |
| Stage 1000×600 (`STAGE_W`, `STAGE_H`) | Task 8, Task 10 CSS |
| 44px tap targets | Task 10 CSS `.stage-dot` |
| CORS `*.discordsays.com` | Task 1 |
| Cloudflare Pages deploy from `main`, root = `frontend` | Task 11 |
