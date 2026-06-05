const test = require('node:test');
const assert = require('node:assert');
const {
    createPlaceRoute,
    createMoveRoute,
    createMestreRoute,
    createRemoveRoute,
    createInstrumentsRoute,
    createChangeInstrumentRoute
} = require('../../src/routes/api/lineup');

const INSTRUMENT_LIST = { '1:a': [], '2:a': [], 'tarol': [] };

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

function makeStore(event) {
    let current = JSON.parse(JSON.stringify(event));
    return {
        async loadEvent() { return JSON.parse(JSON.stringify(current)); },
        async mutateEvent(_id, fn) {
            const next = JSON.parse(JSON.stringify(current));
            const out = fn(next) ?? next;
            current = out;
            return out;
        },
        peek() { return current; }
    };
}

const baseEvent = {
    id: 'c1', name: 'Demo', date: '08/03/26',
    signups: {
        '1:a': [{ name: 'A', id: 'u1', response: 'ja', note: '' }],
        '2:a': [{ name: 'B', id: 'u2', response: 'nej', note: '' }]
    },
    lineup: []
};

// ---------- PLACE ----------

test('place: 200 + appends entry with placedAt', async () => {
    const store = makeStore(baseEvent);
    const handler = createPlaceRoute({
        lineupStore: store,
        instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true,
        now: () => '2026-05-13T12:00:00.000Z'
    });
    const req = { user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'u1', displayName: 'A', instrument: '1:a', x: 100, y: 200
    } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.lineup, [{
        userId: 'u1', displayName: 'A', instrument: '1:a',
        position: { x: 100, y: 200 }, manuallyAdded: false,
        placedAt: '2026-05-13T12:00:00.000Z'
    }]);
});

test('place: clamps coords to 0..1000 / 0..600', async () => {
    const store = makeStore(baseEvent);
    const handler = createPlaceRoute({
        lineupStore: store, instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true, now: () => 't'
    });
    const req = { user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'u1', displayName: 'A', instrument: '1:a', x: 5000, y: -50
    } };
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.body.lineup[0].position.x, 1000);
    assert.strictEqual(res.body.lineup[0].position.y, 0);
});

test('place: 400 invalid_body when x not number', async () => {
    const handler = createPlaceRoute({
        lineupStore: makeStore(baseEvent), instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true, now: () => 't'
    });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'u1', displayName: 'A', instrument: '1:a', x: 'no', y: 0
    } }, res);
    assert.strictEqual(res.statusCode, 400);
});

test('place: 400 unknown instrument', async () => {
    const handler = createPlaceRoute({
        lineupStore: makeStore(baseEvent), instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true, now: () => 't'
    });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'u1', displayName: 'A', instrument: 'bogus', x: 1, y: 1
    } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'invalid_instrument' });
});

test('place: 404 event_not_found', async () => {
    const store = { async loadEvent() { return null; }, async mutateEvent() { throw new Error('event_not_found'); } };
    const handler = createPlaceRoute({
        lineupStore: store, instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true, now: () => 't'
    });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: {
        concertId: 'gone', userId: 'u1', displayName: 'A', instrument: '1:a', x: 0, y: 0
    } }, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'event_not_found' });
});

test('place: 404 user_not_in_signups for non-manual', async () => {
    const handler = createPlaceRoute({
        lineupStore: makeStore(baseEvent), instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true, now: () => 't'
    });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'u2', displayName: 'B', instrument: '2:a', x: 0, y: 0
    } }, res);
    // u2 is signed up for 2:a but with response 'nej'
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'user_not_in_signups' });
});

test('place: manual-add succeeds even when not in signups', async () => {
    const store = makeStore(baseEvent);
    const handler = createPlaceRoute({
        lineupStore: store, instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true, now: () => 't'
    });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'guest1', displayName: 'Gäst', instrument: 'tarol',
        x: 50, y: 50, manuallyAdded: true
    } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.lineup[0].manuallyAdded, true);
});

test('place: manual-add 400 user_not_in_guild', async () => {
    const handler = createPlaceRoute({
        lineupStore: makeStore(baseEvent), instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => false, now: () => 't'
    });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'ghost', displayName: 'G', instrument: '1:a',
        x: 0, y: 0, manuallyAdded: true
    } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'user_not_in_guild' });
});

test('place: 409 when user already in lineup', async () => {
    const pre = { ...baseEvent, lineup: [{
        userId: 'u1', displayName: 'A', instrument: '1:a',
        position: { x: 0, y: 0 }, manuallyAdded: false, placedAt: 't0'
    }]};
    const handler = createPlaceRoute({
        lineupStore: makeStore(pre), instrumentList: INSTRUMENT_LIST,
        isGuildMember: async () => true, now: () => 't'
    });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: {
        concertId: 'c1', userId: 'u1', displayName: 'A', instrument: '1:a', x: 10, y: 10
    } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.deepStrictEqual(res.body, { error: 'already_placed' });
});

// ---------- MOVE ----------

test('move: 200 updates position + clamps', async () => {
    const pre = { ...baseEvent, lineup: [{
        userId: 'u1', displayName: 'A', instrument: '1:a',
        position: { x: 0, y: 0 }, manuallyAdded: false, placedAt: 't0'
    }]};
    const store = makeStore(pre);
    const handler = createMoveRoute({ lineupStore: store });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1', x: 9999, y: 999 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.lineup[0].position, { x: 1000, y: 600 });
});

