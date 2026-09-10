const test = require('node:test');
const assert = require('node:assert');
const {
    todayInStockholm, hourInStockholm, isRealMonthDay, isLeapYear,
    effectiveMonthDay, dueWindow, isAheadOfToday, msUntilNextSendHour, shouldTickOnStart
} = require('../../src/utils/arshjulDates');

test('todayInStockholm reads the Stockholm calendar day, not UTC', () => {
    // 23:30 UTC on 14 Jan is 00:30 on 15 Jan in Stockholm (CET, +1)
    assert.deepStrictEqual(
        todayInStockholm(new Date('2026-01-14T23:30:00Z')),
        { year: 2026, monthDay: '01-15' }
    );
});

test('todayInStockholm rolls over before UTC midnight in summer', () => {
    // 22:30 UTC on 14 Jun is 00:30 on 15 Jun in Stockholm (CEST, +2)
    assert.deepStrictEqual(
        todayInStockholm(new Date('2026-06-14T22:30:00Z')),
        { year: 2026, monthDay: '06-15' }
    );
});

test('hourInStockholm returns the local hour in 0-23', () => {
    assert.strictEqual(hourInStockholm(new Date('2026-01-15T07:30:00Z')), 8);
    assert.strictEqual(hourInStockholm(new Date('2026-01-15T23:30:00Z')), 0);
});

test('isRealMonthDay accepts real days and rejects impossible ones', () => {
    assert.strictEqual(isRealMonthDay('01-15'), true);
    assert.strictEqual(isRealMonthDay('02-29'), true);
    assert.strictEqual(isRealMonthDay('02-30'), false);
    assert.strictEqual(isRealMonthDay('04-31'), false);
    assert.strictEqual(isRealMonthDay('13-01'), false);
    assert.strictEqual(isRealMonthDay('00-10'), false);
    assert.strictEqual(isRealMonthDay('1-15'), false);
    assert.strictEqual(isRealMonthDay('2026-01-15'), false);
    assert.strictEqual(isRealMonthDay(''), false);
    assert.strictEqual(isRealMonthDay(undefined), false);
});

test('isLeapYear follows the century rule', () => {
    assert.strictEqual(isLeapYear(2024), true);
    assert.strictEqual(isLeapYear(2026), false);
    assert.strictEqual(isLeapYear(1900), false);
    assert.strictEqual(isLeapYear(2000), true);
});

test('effectiveMonthDay maps 02-29 to 02-28 only in non-leap years', () => {
    assert.strictEqual(effectiveMonthDay('02-29', 2026), '02-28');
    assert.strictEqual(effectiveMonthDay('02-29', 2024), '02-29');
    assert.strictEqual(effectiveMonthDay('03-01', 2026), '03-01');
});

test('dueWindow returns today and the preceding days', () => {
    assert.deepStrictEqual(dueWindow(2026, '03-03', 2), ['03-03', '03-02', '03-01']);
});

test('dueWindow crosses a month boundary', () => {
    assert.deepStrictEqual(dueWindow(2026, '03-01', 2), ['03-01', '02-28', '02-27']);
});

test('dueWindow clamps at 1 January so last year does not fire in this one', () => {
    assert.deepStrictEqual(dueWindow(2026, '01-01', 2), ['01-01']);
    assert.deepStrictEqual(dueWindow(2026, '01-02', 2), ['01-02', '01-01']);
});

test('isAheadOfToday compares against the Stockholm day', () => {
    const now = new Date('2026-03-03T09:00:00Z');
    assert.strictEqual(isAheadOfToday('03-04', now), true);
    assert.strictEqual(isAheadOfToday('03-03', now), false);
    assert.strictEqual(isAheadOfToday('03-02', now), false);
});

test('msUntilNextSendHour waits for today when the hour is still ahead', () => {
    // 05:00 Stockholm, send hour 8 => 3 hours
    const now = new Date('2026-01-15T04:00:00Z');
    assert.strictEqual(msUntilNextSendHour(now, 8), 3 * 60 * 60 * 1000);
});

test('msUntilNextSendHour waits for tomorrow once the hour has passed', () => {
    // 08:30 Stockholm, send hour 8 => 23.5 hours
    const now = new Date('2026-01-15T07:30:00Z');
    assert.strictEqual(msUntilNextSendHour(now, 8), 23.5 * 60 * 60 * 1000);
});

test('shouldTickOnStart is true only once the send hour has arrived', () => {
    assert.strictEqual(shouldTickOnStart(new Date('2026-01-15T02:00:00Z'), 8), false); // 03:00
    assert.strictEqual(shouldTickOnStart(new Date('2026-01-15T10:00:00Z'), 8), true);  // 11:00
});
