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
