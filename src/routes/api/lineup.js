const { mergeRoster } = require('../../features/lineup');

function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
}

function userInRoster(eventJson, savedState, userId) {
    const roster = mergeRoster(eventJson, savedState);
    return roster.some(p => p.userId === userId);
}

function createPlaceRoute({ getEventJSON, lineupStore }) {
    return async function placeRoute(req, res) {
        const { concertId, userId, x, y } = req.body || {};
        if (!concertId || !userId || !isFiniteNumber(x) || !isFiniteNumber(y)) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        const eventJson = getEventJSON(concertId);
        if (!eventJson) return res.status(404).json({ error: 'event_not_found' });

        const saved = await lineupStore.loadState(concertId);
        if (!userInRoster(eventJson, saved, userId)) {
            return res.status(404).json({ error: 'user_not_in_roster' });
        }

        await lineupStore.mutate(concertId, state => {
            state.participants[userId] = { placed: true, x, y };
            return state;
        });
        return res.json({ ok: true });
    };
}

function createMoveRoute({ getEventJSON, lineupStore }) {
    return async function moveRoute(req, res) {
        const { concertId, userId, x, y } = req.body || {};
        if (!concertId || !userId || !isFiniteNumber(x) || !isFiniteNumber(y)) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        const eventJson = getEventJSON(concertId);
        if (!eventJson) return res.status(404).json({ error: 'event_not_found' });

        const saved = await lineupStore.loadState(concertId);
        if (!userInRoster(eventJson, saved, userId)) {
            return res.status(404).json({ error: 'user_not_in_roster' });
        }
        if (!saved.participants[userId]?.placed) {
            return res.status(404).json({ error: 'user_not_placed' });
        }

        await lineupStore.mutate(concertId, state => {
            state.participants[userId] = { placed: true, x, y };
            return state;
        });
        return res.json({ ok: true });
    };
}

function createRemoveRoute({ getEventJSON, lineupStore }) {
    return async function removeRoute(req, res) {
        const { concertId, userId } = req.body || {};
        if (!concertId || !userId) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        const eventJson = getEventJSON(concertId);
        if (!eventJson) return res.status(404).json({ error: 'event_not_found' });

        const saved = await lineupStore.loadState(concertId);
        if (!userInRoster(eventJson, saved, userId)) {
            return res.status(404).json({ error: 'user_not_in_roster' });
        }

        await lineupStore.mutate(concertId, state => {
            state.participants[userId] = { placed: false, x: null, y: null };
            return state;
        });
        return res.json({ ok: true });
    };
}

module.exports = { createPlaceRoute, createMoveRoute, createRemoveRoute };
