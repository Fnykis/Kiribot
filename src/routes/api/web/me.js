const { loadCounts, withCounts } = require('../../../utils/groupCounts');

function createWebMeRoute({ memberGroups, arshjulStore, logger }) {
    return async function webMeRoute(req, res) {
        let groups;
        try {
            groups = await memberGroups.getGroups(req.webUser.id);
        } catch (err) {
            if (logger) logger('GET /api/web/me lookup failed:', err.message);
            return res.status(500).json({ error: 'member_lookup_failed' });
        }

        if (!groups.member) return res.json({ member: false });

        const counts = await loadCounts(arshjulStore, logger, 'GET /api/web/me');

        return res.json({
            member: true,
            displayName: groups.displayName,
            isModerator: groups.isModerator === true,
            instruments: withCounts(groups.instruments, counts),
            workgroups: withCounts(groups.workgroups, counts)
        });
    };
}

module.exports = createWebMeRoute;
