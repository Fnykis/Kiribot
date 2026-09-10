import { describe, it, expect, beforeEach } from 'vitest';
import { renderWheel, destinationFor, POLL_INTERVAL_MS, MONTH_NAMES, NO_CHANNEL_TEXT, UNDELIVERABLE_TEXT, VIA_MODERATOR_TEXT } from '../src/wheel.js';
import { ApiError } from '../src/api.js';

let root;
beforeEach(() => { root = document.createElement('div'); });

describe('renderWheel', () => {
    it('shows the group name as the heading', () => {
        renderWheel(root, { role: { id: 'r1', name: 'transportgruppen' }, entries: [] });
        expect(root.querySelector('h1').textContent).toBe('transportgruppen');
    });

    it('renders one row per entry with its date and title', () => {
        renderWheel(root, {
            role: { id: 'r1', name: 'g' },
            entries: [
                { id: 'e1', monthDay: '01-15', title: 'Boka lokal' },
                { id: 'e2', monthDay: '06-06', title: 'Sommarfest' }
            ]
        });
        const rows = [...root.querySelectorAll('.entry')];
        expect(rows.length).toBe(2);
        // Task 16 groups entries under a month heading and shows only the day on the row.
        expect(rows[0].textContent).toContain('15');
        expect(rows[0].textContent).toContain('Boka lokal');
    });

    it('shows an empty-state message when there are no entries', () => {
        renderWheel(root, { role: { id: 'r1', name: 'g' }, entries: [] });
        expect(root.textContent).toContain('Inga poster i årshjulet ännu.');
    });

    it('escapes entry titles rather than injecting HTML', () => {
        renderWheel(root, { role: { id: 'r1', name: 'g' }, entries: [{ id: 'e1', monthDay: '01-01', title: '<img src=x onerror=alert(1)>' }] });
        expect(root.querySelector('img')).toBeNull();
    });

    it('has a back link to the landing page', () => {
        renderWheel(root, { role: { id: 'r1', name: 'g' }, entries: [] });
        expect(root.querySelector('a.back-link').getAttribute('href')).toBe('index.html');
    });
});

describe('destinationFor', () => {
    it('sends an expired session to the landing page', () => {
        expect(destinationFor(new ApiError(401, 'no_session'))).toEqual({ url: 'index.html', reason: 'no_session' });
    });

    it('sends a kicked user to the landing page', () => {
        expect(destinationFor(new ApiError(403, 'not_in_guild'))).toEqual({ url: 'index.html', reason: 'not_in_guild' });
    });

    it('sends a user who lost the role to the landing page', () => {
        expect(destinationFor(new ApiError(403, 'missing_role'))).toEqual({ url: 'index.html', reason: 'missing_role' });
    });

    it('returns null for errors that should not navigate', () => {
        expect(destinationFor(new ApiError(500, 'internal'))).toBeNull();
        expect(destinationFor(new ApiError(502, 'http_502'))).toBeNull();
    });
});

describe('polling', () => {
    it('polls at most once a minute', () => {
        expect(POLL_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
    });
});

const ROLE = { id: 'r1', name: 'tarol', hasChannel: true, viaModerator: false };
const entry = (over = {}) => ({ id: 'e1', roleId: 'r1', monthDay: '01-15', title: 'Boka lokal', body: '', version: 1, sentYears: [], ...over });

describe('month grouping', () => {
    let root;
    beforeEach(() => { root = document.createElement('div'); });

    it('uses the Swedish month names', () => {
        expect(MONTH_NAMES[0]).toBe('januari');
        expect(MONTH_NAMES[11]).toBe('december');
        expect(MONTH_NAMES.length).toBe(12);
    });

    it('groups entries under uppercase month headings in calendar order', () => {
        renderWheel(root, {
            role: ROLE,
            entries: [entry({ id: 'a', monthDay: '09-20', title: 'Terminsstart' }), entry({ id: 'b', monthDay: '01-15' })]
        });
        const headings = [...root.querySelectorAll('.month-heading')].map(h => h.textContent);
        expect(headings).toEqual(['JANUARI', 'SEPTEMBER']);
    });

    it('omits months with no entries', () => {
        renderWheel(root, { role: ROLE, entries: [entry()] });
        expect(root.querySelectorAll('.month-heading').length).toBe(1);
    });

    it('orders entries within a month by day', () => {
        renderWheel(root, {
            role: ROLE,
            entries: [entry({ id: 'a', monthDay: '01-20', title: 'Sen' }), entry({ id: 'b', monthDay: '01-05', title: 'Tidig' })]
        });
        expect([...root.querySelectorAll('.entry-title')].map(e => e.textContent)).toEqual(['Tidig', 'Sen']);
    });

    it('shows the day without the month on each row', () => {
        renderWheel(root, { role: ROLE, entries: [entry({ monthDay: '01-05' })] });
        expect(root.querySelector('.entry-date').textContent).toBe('05');
    });

    it('keeps the empty-wheel notice', () => {
        renderWheel(root, { role: ROLE, entries: [] });
        expect(root.textContent).toContain('Inga poster i årshjulet ännu.');
    });

    it('gives every entry an edit and a delete button', () => {
        renderWheel(root, { role: ROLE, entries: [entry()] });
        expect(root.querySelector('.entry button.entry-edit')).not.toBeNull();
        expect(root.querySelector('.entry button.entry-delete')).not.toBeNull();
    });

    it('offers a new-entry button', () => {
        renderWheel(root, { role: ROLE, entries: [] });
        expect(root.querySelector('#new-entry-btn').textContent).toBe('+ Ny post');
    });
});

describe('no-channel state', () => {
    let root;
    beforeEach(() => { root = document.createElement('div'); });

    it('uses the exact wording', () => {
        expect(NO_CHANNEL_TEXT).toBe('Gruppen saknar en egen kanal i Discord — inga påminnelser skickas förrän en kanal finns.');
        expect(UNDELIVERABLE_TEXT).toBe('(skickas ej)');
        expect(VIA_MODERATOR_TEXT).toBe('Du visar den här gruppens årshjul som moderator.');
    });

    it('shows the banner and marks each entry when the group has no channel', () => {
        renderWheel(root, { role: { ...ROLE, hasChannel: false }, entries: [entry()] });
        expect(root.textContent).toContain(NO_CHANNEL_TEXT);
        expect(root.querySelector('.entry-undeliverable').textContent).toBe(UNDELIVERABLE_TEXT);
    });

    it('shows neither when the group has a channel', () => {
        renderWheel(root, { role: ROLE, entries: [entry()] });
        expect(root.textContent).not.toContain(NO_CHANNEL_TEXT);
        expect(root.querySelector('.entry-undeliverable')).toBeNull();
    });

    it('still lets a channel-less group save — the new-entry button stays', () => {
        renderWheel(root, { role: { ...ROLE, hasChannel: false }, entries: [] });
        expect(root.querySelector('#new-entry-btn')).not.toBeNull();
    });
});

describe('moderator context', () => {
    let root;
    beforeEach(() => { root = document.createElement('div'); });

    it('names the situation when a moderator opens a foreign wheel', () => {
        renderWheel(root, { role: { ...ROLE, viaModerator: true }, entries: [] });
        expect(root.textContent).toContain(VIA_MODERATOR_TEXT);
    });

    it('says nothing on a wheel the caller holds themselves', () => {
        renderWheel(root, { role: ROLE, entries: [] });
        expect(root.textContent).not.toContain(VIA_MODERATOR_TEXT);
    });
});
