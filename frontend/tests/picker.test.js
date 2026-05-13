import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderPicker } from '../src/picker.js';

const sample = [
    { concertId: 'c1', name: 'Tidigast', date: '08/03/26' },
    { concertId: 'c2', name: 'Senare',   date: '23/05/26' },
];

describe('renderPicker', () => {
    let container;
    beforeEach(() => { container = document.createElement('div'); });

    it('renders one card per concert in given order', () => {
        renderPicker(container, sample, () => {});
        const cards = container.querySelectorAll('.picker-card');
        expect(cards).toHaveLength(2);
        expect(cards[0].dataset.concertId).toBe('c1');
        expect(cards[1].dataset.concertId).toBe('c2');
    });

    it('renders concert name and date as text', () => {
        renderPicker(container, sample, () => {});
        const first = container.querySelector('.picker-card');
        expect(first.textContent).toContain('Tidigast');
        expect(first.textContent).toContain('08/03/26');
    });

    it('invokes onSelect with concertId on card click', () => {
        const onSelect = vi.fn();
        renderPicker(container, sample, onSelect);
        container.querySelector('[data-concert-id="c2"]').click();
        expect(onSelect).toHaveBeenCalledWith('c2');
    });

    it('shows empty-state message when concerts is empty', () => {
        renderPicker(container, [], () => {});
        expect(container.querySelectorAll('.picker-card')).toHaveLength(0);
        expect(container.textContent).toMatch(/inga kommande konserter/i);
    });

    it('clears previous content on re-render', () => {
        renderPicker(container, sample, () => {});
        renderPicker(container, [sample[0]], () => {});
        expect(container.querySelectorAll('.picker-card')).toHaveLength(1);
    });
});
