const test = require('node:test');
const assert = require('node:assert');
const {
    createWebYearwheelCreateRoute,
    createWebYearwheelUpdateRoute,
    createWebYearwheelDeleteRoute
} = require('../../src/routes/api/web/yearwheelWrite');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        ended: false,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
        end() { this.ended = true; return this; }
    };
}

const MEMBER_OF_R1 = {
    member: true, displayName: 'Olle L', isModerator: false,
    instruments: [], workgroups: [{ id: 'r1', name: 'transportgruppen' }]
};
const MODERATOR = { member: true, displayName: 'Mod', isModerator: true, instruments: [], workgroups: [] };

const ENTRY = {
    id: 'e1', roleId: 'r1', channelId: 'c1', monthDay: '01-15',
    title: 'A', body: 'b', version: 1, createdBy: 'u1', updatedBy: 'u1',
    updatedAt: '2026-09-10T10:00:00.000Z', sentYears: []
};

function stores(overrides = {}) {
    return {
        getEntry: async id => (id === 'e1' ? { ...ENTRY } : null),
        create: async (roleId, opts) => ({ ...ENTRY, roleId, ...opts, id: 'new-id' }),
        update: async (id, opts) => ({ ...ENTRY, ...opts, id, version: 2 }),
        remove: async () => undefined,
        ...overrides
    };
}

function createRoute(groups, store = stores(), channelId = 'c1') {
    return createWebYearwheelCreateRoute({
        memberGroups: { getGroups: async () => groups },
        arshjulStore: store,
        resolveChannelId: async () => channelId
    });
}

function updateRoute(groups, store = stores()) {
    return createWebYearwheelUpdateRoute({
        memberGroups: { getGroups: async () => groups },
        arshjulStore: store
    });
}

function deleteRoute(groups, store = stores()) {
    return createWebYearwheelDeleteRoute({
        memberGroups: { getGroups: async () => groups },
        arshjulStore: store
    });
}

const postReq = (body, roleId = 'r1') => ({ webUser: { id: 'u1' }, params: { roleId }, body });
const entryReq = (body, id = 'e1') => ({ webUser: { id: 'u1' }, params: { id }, body });

// --- create ---

test('creates an entry and returns 201', async () => {
    const res = mockRes();
    await createRoute(MEMBER_OF_R1)(postReq({ title: 'Boka lokal', body: 'Ring', monthDay: '01-15' }), res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.title, 'Boka lokal');
    assert.strictEqual(res.body.id, 'new-id');
});

test('stores the resolved channel id on create', async () => {
    const calls = [];
    const store = stores({ create: async (roleId, opts) => { calls.push(opts); return { ...ENTRY, id: 'new-id' }; } });
    const res = mockRes();
    await createRoute(MEMBER_OF_R1, store, 'chan-1')(postReq({ title: 'A', monthDay: '01-15' }), res);
    assert.strictEqual(calls[0].channelId, 'chan-1');
    assert.strictEqual(calls[0].userId, 'u1');
});

test('a group with no channel still saves, with channelId null', async () => {
    const calls = [];
    const store = stores({ create: async (roleId, opts) => { calls.push(opts); return { ...ENTRY, id: 'new-id' }; } });
    const res = mockRes();
    await createRoute(MEMBER_OF_R1, store, null)(postReq({ title: 'A', monthDay: '01-15' }), res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(calls[0].channelId, null);
});

test('403 missing_role when creating on a wheel the caller does not hold', async () => {
    const res = mockRes();
    await createRoute(MEMBER_OF_R1)(postReq({ title: 'A', monthDay: '01-15' }, 'r-other'), res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'missing_role' });
});

test('403 not_in_guild when creating as a non-member', async () => {
    const res = mockRes();
    await createRoute({ member: false })(postReq({ title: 'A', monthDay: '01-15' }), res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'not_in_guild' });
});

test('a moderator may create on a wheel they do not hold', async () => {
    const res = mockRes();
    await createRoute(MODERATOR)(postReq({ title: 'A', monthDay: '01-15' }, 'r-any'), res);
    assert.strictEqual(res.statusCode, 201);
});

