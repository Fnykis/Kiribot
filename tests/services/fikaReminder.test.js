const test = require('node:test');
const assert = require('node:assert');

const { findFikaEntry, fikaReminderLeadDays } = require('../../src/services/google/sheets');

function midnight(y, m, d) {
    const date = new Date(y, m - 1, d);
    date.setHours(0, 0, 0, 0);
    return date;
}

test('fikaReminderLeadDays is two days', () => {
    assert.strictEqual(fikaReminderLeadDays, 2);
});

test('findFikaEntry: returns the entry whose date equals the target date', () => {
    const rows = [
        ['2026-09-09', 'FALSE', '', 'Anna'],
        ['2026-09-13', 'TRUE', 'Ta med kaffe', 'Bea', 'Carl'],
        ['2026-09-20', 'FALSE', '', 'Dan'],
    ];
    const entry = findFikaEntry(rows, midnight(2026, 9, 13));
    assert.deepStrictEqual(entry, { storstad: true, extraInfo: 'Ta med kaffe', names: ['Bea', 'Carl'] });
});

test('findFikaEntry: skips rows between today and the target date', () => {
    const rows = [
        ['2026-09-12', 'FALSE', '', 'Anna'],
        ['2026-09-13', 'FALSE', '', 'Bea'],
    ];
    const entry = findFikaEntry(rows, midnight(2026, 9, 13));
    assert.deepStrictEqual(entry, { storstad: false, extraInfo: '', names: ['Bea'] });
});

test('findFikaEntry: returns null when the next upcoming date is not the target', () => {
    const rows = [
        ['2026-09-09', 'FALSE', '', 'Anna'],
        ['2026-09-14', 'FALSE', '', 'Bea'],
    ];
    assert.strictEqual(findFikaEntry(rows, midnight(2026, 9, 13)), null);
});

test('findFikaEntry: stops at the first empty date cell', () => {
    const rows = [
        ['', 'FALSE', '', 'Anna'],
        ['2026-09-13', 'FALSE', '', 'Bea'],
    ];
    assert.strictEqual(findFikaEntry(rows, midnight(2026, 9, 13)), null);
});

test('findFikaEntry: ignores blank name cells and unparseable dates', () => {
    const rows = [
        ['not a date', 'FALSE', '', 'Zed'],
        ['2026-09-13', 'FALSE', '', 'Bea', '', '  ', 'Carl'],
    ];
    const entry = findFikaEntry(rows, midnight(2026, 9, 13));
    assert.deepStrictEqual(entry.names, ['Bea', 'Carl']);
});
