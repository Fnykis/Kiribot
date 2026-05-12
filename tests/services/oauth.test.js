const test = require('node:test');
const assert = require('node:assert');
const createTtlCache = require('../../src/utils/ttlCache');
const createOAuthService = require('../../src/services/oauth');

function mockFetch(routes) {
    const calls = [];
    async function fakeFetch(url, opts) {
        calls.push({ url, opts });
        const handler = routes[url];
        if (!handler) throw new Error('unexpected fetch: ' + url);
        const res = handler(opts);
        return {
            ok: res.status >= 200 && res.status < 300,
            status: res.status,
            async json() { return res.body; }
        };
    }
    fakeFetch.calls = calls;
    return fakeFetch;
}

test('exchangeCode posts to discord token endpoint with form body', async () => {
    const fetch = mockFetch({
        'https://discord.com/api/oauth2/token': () => ({
            status: 200,
            body: { access_token: 'AT', expires_in: 604800, token_type: 'Bearer' }
        })
    });
    const oauth = createOAuthService({
        fetch,
        clientId: 'cid',
        clientSecret: 'csec',
        redirectUri: 'https://discord.com',
        verifyCache: createTtlCache({ ttlMs: 60000 })
    });

    const result = await oauth.exchangeCode('abc123');

    assert.strictEqual(result.access_token, 'AT');
    assert.strictEqual(fetch.calls[0].opts.method, 'POST');
    assert.match(fetch.calls[0].opts.headers['Content-Type'], /application\/x-www-form-urlencoded/);
    const body = fetch.calls[0].opts.body;
    assert.match(body, /client_id=cid/);
    assert.match(body, /client_secret=csec/);
    assert.match(body, /grant_type=authorization_code/);
    assert.match(body, /code=abc123/);
});

test('exchangeCode throws on non-2xx', async () => {
    const fetch = mockFetch({
        'https://discord.com/api/oauth2/token': () => ({
            status: 400, body: { error: 'invalid_grant' }
        })
    });
    const oauth = createOAuthService({
        fetch, clientId: 'c', clientSecret: 's', redirectUri: 'r',
        verifyCache: createTtlCache({ ttlMs: 1000 })
    });

    await assert.rejects(() => oauth.exchangeCode('bad'), /invalid_grant|400/);
});

test('verifyToken calls Discord /users/@me and returns user', async () => {
    const fetch = mockFetch({
        'https://discord.com/api/users/@me': () => ({
            status: 200, body: { id: 'u1', username: 'foo', global_name: 'Foo' }
        })
    });
    const oauth = createOAuthService({
        fetch, clientId: 'c', clientSecret: 's', redirectUri: 'r',
        verifyCache: createTtlCache({ ttlMs: 60000 })
    });

    const user = await oauth.verifyToken('AT');
    assert.strictEqual(user.id, 'u1');
});

test('verifyToken caches', async () => {
    let calls = 0;
    const fetch = mockFetch({
        'https://discord.com/api/users/@me': () => {
            calls++;
            return { status: 200, body: { id: 'u1', username: 'foo' } };
        }
    });
    const oauth = createOAuthService({
        fetch, clientId: 'c', clientSecret: 's', redirectUri: 'r',
        verifyCache: createTtlCache({ ttlMs: 60000 })
    });
    await oauth.verifyToken('AT');
    await oauth.verifyToken('AT');
    assert.strictEqual(calls, 1);
});

test('verifyToken throws on 401', async () => {
    const fetch = mockFetch({
        'https://discord.com/api/users/@me': () => ({ status: 401, body: {} })
    });
    const oauth = createOAuthService({
        fetch, clientId: 'c', clientSecret: 's', redirectUri: 'r',
        verifyCache: createTtlCache({ ttlMs: 1000 })
    });
    await assert.rejects(() => oauth.verifyToken('bad'), /401/);
});
