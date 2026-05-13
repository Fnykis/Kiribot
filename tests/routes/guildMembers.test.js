const test = require('node:test');
const assert = require('node:assert');
const createGuildMembersRoute = require('../../src/routes/api/guildMembers');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

function makeMembersFetch(members) {
    return async () => new Map(members.map(m => [m.id, m]));
}

function makeClient(membersFetch) {
    return {
        guilds: {
            cache: {
                get() {
                    return { members: { fetch: membersFetch } };
                }
            }
        }
    };
}

test('returns members from a fresh fetch', async () => {
    const fetch = makeMembersFetch([
        { id: 'u1', displayName: 'Andrea' },
        { id: 'u2', displayName: 'Orietta' }
    ]);
    const handler = createGuildMembersRoute({ client: makeClient(fetch), guildId: 'g', ttlMs: 60_000 });

    const res = mockRes();
    await handler({}, res);

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, {
        members: [
            { id: 'u1', displayName: 'Andrea' },
            { id: 'u2', displayName: 'Orietta' }
        ]
    });
});

test('serves from cache within ttl (fetch called once across two requests)', async () => {
    let calls = 0;
    const fetch = async () => {
        calls += 1;
        return new Map([['u1', { id: 'u1', displayName: 'Andrea' }]]);
    };
    let t = 1000;
    const handler = createGuildMembersRoute({
        client: makeClient(fetch),
        guildId: 'g',
        ttlMs: 60_000,
        now: () => t
    });

    await handler({}, mockRes());
    t = 5000;
    await handler({}, mockRes());

    assert.strictEqual(calls, 1);
});

test('refetches after ttl expiry', async () => {
    let calls = 0;
    const fetch = async () => {
        calls += 1;
        return new Map([['u1', { id: 'u1', displayName: 'Andrea' }]]);
    };
    let t = 1000;
    const handler = createGuildMembersRoute({
        client: makeClient(fetch),
        guildId: 'g',
        ttlMs: 100,
        now: () => t
    });

    await handler({}, mockRes());
    t = 1200;
    await handler({}, mockRes());

    assert.strictEqual(calls, 2);
});

test('returns 500 guild_fetch_failed on fetch error', async () => {
    const fetch = async () => { throw new Error('discord down'); };
    const handler = createGuildMembersRoute({ client: makeClient(fetch), guildId: 'g', ttlMs: 60_000 });

    const res = mockRes();
    await handler({}, res);

    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'guild_fetch_failed' });
});
