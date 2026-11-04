const test = require('node:test');
const assert = require('node:assert');
const { withoutSignupNotes } = require('../../src/utils/eventResponse');

test('withoutSignupNotes: omits notes in all sections, keeps other fields', () => {
    const event = {
        id: 'c1',
        signups: {
            '1:a': [{ id: 'u1', name: 'A', response: 'nej', note: 'Sjuk' }],
            'tarol': [{ id: 'u2', name: 'B', response: 'ja', note: 'x' }, { id: 'u3', name: 'C', response: 'ja' }]
        },
        lineup: []
    };
    const out = withoutSignupNotes(event);
    assert.deepStrictEqual(out.signups['1:a'], [{ id: 'u1', name: 'A', response: 'nej' }]);
    assert.deepStrictEqual(out.signups.tarol, [
        { id: 'u2', name: 'B', response: 'ja' },
        { id: 'u3', name: 'C', response: 'ja' }
    ]);
    assert.strictEqual(out.id, 'c1');
    assert.deepStrictEqual(out.lineup, []);
});

test('withoutSignupNotes: does not mutate input', () => {
    const event = { signups: { '1:a': [{ id: 'u1', note: 'Sjuk' }] } };
    withoutSignupNotes(event);
    assert.strictEqual(event.signups['1:a'][0].note, 'Sjuk');
});

test('withoutSignupNotes: handles missing signups and non-array sections', () => {
    assert.deepStrictEqual(withoutSignupNotes({ id: 'c1' }), { id: 'c1' });
    const out = withoutSignupNotes({ signups: { a: 'weird', b: null, c: [] } });
    assert.deepStrictEqual(out.signups, { a: 'weird', b: null, c: [] });
});
