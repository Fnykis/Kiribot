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
