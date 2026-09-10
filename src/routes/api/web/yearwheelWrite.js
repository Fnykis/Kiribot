const { validateEntryInput } = require('../../../utils/arshjulEntry');

// Anyone holding the wheel's role may edit anything on it, and a moderator may reach any
// wheel. The audit log below — not per-entry ownership — is what makes that accountable.
async function gate({ memberGroups, userId, roleId, res, logger, label }) {
    let groups;
    try {
        groups = await memberGroups.getGroups(userId);
    } catch (err) {
        if (logger) logger(`${label} lookup failed:`, err.message);
        res.status(500).json({ error: 'internal' });
        return null;
    }

    if (!groups.member) {
        res.status(403).json({ error: 'not_in_guild' });
        return null;
    }

    const owned = [...(groups.instruments || []), ...(groups.workgroups || [])].find(g => g.id === roleId);
    if (!owned && !groups.isModerator) {
        res.status(403).json({ error: 'missing_role' });
        return null;
    }

    return groups;
}

function readVersion(body) {
    const version = body && body.version;
    return Number.isInteger(version) ? version : null;
}

function createWebYearwheelCreateRoute({ memberGroups, arshjulStore, resolveChannelId, logger }) {
    return async function webYearwheelCreateRoute(req, res) {
        const roleId = req.params.roleId;

        const groups = await gate({
            memberGroups, userId: req.webUser.id, roleId, res, logger,
            label: 'POST /api/web/yearwheel'
        });
        if (!groups) return;

        const validated = validateEntryInput(req.body);
        if (!validated.ok) return res.status(400).json({ error: 'invalid_input', field: validated.field });

        // A group with no channel still gets a working wheel; only delivery is withheld.
        let channelId = null;
        try {
            channelId = await resolveChannelId(roleId);
        } catch (err) {
            if (logger) logger('POST /api/web/yearwheel channel lookup failed:', err.message);
        }

        try {
            const entry = await arshjulStore.create(roleId, {
                ...validated.value,
                channelId,
                userId: req.webUser.id
            });
            if (logger) {
                logger(`arshjul: ${req.webUser.id} created entry ${entry.id} on role ${roleId} — ` +
                    `${entry.monthDay} "${entry.title}"`);
            }
            return res.status(201).json(entry);
        } catch (err) {
            if (logger) logger('POST /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }
    };
}

function createWebYearwheelUpdateRoute({ memberGroups, arshjulStore, logger }) {
    return async function webYearwheelUpdateRoute(req, res) {
        let existing;
        try {
            existing = await arshjulStore.getEntry(req.params.id);
        } catch (err) {
            if (logger) logger('PATCH /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }
        // Unknown id answers 404 before any permission work, so a probe cannot tell
        // "exists but forbidden" from "does not exist".
        if (!existing) return res.status(404).json({ error: 'not_found' });

        const groups = await gate({
            memberGroups, userId: req.webUser.id, roleId: existing.roleId, res, logger,
            label: 'PATCH /api/web/yearwheel'
        });
        if (!groups) return;

        const version = readVersion(req.body);
        if (version === null) return res.status(400).json({ error: 'invalid_input', field: 'version' });

        const validated = validateEntryInput(req.body);
        if (!validated.ok) return res.status(400).json({ error: 'invalid_input', field: validated.field });

        try {
            const entry = await arshjulStore.update(req.params.id, {
                ...validated.value,
                version,
                userId: req.webUser.id
            });
            if (logger) {
                logger(`arshjul: ${req.webUser.id} updated entry ${entry.id} on role ${entry.roleId} — ` +
                    `from ${existing.monthDay} "${existing.title}" to ${entry.monthDay} "${entry.title}"`);
            }
            return res.json(entry);
        } catch (err) {
            if (err.message === 'version_conflict') {
                return res.status(409).json({ error: 'version_conflict', entry: existing });
            }
            if (err.message === 'entry_not_found') return res.status(404).json({ error: 'not_found' });
            if (logger) logger('PATCH /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }
    };
}

function createWebYearwheelDeleteRoute({ memberGroups, arshjulStore, logger }) {
    return async function webYearwheelDeleteRoute(req, res) {
        let existing;
        try {
            existing = await arshjulStore.getEntry(req.params.id);
        } catch (err) {
            if (logger) logger('DELETE /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }
        if (!existing) return res.status(404).json({ error: 'not_found' });

        const groups = await gate({
            memberGroups, userId: req.webUser.id, roleId: existing.roleId, res, logger,
            label: 'DELETE /api/web/yearwheel'
        });
        if (!groups) return;

        const version = readVersion(req.body);
        if (version === null) return res.status(400).json({ error: 'invalid_input', field: 'version' });

        try {
            await arshjulStore.remove(req.params.id, version);
            if (logger) {
                logger(`arshjul: ${req.webUser.id} deleted entry ${existing.id} on role ${existing.roleId} — ` +
                    `${existing.monthDay} "${existing.title}"`);
            }
            return res.status(204).end();
        } catch (err) {
            if (err.message === 'version_conflict') {
                return res.status(409).json({ error: 'version_conflict', entry: existing });
            }
            if (err.message === 'entry_not_found') return res.status(404).json({ error: 'not_found' });
            if (logger) logger('DELETE /api/web/yearwheel store failed:', err.message);
            return res.status(500).json({ error: 'internal' });
        }
    };
}

module.exports = {
    createWebYearwheelCreateRoute,
    createWebYearwheelUpdateRoute,
    createWebYearwheelDeleteRoute
};