test('move: 400 invalid_body', async () => {
    const handler = createMoveRoute({ lineupStore: makeStore(baseEvent) });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1', x: 'no', y: 0 } }, res);
    assert.strictEqual(res.statusCode, 400);
});

test('move: 404 user_not_placed', async () => {
    const handler = createMoveRoute({ lineupStore: makeStore(baseEvent) });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1', x: 5, y: 5 } }, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'user_not_placed' });
});

// ---------- MESTRE ----------

const lineupWithU1 = () => ({ ...baseEvent, lineup: [{
    userId: 'u1', displayName: 'A', instrument: '1:a',
    position: { x: 0, y: 0 }, manuallyAdded: false, placedAt: 't0'
}]});

test('mestre: 200 sets mestre + clamps coords', async () => {
    const store = makeStore(lineupWithU1());
    const handler = createMestreRoute({ lineupStore: store });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1', x: 9999, y: -10 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.lineup[0].mestre, { x: 1000, y: 0 });
});

test('mestre: clearing (null coords) removes the field', async () => {
    const pre = lineupWithU1();
    pre.lineup[0].mestre = { x: 100, y: 100 };
    const store = makeStore(pre);
    const handler = createMestreRoute({ lineupStore: store });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1', x: null, y: null } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(!('mestre' in res.body.lineup[0]));
});

test('mestre: 400 invalid_body when only one coord given', async () => {
    const handler = createMestreRoute({ lineupStore: makeStore(lineupWithU1()) });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1', x: 5, y: null } }, res);
    assert.strictEqual(res.statusCode, 400);
});

test('mestre: 404 user_not_placed', async () => {
    const handler = createMestreRoute({ lineupStore: makeStore(baseEvent) });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1', x: 5, y: 5 } }, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'user_not_placed' });
});

// ---------- REMOVE ----------

test('remove: 200 drops entry; idempotent for missing user', async () => {
    const pre = { ...baseEvent, lineup: [{
        userId: 'u1', displayName: 'A', instrument: '1:a',
        position: { x: 0, y: 0 }, manuallyAdded: false, placedAt: 't0'
    }]};
    const store = makeStore(pre);
    const handler = createRemoveRoute({ lineupStore: store });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.lineup.length, 0);

    const res2 = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1' } }, res2);
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.body.lineup.length, 0);
});

test('remove: 400 invalid_body when missing userId', async () => {
    const handler = createRemoveRoute({ lineupStore: makeStore(baseEvent) });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1' } }, res);
    assert.strictEqual(res.statusCode, 400);
});

// ---------- INSTRUMENTS ----------

test('instruments: 200 returns instrumentList keys', async () => {
    const handler = createInstrumentsRoute({ instrumentList: INSTRUMENT_LIST });
    const res = mockRes();
    await handler({ user: { id: 'me' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, ['1:a', '2:a', 'tarol']);
});

test('instruments: 200 empty array when no instrument list', async () => {
    const handler = createInstrumentsRoute({ instrumentList: {} });
    const res = mockRes();
    await handler({ user: { id: 'me' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, []);
});

// ---------- CHANGE INSTRUMENT ----------

const placedEvent = {
    id: 'c1', name: 'Demo', date: '08/03/26',
    signups: {
        '1:a': [{ name: 'A', id: 'u1', response: 'ja', note: '' }],
        '2:a': [{ name: 'B', id: 'u2', response: 'ja', note: '' }]
    },
    lineup: [{
        userId: 'u1', displayName: 'A', instrument: '1:a',
        position: { x: 10, y: 20 }, manuallyAdded: false, placedAt: 't'
    }]
};

test('changeInstrument: 200 updates the entry instrument', async () => {
    const store = makeStore(placedEvent);
    const handler = createChangeInstrumentRoute({ lineupStore: store, instrumentList: INSTRUMENT_LIST });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1', instrument: 'tarol' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.lineup[0].instrument, 'tarol');
    assert.strictEqual(res.body.lineup[0].position.x, 10); // position untouched
});

test('changeInstrument: 400 invalid_body when instrument missing', async () => {
    const handler = createChangeInstrumentRoute({ lineupStore: makeStore(placedEvent), instrumentList: INSTRUMENT_LIST });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'invalid_body' });
});

test('changeInstrument: 400 unknown instrument', async () => {
    const handler = createChangeInstrumentRoute({ lineupStore: makeStore(placedEvent), instrumentList: INSTRUMENT_LIST });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'u1', instrument: 'bogus' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'invalid_instrument' });
});

test('changeInstrument: 404 user_not_placed', async () => {
    const handler = createChangeInstrumentRoute({ lineupStore: makeStore(placedEvent), instrumentList: INSTRUMENT_LIST });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'c1', userId: 'ghost', instrument: 'tarol' } }, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'user_not_placed' });
});

test('changeInstrument: 404 event_not_found', async () => {
    const store = { async loadEvent() { return null; }, async mutateEvent() { throw new Error('event_not_found'); } };
    const handler = createChangeInstrumentRoute({ lineupStore: store, instrumentList: INSTRUMENT_LIST });
    const res = mockRes();
    await handler({ user: { id: 'me' }, body: { concertId: 'gone', userId: 'u1', instrument: 'tarol' } }, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'event_not_found' });
});
