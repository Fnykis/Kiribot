import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWheel, initWheel, destinationFor, POLL_INTERVAL_MS, MONTH_NAMES, NO_CHANNEL_TEXT, UNDELIVERABLE_TEXT, VIA_MODERATOR_TEXT, NO_BODY_TEXT, CLOSE_LABEL_TEXT, DISCARD_CONFIRM_TEXT } from '../src/wheel.js';
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

describe('wheel CRUD wiring', () => {
    let root;
    beforeEach(() => { root = document.createElement('div'); });

    const wheelData = {
        role: { id: 'r1', name: 'tarol', hasChannel: true, viaModerator: false },
        entries: [{ id: 'e1', roleId: 'r1', monthDay: '01-15', title: 'Boka lokal', body: '', version: 1, sentYears: [] }]
    };

    it('opens a form when the new-entry button is clicked', async () => {
        await initWheel(root, '?role=r1', { get: async () => wheelData, poll: false });
        root.querySelector('#new-entry-btn').click();
        expect(root.querySelector('#form-slot form')).not.toBeNull();
    });

    it('posts a new entry and reloads the wheel', async () => {
        const posted = [];
        await initWheel(root, '?role=r1', {
            get: async () => wheelData,
            post: async (path, body) => { posted.push({ path, body }); return {}; },
            poll: false
        });
        root.querySelector('#new-entry-btn').click();
        const form = root.querySelector('#form-slot form');
        form.querySelector('input[name="title"]').value = 'Ny';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        await Promise.resolve();
        expect(posted[0].path).toBe('/api/web/yearwheel/r1');
        expect(posted[0].body.title).toBe('Ny');
    });

    it('patches an edited entry with its version', async () => {
        const patched = [];
        await initWheel(root, '?role=r1', {
            get: async () => wheelData,
            patch: async (path, body) => { patched.push({ path, body }); return {}; },
            poll: false
        });
        root.querySelector('button.entry-edit').click();
        const form = root.querySelector('#form-slot form');
        form.querySelector('input[name="title"]').value = 'Ändrad';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        await Promise.resolve();
        expect(patched[0].path).toBe('/api/web/yearwheel/entry/e1');
        expect(patched[0].body).toMatchObject({ title: 'Ändrad', version: 1 });
    });

    it('confirms before deleting and sends the version', async () => {
        const deleted = [];
        const confirmed = [];
        await initWheel(root, '?role=r1', {
            get: async () => wheelData,
            del: async (path, body) => { deleted.push({ path, body }); },
            confirm: msg => { confirmed.push(msg); return true; },
            poll: false
        });
        root.querySelector('button.entry-delete').click();
        await Promise.resolve();
        expect(confirmed[0]).toContain('Boka lokal');
        expect(deleted[0]).toEqual({ path: '/api/web/yearwheel/entry/e1', body: { version: 1 } });
    });

    it('deletes nothing when the confirmation is declined', async () => {
        const deleted = [];
        await initWheel(root, '?role=r1', {
            get: async () => wheelData,
            del: async (path, body) => { deleted.push({ path, body }); },
            confirm: () => false,
            poll: false
        });
        root.querySelector('button.entry-delete').click();
        await Promise.resolve();
        expect(deleted.length).toBe(0);
    });

    it('shows the conflict message and reopens the form on a 409', async () => {
        await initWheel(root, '?role=r1', {
            get: async () => wheelData,
            patch: async () => {
                throw new ApiError(409, 'version_conflict', {
                    entry: { id: 'e1', monthDay: '01-15', title: 'Serverns titel', body: '', version: 9 }
                });
            },
            poll: false
        });
        root.querySelector('button.entry-edit').click();
        const form = root.querySelector('#form-slot form');
        form.querySelector('input[name="title"]').value = 'Min ändring';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        await new Promise(r => setTimeout(r, 0));
        expect(root.textContent).toContain('Någon annan hann före — posten laddades om.');
        expect(root.querySelector('#form-slot input[name="title"]').value).toBe('Serverns titel');
    });
});

