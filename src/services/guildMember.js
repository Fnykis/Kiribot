function createGuildMemberService({ client, guildId, harmonianRoleId, cache }) {
    async function getMember(userId) {
        const cached = cache.get(userId);
        if (cached) return cached;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error(`Bot not in guild ${guildId}`);

        let member;
        try {
            member = await guild.members.fetch(userId);
        } catch (err) {
            if (err.code === 10007 /* Unknown Member */) {
                const result = { found: false };
                cache.set(userId, result);
                return result;
            }
            throw err;
        }

        const result = {
            found: true,
            id: member.id,
            displayName: member.displayName,
            hasHarmonian: member.roles.cache.has(harmonianRoleId)
        };
        cache.set(userId, result);
        return result;
    }

    return { getMember };
}

module.exports = createGuildMemberService;
