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

        if (event.lineup.some(e => e.userId === userId)) {
            return res.status(409).json({ error: 'already_placed' });
        }
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

        const updated = await lineupStore.mutateEvent(concertId, ev => {
            ev.lineup.push(entry);
            return ev;
        });
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
        if (!event.lineup.some(e => e.userId === userId)) {
            return res.status(404).json({ error: 'user_not_placed' });
        }
        const updated = await lineupStore.mutateEvent(concertId, ev => {
            for (const entry of ev.lineup) {
                if (entry.userId === userId) {
                    entry.position = { x: clamp(x, 0, STAGE_W), y: clamp(y, 0, STAGE_H) };
                    break;
                }
            }
            return ev;
        });
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

module.exports = { createPlaceRoute, createMoveRoute, createRemoveRoute };