describe('poll pause and cleanup', () => {
    let root;
    beforeEach(() => { root = document.createElement('div'); });
    afterEach(() => { vi.useRealTimers(); });

    const wheelData = {
        role: { id: 'r1', name: 'tarol', hasChannel: true, viaModerator: false },
        entries: [{ id: 'e1', roleId: 'r1', monthDay: '01-15', title: 'Boka lokal', body: '', version: 1, sentYears: [] }]
    };

    it('does not redraw the open form on a poll tick even before it is dirty', async () => {
        vi.useFakeTimers();
        await initWheel(root, '?role=r1', { get: async () => wheelData, poll: true });
        root.querySelector('#new-entry-btn').click();
        const formBefore = root.querySelector('#form-slot form');
        expect(formBefore).not.toBeNull();

        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        // Same node — a poll tick over an open, untouched form must not have redrawn it.
        expect(root.querySelector('#form-slot form')).toBe(formBefore);
    });

    it('does not leave a duplicate interval behind when initWheel runs again', async () => {
        vi.useFakeTimers();
        await initWheel(root, '?role=r1', { get: async () => wheelData, poll: true });
        await initWheel(root, '?role=r1', { get: async () => wheelData, poll: true });

        // Only the second call's interval should still be pending — the first was torn down.
        expect(vi.getTimerCount()).toBe(1);
    });
});

describe('expanding an entry', () => {
    let root;
    beforeEach(() => { root = document.createElement('div'); });
    afterEach(() => { vi.useRealTimers(); });

    const two = [
        entry({ id: 'a', monthDay: '01-05', title: 'Först', body: 'Kroppstext A' }),
        entry({ id: 'b', monthDay: '01-06', title: 'Sedan', body: 'Kroppstext B' })
    ];
    const rowFor = id => root.querySelector(`.entry[data-id="${id}"]`);
    const toggleFor = id => rowFor(id).querySelector('.entry-toggle');
    const isOpen = id => rowFor(id).classList.contains('is-open');

    it('starts every entry collapsed', () => {
        renderWheel(root, { role: ROLE, entries: two });
        expect(isOpen('a')).toBe(false);
        expect(isOpen('b')).toBe(false);
        expect(toggleFor('a').getAttribute('aria-expanded')).toBe('false');
    });

    it('opens the entry that was clicked and shows its body', () => {
        renderWheel(root, { role: ROLE, entries: two });
        toggleFor('a').click();
        expect(isOpen('a')).toBe(true);
        expect(toggleFor('a').getAttribute('aria-expanded')).toBe('true');
        expect(rowFor('a').querySelector('.entry-body').textContent).toBe('Kroppstext A');
    });

    it('collapses the entry again when it is clicked a second time', () => {
        renderWheel(root, { role: ROLE, entries: two });
        toggleFor('a').click();
        toggleFor('a').click();
        expect(isOpen('a')).toBe(false);
        expect(toggleFor('a').getAttribute('aria-expanded')).toBe('false');
    });

    it('collapses the open entry when another one is opened', () => {
        renderWheel(root, { role: ROLE, entries: two });
        toggleFor('a').click();
        toggleFor('b').click();
        expect(isOpen('a')).toBe(false);
        expect(isOpen('b')).toBe(true);
    });

    it('names the empty body rather than opening onto nothing', () => {
        renderWheel(root, { role: ROLE, entries: [entry({ body: '   ' })] });
        expect(root.querySelector('.entry-body').textContent).toBe(NO_BODY_TEXT);
    });

    it('keeps edit and delete inside the panel the row opens', () => {
        renderWheel(root, { role: ROLE, entries: [entry()] });
        expect(root.querySelector('.entry-panel .entry-edit')).not.toBeNull();
        expect(root.querySelector('.entry-panel .entry-delete')).not.toBeNull();
    });

    it('tells the caller which entry is open, and that none is', () => {
        const seen = [];
        renderWheel(root, { role: ROLE, entries: two }, { onToggleEntry: id => seen.push(id) });
        toggleFor('a').click();
        toggleFor('a').click();
        expect(seen).toEqual(['a', null]);
    });

    it('restores the open entry when a redraw is asked for one', () => {
        renderWheel(root, { role: ROLE, entries: two }, { expandedId: 'b' });
        expect(isOpen('b')).toBe(true);
        expect(isOpen('a')).toBe(false);
    });

    it('leaves an entry the user opened open across a poll redraw', async () => {
        vi.useFakeTimers();
        const wheelData = {
            role: ROLE,
            entries: [entry({ id: 'e1', body: 'Kroppstext' })]
        };
        await initWheel(root, '?role=r1', { get: async () => wheelData, poll: true });
        root.querySelector('.entry-toggle').click();
        expect(isOpen('e1')).toBe(true);

        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        expect(isOpen('e1')).toBe(true);
    });
});

