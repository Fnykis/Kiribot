import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    renderEntryForm, daysInMonth, isFormDirty,
    TITLE_TOO_LONG_TEXT, INVALID_DATE_TEXT, deleteConfirmText
} from '../src/entryForm.js';

let host;
beforeEach(() => { host = document.createElement('div'); });

function mount(opts = {}) {
    const form = renderEntryForm({ onSave: () => {}, onCancel: () => {}, ...opts });
    host.appendChild(form);
    return form;
}

describe('daysInMonth', () => {
    it('offers 29 days in February so 02-29 can be chosen', () => {
        expect(daysInMonth(2)).toBe(29);
    });

    it('knows the short months', () => {
        expect(daysInMonth(4)).toBe(30);
        expect(daysInMonth(1)).toBe(31);
        expect(daysInMonth(12)).toBe(31);
    });
});

describe('renderEntryForm', () => {
    it('has a title input, month and day selects, and a body textarea', () => {
        const form = mount();
        expect(form.querySelector('input[name="title"]')).not.toBeNull();
        expect(form.querySelector('select[name="month"]')).not.toBeNull();
        expect(form.querySelector('select[name="day"]')).not.toBeNull();
        expect(form.querySelector('textarea[name="body"]')).not.toBeNull();
        expect(form.querySelector('input[type="date"]')).toBeNull();
    });

    it('uses Swedish labels and buttons', () => {
        const form = mount();
        expect(form.textContent).toContain('Titel');
        expect(form.textContent).toContain('Datum');
        expect(form.textContent).toContain('Beskrivning');
        expect(form.querySelector('button[type="submit"]').textContent).toBe('Spara');
        expect(form.querySelector('button.cancel').textContent).toBe('Avbryt');
    });

    it('starts empty for a new entry', () => {
        const form = mount();
        expect(form.querySelector('input[name="title"]').value).toBe('');
        expect(form.querySelector('textarea[name="body"]').value).toBe('');
    });

    it('prefills from an existing entry', () => {
        const form = mount({ entry: { id: 'e1', monthDay: '03-07', title: 'A', body: 'b', version: 2 } });
        expect(form.querySelector('input[name="title"]').value).toBe('A');
        expect(form.querySelector('textarea[name="body"]').value).toBe('b');
        expect(form.querySelector('select[name="month"]').value).toBe('03');
        expect(form.querySelector('select[name="day"]').value).toBe('07');
    });

    it('re-renders the day list when the month changes and keeps a valid day', () => {
        const form = mount({ entry: { id: 'e1', monthDay: '01-31', title: 'A', body: '', version: 1 } });
        const month = form.querySelector('select[name="month"]');
        month.value = '02';
        month.dispatchEvent(new Event('change'));
        const days = [...form.querySelectorAll('select[name="day"] option')].map(o => o.value);
        expect(days.length).toBe(29);
        expect(days.at(-1)).toBe('29');
    });

    it('clamps the selected day when moving to a shorter month', () => {
        const form = mount({ entry: { id: 'e1', monthDay: '01-31', title: 'A', body: '', version: 1 } });
        const month = form.querySelector('select[name="month"]');
        month.value = '04';
        month.dispatchEvent(new Event('change'));
        expect(form.querySelector('select[name="day"]').value).toBe('30');
    });

    it('submits the trimmed values and the version', () => {
        const onSave = vi.fn();
        const form = mount({ entry: { id: 'e1', monthDay: '03-07', title: 'A', body: 'b', version: 2 }, onSave });
        form.querySelector('input[name="title"]').value = '  Ny titel  ';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(onSave).toHaveBeenCalledWith({ title: 'Ny titel', body: 'b', monthDay: '03-07', version: 2 });
    });

    it('refuses to submit an empty title and says why', () => {
        const onSave = vi.fn();
        const form = mount({ onSave });
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(onSave).not.toHaveBeenCalled();
        expect(form.querySelector('.form-error').textContent).toBe(TITLE_TOO_LONG_TEXT);
    });

    it('refuses a title over 100 characters', () => {
        const onSave = vi.fn();
        const form = mount({ onSave });
        form.querySelector('input[name="title"]').value = 'x'.repeat(101);
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(onSave).not.toHaveBeenCalled();
        expect(form.querySelector('.form-error').textContent).toBe(TITLE_TOO_LONG_TEXT);
    });

    it('calls onCancel from the cancel button', () => {
        const onCancel = vi.fn();
        const form = mount({ onCancel });
        form.querySelector('button.cancel').click();
        expect(onCancel).toHaveBeenCalled();
    });

    it('reports dirty only after the user changes something', () => {
        const form = mount({ entry: { id: 'e1', monthDay: '03-07', title: 'A', body: 'b', version: 2 } });
        expect(isFormDirty(form)).toBe(false);
        const title = form.querySelector('input[name="title"]');
        title.value = 'A2';
        title.dispatchEvent(new Event('input'));
        expect(isFormDirty(form)).toBe(true);
    });

    it('names the entry in the delete confirmation', () => {
        expect(deleteConfirmText('Boka lokal')).toBe('Ta bort posten «Boka lokal»? Det går inte att ångra.');
    });

    it('exports the exact invalid-date wording', () => {
        expect(INVALID_DATE_TEXT).toBe('Välj ett giltigt datum.');
    });
});
