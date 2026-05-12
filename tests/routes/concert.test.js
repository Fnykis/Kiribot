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
