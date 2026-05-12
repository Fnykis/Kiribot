const config = require('../config.json');

async function main() {
    const code = process.argv[2];
    if (!code) {
        console.error('Usage: node scripts/m1-smoke.js <oauth-code>');
        console.error('');
        console.error('Get a code by visiting (in a browser):');
        const authorize = new URL('https://discord.com/oauth2/authorize');
        authorize.searchParams.set('client_id', config.clientId);
        authorize.searchParams.set('redirect_uri', config.oauthRedirectUri);
        authorize.searchParams.set('response_type', 'code');
        authorize.searchParams.set('scope', 'identify guilds.members.read');
        console.error('  ' + authorize.toString());
        console.error('');
        console.error('After authorizing, copy the `code` query parameter from the redirect URL.');
        process.exit(1);
    }

    const base = `http://127.0.0.1:${config.expressPort || 3000}`;

    const tokenRes = await fetch(`${base}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    });
    const tokenBody = await tokenRes.json();
    console.log('POST /api/token →', tokenRes.status, tokenBody);
    if (!tokenRes.ok) process.exit(1);

    const meRes = await fetch(`${base}/api/me`, {
        headers: { Authorization: `Bearer ${tokenBody.access_token}` }
    });
    const meBody = await meRes.json();
    console.log('GET /api/me →', meRes.status, meBody);
}

main().catch(err => { console.error(err); process.exit(1); });