test('400 invalid_input names the offending field', async () => {
    const res = mockRes();
    await createRoute(MEMBER_OF_R1)(postReq({ title: 'A', monthDay: '02-30' }), res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'invalid_input', field: 'monthDay' });

    const res2 = mockRes();
    await createRoute(MEMBER_OF_R1)(postReq({ title: '', monthDay: '01-15' }), res2);
    assert.deepStrictEqual(res2.body, { error: 'invalid_input', field: 'title' });
});

test('validation runs after the permission gate, so a stranger learns nothing from it', async () => {
    const res = mockRes();
    await createRoute(MEMBER_OF_R1)(postReq({ title: '', monthDay: 'nope' }, 'r-other'), res);
    assert.strictEqual(res.statusCode, 403);
});

// --- update ---

test('updates an entry and returns it', async () => {
    const res = mockRes();
    await updateRoute(MEMBER_OF_R1)(entryReq({ title: 'B', body: 'c', monthDay: '02-01', version: 1 }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.title, 'B');
    assert.strictEqual(res.body.version, 2);
});

test('404 not_found for an unknown entry, before the permission gate', async () => {
    const res = mockRes();
    await updateRoute(MEMBER_OF_R1)(entryReq({ title: 'B', monthDay: '02-01', version: 1 }, 'nope'), res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { error: 'not_found' });
});

test('403 missing_role when updating an entry on a foreign wheel', async () => {
    const other = {
        member: true, displayName: 'X', isModerator: false,
        instruments: [], workgroups: [{ id: 'r-other', name: 'annan' }]
    };
    const res = mockRes();
    await updateRoute(other)(entryReq({ title: 'B', monthDay: '02-01', version: 1 }), res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'missing_role' });
});

test('409 version_conflict returns the current entry so the page can reload it', async () => {
    const store = stores({ update: async () => { throw new Error('version_conflict'); } });
    const res = mockRes();
    await updateRoute(MEMBER_OF_R1, store)(entryReq({ title: 'B', monthDay: '02-01', version: 1 }), res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error, 'version_conflict');
    assert.strictEqual(res.body.entry.id, 'e1');
});

test('400 invalid_input when the version is missing or not a number', async () => {
    const res = mockRes();
    await updateRoute(MEMBER_OF_R1)(entryReq({ title: 'B', monthDay: '02-01' }), res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: 'invalid_input', field: 'version' });
});

// --- delete ---

test('deletes an entry and returns 204', async () => {
    const res = mockRes();
    await deleteRoute(MEMBER_OF_R1)(entryReq({ version: 1 }), res);
    assert.strictEqual(res.statusCode, 204);
    assert.strictEqual(res.ended, true);
});

test('403 missing_role when deleting an entry on a foreign wheel', async () => {
    const other = {
        member: true, displayName: 'X', isModerator: false,
        instruments: [], workgroups: [{ id: 'r-other', name: 'annan' }]
    };
    const res = mockRes();
    await deleteRoute(other)(entryReq({ version: 1 }), res);
    assert.strictEqual(res.statusCode, 403);
});

test('409 version_conflict when deleting with a stale version', async () => {
    const store = stores({ remove: async () => { throw new Error('version_conflict'); } });
    const res = mockRes();
    await deleteRoute(MEMBER_OF_R1, store)(entryReq({ version: 1 }), res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.entry.id, 'e1');
});

test('a moderator may delete an entry on a wheel they do not hold', async () => {
    const res = mockRes();
    await deleteRoute(MODERATOR)(entryReq({ version: 1 }), res);
    assert.strictEqual(res.statusCode, 204);
});

test('500 when the store fails for an unexpected reason', async () => {
    const store = stores({ update: async () => { throw new Error('arshjul_file_corrupt'); } });
    const res = mockRes();
    await updateRoute(MEMBER_OF_R1, store)(entryReq({ title: 'B', monthDay: '02-01', version: 1 }), res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'internal' });
});
