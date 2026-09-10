// CSRF guard for the årshjul write routes. The session cookie is host-only and HttpOnly, so a
// sibling subdomain cannot read it — but the browser would still attach it to a forged
// same-site request, so the Origin header is checked explicitly on every write.
function createWebOriginMiddleware({ allowedOrigin, logger }) {
    return function webOrigin(req, res, next) {
        const origin = req.headers.origin;
        if (typeof allowedOrigin !== 'string' || allowedOrigin.length === 0 || origin !== allowedOrigin) {
            if (logger) logger(`arshjul: write rejected, bad origin ${origin === undefined ? '(none)' : origin}`);
            return res.status(403).json({ error: 'bad_origin' });
        }
        return next();
    };
}

module.exports = createWebOriginMiddleware;
