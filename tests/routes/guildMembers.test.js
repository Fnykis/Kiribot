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

function makeClient(members) {
    return {
        guilds: {
            cache: {
                get: () => ({
                    members: {
                        async fetch() {
                            return {
                                values: () => members
                            };
                        }
                    },
                    roles: { /* unused */ }
                })
            }
        }
    };
}

function member(id, name, roleIds = []) {
    return {
        id, displayName: name,
        roles: { cache: { has: (r) => roleIds.includes(r) } }
    };
}

test('returns max 25 results filtered by q (case-insensitive)', async () => {
    const all = [];
    for (let i = 0; i < 40; i++) all.push(member(`u${i}`, `Anna${i}`));
    all.push(member('zz', 'Zelda'));
    const handler = createGuildMembersRoute({
        client: makeClient(all), guildId: 'g', harmonianRoleId: 'role-h'
    });
    const res = mockRes();
    await handler({ query: { q: 'anna' } }, res);
    assert.strictEqual(res.body.length, 25);
    for (const m of res.body) assert.match(m.displayName, /^Anna/);
});

test('hasHarmonian reflects role membership', async () => {
    const handler = createGuildMembersRoute({
        client: makeClient([
            member('a', 'Alice', ['role-h']),
            member('b', 'Bob')
        ]),
        guildId: 'g', harmonianRoleId: 'role-h'
    });
    const res = mockRes();
    await handler({ query: { q: '' } }, res);
    const byId = Object.fromEntries(res.body.map(m => [m.id, m]));
    assert.strictEqual(byId.a.hasHarmonian, true);
    assert.strictEqual(byId.b.hasHarmonian, false);
});

test('no q returns up to 25', async () => {
    const all = [];
    for (let i = 0; i < 30; i++) all.push(member(`u${i}`, `Person${i}`));
    const handler = createGuildMembersRoute({
        client: makeClient(all), guildId: 'g', harmonianRoleId: 'role-h'
    });
    const res = mockRes();
    await handler({ query: {} }, res);
    assert.strictEqual(res.body.length, 25);
});

test('returns 500 on fetch failure', async () => {
    const client = { guilds: { cache: { get: () => ({ members: { fetch: () => { throw new Error('boom'); } } }) } } };
    const handler = createGuildMembersRoute({
        client, guildId: 'g', harmonianRoleId: 'role-h'
    });
    const res = mockRes();
    await handler({ query: { q: 'x' } }, res);
    assert.strictEqual(res.statusCode, 500);
});
