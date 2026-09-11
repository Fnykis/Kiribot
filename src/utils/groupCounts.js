// Decorates group lists with the number of årshjul entries per role. Counting is decoration
// on the landing page, never an access decision, so a store failure degrades to 0 instead of
// failing the request.
async function loadCounts(arshjulStore, logger, label) {
    try {
        return await arshjulStore.countsByRole();
    } catch (err) {
        if (logger) logger(`${label} count lookup failed:`, err.message);
        return {};
    }
}

function withCounts(groups, counts) {
    return groups.map(g => ({ ...g, count: counts[g.id] || 0 }));
}

module.exports = { loadCounts, withCounts };
