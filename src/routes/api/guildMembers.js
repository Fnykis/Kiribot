function createGuildMembersRoute({ client, guildId, ttlMs = 60_000, now = Date.now }) {
    let cache = null;

    return async function guildMembersRoute(_req, res) {
        if (cache && now() - cache.at < ttlMs) {
            return res.json({ members: cache.members });
        }

        let members;
        try {
            const guild = client.guilds.cache.get(guildId);
            const collection = await guild.members.fetch();
            members = Array.from(collection.values()).map(m => ({
                id: m.id,
                displayName: m.displayName
            }));
        } catch (_err) {
            return res.status(500).json({ error: 'guild_fetch_failed' });
        }

        cache = { at: now(), members };
        return res.json({ members });
    };
}

module.exports = createGuildMembersRoute;
