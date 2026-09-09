const test = require('node:test');
const assert = require('node:assert');
const postArshjulPanel = require('../../src/features/arshjulPanel');

const URL = 'https://kiribot.ollelindberg.se/yearwheel/';

function mockChannel(messages, sent) {
    return {
        messages: { fetch: async () => new Map(messages.map((m, i) => [String(i), m])) },
        send: async (payload) => { sent.push(payload); return { id: 'new' }; }
    };
}

function messageWithUrl(url) {
    return { components: [{ components: [{ data: { url } }] }] };
}

test('posts the panel when the channel has no matching message', async () => {
    const sent = [];
    const client = { channels: { cache: { get: () => mockChannel([], sent) } } };
    const result = await postArshjulPanel({ client, channelId: 'c1', url: URL });
    assert.strictEqual(result, 'created');
    assert.strictEqual(sent.length, 1);
});

test('does not post again when a message with the same url exists', async () => {
    const sent = [];
    const client = { channels: { cache: { get: () => mockChannel([messageWithUrl(URL)], sent) } } };
    const result = await postArshjulPanel({ client, channelId: 'c1', url: URL });
    assert.strictEqual(result, 'exists');
    assert.strictEqual(sent.length, 0);
});

test('posts when the only existing button points somewhere else', async () => {
    const sent = [];
    const client = { channels: { cache: { get: () => mockChannel([messageWithUrl('https://other.example/')], sent) } } };
    assert.strictEqual(await postArshjulPanel({ client, channelId: 'c1', url: URL }), 'created');
});

test('tolerates messages with no components', async () => {
    const sent = [];
    const client = { channels: { cache: { get: () => mockChannel([{ components: [] }, {}], sent) } } };
    assert.strictEqual(await postArshjulPanel({ client, channelId: 'c1', url: URL }), 'created');
});

test('skips and logs when the channel is not found', async () => {
    const logs = [];
    const client = { channels: { cache: { get: () => undefined } } };
    const result = await postArshjulPanel({ client, channelId: 'missing', url: URL, logger: m => logs.push(m) });
    assert.strictEqual(result, 'skipped');
    assert.ok(logs.some(l => /missing/.test(l)), logs.join('\n'));
});
