import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openManualAdd, closeManualAdd } from '../../src/sidebar/manualAdd.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function makeModal() {
    const m = document.createElement('div');
    m.id = 'manual-add-modal';
    document.body.appendChild(m);
    return m;
}

describe('manualAdd', () => {
    it('debounces search to 250ms', async () => {
        const modal = makeModal();
        const fetchMembers = vi.fn(async () => []);
        openManualAdd({ modalEl: modal, fetchMembers, instruments: ['1:a'], onSubmit: () => {} });

        const input = modal.querySelector('input.manual-search');
        input.value = 'a';
        input.dispatchEvent(new Event('input'));
        input.value = 'an';
        input.dispatchEvent(new Event('input'));
        input.value = 'ann';
        input.dispatchEvent(new Event('input'));

        await vi.advanceTimersByTimeAsync(100);
        expect(fetchMembers).toHaveBeenCalledTimes(0);
        await vi.advanceTimersByTimeAsync(200);
        expect(fetchMembers).toHaveBeenCalledTimes(1);
        expect(fetchMembers).toHaveBeenCalledWith('ann');
    });

    it('renders results then transitions to instrument picker on click', async () => {
        const modal = makeModal();
        const onSubmit = vi.fn();
        const fetchMembers = vi.fn(async () => [{ id: 'g1', displayName: 'Gäst', hasHarmonian: false }]);
        openManualAdd({ modalEl: modal, fetchMembers, instruments: ['1:a', 'tarol'], onSubmit });

        const input = modal.querySelector('input.manual-search');
        input.value = 'gast';
        input.dispatchEvent(new Event('input'));
        await vi.advanceTimersByTimeAsync(300);
        await Promise.resolve();

        const result = modal.querySelector('.manual-result');
        expect(result.textContent).toContain('Gäst');
        result.click();

        const instButtons = modal.querySelectorAll('.manual-instrument');
        expect(instButtons.length).toBe(2);
        instButtons[1].click(); // tarol
        expect(onSubmit).toHaveBeenCalledWith({
            userId: 'g1', displayName: 'Gäst', instrument: 'tarol'
        });
    });

    it('closeManualAdd hides modal', () => {
        const modal = makeModal();
        modal.style.display = 'flex';
        closeManualAdd(modal);
        expect(modal.style.display).toBe('none');
    });
});
