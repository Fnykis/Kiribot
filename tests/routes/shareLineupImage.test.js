const test = require('node:test');
const assert = require('node:assert');
const createShareLineupImageRoute = require('../../src/routes/api/shareLineupImage');

const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('rest-of-the-png')
]);

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

function makeClient({ channelSend, userSend } = {}) {
    return {
        channels: { fetch: async () => ({ send: channelSend || (async () => {}) }) },
        users: { fetch: async () => ({ send: userSend || (async () => {}) }) }
    };
}

function makeReq({ target, body = PNG, user = { id: 'u1' } } = {}) {
    const query = { concertId: 'c1' };
    if (target !== undefined) query.target = target;
    return { query, body, user };
}

const lineupStore = { loadEvent: async () => ({ name: 'Vårkonsert', date: '2026-04-12' }) };

test('shareLineupImage: default target posts to the Harmonia channel', async () => {
    let sentTo = null;
    const handler = createShareLineupImageRoute({
        client: makeClient({ channelSend: async (payload) => { sentTo = { where: 'channel', payload }; } }),
        lineupStore
    });
    const res = mockRes();
    await handler(makeReq(), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(sentTo.where, 'channel');
    assert.equal(sentTo.payload.files[0].name, 'Vårkonsert.png');
});

test('shareLineupImage: target=dm sends the image to the caller', async () => {
    let sentTo = null;
    const handler = createShareLineupImageRoute({
        client: makeClient({
            channelSend: async () => { sentTo = { where: 'channel' }; },
            userSend: async (payload) => { sentTo = { where: 'dm', payload }; }
        }),
        lineupStore
    });
    const res = mockRes();
    await handler(makeReq({ target: 'dm' }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(sentTo.where, 'dm');
    assert.match(sentTo.payload.content, /Vårkonsert/);
    assert.equal(sentTo.payload.files[0].name, 'Vårkonsert.png');
});

test('shareLineupImage: 403 dm_blocked when the user has DMs closed', async () => {
    const handler = createShareLineupImageRoute({
        client: makeClient({
            userSend: async () => { throw Object.assign(new Error('Cannot send messages to this user'), { code: 50007 }); }
        }),
        lineupStore
    });
    const res = mockRes();
    await handler(makeReq({ target: 'dm' }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'dm_blocked');
});

test('shareLineupImage: 400 on an unknown target', async () => {
    const handler = createShareLineupImageRoute({ client: makeClient(), lineupStore });
    const res = mockRes();
    await handler(makeReq({ target: 'everyone' }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'bad_target');
});

test('shareLineupImage: 400 when the body is not a PNG', async () => {
    const handler = createShareLineupImageRoute({ client: makeClient(), lineupStore });
    const res = mockRes();
    await handler(makeReq({ body: Buffer.from('not a png at all') }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'not_png');
});
