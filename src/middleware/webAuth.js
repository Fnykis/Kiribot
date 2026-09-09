const { parseCookies } = require('../utils/cookies');

const COOKIE_NAME = 'kiribot_session';

function createWebAuthMiddleware({ webSession, cookieName = COOKIE_NAME }) {
    return function webAuth(req, res, next) {
        const cookies = parseCookies(req.headers.cookie);
        const session = webSession.verify(cookies[cookieName]);
        if (!session) {
            return res.status(401).json({ error: 'no_session' });
        }
        req.webUser = { id: session.userId };
        next();
    };
}

module.exports = createWebAuthMiddleware;
module.exports.COOKIE_NAME = COOKIE_NAME;
