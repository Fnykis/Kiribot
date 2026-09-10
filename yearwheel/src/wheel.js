import { apiGet } from './api.js';

export const POLL_INTERVAL_MS = 60_000;

const REDIRECTING_CODES = new Set(['no_session', 'not_in_guild', 'missing_role']);

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

export async function initWheel(root, search = window.location.search) {
    const roleId = new URLSearchParams(search).get('role');
    if (!roleId) {
        window.location.replace('index.html');
        return;
    }

    async function load() {
        try {
            renderWheel(root, await apiGet(`/api/web/yearwheel/${encodeURIComponent(roleId)}`));
        } catch (err) {
            const dest = destinationFor(err);
            if (dest) {
                window.location.replace(`${dest.url}?reason=${dest.reason}`);
                return;
            }
            root.replaceChildren(el('p', 'notice', 'Kunde inte hämta årshjulet. Försök igen senare.'));
        }
    }

    await load();
    setInterval(load, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') load();
    });
}
