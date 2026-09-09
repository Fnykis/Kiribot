const test = require('node:test');
const assert = require('node:assert');
const createWebSession = require('../../src/services/webSession');

test('a freshly signed token verifies and returns the user id', () => {
    const s = createWebSession({ secret: 'topsecret' });
    const token = s.sign('123456789012345678');
    assert.deepStrictEqual(s.verify(token), { userId: '123456789012345678' });
});

test('a tampered user id fails verification', () => {
    const s = createWebSession({ secret: 'topsecret' });
    const [, exp, mac] = s.sign('111').split('.');
    assert.strictEqual(s.verify(`999.${exp}.${mac}`), null);
});

test('a tampered expiry fails verification', () => {
    const s = createWebSession({ secret: 'topsecret' });
    const [id, exp, mac] = s.sign('111').split('.');
    assert.strictEqual(s.verify(`${id}.${Number(exp) + 1000}.${mac}`), null);
});

test('a token signed with a different secret fails verification', () => {
    const a = createWebSession({ secret: 'secret-a' });
    const b = createWebSession({ secret: 'secret-b' });
    assert.strictEqual(b.verify(a.sign('111')), null);
});

test('an expired token fails verification', () => {
    let clock = 1_000_000;
    const s = createWebSession({ secret: 'topsecret', ttlMs: 1000, now: () => clock });
    const token = s.sign('111');
    clock += 1001;
    assert.strictEqual(s.verify(token), null);
});

test('a token one millisecond before expiry still verifies', () => {
    let clock = 1_000_000;
    const s = createWebSession({ secret: 'topsecret', ttlMs: 1000, now: () => clock });
    const token = s.sign('111');
    clock += 999;
    assert.deepStrictEqual(s.verify(token), { userId: '111' });
});

test('malformed tokens return null rather than throwing', () => {
    const s = createWebSession({ secret: 'topsecret' });
    for (const bad of [undefined, '', 'a', 'a.b', 'a.b.c.d', 'a.notanumber.c']) {
        assert.strictEqual(s.verify(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
});

test('constructing without a secret throws', () => {
    assert.throws(() => createWebSession({ secret: '' }), /secret/);
});

test('default ttl is 30 days', () => {
    const s = createWebSession({ secret: 'topsecret' });
    assert.strictEqual(s.ttlMs, 30 * 24 * 60 * 60 * 1000);
});
