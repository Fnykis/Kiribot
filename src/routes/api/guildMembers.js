function createGuildMembersRoute({ client, guildId, harmonianRoleId, ttlMs = 60_000, now = Date.now }) {
    let cache = null;

    async function loadAll() {
        if (cache && now() - cache.at < ttlMs) return cache.members;
        const guild = client.guilds.cache.get(guildId);
        const collection = await guild.members.fetch();
        const members = Array.from(collection.values()).map(m => ({
            id: m.id,
            displayName: m.displayName,
            hasHarmonian: m.roles.cache.has(harmonianRoleId)
        }));
        cache = { at: now(), members };
        return members;
    }

    return async function guildMembersRoute(req, res) {
        let members;
        try {
            members = await loadAll();
        } catch {
            return res.status(500).json({ error: 'guild_fetch_failed' });
        }
        const q = String(req.query?.q ?? '').trim().toLowerCase();
        const filtered = q
            ? members.filter(m => m.displayName.toLowerCase().includes(q))
            : members;
        return res.json(filtered.slice(0, 25));
    };
}

module.exports = createGuildMembersRoute;
