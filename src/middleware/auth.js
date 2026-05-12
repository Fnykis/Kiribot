function createAuthMiddleware({ oauth, guildMember, logger }) {
    return async function authMiddleware(req, res, next) {
        const header = req.headers.authorization || '';
        const match = header.match(/^Bearer\s+(.+)$/i);
        if (!match) {
            return res.status(401).json({ error: 'missing_bearer_token' });
        }
        const token = match[1];

        let discordUser;
        try {
            discordUser = await oauth.verifyToken(token);
        } catch (err) {
            if (logger) logger('auth: verifyToken failed:', err.message);
            return res.status(401).json({ error: 'invalid_token' });
        }

        let member;
        try {
            member = await guildMember.getMember(discordUser.id);
        } catch (err) {
            if (logger) logger('auth: guildMember lookup failed:', err);
            return res.status(500).json({ error: 'member_lookup_failed' });
        }

        if (!member.found) {
            return res.status(403).json({ error: 'not_in_guild' });
        }
        if (!member.hasHarmonian) {
            return res.status(403).json({ error: 'missing_role' });
        }

        req.user = {
            id: member.id,
            displayName: member.displayName,
            hasHarmonian: true
        };
        next();
    };
}

module.exports = createAuthMiddleware;
