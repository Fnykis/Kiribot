const test = require('node:test');
const assert = require('node:assert');
const { mergeRoster } = require('../../src/features/lineup');

const eventJson = {
    name: '[SOC] Demo',
    id: 'c1',
    signups: {
        '1:a': [
            { name: 'Andrea W', id: 'u1', response: 'kanske', note: '' },
            { name: 'Orietta R', id: 'u2', response: 'ja', note: '' },
            { name: 'Linnéa F', id: 'u3', response: 'nej', note: '' }
        ],
        '2:a': [
            { name: 'Orietta R', id: 'u2', response: 'ja', note: '' }
        ]
    }
};

test('filters out nej and unknown responses', () => {
    const out = mergeRoster(eventJson, { participants: {} });
    const ids = out.map(p => p.userId);
    assert.ok(!ids.includes('u3'), 'u3 (nej) must be excluded');
});

test('includes both ja and kanske', () => {
    const out = mergeRoster(eventJson, { participants: {} });
    assert.strictEqual(out.find(p => p.userId === 'u1').response, 'kanske');
    assert.strictEqual(out.find(p => p.userId === 'u2' && p.instrument === '1:a').response, 'ja');
});

test('produces one entry per (user, instrument) pair', () => {
    const out = mergeRoster(eventJson, { participants: {} });
    const u2Entries = out.filter(p => p.userId === 'u2');
    assert.strictEqual(u2Entries.length, 2);
    assert.deepStrictEqual(u2Entries.map(p => p.instrument).sort(), ['1:a', '2:a']);
});

test('unplaced participants default to placed:false / null coords', () => {
    const out = mergeRoster(eventJson, { participants: {} });
    out.forEach(p => {
        assert.strictEqual(p.placed, false);
        assert.strictEqual(p.x, null);
        assert.strictEqual(p.y, null);
    });
});

test('merges saved placement onto matching userId', () => {
    const saved = { participants: { u2: { placed: true, x: 100, y: 50 } } };
    const out = mergeRoster(eventJson, saved);
    const placedEntries = out.filter(p => p.userId === 'u2');
    placedEntries.forEach(p => {
        assert.strictEqual(p.placed, true);
        assert.strictEqual(p.x, 100);
        assert.strictEqual(p.y, 50);
    });
});

test('handles empty signups object', () => {
    assert.deepStrictEqual(mergeRoster({ signups: {} }, { participants: {} }), []);
});

test('shape exposes displayName from signup.name', () => {
    const out = mergeRoster(eventJson, { participants: {} });
    assert.strictEqual(out.find(p => p.userId === 'u1').displayName, 'Andrea W');
});
