import { apiGet, apiPost, apiPatch, apiDelete } from './api.js';
import { icon } from './icons.js';
import {
    renderEntryForm, deleteConfirmText, showFormError, isFormDirty,
    SAVE_FAILED_TEXT, CONFLICT_TEXT
} from './entryForm.js';

export const POLL_INTERVAL_MS = 60_000;

const REDIRECTING_CODES = new Set(['no_session', 'not_in_guild', 'missing_role']);

// Module-level so a re-entrant initWheel() call (no full page reload in between) tears
// down the previous poll instead of stacking a second interval/listener on top of it.
let activePollInterval = null;
let activeVisibilityHandler = null;

// Panel/label ids are minted here rather than derived from entry.id: they only ever have to
// be unique within one render, and a generated id can never be a string the store handed us.
let domIdSeq = 0;

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
export const EMPTY_HINT_TEXT = 'Tryck på + Ny post för att lägga till den första.';
export const NO_BODY_TEXT = 'Ingen beskrivning.';
export const SENT_TEXT = 'Påminnelsen är skickad i år.';
export const LOAD_ERROR_TEXT = 'Kunde inte hämta årshjulet. Försök igen senare.';
export const RETRY_TEXT = 'Försök igen';
export const CLOSE_LABEL_TEXT = 'Stäng';
export const DISCARD_CONFIRM_TEXT = 'Stäng utan att spara? Det du har skrivit försvinner.';

function noticeLine(className, iconName, text) {
    const p = el('p', `notice ${className}`);
    p.appendChild(icon(iconName));
    p.appendChild(el('span', null, text));
    return p;
}

// The form is a modal, not a slab pushed into the page: on a phone it opens over the list
// instead of shoving it down, and it is the only thing on screen while it is open. A native
// <dialog> is doing the work — top layer, focus trap, Esc, inert background, ::backdrop —
// none of which is worth reimplementing on a div.
export function buildModal(form, onRequestClose, noticeText) {
    const dialog = el('dialog', 'modal');
    const labelledBy = form.getAttribute('aria-labelledby');
    if (labelledBy) dialog.setAttribute('aria-labelledby', labelledBy);

    const card = el('div', 'modal-card');

    // First in the DOM so the way out is the first thing a screen reader reaches, and pinned
    // outside the scrolling body so it stays reachable in a long form.
    const close = el('button', 'modal-close');
    close.type = 'button';
    close.setAttribute('aria-label', CLOSE_LABEL_TEXT);
    close.appendChild(icon('close'));
    close.addEventListener('click', () => onRequestClose());
    card.appendChild(close);

    const body = el('div', 'modal-body');
    body.appendChild(form);
    if (noticeText) {
        // A conflict notice belongs inside the dialog — behind the scrim nobody would read
        // it. It goes under the heading, so the dialog still says what it is first.
        const line = noticeLine('notice-transient', 'warning', noticeText);
        line.setAttribute('role', 'status');
        const heading = form.querySelector('.form-heading');
        if (heading) heading.after(line);
        else body.insertBefore(line, form);
    }
    card.appendChild(body);
    dialog.appendChild(card);

    // Esc is the browser's own dismissal; route it through the same unsaved-changes check
    // as the close button and Avbryt rather than letting it drop the dialog outright.
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        onRequestClose();
    });
    // A click that lands on the dialog element itself landed on the backdrop — the card is
    // a child, so it keeps its own clicks.
    dialog.addEventListener('click', event => {
        if (event.target === dialog) onRequestClose();
    });

    return dialog;
}

// jsdom (and any browser without <dialog>) has the element but not showModal; the attribute
// fallback keeps the form usable there instead of rendering nothing at all.
export function openModal(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
}

function labelledButton(className, iconName, text, ariaLabel) {
    const button = el('button', className);
    button.type = 'button';
    button.appendChild(icon(iconName));
    button.appendChild(el('span', null, text));
    if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
    return button;
}

