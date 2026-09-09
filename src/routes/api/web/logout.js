const { serializeCookie } = require('../../../utils/cookies');
const { COOKIE_NAME } = require('../../../middleware/webAuth');

function createWebLogoutRoute() {
    return async function webLogoutRoute(req, res) {
        res.setHeader('Set-Cookie', serializeCookie(COOKIE_NAME, '', { maxAge: 0 }));
        return res.json({ ok: true });
    };
}

module.exports = createWebLogoutRoute;
