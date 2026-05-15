const test = require('node:test');
const assert = require('node:assert');
const createVoiceMuteRoute = require('../../src/routes/api/voiceMute');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

function makeMember({ channelId, setMute }) {
    return {
        voice: {
            channelId,
            setMute: setMute || (async () => {})
        }
    };
}

test('voiceMute: 400 if muted not boolean', async () => {
    const handler = createVoiceMuteRoute({
        getMember: async () => makeMember({ channelId: 'LU' }),
        lineupChannelId: 'LU'
    });
    const res = mockRes();
    await handler({ user: { id: 'u1' }, body: { muted: 'yes' } }, res);
    assert.equal(res.statusCode, 400);
});

test('voiceMute: 409 if user not in lineup VC', async () => {
    const handler = createVoiceMuteRoute({
        getMember: async () => makeMember({ channelId: 'OTHER' }),
        lineupChannelId: 'LU'
    });
    const res = mockRes();
    await handler({ user: { id: 'u1' }, body: { muted: true } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'not_in_lineup_vc');
});

test('voiceMute: 500 if getMember throws', async () => {
    const handler = createVoiceMuteRoute({
        getMember: async () => { throw new Error('lookup_fail'); },
        lineupChannelId: 'LU'
    });
    const res = mockRes();
    await handler({ user: { id: 'u1' }, body: { muted: true } }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'member_lookup_failed');
});

test('voiceMute: 200 + calls setMute(true)', async () => {
    const calls = [];
    const handler = createVoiceMuteRoute({
        getMember: async () => makeMember({
            channelId: 'LU',
            setMute: async (m, reason) => { calls.push({ m, reason }); }
        }),
        lineupChannelId: 'LU'
    });
    const res = mockRes();
    await handler({ user: { id: 'u1' }, body: { muted: true } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { muted: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].m, true);
    assert.equal(calls[0].reason, 'activity toggle');
});

test('voiceMute: 200 + setMute(false)', async () => {
    const calls = [];
    const handler = createVoiceMuteRoute({
        getMember: async () => makeMember({
            channelId: 'LU',
            setMute: async (m, reason) => { calls.push({ m, reason }); }
        }),
        lineupChannelId: 'LU'
    });
    const res = mockRes();
    await handler({ user: { id: 'u1' }, body: { muted: false } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].m, false);
    assert.equal(calls[0].reason, 'activity toggle');
});

test('voiceMute: 500 if setMute throws', async () => {
    const handler = createVoiceMuteRoute({
        getMember: async () => makeMember({
            channelId: 'LU',
            setMute: async () => { throw new Error('discord_down'); }
        }),
        lineupChannelId: 'LU'
    });
    const res = mockRes();
    await handler({ user: { id: 'u1' }, body: { muted: true } }, res);
    assert.equal(res.statusCode, 500);
});
