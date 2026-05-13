import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startPoll, stopPoll } from '../src/poll.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function eventWith(lineup) {
    return { id: 'c1', name: 'X', date: 'd', signups: {}, lineup };
}

describe('startPoll', () => {
    it('calls fetchState on each interval and forwards to onUpdate', async () => {
        const events = [eventWith([]), eventWith([{ userId: 'u1', position: { x: 1, y: 1 } }])];
        let i = 0;
        const fetchState = vi.fn(async () => events[Math.min(i++, events.length - 1)]);
        const onUpdate = vi.fn();
        const handle = startPoll({ fetchState, intervalMs: 1000, getDraggingId: () => null, onUpdate });

        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(1000);

        expect(fetchState).toHaveBeenCalledTimes(2);
        expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ lineup: [{ userId: 'u1', position: { x: 1, y: 1 } }] }));
        stopPoll(handle);
    });

    it('skips fetch when visibilityRef.hidden is true', async () => {
        const fetchState = vi.fn(async () => eventWith([]));
        const visibilityRef = { hidden: true };
        const handle = startPoll({ fetchState, intervalMs: 500, getDraggingId: () => null, onUpdate: () => {}, visibilityRef });
        await vi.advanceTimersByTimeAsync(1500);
        expect(fetchState).toHaveBeenCalledTimes(0);
        stopPoll(handle);
    });

    it('preserves dragging user position from prior event', async () => {
        const prev = eventWith([{ userId: 'me', position: { x: 100, y: 100 } }, { userId: 'other', position: { x: 0, y: 0 } }]);
        const next = eventWith([{ userId: 'me', position: { x: 999, y: 999 } }, { userId: 'other', position: { x: 50, y: 50 } }]);
        const calls = [prev, next];
        let i = 0;
        const fetchState = vi.fn(async () => calls[Math.min(i++, calls.length - 1)]);
        const updates = [];
        const handle = startPoll({
            fetchState, intervalMs: 100,
            getDraggingId: () => 'me',
            onUpdate: (ev) => updates.push(ev)
        });
        await vi.advanceTimersByTimeAsync(100); // first tick → publishes prev
        await vi.advanceTimersByTimeAsync(100); // second tick → publishes next with 'me' position preserved from prev
        expect(updates).toHaveLength(2);
        const me = updates[1].lineup.find(e => e.userId === 'me');
        const other = updates[1].lineup.find(e => e.userId === 'other');
        expect(me.position).toEqual({ x: 100, y: 100 });
        expect(other.position).toEqual({ x: 50, y: 50 });
        stopPoll(handle);
    });

    it('calls onError when fetch rejects and continues polling', async () => {
        let i = 0;
        const fetchState = vi.fn(async () => {
            if (i++ === 0) throw new Error('boom');
            return eventWith([]);
        });
        const onError = vi.fn();
        const handle = startPoll({ fetchState, intervalMs: 100, getDraggingId: () => null, onUpdate: () => {}, onError });
        await vi.advanceTimersByTimeAsync(100);
        await vi.advanceTimersByTimeAsync(100);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(fetchState).toHaveBeenCalledTimes(2);
        stopPoll(handle);
    });
});
