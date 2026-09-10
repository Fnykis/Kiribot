function createWebMeRoute({ memberGroups, logger }) {
    return async function webMeRoute(req, res) {
        let groups;
        try {
            groups = await memberGroups.getGroups(req.webUser.id);
        } catch (err) {
            if (logger) logger('GET /api/web/me lookup failed:', err.message);
            return res.status(500).json({ error: 'member_lookup_failed' });
        }

        if (!groups.member) return res.json({ member: false });

        return res.json({
            member: true,
            displayName: groups.displayName,
            isModerator: groups.isModerator === true,
            instruments: groups.instruments,
            workgroups: groups.workgroups
        });
    };
}

module.exports = createWebMeRoute;
