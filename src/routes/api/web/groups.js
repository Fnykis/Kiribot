// The full group roster is moderator-only. An ordinary member's browser never receives the
// list of groups they are not in — see the parent spec's note on GET /api/web/me.
function createWebGroupsRoute({ memberGroups, logger }) {
    return async function webGroupsRoute(req, res) {
        let groups;
        try {
            groups = await memberGroups.getGroups(req.webUser.id);
        } catch (err) {
            if (logger) logger('GET /api/web/groups lookup failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }

        if (!groups.member) return res.status(403).json({ error: 'not_in_guild' });
        if (!groups.isModerator) return res.status(403).json({ error: 'not_moderator' });

        try {
            return res.json(await memberGroups.listAllGroups());
        } catch (err) {
            if (logger) logger('GET /api/web/groups roster failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }
    };
}

module.exports = createWebGroupsRoute;
