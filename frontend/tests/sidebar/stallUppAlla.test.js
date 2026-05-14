import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openStallUppAlla } from '../../src/sidebar/stallUppAlla.js';

function makeEvent() {
    return {
        signups: {
            '1:a': [
                { id: 'u1', name: 'Alice', response: 'ja' },
                { id: 'u2', name: 'Bob', response: 'kanske' },
            ],
            'tarol': [
                { id: 'u2', name: 'Bob', response: 'ja' },
            ],
        },
        lineup: [],
    };
}

function makeSingleEvent() {
    return {
        signups: {
            '1:a': [
                { id: 'u1', name: 'Alice', response: 'ja' },
            ],
            'tarol': [
                { id: 'u3', name: 'Carol', response: 'ja' },
            ],
        },
        lineup: [],
    };
}

function setupDom() {
    document.body.replaceChildren();
    const el = document.createElement('div');
    el.id = 'm';
    el.hidden = true;
    document.body.appendChild(el);
    return el;
}

describe('openStallUppAlla', () => {
    let modalEl;
    beforeEach(() => { modalEl = setupDom(); });

    it('renders one row per multi-instrument user', () => {
        openStallUppAlla({ modalEl, event: makeEvent(), onSubmit: () => {} });
        const rows = modalEl.querySelectorAll('.stua-row');
        // Only Bob (multi) gets a row; Alice (single) is pre-filled and not rendered
        expect(rows.length).toBe(1);
    });

    it('OK disabled until every member has one instrument selected', () => {
        openStallUppAlla({ modalEl, event: makeEvent(), onSubmit: () => {} });
        const ok = modalEl.querySelector('button.stua-ok');
        expect(ok.disabled).toBe(true);
        // Alice is pre-filled (single) — no button to click for her
        // OK still disabled because Bob hasn't picked yet
        modalEl.querySelector('[data-user="u2"][data-instrument="tarol"]').click();
        expect(ok.disabled).toBe(false);
    });

    it('OK click calls onSubmit with one selection per user', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        openStallUppAlla({ modalEl, event: makeEvent(), onSubmit });
        // Alice is pre-filled; only Bob needs a click
        modalEl.querySelector('[data-user="u2"][data-instrument="tarol"]').click();
        modalEl.querySelector('button.stua-ok').click();
        await new Promise(r => setTimeout(r, 0));
        expect(onSubmit).toHaveBeenCalledWith(
            expect.arrayContaining([
                { userId: 'u1', displayName: 'Alice', instrument: '1:a' },
                { userId: 'u2', displayName: 'Bob', instrument: 'tarol' },
            ])
        );
        expect(onSubmit.mock.calls[0][0]).toHaveLength(2);
    });

    it('skips members already placed in lineup', () => {
        const event = makeEvent();
        event.lineup = [{ userId: 'u1', position: {x:0,y:0}, instrument: '1:a', displayName: 'Alice' }];
        openStallUppAlla({ modalEl, event, onSubmit: () => {} });
        const rows = modalEl.querySelectorAll('.stua-row');
        // Alice is placed; only Bob remains (multi, 2 instruments) → 1 row
        expect(rows.length).toBe(1);
    });

    it('shows empty state when nobody left to place', () => {
        const event = makeEvent();
        event.lineup = [
            { userId: 'u1', position: {x:0,y:0}, instrument: '1:a', displayName: 'Alice' },
            { userId: 'u2', position: {x:0,y:0}, instrument: 'tarol', displayName: 'Bob' },
        ];
        openStallUppAlla({ modalEl, event, onSubmit: () => {} });
        expect(modalEl.textContent).toContain('redan utställda');
    });

    it('single-instrument members not rendered but included in payload', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        openStallUppAlla({ modalEl, event: makeEvent(), onSubmit });
        // Alice (single) has no .stua-row in DOM
        const aliceRow = modalEl.querySelector('[data-user="u1"]');
        expect(aliceRow).toBeNull();
        // Click Bob's instrument and submit
        modalEl.querySelector('[data-user="u2"][data-instrument="tarol"]').click();
        modalEl.querySelector('button.stua-ok').click();
        await new Promise(r => setTimeout(r, 0));
        const payload = onSubmit.mock.calls[0][0];
        expect(payload).toEqual(
            expect.arrayContaining([
                { userId: 'u1', displayName: 'Alice', instrument: '1:a' },
                { userId: 'u2', displayName: 'Bob', instrument: 'tarol' },
            ])
        );
        expect(payload).toHaveLength(2);
    });

    it('skips modal and calls onSubmit directly when all members are single-instrument', () => {
        const onSubmit = vi.fn();
        openStallUppAlla({ modalEl, event: makeSingleEvent(), onSubmit });
        // Modal should never have been opened
        expect(modalEl.hidden).toBe(true);
        // onSubmit called immediately with Alice and Carol auto-selections
        const payload = onSubmit.mock.calls[0][0];
        expect(payload).toEqual(
            expect.arrayContaining([
                { userId: 'u1', displayName: 'Alice', instrument: '1:a' },
                { userId: 'u3', displayName: 'Carol', instrument: 'tarol' },
            ])
        );
        expect(payload).toHaveLength(2);
    });
});
