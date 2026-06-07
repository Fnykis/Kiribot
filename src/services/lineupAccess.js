const logActivity = require('../core/logger');

// 1 min: how long a clicker's lineup-channel access (and the ephemeral prompt)
// lives without joining. Joining cancels the revoke (voiceStateUpdate).
const REVOKE_DELAY_MS = 60 * 1000;
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

// Delete an ephemeral interaction reply after REVOKE_DELAY_MS (the lineup prompt
// "Klicka för att starta..."). Failures — e.g. the user already dismissed it, or
// the bot restarted — are swallowed and logged. `label` is for log context only.
function scheduleReplyDeletion(interaction, label) {
    setTimeout(() => {
        Promise.resolve(interaction.deleteReply()).catch(err =>
            logActivity(`lineupAccess: failed to delete prompt for ${label}: ${err.message}`));
    }, REVOKE_DELAY_MS);
}

module.exports = { scheduleRevoke, cancelRevoke, scheduleReplyDeletion, REVOKE_DELAY_MS };