// One row is one control: the whole row expands the entry, and edit/delete live inside the
// panel that opens. A collapsed list is then all title and date, and the two destructive-ish
// actions are never a stray thumb away on a phone.
function entryRow(entry, { hasChannel }, handlers, onToggle) {
    const li = el('li', 'entry');
    li.dataset.id = entry.id;

    const panelId = `entry-panel-${++domIdSeq}`;
    const titleId = `entry-title-${domIdSeq}`;

    const toggle = el('button', 'entry-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', panelId);
    toggle.appendChild(el('span', 'entry-date', entry.monthDay.slice(3, 5)));
    const title = el('span', 'entry-title', entry.title);
    title.id = titleId;
    toggle.appendChild(title);
    if (!hasChannel) toggle.appendChild(el('span', 'entry-undeliverable', UNDELIVERABLE_TEXT));
    toggle.appendChild(icon('expand', 'icon entry-chevron'));
    toggle.addEventListener('click', () => onToggle(entry.id));
    li.appendChild(toggle);

    const panel = el('div', 'entry-panel');
    panel.id = panelId;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-labelledby', titleId);
    const inner = el('div', 'entry-panel-inner');
    const body = el('div', 'entry-panel-body');

    const text = typeof entry.body === 'string' ? entry.body.trim() : '';
    body.appendChild(text
        ? el('p', 'entry-body', text)
        : el('p', 'entry-body entry-body-empty', NO_BODY_TEXT));

    if (Array.isArray(entry.sentYears) && entry.sentYears.includes(new Date().getFullYear())) {
        const sent = el('p', 'entry-sent');
        sent.appendChild(icon('check'));
        sent.appendChild(el('span', null, SENT_TEXT));
        body.appendChild(sent);
    }

    const actions = el('div', 'entry-actions');
    const edit = labelledButton('entry-edit btn btn-ghost', 'edit', 'Redigera', `Redigera ${entry.title}`);
    if (handlers.onEdit) edit.addEventListener('click', () => handlers.onEdit(entry));
    actions.appendChild(edit);

    const remove = labelledButton('entry-delete btn btn-danger', 'remove', 'Ta bort', `Ta bort ${entry.title}`);
    if (handlers.onDelete) remove.addEventListener('click', () => handlers.onDelete(entry));
    actions.appendChild(remove);

    body.appendChild(actions);
    inner.appendChild(body);
    panel.appendChild(inner);
    li.appendChild(panel);

    return li;
}

// Accordion: at most one entry open, so the list never grows under the reading position in
// two places at once. Driven off the entry id rather than the node, so a poll redraw can put
// the same row back open.
export function applyExpansion(root, expandedId) {
    for (const li of root.querySelectorAll('.entry')) {
        const open = expandedId != null && li.dataset.id === expandedId;
        li.classList.toggle('is-open', open);
        li.querySelector('.entry-toggle')?.setAttribute('aria-expanded', String(open));
    }
}

