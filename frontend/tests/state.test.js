import { describe, it, expect } from 'vitest';

// Dynamic import with cache-busting isolates module state between tests.
async function freshState() {
    return import('../src/state.js?t=' + Math.random());
}

describe('state store', () => {
    it('getEvent returns null initially', async () => {
        const state = await freshState();
        expect(state.getEvent()).toBeNull();
    });

    it('setEvent / getEvent round-trip', async () => {
        const state = await freshState();
        const event = { id: 'c1', name: 'Test', signups: {}, lineup: [] };
        state.setEvent(event);
        expect(state.getEvent()).toBe(event);
    });

    it('getDraggingId returns null initially', async () => {
        const state = await freshState();
        expect(state.getDraggingId()).toBeNull();
    });

    it('setDraggingId / getDraggingId round-trip', async () => {
        const state = await freshState();
        state.setDraggingId('u999');
        expect(state.getDraggingId()).toBe('u999');
    });
});

describe('concerts', () => {
    it('getConcerts returns null initially', async () => {
        const state = await freshState();
        expect(state.getConcerts()).toBeNull();
    });

    it('setConcerts / getConcerts round-trip', async () => {
        const state = await freshState();
        const concerts = [{ concertId: 'c1', name: 'A', date: '08/03/26' }];
        state.setConcerts(concerts);
        expect(state.getConcerts()).toBe(concerts);
    });
});

describe('selectedConcertId', () => {
    it('getSelectedConcertId returns null initially', async () => {
        const state = await freshState();
        expect(state.getSelectedConcertId()).toBeNull();
    });

    it('setSelectedConcertId / getSelectedConcertId round-trip', async () => {
        const state = await freshState();
        state.setSelectedConcertId('c123');
        expect(state.getSelectedConcertId()).toBe('c123');
    });

    it('clearSelectedConcert resets selection and event', async () => {
        const state = await freshState();
        state.setSelectedConcertId('c123');
        state.setEvent({ id: 'c123' });
        state.clearSelectedConcert();
        expect(state.getSelectedConcertId()).toBeNull();
        expect(state.getEvent()).toBeNull();
    });
});
