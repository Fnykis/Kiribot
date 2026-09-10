function createWebYearwheelRoute({ memberGroups, arshjulStore, resolveChannelId, logger }) {
    return async function webYearwheelRoute(req, res) {
        const roleId = req.params.roleId;

        let groups;
        try {
            groups = await memberGroups.getGroups(req.webUser.id);
        } catch (err) {
            if (logger) logger('GET /api/web/yearwheel lookup failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }

        let owned;
        try {
            if (!groups.member) return res.status(403).json({ error: 'not_in_guild' });

            owned = [...groups.instruments, ...groups.workgroups].find(g => g.id === roleId);
            if (!owned && !groups.isModerator) {
                return res.status(403).json({ error: 'missing_role' });
            }
        } catch (err) {
            if (logger) logger('GET /api/web/yearwheel group shape invalid:', err.message);
            return res.status(500).json({ error: 'internal' });
        }

        let entries;
        try {
            entries = await arshjulStore.listByRole(roleId);
        } catch (err) {
            if (logger) logger('GET /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }

        // A moderator reaching a wheel they do not hold gets the real role name from the
        // roster rather than the bare id, so the page can name whose wheel they are editing.
        let name = owned ? owned.name : roleId;
        if (!owned) {
            try {
                const all = await memberGroups.listAllGroups();
                const found = [...all.instruments, ...all.workgroups].find(g => g.id === roleId);
                if (found) name = found.name;
            } catch (err) {
                if (logger) logger('GET /api/web/yearwheel roster lookup failed:', err.message);
            }
        }

        // A missing channel is a normal state, never a reason to fail the read.
        let hasChannel = false;
        try {
            hasChannel = Boolean(await resolveChannelId(roleId));
        } catch (err) {
            if (logger) logger('GET /api/web/yearwheel channel lookup failed:', err.message);
        }

        return res.json({
            role: { id: roleId, name, hasChannel, viaModerator: !owned },
            entries
        });
    };
}

module.exports = createWebYearwheelRoute;
