function createOAuthService({ fetch, clientId, clientSecret, redirectUri, verifyCache, logger }) {
    async function exchangeCode(code) {
        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri
        }).toString();

        if (logger) logger('token exchange payload:', { client_id: clientId, redirect_uri: redirectUri, code });
        const res = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const reason = err.error_description || err.error || `HTTP ${res.status}`;
            throw new Error(`Discord token exchange failed: ${reason}`);
        }
        return res.json();
    }

    async function verifyToken(accessToken) {
        const cached = verifyCache.get(accessToken);
        if (cached) return cached;

        const res = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) {
            throw new Error(`Discord verify failed: HTTP ${res.status}`);
        }
        const user = await res.json();
        verifyCache.set(accessToken, user);
        return user;
    }

    return { exchangeCode, verifyToken };
}

module.exports = createOAuthService;
