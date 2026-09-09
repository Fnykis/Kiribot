const test = require('node:test');
const assert = require('node:assert');
const createMemberGroupsService = require('../../src/services/memberGroups');

const HEX_INSTR = '#e91e63';
const HEX_ARBET = '#f1c40f';

function role(id, name, hexColor) {
    return { id, name, hexColor };
}

// Builds a client whose guild has the given roles on the member.
function mockClient(memberRoles, { displayName = 'Test T', found = true } = {}) {
    const cache = new Map(memberRoles.map(r => [r.id, r]));
    return {
        guilds: {
            cache: {
                get: () => ({
                    members: {
                        fetch: async () => {
                            if (!found) { const e = new Error('Unknown Member'); e.code = 10007; throw e; }
                            return { id: 'u1', displayName, roles: { cache } };
                        }
                    }
                })
            }
        }
    };
}

function noCache() {
    return { get: () => undefined, set: () => {} };
}

function service(client) {
    return createMemberGroupsService({
        client,
        guildId: 'g1',
        hexInstr: HEX_INSTR,
        hexArbet: HEX_ARBET,
        moderatorRoleId: 'mod',
        cache: noCache()
    });
}

test('returns member:false for someone not in the guild', async () => {
    const svc = service(mockClient([], { found: false }));
    assert.deepStrictEqual(await svc.getGroups('u1'), { member: false });
});

test('splits roles into instruments and workgroups by colour', async () => {
    const svc = service(mockClient([
        role('r1', 'tarol', HEX_INSTR),
        role('r2', 'transportgruppen', HEX_ARBET),
        role('r3', 'aktiv', '#000000')
    ]));
    const out = await svc.getGroups('u1');
    assert.strictEqual(out.member, true);
    assert.deepStrictEqual(out.instruments, [{ id: 'r1', name: 'tarol' }]);
    assert.deepStrictEqual(out.workgroups, [{ id: 'r2', name: 'transportgruppen' }]);
});

test('returns every group when a member holds several of each', async () => {
    const svc = service(mockClient([
        role('r1', 'tarol', HEX_INSTR),
        role('r2', 'timbal', HEX_INSTR),
        role('r3', 'transportgruppen', HEX_ARBET),
        role('r4', 'fikagruppen', HEX_ARBET)
    ]));
    const out = await svc.getGroups('u1');
    assert.strictEqual(out.instruments.length, 2);
    assert.strictEqual(out.workgroups.length, 2);
});

test('sorts groups by name', async () => {
    const svc = service(mockClient([
        role('r2', 'transportgruppen', HEX_ARBET),
        role('r1', 'fikagruppen', HEX_ARBET)
    ]));
    const out = await svc.getGroups('u1');
    assert.deepStrictEqual(out.workgroups.map(w => w.name), ['fikagruppen', 'transportgruppen']);
});

test('a member with no group roles gets empty arrays, not member:false', async () => {
    const svc = service(mockClient([role('r3', 'aktiv', '#000000')]));
    const out = await svc.getGroups('u1');
    assert.deepStrictEqual(out.instruments, []);
    assert.deepStrictEqual(out.workgroups, []);
    assert.strictEqual(out.member, true);
});

test('reports moderator status', async () => {
    const svc = service(mockClient([role('mod', 'moderator', '#111111')]));
    assert.strictEqual((await svc.getGroups('u1')).isModerator, true);
});

test('caches the result for the user id', async () => {
    let fetches = 0;
    const store = new Map();
    const client = {
        guilds: {
            cache: {
                get: () => ({
                    members: {
                        fetch: async () => { fetches++; return { id: 'u1', displayName: 'T', roles: { cache: new Map() } }; }
                    }
                })
            }
        }
    };
    const svc = createMemberGroupsService({
        client, guildId: 'g1', hexInstr: HEX_INSTR, hexArbet: HEX_ARBET, moderatorRoleId: 'mod',
        cache: { get: k => store.get(k), set: (k, v) => store.set(k, v) }
    });
    await svc.getGroups('u1');
    await svc.getGroups('u1');
    assert.strictEqual(fetches, 1);
});

test('throws when the bot is not in the guild', async () => {
    const client = { guilds: { cache: { get: () => undefined } } };
    const svc = service(client);
    await assert.rejects(() => svc.getGroups('u1'), /not in guild/i);
});
