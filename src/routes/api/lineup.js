const STAGE_W = 1000;
const STAGE_H = 600;

function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function isInSignups(event, userId, instrument) {
    const list = event.signups?.[instrument];
    if (!Array.isArray(list)) return false;
    return list.some(s => s.id === userId && (s.response === 'ja' || s.response === 'kanske'));
}

function createPlaceRoute({ lineupStore, instrumentList, isGuildMember, now = () => new Date().toISOString() }) {
    return async function placeRoute(req, res) {
        const { concertId, userId, displayName, instrument, x, y, manuallyAdded = false } = req.body || {};
        if (!concertId || !userId || !displayName || !instrument
            || !isFiniteNumber(x) || !isFiniteNumber(y)) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        if (!Object.prototype.hasOwnProperty.call(instrumentList, instrument)) {
            return res.status(400).json({ error: 'invalid_instrument' });
        }

        const event = await lineupStore.loadEvent(concertId);
        if (!event) return res.status(404).json({ error: 'event_not_found' });

        if (manuallyAdded) {
            const ok = await isGuildMember(userId);
            if (!ok) return res.status(400).json({ error: 'user_not_in_guild' });
        } else {
            if (!isInSignups(event, userId, instrument)) {
                return res.status(404).json({ error: 'user_not_in_signups' });
            }
        }

        const entry = {
            userId,
            displayName,
            instrument,
            position: { x: clamp(x, 0, STAGE_W), y: clamp(y, 0, STAGE_H) },
            manuallyAdded: Boolean(manuallyAdded),
            placedAt: now()
        };

        let updated;
        try {
            updated = await lineupStore.mutateEvent(concertId, ev => {
                if (ev.lineup.some(e => e.userId === userId)) throw new Error('already_placed');
                ev.lineup.push(entry);
                return ev;
            });
        } catch (err) {
            if (err.message === 'already_placed') return res.status(409).json({ error: 'already_placed' });
            if (err.message === 'event_not_found') return res.status(404).json({ error: 'event_not_found' });
            throw err;
        }
        return res.json(updated);
    };
}

function createMoveRoute({ lineupStore }) {
    return async function moveRoute(req, res) {
        const { concertId, userId, x, y } = req.body || {};
        if (!concertId || !userId || !isFiniteNumber(x) || !isFiniteNumber(y)) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        const event = await lineupStore.loadEvent(concertId);
        if (!event) return res.status(404).json({ error: 'event_not_found' });

        let updated;
        try {
            updated = await lineupStore.mutateEvent(concertId, ev => {
                const entry = ev.lineup.find(e => e.userId === userId);
                if (!entry) throw new Error('user_not_placed');
                entry.position = { x: clamp(x, 0, STAGE_W), y: clamp(y, 0, STAGE_H) };
                return ev;
            });
        } catch (err) {
            if (err.message === 'user_not_placed') return res.status(404).json({ error: 'user_not_placed' });
            if (err.message === 'event_not_found') return res.status(404).json({ error: 'event_not_found' });
            throw err;
        }
        return res.json(updated);
    };
}

function createMestreRoute({ lineupStore }) {
    return async function mestreRoute(req, res) {
        const { concertId, userId, x, y } = req.body || {};
        if (!concertId || !userId) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        // x/y both finite => set the mestre ghost position; both absent/null => clear it.
        const setting = x != null || y != null;
        if (setting && !(isFiniteNumber(x) && isFiniteNumber(y))) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        const event = await lineupStore.loadEvent(concertId);
        if (!event) return res.status(404).json({ error: 'event_not_found' });

        let updated;
        try {
            updated = await lineupStore.mutateEvent(concertId, ev => {
                const entry = ev.lineup.find(e => e.userId === userId);
                if (!entry) throw new Error('user_not_placed');
                if (setting) entry.mestre = { x: clamp(x, 0, STAGE_W), y: clamp(y, 0, STAGE_H) };
                else delete entry.mestre;
                return ev;
            });
        } catch (err) {
            if (err.message === 'user_not_placed') return res.status(404).json({ error: 'user_not_placed' });
            if (err.message === 'event_not_found') return res.status(404).json({ error: 'event_not_found' });
            throw err;
        }
        return res.json(updated);
    };
}

function createRemoveRoute({ lineupStore }) {
    return async function removeRoute(req, res) {
        const { concertId, userId } = req.body || {};
        if (!concertId || !userId) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        const event = await lineupStore.loadEvent(concertId);
        if (!event) return res.status(404).json({ error: 'event_not_found' });
        const updated = await lineupStore.mutateEvent(concertId, ev => {
            ev.lineup = ev.lineup.filter(e => e.userId !== userId);
            return ev;
        });
        return res.json(updated);
    };
}

function createInstrumentsRoute({ instrumentList }) {
    return function instrumentsRoute(_req, res) {
        return res.json(Object.keys(instrumentList || {}));
    };
}

function createChangeInstrumentRoute({ lineupStore, instrumentList }) {
    return async function changeInstrumentRoute(req, res) {
        const { concertId, userId, instrument } = req.body || {};
        if (!concertId || !userId || !instrument) {
            return res.status(400).json({ error: 'invalid_body' });
        }
        if (!Object.prototype.hasOwnProperty.call(instrumentList, instrument)) {
            return res.status(400).json({ error: 'invalid_instrument' });
        }
        const event = await lineupStore.loadEvent(concertId);
        if (!event) return res.status(404).json({ error: 'event_not_found' });

        let updated;
        try {
            updated = await lineupStore.mutateEvent(concertId, ev => {
                const entry = ev.lineup.find(e => e.userId === userId);
                if (!entry) throw new Error('user_not_placed');
                entry.instrument = instrument;
                return ev;
            });
        } catch (err) {
            if (err.message === 'user_not_placed') return res.status(404).json({ error: 'user_not_placed' });
            if (err.message === 'event_not_found') return res.status(404).json({ error: 'event_not_found' });
            throw err;
        }
        return res.json(updated);
    };
}

module.exports = { createPlaceRoute, createMoveRoute, createMestreRoute, createRemoveRoute, createInstrumentsRoute, createChangeInstrumentRoute };
