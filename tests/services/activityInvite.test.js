const test = require('node:test');
const assert = require('node:assert');
const createActivityInviteService = require('../../src/services/activityInvite');

test('createActivityInvite: posts target_type=2 invite to correct channel', async () => {
    const calls = [];
    const restPost = async (route, body) => {
        calls.push({ route, body });
        return { code: 'abc123' };
    };
    const svc = createActivityInviteService({
        restPost,
        channelId: 'CHAN',
        applicationId: 'APP'
    });
    const result = await svc.create();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].route, '/channels/CHAN/invites');
    assert.deepEqual(calls[0].body, {
        max_age: 604800,
        max_uses: 0,
        target_type: 2,
        target_application_id: 'APP'
    });
    assert.equal(result.code, 'abc123');
});

test('createActivityInvite: propagates rest errors', async () => {
    const restPost = async () => { throw new Error('boom'); };
    const svc = createActivityInviteService({
        restPost, channelId: 'C', applicationId: 'A'
    });
    await assert.rejects(() => svc.create(), /boom/);
});
