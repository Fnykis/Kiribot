const test = require('node:test');
const assert = require('node:assert');
const { createPendingConcerts } = require('../../src/features/lineup');

test('pop returns null for unknown user', () => {
    const pc = createPendingConcerts({ ttlMs: 1000 });
    assert.strictEqual(pc.pop('u1'), null);
});

test('set then pop returns the concertId', () => {
    const pc = createPendingConcerts({ ttlMs: 1000, now: () => 0 });
    pc.set('u1', 'concert-A');
    assert.strictEqual(pc.pop('u1'), 'concert-A');
});

test('pop clears the entry (second pop returns null)', () => {
    const pc = createPendingConcerts({ ttlMs: 1000, now: () => 0 });
    pc.set('u1', 'concert-A');
    pc.pop('u1');
    assert.strictEqual(pc.pop('u1'), null);
});

test('pop returns null after ttl expires', () => {
    let t = 0;
    const pc = createPendingConcerts({ ttlMs: 100, now: () => t });
    pc.set('u1', 'concert-A');
    t = 101;
    assert.strictEqual(pc.pop('u1'), null);
});

test('set overwrites previous entry for same user', () => {
    const pc = createPendingConcerts({ ttlMs: 1000, now: () => 0 });
    pc.set('u1', 'concert-A');
    pc.set('u1', 'concert-B');
    assert.strictEqual(pc.pop('u1'), 'concert-B');
});

test('separate users do not collide', () => {
    const pc = createPendingConcerts({ ttlMs: 1000, now: () => 0 });
    pc.set('u1', 'concert-A');
    pc.set('u2', 'concert-B');
    assert.strictEqual(pc.pop('u1'), 'concert-A');
    assert.strictEqual(pc.pop('u2'), 'concert-B');
});

test('default singleton is exported', () => {
    const { pendingConcerts } = require('../../src/features/lineup');
    assert.strictEqual(typeof pendingConcerts.set, 'function');
    assert.strictEqual(typeof pendingConcerts.pop, 'function');
});
