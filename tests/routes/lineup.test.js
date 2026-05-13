const test = require('node:test');
const assert = require('node:assert');
const {
    createPlaceRoute,
    createMoveRoute,
    createRemoveRoute
} = require('../../src/routes/api/lineup');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

const eventJson = {
    name: 'Demo',
    id: 'c1',
    signups: {
        '1:a': [{ name: 'A', id: 'u1', response: 'ja', note: '' }]
    }
};

function makeStore(initial = {}) {
    let state = { concertId: 'c1', participants: { ...initial }, updatedAt: null };
    return {
        async loadState() { return JSON.parse(JSON.stringify(state)); },
        async mutate(_id, fn) {
            const next = JSON.parse(JSON.stringify(state));
            const out = fn(next) || next;
            out.updatedAt = '2026-05-13T00:00:00Z';
            state = out;
            return out;
        },
        peek() { return state; }
    };
}

// place
test('place: 200 on valid place', async () => {
    const store = makeStore();
    const handler = createPlaceRoute({
        getEventJSON: () => eventJson,
        lineupStore: store
    });

    const req = { body: { concertId: 'c1', userId: 'u1', x: 10, y: 20 } };
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { ok: true });
    assert.deepStrictEqual(store.peek().participants['u1'], { placed: true, x: 10, y: 20 });
});

test('place: 400 invalid_body when x is not a number', async () => {
    const handler = createPlaceRoute({
        getEventJSON: () => eventJson,
        lineupStore: makeStore()
    });
    const req = { body: { concertId: 'c1', userId: 'u1', x: 'abc', y: 20 } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'invalid_body' });
});

test('place: 404 event_not_found when concert is archived', async () => {
    const handler = createPlaceRoute({
        getEventJSON: () => null,
        lineupStore: makeStore()
    });
    const req = { body: { concertId: 'gone', userId: 'u1', x: 1, y: 2 } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'event_not_found' });
});

test('place: 404 user_not_in_roster for unknown user', async () => {
    const handler = createPlaceRoute({
        getEventJSON: () => eventJson,
        lineupStore: makeStore()
    });
    const req = { body: { concertId: 'c1', userId: 'nobody', x: 1, y: 2 } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'user_not_in_roster' });
});

// move
test('move: 200 on valid move of placed user', async () => {
    const store = makeStore({ u1: { placed: true, x: 1, y: 2 } });
    const handler = createMoveRoute({
        getEventJSON: () => eventJson,
        lineupStore: store
    });
    const req = { body: { concertId: 'c1', userId: 'u1', x: 99, y: 100 } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(store.peek().participants['u1'], { placed: true, x: 99, y: 100 });
});

test('move: 404 user_not_placed when user has no placement yet', async () => {
    const handler = createMoveRoute({
        getEventJSON: () => eventJson,
        lineupStore: makeStore()
    });
    const req = { body: { concertId: 'c1', userId: 'u1', x: 1, y: 2 } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'user_not_placed' });
});

// remove
test('remove: 200 clears placement', async () => {
    const store = makeStore({ u1: { placed: true, x: 1, y: 2 } });
    const handler = createRemoveRoute({
        getEventJSON: () => eventJson,
        lineupStore: store
    });
    const req = { body: { concertId: 'c1', userId: 'u1' } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(store.peek().participants['u1'], { placed: false, x: null, y: null });
});

test('remove: 400 invalid_body when userId missing', async () => {
    const handler = createRemoveRoute({
        getEventJSON: () => eventJson,
        lineupStore: makeStore()
    });
    const req = { body: { concertId: 'c1' } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'invalid_body' });
});

test('remove: 404 event_not_found for archived concert', async () => {
    const handler = createRemoveRoute({
        getEventJSON: () => null,
        lineupStore: makeStore()
    });
    const req = { body: { concertId: 'gone', userId: 'u1' } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'event_not_found' });
});
