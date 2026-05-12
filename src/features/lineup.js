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

module.exports = { createPendingConcerts, pendingConcerts };
