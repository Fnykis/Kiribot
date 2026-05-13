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

const eventJson = {
    name: '[SOC] Demo',
    id: 'c1',
    signups: {
        '1:a': [
            { name: 'Andrea W', id: 'u1', response: 'kanske', note: '' },
            { name: 'Orietta R', id: 'u2', response: 'ja', note: '' }
        ]
    }
};

test('returns merged state with concertId, name, updatedAt, participants', async () => {
    const lineupStore = {
        async loadState(id) {
            return { concertId: id, participants: { u2: { placed: true, x: 5, y: 6 } }, updatedAt: '2026-05-13T12:00:00Z' };
        }
    };
    const handler = createStateRoute({
        getEventJSON: id => (id === 'c1' ? eventJson : null),
        lineupStore
    });

    const req = { params: { concertId: 'c1' }, user: { id: 'caller' } };
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.concertId, 'c1');
    assert.strictEqual(res.body.name, '[SOC] Demo');
    assert.strictEqual(res.body.updatedAt, '2026-05-13T12:00:00Z');
    assert.strictEqual(Array.isArray(res.body.participants), true);
    const u2 = res.body.participants.find(p => p.userId === 'u2');
    assert.strictEqual(u2.placed, true);
    assert.strictEqual(u2.x, 5);
});

test('returns 404 event_not_found for unknown concertId', async () => {
    const handler = createStateRoute({
        getEventJSON: () => null,
        lineupStore: { async loadState() { return { participants: {}, updatedAt: null }; } }
    });

    const req = { params: { concertId: 'gone' }, user: { id: 'caller' } };
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'event_not_found' });
});
