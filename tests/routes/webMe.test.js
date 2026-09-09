const test = require('node:test');
const assert = require('node:assert');
const createWebMeRoute = require('../../src/routes/api/web/me');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

test('returns member:false and nothing else for a non-member', async () => {
    const handler = createWebMeRoute({ memberGroups: { getGroups: async () => ({ member: false }) } });
    const res = mockRes();
    await handler({ webUser: { id: 'u1' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { member: false });
});

test('returns the member display name and both group lists', async () => {
    const handler = createWebMeRoute({
        memberGroups: {
            getGroups: async () => ({
                member: true,
                displayName: 'Olle L',
                isModerator: false,
                instruments: [{ id: 'r1', name: 'tarol' }],
                workgroups: [{ id: 'r2', name: 'transportgruppen' }]
            })
        }
    });
    const res = mockRes();
    await handler({ webUser: { id: 'u1' } }, res);
    assert.deepStrictEqual(res.body, {
        member: true,
        displayName: 'Olle L',
        instruments: [{ id: 'r1', name: 'tarol' }],
        workgroups: [{ id: 'r2', name: 'transportgruppen' }]
    });
});

test('does not leak moderator status', async () => {
    const handler = createWebMeRoute({
        memberGroups: {
            getGroups: async () => ({ member: true, displayName: 'M', isModerator: true, instruments: [], workgroups: [] })
        }
    });
    const res = mockRes();
    await handler({ webUser: { id: 'u1' } }, res);
    assert.strictEqual('isModerator' in res.body, false);
});

test('a member with no groups returns empty arrays', async () => {
    const handler = createWebMeRoute({
        memberGroups: { getGroups: async () => ({ member: true, displayName: 'N', isModerator: false, instruments: [], workgroups: [] }) }
    });
    const res = mockRes();
    await handler({ webUser: { id: 'u1' } }, res);
    assert.deepStrictEqual(res.body.instruments, []);
    assert.deepStrictEqual(res.body.workgroups, []);
});

test('500 member_lookup_failed when Discord lookup throws', async () => {
    const handler = createWebMeRoute({ memberGroups: { getGroups: async () => { throw new Error('discord down'); } } });
    const res = mockRes();
    await handler({ webUser: { id: 'u1' } }, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'member_lookup_failed' });
});
