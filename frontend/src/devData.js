// Dev-only data adapter. Reshapes local repo JSON (src/events/active, src/data)
// into the same shapes the backend API returns, so the planner runs without a
// server or the Harmonian auth gate. Mirrors src/routes/api/*.js logic.

const STAGE_W = 1000;
const STAGE_H = 600;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }

function httpError(code, status) {
    return Object.assign(new Error(code), { status });
}

// "DD/MM/YY" -> Date, for sorting concerts
function parseEventDate(str) {
    const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(String(str || ''));
    if (!m) return null;
    return new Date(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

export function createDevData(rawEvents) {
    const events = {};
    for (const e of rawEvents || []) {
        if (!e || !e.id) continue;
        const clone = JSON.parse(JSON.stringify(e));
        clone.lineup = Array.isArray(e.lineup) ? clone.lineup : [];
        events[e.id] = clone;
    }

    function getConcerts() {
        const list = Object.values(events)
            .filter(e => e.id && e.name && e.date && e.active !== false)
            .map(e => ({ concertId: e.id, name: e.name, date: e.date }));
        list.sort((a, b) => {
            const da = parseEventDate(a.date);
            const db = parseEventDate(b.date);
            if (!da && !db) return 0;
            if (!da) return 1;
            if (!db) return -1;
            return da.getTime() - db.getTime();
        });
        return list;
    }

    function getState(concertId) {
        const event = events[concertId];
        if (!event) throw httpError('event_not_found', 404);
        return event;
    }

    function getMembers(q) {
        const seen = new Map();
        for (const event of Object.values(events)) {
            for (const list of Object.values(event.signups || {})) {
                for (const s of list) {
                    if (s && s.id && !seen.has(s.id)) {
                        seen.set(s.id, { id: s.id, displayName: s.name, hasHarmonian: true });
                    }
                }
            }
        }
        const term = String(q || '').trim().toLowerCase();
        const all = Array.from(seen.values());
        const filtered = term
            ? all.filter(m => m.displayName.toLowerCase().includes(term))
            : all;
        return filtered.slice(0, 25);
    }

    function isInSignups(event, userId, instrument) {
        const list = event.signups?.[instrument];
        if (!Array.isArray(list)) return false;
        return list.some(s => s.id === userId && (s.response === 'ja' || s.response === 'kanske'));
    }

    function place({ concertId, userId, displayName, instrument, x, y, manuallyAdded = false }) {
        if (!concertId || !userId || !displayName || !instrument
            || !isFiniteNumber(x) || !isFiniteNumber(y)) {
            throw httpError('invalid_body', 400);
        }
        const event = events[concertId];
        if (!event) throw httpError('event_not_found', 404);
        if (!Object.prototype.hasOwnProperty.call(event.signups || {}, instrument)) {
            throw httpError('invalid_instrument', 400);
        }
        if (!manuallyAdded && !isInSignups(event, userId, instrument)) {
            throw httpError('user_not_in_signups', 404);
        }
        if (event.lineup.some(e => e.userId === userId)) {
            throw httpError('already_placed', 409);
        }
        event.lineup.push({
            userId,
            displayName,
            instrument,
            position: { x: clamp(x, 0, STAGE_W), y: clamp(y, 0, STAGE_H) },
            manuallyAdded: Boolean(manuallyAdded),
            placedAt: new Date().toISOString(),
        });
        return event;
    }

    function move({ concertId, userId, x, y }) {
        if (!concertId || !userId || !isFiniteNumber(x) || !isFiniteNumber(y)) {
            throw httpError('invalid_body', 400);
        }
        const event = events[concertId];
        if (!event) throw httpError('event_not_found', 404);
        const entry = event.lineup.find(e => e.userId === userId);
        if (!entry) throw httpError('user_not_placed', 404);
        entry.position = { x: clamp(x, 0, STAGE_W), y: clamp(y, 0, STAGE_H) };
        return event;
    }

    function remove({ concertId, userId }) {
        if (!concertId || !userId) throw httpError('invalid_body', 400);
        const event = events[concertId];
        if (!event) throw httpError('event_not_found', 404);
        event.lineup = event.lineup.filter(e => e.userId !== userId);
        return event;
    }

    function setMute(muted) {
        console.log('[dev] setMute', muted);
        return { muted };
    }

    function leaveVoice() {
        console.log('[dev] leaveVoice');
        return { ok: true };
    }

    return { getConcerts, getState, getMembers, place, move, remove, setMute, leaveVoice };
}
