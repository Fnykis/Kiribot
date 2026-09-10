import { apiGet, apiPost, apiPatch, apiDelete } from './api.js';
import {
    renderEntryForm, deleteConfirmText, showFormError,
    SAVE_FAILED_TEXT, CONFLICT_TEXT
} from './entryForm.js';

export const POLL_INTERVAL_MS = 60_000;

const REDIRECTING_CODES = new Set(['no_session', 'not_in_guild', 'missing_role']);

// Module-level so a re-entrant initWheel() call (no full page reload in between) tears
// down the previous poll instead of stacking a second interval/listener on top of it.
let activePollInterval = null;
let activeVisibilityHandler = null;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

export function destinationFor(error) {
    if (!error || !REDIRECTING_CODES.has(error.code)) return null;
    return { url: 'index.html', reason: error.code };
}

export const MONTH_NAMES = [
    'januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december'
];
export const NO_CHANNEL_TEXT = 'Gruppen saknar en egen kanal i Discord — inga påminnelser skickas förrän en kanal finns.';
export const UNDELIVERABLE_TEXT = '(skickas ej)';
export const VIA_MODERATOR_TEXT = 'Du visar den här gruppens årshjul som moderator.';
export const EMPTY_TEXT = 'Inga poster i årshjulet ännu.';

