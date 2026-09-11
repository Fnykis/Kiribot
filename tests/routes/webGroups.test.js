const test = require('node:test');
const assert = require('node:assert');
const createWebGroupsRoute = require('../../src/routes/api/web/groups');

const EMPTY_STORE = { countsByRole: async () => ({}) };

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

const ALL = {
    instruments: [{ id: 'i1', name: 'tarol' }],
    workgroups: [{ id: 'w1', name: 'transportgruppen' }, { id: 'w2', name: 'fikagruppen' }]
};

function route(groups, all = ALL) {
    return createWebGroupsRoute({
        arshjulStore: EMPTY_STORE,
        memberGroups: { getGroups: async () => groups, listAllGroups: async () => all }
    });
}

const req = { webUser: { id: 'u1' } };

test('a moderator receives every instrument and workgroup', async () => {
    const res = mockRes();
    await route({ member: true, isModerator: true, instruments: [], workgroups: [] })(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, {
        instruments: [{ id: 'i1', name: 'tarol', count: 0 }],
        workgroups: [{ id: 'w1', name: 'transportgruppen', count: 0 }, { id: 'w2', name: 'fikagruppen', count: 0 }]
    });
});

test('403 not_moderator for an ordinary member who holds groups', async () => {
    const res = mockRes();
    await route({
        member: true, isModerator: false,
        instruments: [], workgroups: [{ id: 'w1', name: 'transportgruppen' }]
    })(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'not_moderator' });
});

test('403 not_in_guild for a non-member, checked before the moderator flag', async () => {
    const res = mockRes();
    await route({ member: false, isModerator: true })(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'not_in_guild' });
});

test('500 when the roster lookup fails', async () => {
    const res = mockRes();
    await createWebGroupsRoute({
        arshjulStore: EMPTY_STORE,
        memberGroups: {
            getGroups: async () => ({ member: true, isModerator: true }),
            listAllGroups: async () => { throw new Error('Bot not in guild g1'); }
        }
    })(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'internal' });
});

test('500 when getGroups resolves a malformed shape (missing member/isModerator)', async () => {
    const res = mockRes();
    await createWebGroupsRoute({
        arshjulStore: EMPTY_STORE,
        memberGroups: { getGroups: async () => ({ instruments: [] }), listAllGroups: async () => ALL }
    })(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'internal' });
});

test('attaches the reminder count to every group in the roster, 0 when the role has none', async () => {
    const res = mockRes();
    await createWebGroupsRoute({
        memberGroups: {
            getGroups: async () => ({ member: true, isModerator: true, instruments: [], workgroups: [] }),
            listAllGroups: async () => ALL
        },
        arshjulStore: { countsByRole: async () => ({ w2: 5 }) }
    })(req, res);
    assert.deepStrictEqual(res.body, {
        instruments: [{ id: 'i1', name: 'tarol', count: 0 }],
        workgroups: [{ id: 'w1', name: 'transportgruppen', count: 0 }, { id: 'w2', name: 'fikagruppen', count: 5 }]
    });
});

test('a failing count lookup logs and falls back to 0 rather than failing the request', async () => {
    const res = mockRes();
    const logged = [];
    await createWebGroupsRoute({
        memberGroups: {
            getGroups: async () => ({ member: true, isModerator: true, instruments: [], workgroups: [] }),
            listAllGroups: async () => ALL
        },
        arshjulStore: { countsByRole: async () => { throw new Error('corrupt'); } },
        logger: (...a) => logged.push(a.join(' '))
    })(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.instruments[0].count, 0);
    assert.ok(logged.some(l => l.includes('corrupt')));
});
