const test = require('node:test');
const assert = require('node:assert');
const createMemberStatusService = require('../../src/services/memberStatus');

const AKTIV = 'role-aktiv';
const INAKTIV = 'role-inaktiv';
const PM_CHANNEL = 'ch-pm';
const PROFILE_CHANNEL = 'ch-profile';

function fakeMember({ id, nickname = null, username = 'user', roles = [], bot = false }) {
    const roleIds = new Set(roles);
    const calls = [];
    return {
        id,
        nickname,
        user: { id, username, bot },
        roles: {
            cache: { has: roleId => roleIds.has(roleId) },
            add: async roleId => { calls.push(['add', roleId]); roleIds.add(roleId); },
            remove: async roleId => { calls.push(['remove', roleId]); roleIds.delete(roleId); }
        },
        calls
    };
}

function fakeThread() {
    const thread = { added: [], sent: [] };
    thread.members = { add: async id => { thread.added.push(id); } };
    thread.send = async payload => { thread.sent.push(payload); };
    return thread;
}

function fakeClient({ roles = [{ id: AKTIV, name: 'aktiv' }, { id: INAKTIV, name: 'inaktiv' }], threads = [] } = {}) {
    const created = [];
    const pmChannel = {
        id: PM_CHANNEL,
        threads: {
            create: async opts => {
                created.push(opts);
                const next = threads.shift();
                if (next instanceof Error) throw next;
                return next || fakeThread();
            }
        }
    };
    return {
        created,
        channels: { cache: new Map([[PM_CHANNEL, pmChannel]]) },
        guilds: { cache: { get: () => ({ roles: { cache: new Map(roles.map(r => [r.id, r])) } }) } }
    };
}

function service(client, overrides = {}) {
    return createMemberStatusService({
        client,
        guildId: 'g1',
        privateMessagesChannelId: PM_CHANNEL,
        yourProfileChannelId: PROFILE_CHANNEL,
        logActivity: () => {},
        ...overrides
    });
}

test('swaps aktiv for inaktiv on an aktiv member and reports them as changed', async () => {
    const client = fakeClient();
    const member = fakeMember({ id: 'u1', nickname: 'Olle', roles: [AKTIV] });

    const result = await service(client).setMembersInactive({ members: [member], reason: '', moderatorNickname: 'Mod' });

    assert.deepStrictEqual(member.calls, [['add', INAKTIV], ['remove', AKTIV]]);
    assert.deepStrictEqual(result.changed, ['Olle']);
    assert.deepStrictEqual(result.skipped, []);
    assert.strictEqual(result.errors, 0);
});

test('skips a member who is not aktiv without touching their roles or opening a thread', async () => {
    const client = fakeClient();
    const member = fakeMember({ id: 'u1', username: 'redan-inaktiv', roles: [INAKTIV] });

    const result = await service(client).setMembersInactive({ members: [member], reason: '', moderatorNickname: 'Mod' });

    assert.deepStrictEqual(member.calls, []);
    assert.deepStrictEqual(result.changed, []);
    assert.deepStrictEqual(result.skipped, ['redan-inaktiv']);
    assert.strictEqual(client.created.length, 0);
});

test('skips a bot even if it carries the aktiv role', async () => {
    const client = fakeClient();
    const member = fakeMember({ id: 'b1', username: 'Kiribot', roles: [AKTIV], bot: true });

    const result = await service(client).setMembersInactive({ members: [member], reason: '', moderatorNickname: 'Mod' });

    assert.deepStrictEqual(member.calls, []);
    assert.deepStrictEqual(result.skipped, ['Kiribot']);
});

test('opens a private thread per changed member and posts a message pointing to #din-profil', async () => {
    const thread = fakeThread();
    const client = fakeClient({ threads: [thread] });
    const member = fakeMember({ id: 'u1', nickname: 'Olle', roles: [AKTIV] });

    await service(client).setMembersInactive({ members: [member], reason: '', moderatorNickname: 'Mod' });

    assert.strictEqual(client.created.length, 1);
    assert.strictEqual(client.created[0].name, 'Status: Olle');
    assert.strictEqual(client.created[0].type, 12); // ChannelType.PrivateThread
    assert.deepStrictEqual(thread.added, ['u1']);
    assert.strictEqual(thread.sent.length, 1);

    const { content, allowedMentions } = thread.sent[0];
    assert.match(content, /<@u1>/);
    assert.match(content, /\*\*inaktiv\*\*/);
    assert.match(content, /Mod/);
    assert.match(content, new RegExp(`<#${PROFILE_CHANNEL}>`));
    assert.doesNotMatch(content, /Anledning/);
    assert.deepStrictEqual(allowedMentions, { users: ['u1'] });
});

test('includes the reason line only when a reason is given', async () => {
    const thread = fakeThread();
    const client = fakeClient({ threads: [thread] });
    const member = fakeMember({ id: 'u1', nickname: 'Olle', roles: [AKTIV] });

    await service(client).setMembersInactive({ members: [member], reason: '  Har inte svarat på 3 signups  ', moderatorNickname: 'Mod' });

    assert.match(thread.sent[0].content, /\*\*Anledning:\*\* Har inte svarat på 3 signups/);
});

test('keeps the role change, counts the error and continues when a thread cannot be created', async () => {
    const logged = [];
    const secondThread = fakeThread();
    const client = fakeClient({ threads: [new Error('Missing Permissions'), secondThread] });
    const first = fakeMember({ id: 'u1', nickname: 'Olle', roles: [AKTIV] });
    const second = fakeMember({ id: 'u2', nickname: 'Stina', roles: [AKTIV] });

    const result = await service(client, { logActivity: msg => logged.push(msg) })
        .setMembersInactive({ members: [first, second], reason: '', moderatorNickname: 'Mod' });

    assert.deepStrictEqual(first.calls, [['add', INAKTIV], ['remove', AKTIV]]);
    assert.deepStrictEqual(result.changed, ['Olle', 'Stina']);
    assert.strictEqual(result.errors, 1);
    assert.deepStrictEqual(secondThread.added, ['u2']);
    assert.ok(logged.some(msg => /Olle/.test(msg) && /Missing Permissions/.test(msg)));
});

test('formatSummary lists changed members, skipped members and notification errors', () => {
    const { formatSummary } = createMemberStatusService({ client: fakeClient(), guildId: 'g1', privateMessagesChannelId: PM_CHANNEL, yourProfileChannelId: PROFILE_CHANNEL, logActivity: () => {} });

    assert.strictEqual(
        formatSummary({ changed: ['Olle', 'Stina'], skipped: ['Kalle'], errors: 1 }),
        '**Satta som inaktiva (2):** Olle, Stina\n**Hoppade över (redan inaktiv eller bot):** Kalle\n⚠️ 1 medlem kunde inte meddelas i tråd. Kontrollera loggar.'
    );
    assert.strictEqual(
        formatSummary({ changed: [], skipped: ['Kalle'], errors: 0 }),
        '**Satta som inaktiva (0):** –\n**Hoppade över (redan inaktiv eller bot):** Kalle'
    );
});

test('throws when the aktiv or inaktiv role is missing', async () => {
    const client = fakeClient({ roles: [{ id: AKTIV, name: 'aktiv' }] });
    const member = fakeMember({ id: 'u1', roles: [AKTIV] });

    await assert.rejects(
        () => service(client).setMembersInactive({ members: [member], reason: '', moderatorNickname: 'Mod' }),
        /aktiv/
    );
    assert.deepStrictEqual(member.calls, []);
});
