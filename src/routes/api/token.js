function createTokenRoute({ oauth, logger }) {
    return async function tokenRoute(req, res) {
        const { code } = req.body || {};
        if (logger) logger('POST /api/token received code:', code ? `${code.slice(0, 8)}... (len ${code.length})` : 'MISSING');
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'missing_code' });
        }
        try {
            const result = await oauth.exchangeCode(code);
            return res.json({
                access_token: result.access_token,
                expires_in: result.expires_in
            });
        } catch (err) {
            if (logger) logger('POST /api/token failed:', err.message);
            return res.status(400).json({ error: 'exchange_failed', detail: err.message });
        }
    };
}

module.exports = createTokenRoute;
