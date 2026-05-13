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

module.exports = { mergeRoster };
