function createWebYearwheelRoute({ memberGroups, arshjulStore, logger }) {
    return async function webYearwheelRoute(req, res) {
        const roleId = req.params.roleId;

        let groups;
        try {
            groups = await memberGroups.getGroups(req.webUser.id);
        } catch (err) {
            if (logger) logger('GET /api/web/yearwheel lookup failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }

        if (!groups.member) return res.status(403).json({ error: 'not_in_guild' });

        const owned = [...groups.instruments, ...groups.workgroups].find(g => g.id === roleId);
        if (!owned && !groups.isModerator) {
            return res.status(403).json({ error: 'missing_role' });
        }

        let entries;
        try {
            entries = await arshjulStore.listByRole(roleId);
        } catch (err) {
            if (logger) logger('GET /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }

        return res.json({
            role: { id: roleId, name: owned ? owned.name : roleId },
            entries
        });
    };
}

module.exports = createWebYearwheelRoute;
