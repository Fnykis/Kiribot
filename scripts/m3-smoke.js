const config = require('../config.json');

async function main() {
    const code = process.argv[2];
    const concertId = process.argv[3];

    if (!code || !concertId) {
        console.error('Usage: node scripts/m3-smoke.js <oauth-code> <concertId>');
        console.error('');
        console.error('Get a code by visiting (in a browser):');
        const authorize = new URL('https://discord.com/oauth2/authorize');
        authorize.searchParams.set('client_id', config.clientId);
        authorize.searchParams.set('redirect_uri', config.oauthRedirectUri);
        authorize.searchParams.set('response_type', 'code');
        authorize.searchParams.set('scope', 'identify guilds.members.read');
        console.error('  ' + authorize.toString());
        console.error('');
        console.error('Pass the OAuth code AND a concertId from src/events/active/.');
        process.exit(1);
    }

    const base = `http://127.0.0.1:${config.expressPort || 3000}`;

    const tokenRes = await fetch(`${base}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    });
    const tokenBody = await tokenRes.json();
    console.log('POST /api/token →', tokenRes.status);
    if (!tokenRes.ok) process.exit(1);

    const auth = { Authorization: `Bearer ${tokenBody.access_token}` };

    // 1. GET state — pick a userId from roster.
    const r1 = await fetch(`${base}/api/state/${concertId}`, { headers: auth });
    const s1 = await r1.json();
    console.log('GET /api/state →', r1.status, 'participants:', s1.participants?.length);
    if (!r1.ok) process.exit(1);
    const target = s1.participants[0];
    if (!target) { console.error('No participants in roster — pick a different concertId.'); process.exit(1); }
    console.log('Target participant:', target.userId, target.displayName, target.instrument);
    console.log('  initial placed:', target.placed);

    // 2. POST place
    const placeRes = await fetch(`${base}/api/lineup/place`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ concertId, userId: target.userId, x: 100, y: 200 })
    });
    console.log('POST /api/lineup/place →', placeRes.status, await placeRes.json());

    // 3. GET state — confirm placed
    const r2 = await fetch(`${base}/api/state/${concertId}`, { headers: auth });
    const s2 = await r2.json();
    const after = s2.participants.find(p => p.userId === target.userId);
    console.log('After place: placed=' + after.placed + ' x=' + after.x + ' y=' + after.y);

    // 4. POST move
    const moveRes = await fetch(`${base}/api/lineup/move`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ concertId, userId: target.userId, x: 300, y: 400 })
    });
    console.log('POST /api/lineup/move →', moveRes.status, await moveRes.json());

    const r3 = await fetch(`${base}/api/state/${concertId}`, { headers: auth });
    const s3 = await r3.json();
    const moved = s3.participants.find(p => p.userId === target.userId);
    console.log('After move: x=' + moved.x + ' y=' + moved.y);

    // 5. POST remove
    const removeRes = await fetch(`${base}/api/lineup/remove`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ concertId, userId: target.userId })
    });
    console.log('POST /api/lineup/remove →', removeRes.status, await removeRes.json());

    const r4 = await fetch(`${base}/api/state/${concertId}`, { headers: auth });
    const s4 = await r4.json();
    const removed = s4.participants.find(p => p.userId === target.userId);
    console.log('After remove: placed=' + removed.placed + ' x=' + removed.x + ' y=' + removed.y);

    // 6. GET guild members
    const memRes = await fetch(`${base}/api/guild/members`, { headers: auth });
    const memBody = await memRes.json();
    console.log('GET /api/guild/members →', memRes.status, 'count:', memBody.members?.length);
}

main().catch(err => { console.error(err); process.exit(1); });
