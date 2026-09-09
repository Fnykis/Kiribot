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
