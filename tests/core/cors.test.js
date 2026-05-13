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
