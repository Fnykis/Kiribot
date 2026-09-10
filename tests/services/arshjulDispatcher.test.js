const test = require('node:test');
const assert = require('node:assert');
const createArshjulDispatcher = require('../../src/services/arshjulDispatcher');

function fakeChannel(id, sends) {
    return {
        id,
        send: async payload => {
            sends.push({ channelId: id, payload });
            return {
                startThread: async opts => { sends[sends.length - 1].thread = opts; }
            };
        }
    };
}

function harness({ entries, live = true, nowIso = '2026-03-03T09:00:00Z', channelId = 'c1', testChannelId = 'bot-test' }) {
    const sends = [];
    const marked = [];
    const logs = [];
    const dispatcher = createArshjulDispatcher({
        client: { channels: { fetch: async id => fakeChannel(id, sends) } },
        store: {
            listAll: async () => entries.map(e => ({ ...e })),
            markSent: async (id, year) => { marked.push([id, year]); }
        },
        resolveChannelId: async () => channelId,
        testChannelId,
        isLive: () => live,
        sendHour: 8,
        logger: (...args) => logs.push(args.join(' ')),
        now: () => new Date(nowIso),
        sleep: async () => {}
    });
    return { dispatcher, sends, marked, logs };
}

const ENTRY = {
    id: 'e1', roleId: 'r1', channelId: 'c1', monthDay: '03-03',
    title: 'Boka lokal', body: 'Ring dem', version: 1, sentYears: []
};

