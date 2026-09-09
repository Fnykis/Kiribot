const test = require('node:test');
const assert = require('node:assert');
const { buildApp } = require('../../src/core/express');

function minConfig() {
    return {
        clientId: 'test_client',
        discordClientSecret: 'test_secret',
        guildId: 'test_guild',
        harmonianRoleId: 'test_role',
        oauthRedirectUri: 'https://discord.com',
        expressPort: 3000,
        webOrigin: 'https://kiribot.ollelindberg.se',
        webRedirectUri: 'https://kiribot.ollelindberg.se/yearwheel/callback.html',
        sessionSecret: 'test_session_secret_at_least_32_chars_long',
    };
}

function minClient() {
    return {
        guilds: { cache: { get: () => ({ members: { fetch: async () => null } }) } }
    };
}

function listenAsync(app) {
    return new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
}

test('CORS preflight reflects *.discordsays.com origin', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/me`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'https://abc123.discordsays.com',
                'Access-Control-Request-Method': 'GET',
            }
        });
        const allow = res.headers.get('access-control-allow-origin');
        assert.strictEqual(allow, 'https://abc123.discordsays.com');
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('CORS does not reflect non-discordsays origin', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/me`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'https://evil.example.com',
                'Access-Control-Request-Method': 'GET',
            }
        });
        const allow = res.headers.get('access-control-allow-origin');
        assert.ok(
            allow !== 'https://evil.example.com',
            `should not reflect untrusted origin, got: ${allow}`
        );
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('CORS still reflects the Discord Activity origin after adding the web origin', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/me`, {
            method: 'OPTIONS',
            headers: { 'Origin': 'https://abc123.discordsays.com', 'Access-Control-Request-Method': 'GET' }
        });
        assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://abc123.discordsays.com');
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('CORS reflects the årshjul origin and allows credentials', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/web/me`, {
            method: 'OPTIONS',
            headers: { 'Origin': 'https://kiribot.ollelindberg.se', 'Access-Control-Request-Method': 'GET' }
        });
        assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://kiribot.ollelindberg.se');
        assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('CORS does not reflect a lookalike origin', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/web/me`, {
            method: 'OPTIONS',
            headers: { 'Origin': 'https://kiribot.ollelindberg.se.evil.com', 'Access-Control-Request-Method': 'GET' }
        });
        const allow = res.headers.get('access-control-allow-origin');
        assert.ok(allow !== 'https://kiribot.ollelindberg.se.evil.com', `got: ${allow}`);
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('GET /api/web/me without a cookie is 401 no_session', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/web/me`);
        assert.strictEqual(res.status, 401);
        assert.deepStrictEqual(await res.json(), { error: 'no_session' });
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('GET /api/web/yearwheel/:roleId without a cookie is 401 no_session', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/web/yearwheel/r1`);
        assert.strictEqual(res.status, 401);
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('POST /api/web/token without a cookie is reachable (not gated by webAuth)', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/web/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        // No code was sent either, so this proves the route ran webTokenRoute's own validation
        // rather than being blocked by webAuth (which would return 401, not 400).
        assert.strictEqual(res.status, 400);
        assert.deepStrictEqual(await res.json(), { error: 'missing_code' });
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('POST /api/web/logout without a cookie is reachable and clears the cookie', async () => {
    const app = buildApp({ client: minClient(), config: minConfig() });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/web/logout`, { method: 'POST' });
        assert.strictEqual(res.status, 200);
        const setCookie = res.headers.get('set-cookie');
        assert.ok(setCookie && setCookie.startsWith('kiribot_session='), setCookie);
        assert.ok(setCookie.includes('Max-Age=0'), setCookie);
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('missing config.sessionSecret fails soft: buildApp does not throw and the Activity API keeps working', async () => {
    const config = minConfig();
    delete config.sessionSecret;
    const app = buildApp({ client: minClient(), config });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        // The Activity's own CORS/routes must be entirely unaffected.
        const activityRes = await fetch(`http://127.0.0.1:${port}/api/me`, {
            method: 'OPTIONS',
            headers: { 'Origin': 'https://abc123.discordsays.com', 'Access-Control-Request-Method': 'GET' }
        });
        assert.strictEqual(activityRes.headers.get('access-control-allow-origin'), 'https://abc123.discordsays.com');

        // The web routes must simply not be mounted, not crash the process.
        const webRes = await fetch(`http://127.0.0.1:${port}/api/web/me`);
        assert.strictEqual(webRes.status, 404);
    } finally {
        await new Promise(res => server.close(res));
    }
});

test('a placeholder/too-short config.sessionSecret is treated as absent, not used to sign cookies', async () => {
    const config = minConfig();
    config.sessionSecret = '[YOUR SESSION SECRET]';
    const app = buildApp({ client: minClient(), config });
    const server = await listenAsync(app);
    const port = server.address().port;
    try {
        const webRes = await fetch(`http://127.0.0.1:${port}/api/web/me`);
        assert.strictEqual(webRes.status, 404);
    } finally {
        await new Promise(res => server.close(res));
    }
});
