const { serializeCookie } = require('../../../utils/cookies');
const { COOKIE_NAME } = require('../../../middleware/webAuth');

function createWebTokenRoute({ oauth, webSession, redirectUri, logger }) {
    return async function webTokenRoute(req, res) {
        const { code } = req.body || {};
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'missing_code' });
        }

        let discordUser;
        try {
            const result = await oauth.exchangeCode(code, redirectUri);
            discordUser = await oauth.verifyToken(result.access_token);
        } catch (err) {
            if (logger) logger('POST /api/web/token failed:', err.message);
            return res.status(400).json({ error: 'exchange_failed' });
        }

        const token = webSession.sign(discordUser.id);
        res.setHeader('Set-Cookie', serializeCookie(COOKIE_NAME, token, {
            maxAge: Math.floor(webSession.ttlMs / 1000)
        }));
        return res.json({ ok: true });
    };
}

module.exports = createWebTokenRoute;
