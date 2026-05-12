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
