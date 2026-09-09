const crypto = require('crypto');

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function createWebSession({ secret, ttlMs = DEFAULT_TTL_MS, now = Date.now }) {
    if (!secret) throw new Error('webSession: secret is required');

    function mac(payload) {
        return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    }

    function sign(userId) {
        const payload = `${userId}.${now() + ttlMs}`;
        return `${payload}.${mac(payload)}`;
    }

    function verify(token) {
        if (typeof token !== 'string') return null;
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const [userId, expRaw, given] = parts;
        if (!userId) return null;

        const exp = Number(expRaw);
        if (!Number.isFinite(exp)) return null;

        const expected = mac(`${userId}.${expRaw}`);
        const a = Buffer.from(expected);
        const b = Buffer.from(given);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

        if (now() >= exp) return null;
        return { userId };
    }

    return { sign, verify, ttlMs };
}

module.exports = createWebSession;
