function createTtlCache({ ttlMs, now = Date.now } = {}) {
    const store = new Map();
    return {
        get(key) {
            const entry = store.get(key);
            if (!entry) return undefined;
            if (now() >= entry.expiresAt) {
                store.delete(key);
                return undefined;
            }
            return entry.value;
        },
        set(key, value) {
            store.set(key, { value, expiresAt: now() + ttlMs });
        },
        delete(key) {
            store.delete(key);
        }
    };
}

module.exports = createTtlCache;
