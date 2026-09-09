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

export function renderWheel(root, { role, entries }) {
    root.replaceChildren();

    const back = el('a', 'back-link', '← Tillbaka');
    back.setAttribute('href', 'index.html');
    root.appendChild(back);

    root.appendChild(el('h1', null, role.name));

    if (!entries.length) {
        root.appendChild(el('p', 'notice', 'Inga poster i årshjulet ännu.'));
        return;
    }

    const list = el('ul', 'entry-list');
    for (const entry of entries) {
        const li = el('li', 'entry');
        li.appendChild(el('span', 'entry-date', entry.monthDay));
        li.appendChild(el('span', 'entry-title', entry.title));
        list.appendChild(li);
    }
    root.appendChild(list);
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
