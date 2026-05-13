function createPendingConcerts({ ttlMs = 10 * 60 * 1000, now = Date.now } = {}) {
    const store = new Map();
    return {
        set(userId, concertId) {
            store.set(userId, { concertId, expiresAt: now() + ttlMs });
        },
        pop(userId) {
            const entry = store.get(userId);
            if (!entry) return null;
            store.delete(userId);
            if (now() >= entry.expiresAt) return null;
            return entry.concertId;
        }
    };
}

const pendingConcerts = createPendingConcerts();

const ALLOWED_RESPONSES = new Set(['ja', 'kanske']);

function mergeRoster(eventJson, savedState) {
    const out = [];
    const signups = eventJson?.signups || {};
    const placements = savedState?.participants || {};
    for (const [instrument, entries] of Object.entries(signups)) {
        for (const signup of entries) {
            if (!ALLOWED_RESPONSES.has(signup.response)) continue;
            const userId = signup.id;
            const saved = placements[userId];
            out.push({
                userId,
                displayName: signup.name,
                instrument,
                response: signup.response,
                placed: saved?.placed ?? false,
                x: saved?.x ?? null,
                y: saved?.y ?? null
            });
        }
    }
    return out;
}

module.exports = { createPendingConcerts, pendingConcerts, mergeRoster };
