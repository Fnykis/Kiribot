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

function setupDom() {
    document.body.replaceChildren();
    const el = document.createElement('div');
    el.id = 'm';
    document.body.appendChild(el);
    return el;
}

describe('openStallUppAlla', () => {
    let modalEl;
    beforeEach(() => { modalEl = setupDom(); });

    it('renders one row per (user × instrument) signup combo', () => {
        openStallUppAlla({ modalEl, event: makeEvent(), onSubmit: () => {} });
        const rows = modalEl.querySelectorAll('.stua-row');
        expect(rows.length).toBe(3);
    });

    it('OK disabled until every member has one instrument selected', () => {
        openStallUppAlla({ modalEl, event: makeEvent(), onSubmit: () => {} });
        const ok = modalEl.querySelector('button.stua-ok');
        expect(ok.disabled).toBe(true);
        modalEl.querySelector('[data-user="u1"][data-instrument="1:a"]').click();
        expect(ok.disabled).toBe(true);
        modalEl.querySelector('[data-user="u2"][data-instrument="tarol"]').click();
        expect(ok.disabled).toBe(false);
    });

    it('OK click calls onSubmit with one selection per user', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        openStallUppAlla({ modalEl, event: makeEvent(), onSubmit });
        modalEl.querySelector('[data-user="u1"][data-instrument="1:a"]').click();
        modalEl.querySelector('[data-user="u2"][data-instrument="tarol"]').click();
        modalEl.querySelector('button.stua-ok').click();
        await new Promise(r => setTimeout(r, 0));
        expect(onSubmit).toHaveBeenCalledWith([
            { userId: 'u1', displayName: 'Alice', instrument: '1:a' },
            { userId: 'u2', displayName: 'Bob', instrument: 'tarol' },
        ]);
    });

    it('skips members already placed in lineup', () => {
        const event = makeEvent();
        event.lineup = [{ userId: 'u1', position: {x:0,y:0}, instrument: '1:a', displayName: 'Alice' }];
        openStallUppAlla({ modalEl, event, onSubmit: () => {} });
        const rows = modalEl.querySelectorAll('.stua-row');
        expect(rows.length).toBe(2); // only Bob (×2 instruments)
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
});
