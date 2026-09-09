import { describe, it, expect, beforeEach } from 'vitest';
import { renderWheel, destinationFor, POLL_INTERVAL_MS } from '../src/wheel.js';
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
        expect(rows[0].textContent).toContain('01-15');
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