test('posts to the role channel, mentions the role and opens a thread', async () => {
    const h = harness({ entries: [ENTRY] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 1);
    assert.strictEqual(h.sends[0].channelId, 'c1');
    assert.strictEqual(h.sends[0].payload.content, '<@&r1>\nRing dem');
    assert.deepStrictEqual(h.sends[0].payload.allowedMentions, { parse: [], roles: ['r1'] });
    assert.deepStrictEqual(h.sends[0].thread, { name: 'Boka lokal' });
});

test('marks the year as sent', async () => {
    const h = harness({ entries: [ENTRY] });
    await h.dispatcher.tick();
    assert.deepStrictEqual(h.marked, [['e1', 2026]]);
});

test('sends the mention alone when the body is empty', async () => {
    const h = harness({ entries: [{ ...ENTRY, body: '' }] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends[0].payload.content, '<@&r1>');
});

test('skips an entry already sent this year', async () => {
    const h = harness({ entries: [{ ...ENTRY, sentYears: [2026] }] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 0);
});

test('sends again in a new year', async () => {
    const h = harness({ entries: [{ ...ENTRY, sentYears: [2025] }] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 1);
    assert.deepStrictEqual(h.marked, [['e1', 2026]]);
});

test('catches up an entry up to two days late', async () => {
    const h = harness({ entries: [{ ...ENTRY, monthDay: '03-01' }] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 1);
});

test('skips an entry three days late and logs it once', async () => {
    const h = harness({ entries: [{ ...ENTRY, monthDay: '02-28' }] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 0);
    assert.ok(h.logs.some(l => l.includes('missed')), `expected a missed log in ${JSON.stringify(h.logs)}`);
});

test('does not send an entry dated in the future', async () => {
    const h = harness({ entries: [{ ...ENTRY, monthDay: '12-24' }] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 0);
});

test('29 February fires on 28 February in a non-leap year', async () => {
    const h = harness({ entries: [{ ...ENTRY, monthDay: '02-29' }], nowIso: '2026-02-28T09:00:00Z' });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 1);
});

test('29 February fires on its own day in a leap year', async () => {
    const h = harness({ entries: [{ ...ENTRY, monthDay: '02-29' }], nowIso: '2024-02-29T09:00:00Z' });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends.length, 1);
    assert.deepStrictEqual(h.marked, [['e1', 2024]]);
});

test('a second tick the same day sends nothing new', async () => {
    // sentYears must be cloned, not shared with ENTRY: markSent below pushes into it,
    // and the shared array constant `ENTRY` feeds every other test in this file.
    const entries = [{ ...ENTRY, sentYears: [...ENTRY.sentYears] }];
    const sends = [];
    const dispatcher = createArshjulDispatcher({
        client: { channels: { fetch: async id => fakeChannel(id, sends) } },
        store: {
            listAll: async () => entries.map(e => ({ ...e })),
            markSent: async (id, year) => {
                const target = entries.find(e => e.id === id);
                if (!target.sentYears.includes(year)) target.sentYears.push(year);
            }
        },
        resolveChannelId: async () => 'c1',
        testChannelId: 'bot-test',
        isLive: () => true,
        sendHour: 8,
        logger: () => {},
        now: () => new Date('2026-03-03T09:00:00Z'),
        sleep: async () => {}
    });
    await dispatcher.tick();
    await dispatcher.tick();
    assert.strictEqual(sends.length, 1);
});

test('test mode posts to the bot-test channel, strips the mention and names the real target', async () => {
    const h = harness({ entries: [ENTRY], live: false });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends[0].channelId, 'bot-test');
    assert.strictEqual(h.sends[0].payload.content, '[TEST → <#c1>]\nRing dem');
    assert.deepStrictEqual(h.sends[0].payload.allowedMentions, { parse: [], roles: [] });
    assert.deepStrictEqual(h.sends[0].thread, { name: 'Boka lokal' });
});

test('test mode still marks the year, so nothing re-fires on go-live', async () => {
    const h = harness({ entries: [ENTRY], live: false });
    await h.dispatcher.tick();
    assert.deepStrictEqual(h.marked, [['e1', 2026]]);
});

test('an entry with no resolvable channel is skipped in both modes and not marked', async () => {
    for (const live of [true, false]) {
        const h = harness({ entries: [{ ...ENTRY, channelId: null }], channelId: null, live });
        await h.dispatcher.tick();
        assert.strictEqual(h.sends.length, 0);
        assert.deepStrictEqual(h.marked, []);
        assert.ok(h.logs.some(l => l.includes('no channel')));
    }
});

test('falls back to name resolution when the stored channel id is gone', async () => {
    const sends = [];
    const dispatcher = createArshjulDispatcher({
        client: {
            channels: {
                fetch: async id => {
                    if (id === 'stale') throw new Error('Unknown Channel');
                    return fakeChannel(id, sends);
                }
            }
        },
        store: { listAll: async () => [{ ...ENTRY, channelId: 'stale' }], markSent: async () => {} },
        resolveChannelId: async () => 'fresh',
        testChannelId: 'bot-test',
        isLive: () => true,
        sendHour: 8,
        logger: () => {},
        now: () => new Date('2026-03-03T09:00:00Z'),
        sleep: async () => {}
    });
    await dispatcher.tick();
    assert.strictEqual(sends.length, 1);
    assert.strictEqual(sends[0].channelId, 'fresh');
});

test('one entry failing to send does not stop the others', async () => {
    const sends = [];
    const marked = [];
    const dispatcher = createArshjulDispatcher({
        client: {
            channels: {
                fetch: async id => {
                    if (id === 'boom') throw new Error('Missing Permissions');
                    return fakeChannel(id, sends);
                }
            }
        },
        store: {
            listAll: async () => [
                { ...ENTRY, id: 'bad', channelId: 'boom' },
                { ...ENTRY, id: 'good', channelId: 'c1' }
            ],
            markSent: async (id, year) => { marked.push([id, year]); }
        },
        resolveChannelId: async () => null,
        testChannelId: 'bot-test',
        isLive: () => true,
        sendHour: 8,
        logger: () => {},
        now: () => new Date('2026-03-03T09:00:00Z'),
        sleep: async () => {}
    });
    await dispatcher.tick();
    assert.strictEqual(sends.length, 1);
    assert.deepStrictEqual(marked, [['good', 2026]]);
});

test('a title at the Discord limit is used unchanged', async () => {
    const title = 'x'.repeat(100);
    const h = harness({ entries: [{ ...ENTRY, title }] });
    await h.dispatcher.tick();
    assert.strictEqual(h.sends[0].thread.name, title);
    assert.strictEqual(h.sends[0].thread.name.length, 100);
});

test('two concurrent tick() calls send only once (check-then-act race guard)', async () => {
    const h = harness({ entries: [ENTRY] });
    // Fire both without awaiting the first — reproduces a manual tick() landing
    // while a scheduled one is still mid-flight (or a doubled start()).
    const p1 = h.dispatcher.tick();
    const p2 = h.dispatcher.tick();
    await Promise.all([p1, p2]);
    assert.strictEqual(h.sends.length, 1);
    assert.deepStrictEqual(h.marked, [['e1', 2026]]);
});

test('tick() runs again once the in-flight one has finished', async () => {
    // Proves the in-flight guard releases after completion instead of wedging tick()
    // shut forever: two sequential (awaited, non-overlapping) calls must each do a
    // fresh store.listAll() read, not silently reuse the first call's settled promise.
    let listAllCalls = 0;
    const dispatcher = createArshjulDispatcher({
        client: { channels: { fetch: async id => fakeChannel(id, []) } },
        store: {
            listAll: async () => { listAllCalls++; return []; },
            markSent: async () => {}
        },
        resolveChannelId: async () => null,
        testChannelId: 'bot-test',
        isLive: () => true,
        sendHour: 8,
        logger: () => {},
        now: () => new Date('2026-03-03T09:00:00Z'),
        sleep: async () => {}
    });
    await dispatcher.tick();
    await dispatcher.tick();
    assert.strictEqual(listAllCalls, 2);
});

test('start() called twice does not spin up a second timer chain', () => {
    const originalSetTimeout = global.setTimeout;
    let calls = 0;
    global.setTimeout = (fn, ms) => {
        calls++;
        return originalSetTimeout(() => {}, 0);
    };
    try {
        const dispatcher = createArshjulDispatcher({
            client: { channels: { fetch: async () => null } },
            store: { listAll: async () => [], markSent: async () => {} },
            resolveChannelId: async () => null,
            testChannelId: 'bot-test',
            isLive: () => true,
            sendHour: 8,
            logger: () => {},
            now: () => new Date('2026-03-03T09:00:00Z'),
            sleep: async () => {}
        });
        dispatcher.start();
        dispatcher.start();
        assert.strictEqual(calls, 1);
        dispatcher.stop();
    } finally {
        global.setTimeout = originalSetTimeout;
    }
});

test('stop() then start() again is allowed to spin up one fresh timer', () => {
    const originalSetTimeout = global.setTimeout;
    let calls = 0;
    global.setTimeout = (fn, ms) => {
        calls++;
        return originalSetTimeout(() => {}, 0);
    };
    try {
        const dispatcher = createArshjulDispatcher({
            client: { channels: { fetch: async () => null } },
            store: { listAll: async () => [], markSent: async () => {} },
            resolveChannelId: async () => null,
            testChannelId: 'bot-test',
            isLive: () => true,
            sendHour: 8,
            logger: () => {},
            now: () => new Date('2026-03-03T09:00:00Z'),
            sleep: async () => {}
        });
        dispatcher.start();
        dispatcher.stop();
        dispatcher.start();
        assert.strictEqual(calls, 2);
        dispatcher.stop();
    } finally {
        global.setTimeout = originalSetTimeout;
    }
});
