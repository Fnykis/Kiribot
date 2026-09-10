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

        // A moderator's blanket access is bounded to real instrument/workgroup roles — the
        // same roster lookup that resolves the display name below also proves roleId is a
        // real role at all, before a moderator can read a wheel for it. Without this, any
        // roleId string (including the guild's own id, which mentions as @everyone) would
        // be readable just because the caller happens to be a moderator.
        let name = owned ? owned.name : roleId;
        if (!owned) {
            let all;
            try {
                all = await memberGroups.listAllGroups();
            } catch (err) {
                if (logger) logger('GET /api/web/yearwheel roster lookup failed:', err.message);
                return res.status(500).json({ error: 'internal' });
            }
            const found = [...all.instruments, ...all.workgroups].find(g => g.id === roleId);
            if (!found) return res.status(404).json({ error: 'not_found' });
            name = found.name;
        }

        let entries;
        try {
            entries = await arshjulStore.listByRole(roleId);
        } catch (err) {
            if (logger) logger('GET /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
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
