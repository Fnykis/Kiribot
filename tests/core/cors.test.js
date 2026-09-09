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
        sessionSecret: 'test_session_secret',
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