describe('the entry form as a modal', () => {
    let root;
    beforeEach(() => {
        root = document.createElement('div');
        document.body.className = '';
    });

    const wheelData = {
        role: { id: 'r1', name: 'tarol', hasChannel: true, viaModerator: false },
        entries: [{ id: 'e1', roleId: 'r1', monthDay: '01-15', title: 'Boka lokal', body: '', version: 1, sentYears: [] }]
    };
    const open = async (deps = {}) => {
        await initWheel(root, '?role=r1', { get: async () => wheelData, poll: false, ...deps });
        root.querySelector('#new-entry-btn').click();
        return root.querySelector('dialog.modal');
    };
    const dirty = dialog => {
        dialog.querySelector('input[name="title"]').dispatchEvent(new Event('input'));
    };

    it('opens the form inside a dialog rather than in the page', async () => {
        const dialog = await open();
        expect(dialog).not.toBeNull();
        expect(dialog.hasAttribute('open')).toBe(true);
        expect(dialog.querySelector('form.entry-form')).not.toBeNull();
        // Still reachable where the page has always looked for it.
        expect(root.querySelector('#form-slot form')).not.toBeNull();
    });

    it('names the dialog with the form heading', async () => {
        const dialog = await open();
        const heading = dialog.querySelector('.form-heading');
        expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
    });

    it('locks the page behind the modal and lets go on close', async () => {
        const dialog = await open();
        expect(document.body.classList.contains('modal-open')).toBe(true);
        dialog.querySelector('.modal-close').click();
        expect(document.body.classList.contains('modal-open')).toBe(false);
    });

    it('closes an untouched form from the ✕, from Esc and from the backdrop', async () => {
        for (const dismiss of [
            d => d.querySelector('.modal-close').click(),
            d => d.dispatchEvent(new Event('cancel', { cancelable: true })),
            d => d.click()
        ]) {
            root = document.createElement('div');
            const dialog = await open();
            dismiss(dialog);
            expect(root.querySelector('dialog.modal')).toBeNull();
        }
    });

    it('labels the close button', async () => {
        const dialog = await open();
        expect(dialog.querySelector('.modal-close').getAttribute('aria-label')).toBe(CLOSE_LABEL_TEXT);
    });

    it('keeps a click inside the card from closing the modal', async () => {
        const dialog = await open();
        dialog.querySelector('.modal-card').click();
        expect(root.querySelector('dialog.modal')).not.toBeNull();
    });

    it('asks before throwing away a half-typed entry', async () => {
        const asked = [];
        const dialog = await open({ confirm: msg => { asked.push(msg); return false; } });
        dirty(dialog);
        dialog.querySelector('.modal-close').click();
        expect(asked).toEqual([DISCARD_CONFIRM_TEXT]);
        expect(root.querySelector('dialog.modal')).not.toBeNull();
    });

    it('closes the half-typed entry once that is confirmed', async () => {
        const dialog = await open({ confirm: () => true });
        dirty(dialog);
        dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
        expect(root.querySelector('dialog.modal')).toBeNull();
    });

    it('runs Avbryt through the same check', async () => {
        const asked = [];
        const dialog = await open({ confirm: msg => { asked.push(msg); return false; } });
        dirty(dialog);
        dialog.querySelector('button.cancel').click();
        expect(asked).toEqual([DISCARD_CONFIRM_TEXT]);
        expect(root.querySelector('dialog.modal')).not.toBeNull();
    });

    it('never asks about a form nobody typed in', async () => {
        const asked = [];
        const dialog = await open({ confirm: msg => { asked.push(msg); return true; } });
        dialog.querySelector('button.cancel').click();
        expect(asked).toEqual([]);
        expect(root.querySelector('dialog.modal')).toBeNull();
    });

    it('shows a 409 notice inside the dialog, not behind it', async () => {
        await initWheel(root, '?role=r1', {
            get: async () => wheelData,
            patch: async () => {
                throw new ApiError(409, 'version_conflict', {
                    entry: { id: 'e1', monthDay: '01-15', title: 'Serverns titel', body: '', version: 9 }
                });
            },
            poll: false
        });
        root.querySelector('button.entry-edit').click();
        const form = root.querySelector('#form-slot form');
        form.querySelector('input[name="title"]').value = 'Min ändring';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        await new Promise(r => setTimeout(r, 0));

        const dialog = root.querySelector('dialog.modal');
        expect(dialog.textContent).toContain('Någon annan hann före — posten laddades om.');
        expect(dialog.querySelector('input[name="title"]').value).toBe('Serverns titel');
    });
});