export function renderWheel(root, { role, entries }, handlers = {}) {
    root.replaceChildren();

    const bar = el('div', 'app-bar');
    const back = el('a', 'back-link');
    back.setAttribute('href', 'index.html');
    back.appendChild(icon('back'));
    back.appendChild(el('span', null, 'Tillbaka'));
    bar.appendChild(back);
    root.appendChild(bar);

    root.appendChild(el('h1', null, role.name));
    if (entries.length) {
        root.appendChild(el('p', 'wheel-meta', entries.length === 1 ? '1 post' : `${entries.length} poster`));
    }

    if (role.viaModerator) root.appendChild(noticeLine('notice-mod', 'shield', VIA_MODERATOR_TEXT));
    if (!role.hasChannel) root.appendChild(noticeLine('notice-warning', 'warning', NO_CHANNEL_TEXT));

    const formSlot = el('div', 'form-slot');
    formSlot.id = 'form-slot';
    root.appendChild(formSlot);

    if (!entries.length) {
        const empty = el('div', 'empty-state');
        empty.appendChild(icon('calendar'));
        empty.appendChild(el('p', 'empty-title', EMPTY_TEXT));
        empty.appendChild(el('p', 'empty-hint', EMPTY_HINT_TEXT));
        root.appendChild(empty);
    } else {
        // Expansion is owned by the render: tapping a row opens it here and now, without a
        // redraw. The caller is only told which row is open, so it can hand the same id back
        // on the next draw (a poll tick must not close what someone is reading).
        let expandedId = handlers.expandedId ?? null;
        const toggle = id => {
            expandedId = expandedId === id ? null : id;
            applyExpansion(root, expandedId);
            if (handlers.onToggleEntry) handlers.onToggleEntry(expandedId);
        };

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
            list.appendChild(entryRow(entry, role, handlers, toggle));
        }
        applyExpansion(root, expandedId);
    }

    // Last in the DOM so `position: sticky; bottom` pins it over the list while there is
    // more list below, and lets it settle under the final entry once there is not.
    const actionBar = el('div', 'action-bar');
    const newBtn = el('button', 'btn btn-block', '+ Ny post');
    newBtn.type = 'button';
    newBtn.id = 'new-entry-btn';
    if (handlers.onNew) newBtn.addEventListener('click', () => handlers.onNew());
    actionBar.appendChild(newBtn);
    root.appendChild(actionBar);
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
    let expandedId = null;  // survives redraws (poll ticks included) so a read row stays open

    function currentForm() {
        return root.querySelector('#form-slot form');
    }

    function closeForm() {
        formOpen = false;
        openEntry = null;
        draw();
    }

    // Every way out of the modal — Avbryt, the ✕, Esc, a tap on the backdrop — comes through
    // here, so a half-typed entry can never be lost to a stray tap outside the card.
    function requestClose() {
        const form = currentForm();
        if (form && isFormDirty(form) && !confirmFn(DISCARD_CONFIRM_TEXT)) return;
        closeForm();
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
            onDelete: entry => remove(entry),
            // renderWheel opens and closes the row itself; all this has to do is remember
            // which one, so the next draw can restore it.
            onToggleEntry: id => { expandedId = id; },
            expandedId
        });
        const slot = root.querySelector('#form-slot');
        if (formOpen) {
            const form = renderEntryForm({ entry: openEntry, onSave: save, onCancel: requestClose });
            const dialog = buildModal(form, requestClose, notice);
            notice = null;
            slot.appendChild(dialog);
            openModal(dialog);
            form.querySelector('.form-heading')?.focus();
        } else if (notice) {
            const line = noticeLine('notice-transient', 'warning', notice);
            line.setAttribute('role', 'status');
            slot.before(line);
            notice = null;
        }
        // The list behind the scrim must not scroll under a thumb aimed at the card.
        document.body.classList.toggle('modal-open', formOpen);
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
            if (expandedId === entry.id) expandedId = null;
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

    function drawLoadError() {
        root.replaceChildren();
        const bar = el('div', 'app-bar');
        const back = el('a', 'back-link');
        back.setAttribute('href', 'index.html');
        back.appendChild(icon('back'));
        back.appendChild(el('span', null, 'Tillbaka'));
        bar.appendChild(back);
        root.appendChild(bar);

        const line = noticeLine('notice-warning', 'warning', LOAD_ERROR_TEXT);
        line.setAttribute('role', 'status');
        root.appendChild(line);

        const actionBar = el('div', 'action-bar');
        const retry = el('button', 'btn btn-block', RETRY_TEXT);
        retry.type = 'button';
        retry.addEventListener('click', () => load());
        actionBar.appendChild(retry);
        root.appendChild(actionBar);
    }

    async function load({ keepForm = false } = {}) {
        try {
            data = await get(`/api/web/yearwheel/${encodeURIComponent(roleId)}`);
            if (keepForm) formOpen = true;
            draw();
        } catch (err) {
            if (navigateOnError(err)) return;
            drawLoadError();
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
