import { describe, it, expect, beforeEach } from 'vitest';
import { createDevData } from '../src/devData.js';

function sampleEvents() {
    return [
        {
            id: '100', name: 'Later Gig', date: '20/06/26', active: true,
            signups: {
                '1:a': [
                    { name: 'Anna A', id: 'u1', response: 'ja', note: '' },
                    { name: 'Bo B', id: 'u2', response: 'nej', note: '' },
                ],
                'timbal': [
                    { name: 'Cilla C', id: 'u3', response: 'kanske', note: '' },
                ],
            },
        },
        {
            id: '200', name: 'Earlier Gig', date: '01/06/26', active: true,
            signups: {
                '1:a': [{ name: 'Anna A', id: 'u1', response: 'ja', note: '' }],
            },
        },
        {
            id: '300', name: 'Closed Gig', date: '05/06/26', active: false,
            signups: {},
        },
    ];
}

describe('getConcerts', () => {
    it('maps id to concertId and excludes inactive events', () => {
        const dev = createDevData(sampleEvents());
        const concerts = dev.getConcerts();
        expect(concerts.map(c => c.concertId)).toEqual(['200', '100']);
        expect(concerts[0]).toEqual({ concertId: '200', name: 'Earlier Gig', date: '01/06/26' });
    });

    it('sorts by date ascending', () => {
        const dev = createDevData(sampleEvents());
        const dates = dev.getConcerts().map(c => c.date);
        expect(dates).toEqual(['01/06/26', '20/06/26']);
    });
});

describe('getState', () => {
    it('returns the event with a lineup array', () => {
        const dev = createDevData(sampleEvents());
        const state = dev.getState('100');
        expect(state.name).toBe('Later Gig');
        expect(state.lineup).toEqual([]);
    });

    it('throws 404 for unknown concertId', () => {
        const dev = createDevData(sampleEvents());
        expect(() => dev.getState('999')).toThrow();
        try { dev.getState('999'); } catch (e) { expect(e.status).toBe(404); }
    });
});

describe('getMembers', () => {
    it('dedupes members by id across all events', () => {
        const dev = createDevData(sampleEvents());
        const ids = dev.getMembers('').map(m => m.id).sort();
        expect(ids).toEqual(['u1', 'u2', 'u3']);
    });

    it('marks every member hasHarmonian true and maps name to displayName', () => {
        const dev = createDevData(sampleEvents());
        const anna = dev.getMembers('anna')[0];
        expect(anna).toEqual({ id: 'u1', displayName: 'Anna A', hasHarmonian: true });
    });

    it('filters by case-insensitive substring', () => {
        const dev = createDevData(sampleEvents());
        expect(dev.getMembers('cil').map(m => m.id)).toEqual(['u3']);
    });
});

describe('place', () => {
    let dev;
    beforeEach(() => { dev = createDevData(sampleEvents()); });

    it('adds a signed-up member to the lineup', () => {
        const updated = dev.place({ concertId: '100', userId: 'u1', displayName: 'Anna A', instrument: '1:a', x: 50, y: 60 });
        expect(updated.lineup).toHaveLength(1);
        expect(updated.lineup[0]).toMatchObject({ userId: 'u1', instrument: '1:a', position: { x: 50, y: 60 } });
    });

    it('clamps position to stage bounds', () => {
        const updated = dev.place({ concertId: '100', userId: 'u1', displayName: 'Anna A', instrument: '1:a', x: 9999, y: -10 });
        expect(updated.lineup[0].position).toEqual({ x: 1000, y: 0 });
    });

    it('throws 409 when member already placed', () => {
        dev.place({ concertId: '100', userId: 'u1', displayName: 'Anna A', instrument: '1:a', x: 1, y: 1 });
        try {
            dev.place({ concertId: '100', userId: 'u1', displayName: 'Anna A', instrument: '1:a', x: 2, y: 2 });
            throw new Error('should have thrown');
        } catch (e) { expect(e.status).toBe(409); }
    });

    it('throws 404 when member not in signups and not manuallyAdded', () => {
        try {
            dev.place({ concertId: '100', userId: 'u2', displayName: 'Bo B', instrument: '1:a', x: 1, y: 1 });
            throw new Error('should have thrown');
        } catch (e) { expect(e.status).toBe(404); }
    });

    it('allows manuallyAdded members to bypass the signup check', () => {
        const updated = dev.place({ concertId: '100', userId: 'u2', displayName: 'Bo B', instrument: '1:a', x: 1, y: 1, manuallyAdded: true });
        expect(updated.lineup[0].userId).toBe('u2');
    });
});

describe('move', () => {
    let dev;
    beforeEach(() => {
        dev = createDevData(sampleEvents());
        dev.place({ concertId: '100', userId: 'u1', displayName: 'Anna A', instrument: '1:a', x: 10, y: 10 });
    });

    it('updates the position of a placed member', () => {
        const updated = dev.move({ concertId: '100', userId: 'u1', x: 200, y: 150 });
        expect(updated.lineup[0].position).toEqual({ x: 200, y: 150 });
    });

    it('throws 404 when member not placed', () => {
        try {
            dev.move({ concertId: '100', userId: 'u3', x: 1, y: 1 });
            throw new Error('should have thrown');
        } catch (e) { expect(e.status).toBe(404); }
    });
});

describe('remove', () => {
    it('removes a placed member from the lineup', () => {
        const dev = createDevData(sampleEvents());
        dev.place({ concertId: '100', userId: 'u1', displayName: 'Anna A', instrument: '1:a', x: 10, y: 10 });
        const updated = dev.remove({ concertId: '100', userId: 'u1' });
        expect(updated.lineup).toEqual([]);
    });
});
