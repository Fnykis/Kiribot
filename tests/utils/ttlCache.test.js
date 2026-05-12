const test = require('node:test');
const assert = require('node:assert');
const createTtlCache = require('../../src/utils/ttlCache');

test('returns undefined for missing key', () => {
    const cache = createTtlCache({ ttlMs: 1000 });
    assert.strictEqual(cache.get('x'), undefined);
});

test('returns stored value within TTL', () => {
    const cache = createTtlCache({ ttlMs: 1000, now: () => 0 });
    cache.set('x', 42);
    assert.strictEqual(cache.get('x'), 42);
});

test('expires after ttl', () => {
    let t = 0;
    const cache = createTtlCache({ ttlMs: 100, now: () => t });
    cache.set('x', 42);
    t = 99;
    assert.strictEqual(cache.get('x'), 42);
    t = 101;
    assert.strictEqual(cache.get('x'), undefined);
});

test('delete removes key', () => {
    const cache = createTtlCache({ ttlMs: 1000 });
    cache.set('x', 42);
    cache.delete('x');
    assert.strictEqual(cache.get('x'), undefined);
});
