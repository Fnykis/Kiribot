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

test('state: 200 returns full event JSON with lineup', async () => {
    const store = {
        async loadEvent(id) {
            if (id !== 'c1') return null;
            return { id: 'c1', name: 'Demo', date: '08/03/26', signups: { '1:a': [] }, lineup: [] };
        }
    };
    const handler = createStateRoute({ lineupStore: store });
    const req = { params: { concertId: 'c1' } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, {
        id: 'c1', name: 'Demo', date: '08/03/26', signups: { '1:a': [] }, lineup: []
    });
});

test('state: 404 when event not found', async () => {
    const store = { async loadEvent() { return null; } };
    const handler = createStateRoute({ lineupStore: store });
    const res = mockRes();
    await handler({ params: { concertId: 'gone' } }, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'event_not_found' });
});
