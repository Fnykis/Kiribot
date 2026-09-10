function createMemberGroupsService({ client, guildId, hexInstr, hexArbet, moderatorRoleId, cache }) {
    function byColor(memberRoles, hex) {
        return [...memberRoles.values()]
            .filter(r => r.hexColor === hex)
            .map(r => ({ id: r.id, name: r.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async function getGroups(userId) {
        const cached = cache.get(userId);
        if (cached) return cached;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error(`Bot not in guild ${guildId}`);

        let member;
        try {
            member = await guild.members.fetch(userId);
        } catch (err) {
            if (err.code === 10007 /* Unknown Member */) {
                const result = { member: false };
                cache.set(userId, result);
                return result;
            }
            throw err;
        }

        const roles = member.roles.cache;
        const result = {
            member: true,
            displayName: member.displayName,
            isModerator: roles.has(moderatorRoleId),
            instruments: byColor(roles, hexInstr),
            workgroups: byColor(roles, hexArbet)
        };
        cache.set(userId, result);
        return result;
    }

    // Cached under a fixed key so a burst of Mod-section opens costs one role scan per TTL.
    const ALL_GROUPS_KEY = '__all_groups__';

    async function listAllGroups() {
        const cached = cache.get(ALL_GROUPS_KEY);
        if (cached) return cached;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error(`Bot not in guild ${guildId}`);

        const roles = guild.roles.cache;
        const result = {
            instruments: byColor(roles, hexInstr),
            workgroups: byColor(roles, hexArbet)
        };
        cache.set(ALL_GROUPS_KEY, result);
        return result;
    }

    return { getGroups, listAllGroups };
}

module.exports = createMemberGroupsService;
