// Groups and their channels are created at runtime (src/interactions/modals/workgroups.js),
// and channel creation there is optional — so a role legitimately has no channel, and null
// is a normal answer rather than an error.
function createRoleChannelService({ client, guildId, categoryIds, cache }) {
    function channelNameFor(roleName) {
        return roleName.toLowerCase().replace(/\s+/g, '-');
    }

    async function resolveChannelId(roleId) {
        const cached = cache.get(roleId);
        if (cached !== undefined) return cached;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error(`Bot not in guild ${guildId}`);

        const role = guild.roles.cache.get(roleId);
        if (!role) {
            cache.set(roleId, null);
            return null;
        }

        const wanted = channelNameFor(role.name);
        const match = [...guild.channels.cache.values()]
            .find(c => categoryIds.includes(c.parentId) && c.name === wanted);

        const id = match ? match.id : null;
        cache.set(roleId, id);
        return id;
    }

    return { resolveChannelId };
}

module.exports = createRoleChannelService;