function entryRow(entry, { hasChannel }, handlers) {
    const li = el('li', 'entry');
    li.dataset.id = entry.id;
    li.appendChild(el('span', 'entry-date', entry.monthDay.slice(3, 5)));
    li.appendChild(el('span', 'entry-title', entry.title));
    if (!hasChannel) li.appendChild(el('span', 'entry-undeliverable', UNDELIVERABLE_TEXT));

    const edit = el('button', 'entry-edit', '✎');
    edit.type = 'button';
    edit.setAttribute('aria-label', `Redigera ${entry.title}`);
    if (handlers.onEdit) edit.addEventListener('click', () => handlers.onEdit(entry));
    li.appendChild(edit);

    const remove = el('button', 'entry-delete', '✕');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Ta bort ${entry.title}`);
    if (handlers.onDelete) remove.addEventListener('click', () => handlers.onDelete(entry));
    li.appendChild(remove);

    return li;
}

export function renderWheel(root, { role, entries }, handlers = {}) {
    root.replaceChildren();

    const back = el('a', 'back-link', '← Tillbaka');
    back.setAttribute('href', 'index.html');
    root.appendChild(back);

    const newBtn = el('button', 'btn', '+ Ny post');
    newBtn.id = 'new-entry-btn';
    newBtn.type = 'button';
    if (handlers.onNew) newBtn.addEventListener('click', () => handlers.onNew());
    root.appendChild(newBtn);

    root.appendChild(el('h1', null, role.name));

    if (role.viaModerator) root.appendChild(el('p', 'notice notice-mod', VIA_MODERATOR_TEXT));
    if (!role.hasChannel) root.appendChild(el('p', 'notice notice-warning', NO_CHANNEL_TEXT));

    const formSlot = el('div', 'form-slot');
    formSlot.id = 'form-slot';
    root.appendChild(formSlot);

    if (!entries.length) {
        root.appendChild(el('p', 'notice', EMPTY_TEXT));
        return;
    }

    // Grouped by month, in calendar order. A month with no entries is not rendered —
    // an empty JULI heading is noise.
    const sorted = [...entries].sort((a, b) => a.monthDay.localeCompare(b.monthDay));
    let currentMonth = null;
    let list = null;
    for (const entry of sorted) {
        const month = entry.monthDay.slice(0, 2);
        if (month !== currentMonth) {
            currentMonth = month;
            root.appendChild(el('h2', 'month-heading', MONTH_NAMES[Number(month) - 1].toUpperCase()));
            list = el('ul', 'entry-list');
            root.appendChild(list);
        }
        list.appendChild(entryRow(entry, role, handlers));
    }
}

export async function initWheel(root, search = window.location.search, deps = {}) {
    // Idempotent re-init: stop any poll a prior initWheel() call started before setting
    // up a new one, so calling this twice never leaves duplicate intervals/listeners.
    if (activePollInterval !== null) {
        clearInterval(activePollInterval);
        activePollInterval = null;
    }
    if (activeVisibilityHandler) {
        document.removeEventListener('visibilitychange', activeVisibilityHandler);
        activeVisibilityHandler = null;
    }

    const {
        get = path => apiGet(path),
        post = (path, body) => apiPost(path, body),
        patch = (path, body) => apiPatch(path, body),
        del = (path, body) => apiDelete(path, body),
        confirm: confirmFn = message => window.confirm(message),
        poll = true
    } = deps;

    const roleId = new URLSearchParams(search).get('role');
    if (!roleId) {
        window.location.replace('index.html');
        return;
    }

    let data = null;
    let openEntry = null;   // the entry being edited, or null for a new one
    let formOpen = false;
    let notice = null;

    function currentForm() {
        return root.querySelector('#form-slot form');
    }

    function closeForm() {
        formOpen = false;
        openEntry = null;
        draw();
    }

    function openForm(entry) {
        formOpen = true;
        openEntry = entry || null;
        draw();
    }

    function draw() {
        renderWheel(root, data, {
            onNew: () => openForm(null),
            onEdit: entry => openForm(entry),
            onDelete: entry => remove(entry)
        });
        if (notice) {
            root.querySelector('#form-slot').before(el('p', 'notice notice-transient', notice));
            notice = null;
        }
        if (formOpen) {
            root.querySelector('#form-slot').appendChild(
                renderEntryForm({ entry: openEntry, onSave: save, onCancel: closeForm })
            );
        }
    }

    async function save(values) {
        const form = currentForm();
        try {
            if (openEntry) {
                await patch(`/api/web/yearwheel/entry/${encodeURIComponent(openEntry.id)}`, values);
            } else {
                await post(`/api/web/yearwheel/${encodeURIComponent(roleId)}`, {
                    title: values.title, body: values.body, monthDay: values.monthDay
                });
            }
            formOpen = false;
            openEntry = null;
            await load();
        } catch (err) {
            if (navigateOnError(err)) return;
            if (err && err.code === 'version_conflict') {
                // Reopen the form on the server's values — nothing typed is written over
                // someone else's edit.
                notice = CONFLICT_TEXT;
                openEntry = err.body?.entry ?? openEntry;
                await load({ keepForm: true });
                return;
            }
            if (form) showFormError(form, SAVE_FAILED_TEXT);
        }
    }

    async function remove(entry) {
        if (!confirmFn(deleteConfirmText(entry.title))) return;
        try {
            await del(`/api/web/yearwheel/entry/${encodeURIComponent(entry.id)}`, { version: entry.version });
            await load();
        } catch (err) {
            if (navigateOnError(err)) return;
            notice = err && err.code === 'version_conflict' ? CONFLICT_TEXT : SAVE_FAILED_TEXT;
            await load();
        }
    }

    function navigateOnError(err) {
        const dest = destinationFor(err);
        if (!dest) return false;
        window.location.replace(`${dest.url}?reason=${dest.reason}`);
        return true;
    }

    async function load({ keepForm = false } = {}) {
        try {
            data = await get(`/api/web/yearwheel/${encodeURIComponent(roleId)}`);
            if (keepForm) formOpen = true;
            draw();
        } catch (err) {
            if (navigateOnError(err)) return;
            root.replaceChildren(el('p', 'notice', 'Kunde inte hämta årshjulet. Försök igen senare.'));
        }
    }

    await load();

    if (poll) {
        // A poll must never touch the form's DOM once it's open — even before it's dirty,
        // a redraw would destroy the field the user just clicked into. The form is a
        // manual, explicit action; only an explicit save/cancel/409-reload may redraw it.
        const refresh = () => {
            if (formOpen) return;
            load();
        };
        activePollInterval = setInterval(refresh, POLL_INTERVAL_MS);
        activeVisibilityHandler = () => {
            if (document.visibilityState === 'visible') refresh();
        };
        document.addEventListener('visibilitychange', activeVisibilityHandler);
    }
}
