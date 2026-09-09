const test = require('node:test');
const assert = require('node:assert');
const { parseCookies, serializeCookie } = require('../../src/utils/cookies');

test('parses a single cookie', () => {
    assert.deepStrictEqual(parseCookies('kiribot_session=abc'), { kiribot_session: 'abc' });
});

test('parses several cookies and trims whitespace', () => {
    assert.deepStrictEqual(
        parseCookies('a=1; kiribot_session=abc.def; b=2'),
        { a: '1', kiribot_session: 'abc.def', b: '2' }
    );
});

test('returns an empty object for a missing or empty header', () => {
    assert.deepStrictEqual(parseCookies(undefined), {});
    assert.deepStrictEqual(parseCookies(''), {});
});

test('decodes percent-encoded values', () => {
    assert.deepStrictEqual(parseCookies('x=a%20b'), { x: 'a b' });
});

test('ignores malformed pairs without a name', () => {
    assert.deepStrictEqual(parseCookies('=nope; ok=1'), { ok: '1' });
});

test('serializes with the fixed security attributes', () => {
    const out = serializeCookie('kiribot_session', 'tok', { maxAge: 60 });
    assert.strictEqual(out, 'kiribot_session=tok; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=Lax');
});

test('serialized cookie never carries a Domain attribute', () => {
    const out = serializeCookie('kiribot_session', 'tok', { maxAge: 60 });
    assert.ok(!/Domain/i.test(out), `must be host-only, got: ${out}`);
});

test('serializes an expiry in the past to clear the cookie', () => {
    const out = serializeCookie('kiribot_session', '', { maxAge: 0 });
    assert.ok(out.startsWith('kiribot_session=; Max-Age=0'), out);
});
