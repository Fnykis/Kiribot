const config = require('../config.json');

async function main() {
    const code = process.argv[2];
    if (!code) {
        console.error('Usage: node scripts/m2-smoke.js <oauth-code>');
        console.error('');
        console.error('Get a code by visiting (in a browser):');
        const authorize = new URL('https://discord.com/oauth2/authorize');
        authorize.searchParams.set('client_id', config.clientId);
        authorize.searchParams.set('redirect_uri', config.oauthRedirectUri);
        authorize.searchParams.set('response_type', 'code');
        authorize.searchParams.set('scope', 'identify guilds.members.read');
        console.error('  ' + authorize.toString());
        console.error('');
        console.error('Workflow:');
        console.error('  1. In Discord, right-click an active signup post → Apps → "Planera lineup".');
        console.error('  2. Confirm you see the ephemeral reply.');
        console.error('  3. Authorize via the URL above and paste the resulting code here.');
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

    const pendingRes = await fetch(`${base}/api/concert/pending`, {
        headers: { Authorization: `Bearer ${tokenBody.access_token}` }
    });
    const pendingBody = await pendingRes.json();
    console.log('GET /api/concert/pending →', pendingRes.status, pendingBody);

    const pendingRes2 = await fetch(`${base}/api/concert/pending`, {
        headers: { Authorization: `Bearer ${tokenBody.access_token}` }
    });
    const pendingBody2 = await pendingRes2.json();
    console.log('GET /api/concert/pending (2nd call) →', pendingRes2.status, pendingBody2);
}

main().catch(err => { console.error(err); process.exit(1); });
