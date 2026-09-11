const { ChannelType } = require('discord.js');
const { getMemberNickname } = require('../utils/interactionUtils');

// Moderator-driven status change (aktiv -> inaktiv). The member can flip themselves back
// via the status buttons in #din-profil, so this only ever goes one way.
function createMemberStatusService({ client, guildId, privateMessagesChannelId, yourProfileChannelId, logActivity }) {
    function findRoles() {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error(`Bot not in guild ${guildId}`);

        const roles = [...guild.roles.cache.values()];
        const aktiv = roles.find(r => r.name === 'aktiv');
        const inaktiv = roles.find(r => r.name === 'inaktiv');
        if (!aktiv || !inaktiv) throw new Error('Roles "aktiv" and "inaktiv" must both exist');
        return { aktiv, inaktiv };
    }

    function buildMessage({ member, reason, moderatorNickname }) {
        const lines = [
            `Hej <@${member.id}>! Din status i Kiriaka har ändrats till **inaktiv** av ${moderatorNickname}.`
        ];
        const trimmedReason = (reason || '').trim();
        if (trimmedReason) lines.push(`**Anledning:** ${trimmedReason}`);
        lines.push('', `Om det inte stämmer kan du själv sätta dig som aktiv igen i <#${yourProfileChannelId}> via knappen **Status**.`);
        return lines.join('\n');
    }

    // Same private-thread pattern as the signup reminder: always deliverable, and moderators can follow up in it.
    async function notifyMember({ member, nickname, reason, moderatorNickname }) {
        const channel = client.channels.cache.get(privateMessagesChannelId);
        if (!channel) throw new Error(`Private messages channel ${privateMessagesChannelId} not found`);

        const thread = await channel.threads.create({
            name: `Status: ${nickname}`.slice(0, 100),
            autoArchiveDuration: 10080,
            type: ChannelType.PrivateThread
        });
        await thread.members.add(member.id);
        await thread.send({
            content: buildMessage({ member, reason, moderatorNickname }),
            allowedMentions: { users: [member.id] }
        });
    }

    async function setMembersInactive({ members, reason, moderatorNickname }) {
        const { aktiv, inaktiv } = findRoles();
        const result = { changed: [], skipped: [], errors: 0 };

        for (const member of members) {
            const nickname = getMemberNickname(member);
            if (member.user.bot || !member.roles.cache.has(aktiv.id)) {
                result.skipped.push(nickname);
                continue;
            }

            await member.roles.add(inaktiv.id);
            await member.roles.remove(aktiv.id);
            result.changed.push(nickname);

            // Status is the source of truth; the notification is best-effort and never rolls the role back.
            try {
                await notifyMember({ member, nickname, reason, moderatorNickname });
            } catch (error) {
                result.errors++;
                logActivity(`Failed to notify ${nickname} about inaktiv status: ${error.message}`);
            }
        }

        return result;
    }

    function formatSummary({ changed, skipped, errors }) {
        const lines = [`**Satta som inaktiva (${changed.length}):** ${changed.length ? changed.join(', ') : '–'}`];
        if (skipped.length) lines.push(`**Hoppade över (redan inaktiv eller bot):** ${skipped.join(', ')}`);
        if (errors) lines.push(`⚠️ ${errors} medlem${errors === 1 ? '' : 'mar'} kunde inte meddelas i tråd. Kontrollera loggar.`);
        return lines.join('\n');
    }

    return { setMembersInactive, formatSummary };
}

module.exports = createMemberStatusService;
