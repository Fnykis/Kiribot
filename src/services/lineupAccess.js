const logActivity = require('../core/logger');

const REVOKE_DELAY_MS = 5 * 60 * 1000;
const pendingRevokes = new Map();

function scheduleRevoke(userId, channel) {
    cancelRevoke(userId);
    const timeout = setTimeout(async () => {
        pendingRevokes.delete(userId);
        try {
            await channel.permissionOverwrites.delete(userId);
            logActivity(`lineupAccess: revoked channel perms for ${userId} (timeout)`);
        } catch (err) {
            logActivity(`lineupAccess: failed to revoke perms for ${userId}: ${err.message}`);
        }
    }, REVOKE_DELAY_MS);
    pendingRevokes.set(userId, timeout);
}

function cancelRevoke(userId) {
    const t = pendingRevokes.get(userId);
    if (t) {
        clearTimeout(t);
        pendingRevokes.delete(userId);
    }
}

module.exports = { scheduleRevoke, cancelRevoke };
