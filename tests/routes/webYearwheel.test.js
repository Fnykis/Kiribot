const test = require('node:test');
const assert = require('node:assert');
const createWebYearwheelRoute = require('../../src/routes/api/web/yearwheel');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

function req(roleId, userId = 'u1') {
    return { webUser: { id: userId }, params: { roleId } };
}

const MEMBER_OF_R1 = {
    member: true,
    displayName: 'Olle L',
    isModerator: false,
    instruments: [],
    workgroups: [{ id: 'r1', name: 'transportgruppen' }]
};

function route(groups, entries = []) {
    return createWebYearwheelRoute({
        memberGroups: { getGroups: async () => groups },
        arshjulStore: { listByRole: async () => entries }
    });
}

test('403 not_in_guild when the caller is not in the server', async () => {
    const res = mockRes();
    await route({ member: false })(req('r1'), res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'not_in_guild' });
});

test('403 missing_role when the caller does not hold that role', async () => {
    const res = mockRes();
    await route(MEMBER_OF_R1)(req('r-other'), res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'missing_role' });
});

test('200 with the entries when the caller holds the role', async () => {
    const entries = [{ id: 'e1', roleId: 'r1', monthDay: '01-15', title: 'Boka lokal', fields: {}, version: 1, sentYears: [] }];
    const res = mockRes();
    await route(MEMBER_OF_R1, entries)(req('r1'), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.role.id, 'r1');
    assert.strictEqual(res.body.role.name, 'transportgruppen');
    assert.deepStrictEqual(res.body.entries, entries);
});

test('an instrument role is accepted the same way as a workgroup role', async () => {
    const groups = { member: true, displayName: 'O', isModerator: false, instruments: [{ id: 'i1', name: 'tarol' }], workgroups: [] };
    const res = mockRes();
    await route(groups)(req('i1'), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.role.name, 'tarol');
});

test('a moderator may read a wheel for a role they do not hold', async () => {
    const groups = { member: true, displayName: 'Mod', isModerator: true, instruments: [], workgroups: [] };
    const res = mockRes();
    await route(groups)(req('r-any'), res);
    assert.strictEqual(res.statusCode, 200);
});

test('403 missing_role for an unknown role id', async () => {
    const res = mockRes();
    await route(MEMBER_OF_R1)(req('does-not-exist'), res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'missing_role' });
});

test('403 missing_role when roleId is absent', async () => {
    const res = mockRes();
    await route(MEMBER_OF_R1)({ webUser: { id: 'u1' }, params: {} }, res);
    assert.strictEqual(res.statusCode, 403);
});

test('500 when the store fails', async () => {
    const handler = createWebYearwheelRoute({
        memberGroups: { getGroups: async () => MEMBER_OF_R1 },
        arshjulStore: { listByRole: async () => { throw new Error('arshjul_file_corrupt'); } }
    });
    const res = mockRes();
    await handler(req('r1'), res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'internal' });
});

test('403 not_in_guild is checked before the moderator fallback, even for a moderator', async () => {
    const res = mockRes();
    await route({ member: false, isModerator: true })(req('r-any'), res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'not_in_guild' });
});

test('calls getGroups with the caller id and listByRole with the requested roleId', async () => {
    const getGroupsCalls = [];
    const listByRoleCalls = [];
    const handler = createWebYearwheelRoute({
        memberGroups: {
            getGroups: async (userId) => {
                getGroupsCalls.push(userId);
                return MEMBER_OF_R1;
            }
        },
        arshjulStore: {
            listByRole: async (roleId) => {
                listByRoleCalls.push(roleId);
                return [];
            }
        }
    });
    const res = mockRes();
    await handler(req('r1', 'the-caller'), res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(getGroupsCalls, ['the-caller']);
    assert.deepStrictEqual(listByRoleCalls, ['r1']);
});

test('500 when getGroups resolves a malformed shape (missing instruments/workgroups)', async () => {
    const handler = createWebYearwheelRoute({
        memberGroups: { getGroups: async () => ({ member: true, isModerator: false }) },
        arshjulStore: { listByRole: async () => [] }
    });
    const res = mockRes();
    await handler(req('r1'), res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'internal' });
});
