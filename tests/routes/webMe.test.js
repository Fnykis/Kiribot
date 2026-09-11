const test = require('node:test');
const assert = require('node:assert');
const createWebMeRoute = require('../../src/routes/api/web/me');

const EMPTY_STORE = { countsByRole: async () => ({}) };

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

test('returns member:false and nothing else for a non-member', async () => {
    const handler = createWebMeRoute({ arshjulStore: EMPTY_STORE, memberGroups: { getGroups: async () => ({ member: false }) } });
    const res = mockRes();
    await handler({ webUser: { id: 'u1' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { member: false });
});

test('returns the member display name and both group lists', async () => {
    const handler = createWebMeRoute({
        arshjulStore: EMPTY_STORE,
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
        isModerator: false,
        instruments: [{ id: 'r1', name: 'tarol', count: 0 }],
        workgroups: [{ id: 'r2', name: 'transportgruppen', count: 0 }]
    });
});

test('exposes isModerator status when present', async () => {
    const handler = createWebMeRoute({
        arshjulStore: EMPTY_STORE,
        memberGroups: {
            getGroups: async () => ({ member: true, displayName: 'M', isModerator: true, instruments: [], workgroups: [] })
        }
    });
    const res = mockRes();
    await handler({ webUser: { id: 'u1' } }, res);
    assert.strictEqual(res.body.isModerator, true);
});

test('a member with no groups returns empty arrays', async () => {
    const handler = createWebMeRoute({
        arshjulStore: EMPTY_STORE,
        memberGroups: { getGroups: async () => ({ member: true, displayName: 'N', isModerator: false, instruments: [], workgroups: [] }) }
    });
    const res = mockRes();
    await handler({ webUser: { id: 'u1' } }, res);
    assert.deepStrictEqual(res.body.instruments, []);
    assert.deepStrictEqual(res.body.workgroups, []);
});

test('500 member_lookup_failed when Discord lookup throws', async () => {
    const handler = createWebMeRoute({ arshjulStore: EMPTY_STORE, memberGroups: { getGroups: async () => { throw new Error('discord down'); } } });
    const res = mockRes();
    await handler({ webUser: { id: 'u1' } }, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'member_lookup_failed' });
});

test('reports isModerator true for a moderator', async () => {
    const res = mockRes();
    await createWebMeRoute({
        arshjulStore: EMPTY_STORE,
        memberGroups: {
            getGroups: async () => ({
                member: true, displayName: 'Mod', isModerator: true,
                instruments: [], workgroups: []
            })
        }
    })({ webUser: { id: 'u1' } }, res);
    assert.strictEqual(res.body.isModerator, true);
});

test('reports isModerator false for an ordinary member and still lists only their own groups', async () => {
    const res = mockRes();
    await createWebMeRoute({
        arshjulStore: EMPTY_STORE,
        memberGroups: {
            getGroups: async () => ({
                member: true, displayName: 'Olle L', isModerator: false,
                instruments: [{ id: 'i1', name: 'tarol' }], workgroups: []
            })
        }
    })({ webUser: { id: 'u1' } }, res);
    assert.strictEqual(res.body.isModerator, false);
    assert.deepStrictEqual(res.body.instruments, [{ id: 'i1', name: 'tarol', count: 0 }]);
    assert.deepStrictEqual(res.body.workgroups, []);
});

test('a non-member response still carries nothing but member:false', async () => {
    const res = mockRes();
    await createWebMeRoute({ arshjulStore: EMPTY_STORE, memberGroups: { getGroups: async () => ({ member: false }) } })(
        { webUser: { id: 'u1' } }, res
    );
    assert.deepStrictEqual(res.body, { member: false });
});

test('attaches the reminder count to every group, 0 when the role has none', async () => {
    const res = mockRes();
    await createWebMeRoute({
        memberGroups: {
            getGroups: async () => ({
                member: true, displayName: 'Olle L', isModerator: false,
                instruments: [{ id: 'i1', name: 'tarol' }],
                workgroups: [{ id: 'w1', name: 'transportgruppen' }]
            })
        },
        arshjulStore: { countsByRole: async () => ({ i1: 3 }) }
    })({ webUser: { id: 'u1' } }, res);
    assert.deepStrictEqual(res.body.instruments, [{ id: 'i1', name: 'tarol', count: 3 }]);
    assert.deepStrictEqual(res.body.workgroups, [{ id: 'w1', name: 'transportgruppen', count: 0 }]);
});

test('a failing count lookup logs and falls back to 0 rather than failing the request', async () => {
    const res = mockRes();
    const logged = [];
    await createWebMeRoute({
        memberGroups: {
            getGroups: async () => ({
                member: true, displayName: 'Olle L', isModerator: false,
                instruments: [{ id: 'i1', name: 'tarol' }], workgroups: []
            })
        },
        arshjulStore: { countsByRole: async () => { throw new Error('corrupt'); } },
        logger: (...a) => logged.push(a.join(' '))
    })({ webUser: { id: 'u1' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.instruments, [{ id: 'i1', name: 'tarol', count: 0 }]);
    assert.ok(logged.some(l => l.includes('corrupt')));
});
