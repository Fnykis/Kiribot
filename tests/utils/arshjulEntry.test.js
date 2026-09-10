const test = require('node:test');
const assert = require('node:assert');
const { validateEntryInput, MAX_TITLE_LENGTH, MAX_BODY_LENGTH } = require('../../src/utils/arshjulEntry');

test('accepts a valid entry and returns trimmed values', () => {
    const out = validateEntryInput({ title: '  Boka lokal  ', body: '  Ring dem  ', monthDay: '01-15' });
    assert.deepStrictEqual(out, { ok: true, value: { title: 'Boka lokal', body: 'Ring dem', monthDay: '01-15' } });
});

test('treats a missing body as an empty one', () => {
    const out = validateEntryInput({ title: 'A', monthDay: '01-15' });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.value.body, '');
});

test('rejects an empty or whitespace-only title', () => {
    assert.deepStrictEqual(validateEntryInput({ title: '', monthDay: '01-15' }), { ok: false, field: 'title' });
    assert.deepStrictEqual(validateEntryInput({ title: '   ', monthDay: '01-15' }), { ok: false, field: 'title' });
});

test('rejects a title over the limit but accepts one exactly at it', () => {
    assert.strictEqual(validateEntryInput({ title: 'x'.repeat(MAX_TITLE_LENGTH), monthDay: '01-15' }).ok, true);
    assert.deepStrictEqual(
        validateEntryInput({ title: 'x'.repeat(MAX_TITLE_LENGTH + 1), monthDay: '01-15' }),
        { ok: false, field: 'title' }
    );
});

test('rejects a body over the limit but accepts one exactly at it', () => {
    assert.strictEqual(validateEntryInput({ title: 'A', body: 'x'.repeat(MAX_BODY_LENGTH), monthDay: '01-15' }).ok, true);
    assert.deepStrictEqual(
        validateEntryInput({ title: 'A', body: 'x'.repeat(MAX_BODY_LENGTH + 1), monthDay: '01-15' }),
        { ok: false, field: 'body' }
    );
});

test('rejects an impossible or malformed date', () => {
    assert.deepStrictEqual(validateEntryInput({ title: 'A', monthDay: '02-30' }), { ok: false, field: 'monthDay' });
    assert.deepStrictEqual(validateEntryInput({ title: 'A', monthDay: 'nope' }), { ok: false, field: 'monthDay' });
    assert.deepStrictEqual(validateEntryInput({ title: 'A' }), { ok: false, field: 'monthDay' });
});

test('accepts 29 February', () => {
    assert.strictEqual(validateEntryInput({ title: 'A', monthDay: '02-29' }).ok, true);
});

test('rejects non-string fields and a non-object input', () => {
    assert.deepStrictEqual(validateEntryInput({ title: 5, monthDay: '01-15' }), { ok: false, field: 'title' });
    assert.deepStrictEqual(validateEntryInput({ title: 'A', body: 5, monthDay: '01-15' }), { ok: false, field: 'body' });
    assert.deepStrictEqual(validateEntryInput(undefined), { ok: false, field: 'title' });
});
