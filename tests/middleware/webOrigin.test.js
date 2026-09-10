// tests/middleware/webOrigin.test.js
const test = require('node:test');
const assert = require('node:assert');
const createWebOriginMiddleware = require('../../src/middleware/webOrigin');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

const ALLOWED = 'https://kiribot.ollelindberg.se';
const mw = createWebOriginMiddleware({ allowedOrigin: ALLOWED });

test('calls next for the allowed origin', () => {
    const res = mockRes();
    let called = false;
    mw({ headers: { origin: ALLOWED } }, res, () => { called = true; });
    assert.strictEqual(called, true);
    assert.strictEqual(res.statusCode, 200);
});

test('rejects a different origin', () => {
    const res = mockRes();
    let called = false;
    mw({ headers: { origin: 'https://evil.example' } }, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'bad_origin' });
});

test('rejects a sibling subdomain on the same registrable domain', () => {
    const res = mockRes();
    mw({ headers: { origin: 'https://something-else.ollelindberg.se' } }, res, () => {});
    assert.strictEqual(res.statusCode, 403);
});

test('rejects a request with no Origin header', () => {
    const res = mockRes();
    let called = false;
    mw({ headers: {} }, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(res.statusCode, 403);
});

test('rejects everything when no allowed origin is configured', () => {
    const res = mockRes();
    createWebOriginMiddleware({ allowedOrigin: undefined })({ headers: { origin: ALLOWED } }, res, () => {});
    assert.strictEqual(res.statusCode, 403);
});
