const test = require('node:test');
const assert = require('node:assert');
const createRoleChannelService = require('../../src/services/roleChannel');
const createTtlCache = require('../../src/utils/ttlCache');

function fakeClient({ roles = [], channels = [] } = {}) {
    return {
        guilds: {
            cache: {
                get: () => ({
                    roles: { cache: new Map(roles.map(r => [r.id, r])) },
                    channels: { cache: new Map(channels.map(c => [c.id, c])) }
                })
            }
        }
    };
}

function service(client) {
    return createRoleChannelService({
        client,
        guildId: 'g1',
        categoryIds: ['cat-a', 'cat-b'],
        cache: createTtlCache({ ttlMs: 60_000 })
    });
}

test('finds the channel whose name matches the role name', async () => {
    const client = fakeClient({
        roles: [{ id: 'r1', name: 'tarol' }],
        channels: [{ id: 'c1', name: 'tarol', parentId: 'cat-a' }]
    });
    assert.strictEqual(await service(client).resolveChannelId('r1'), 'c1');
});

test('lowercases the role name and replaces spaces with dashes', async () => {
    const client = fakeClient({
        roles: [{ id: 'r1', name: 'Transport Gruppen' }],
        channels: [{ id: 'c1', name: 'transport-gruppen', parentId: 'cat-b' }]
    });
    assert.strictEqual(await service(client).resolveChannelId('r1'), 'c1');
});

test('ignores a name match outside the two categories', async () => {
    const client = fakeClient({
        roles: [{ id: 'r1', name: 'tarol' }],
        channels: [{ id: 'c1', name: 'tarol', parentId: 'some-other-category' }]
    });
    assert.strictEqual(await service(client).resolveChannelId('r1'), null);
});

test('returns null when the group has no channel', async () => {
    const client = fakeClient({ roles: [{ id: 'r1', name: 'tarol' }], channels: [] });
    assert.strictEqual(await service(client).resolveChannelId('r1'), null);
});

test('returns null for an unknown role', async () => {
    assert.strictEqual(await service(fakeClient()).resolveChannelId('nope'), null);
});

test('caches a null answer instead of re-scanning every call', async () => {
    let lookups = 0;
    const client = {
        guilds: {
            cache: {
                get: () => {
                    lookups++;
                    return { roles: { cache: new Map() }, channels: { cache: new Map() } };
                }
            }
        }
    };
    const svc = service(client);
    await svc.resolveChannelId('r1');
    await svc.resolveChannelId('r1');
    assert.strictEqual(lookups, 1);
});

test('throws when the bot is not in the guild', async () => {
    const client = { guilds: { cache: { get: () => undefined } } };
    await assert.rejects(() => service(client).resolveChannelId('r1'), /Bot not in guild/);
});
