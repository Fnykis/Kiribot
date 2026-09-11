export const TITLE_TOO_LONG_TEXT = 'Titeln får vara högst 100 tecken.';
export const TITLE_REQUIRED_TEXT = 'Titeln får inte vara tom.';
export const BODY_TOO_LONG_TEXT = 'Beskrivningen får vara högst 1500 tecken.';
export const INVALID_DATE_TEXT = 'Välj ett giltigt datum.';
export const SAVE_FAILED_TEXT = 'Kunde inte spara. Försök igen.';
export const CONFLICT_TEXT = 'Någon annan hann före — posten laddades om.';

export const NEW_HEADING_TEXT = 'Ny post';
export const EDIT_HEADING_TEXT = 'Redigera post';
export const TITLE_HINT_TEXT = 'Blir rubrik på tråden i Discord.';
export const DATE_HINT_TEXT = 'Posten återkommer varje år — inget årtal behövs.';
export const BODY_HINT_TEXT = 'Skickas med i påminnelsen till gruppens kanal.';

const MAX_TITLE = 100;
const MAX_BODY = 1500;
const MONTH_LABELS = [
    'januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december'
];
// February offers 29 so 02-29 can be chosen; the dispatcher fires it on 02-28 in non-leap years.
const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

let headingSeq = 0;

export function daysInMonth(month) {
    return DAYS[month - 1];
}

export function deleteConfirmText(title) {
    return `Ta bort posten «${title}»? Det går inte att ångra.`;
}

function pad(n) {
    return String(n).padStart(2, '0');
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

// Label above the control, hint below it: the hint has to stay readable while the field is
// being filled, which a placeholder cannot do.
function labelled(labelText, control, hintText) {
    const label = el('label');
    label.appendChild(el('span', 'field-label', labelText));
    label.appendChild(control);
    if (hintText) label.appendChild(el('span', 'field-hint', hintText));
    return label;
}

function fillDays(daySelect, month, keep) {
    const wanted = Number(keep);
    daySelect.replaceChildren();
    const max = daysInMonth(month);
    for (let d = 1; d <= max; d++) {
        const opt = el('option', null, pad(d));
        opt.value = pad(d);
        daySelect.appendChild(opt);
    }
    // Moving 31 January to April clamps to the 30th rather than silently resetting.
    daySelect.value = pad(Math.min(Number.isFinite(wanted) && wanted > 0 ? wanted : 1, max));
}

export function isFormDirty(form) {
    return form.dataset.dirty === 'true';
}

// The date is a month select plus a day select, never a native date input: an årshjul entry
// has no year, and a date picker would force the user to pick one and imply it means something.
export function renderEntryForm({ entry, onSave, onCancel }) {
    const form = document.createElement('form');
    form.className = 'entry-form';
    form.dataset.dirty = 'false';

    const headingId = `form-heading-${++headingSeq}`;
    const heading = el('h2', 'form-heading', entry ? EDIT_HEADING_TEXT : NEW_HEADING_TEXT);
    heading.id = headingId;
    // Focusable but not tabbable: opening the form moves focus here, so a screen reader
    // announces which form just appeared instead of dropping the user into a bare field.
    heading.tabIndex = -1;
    form.setAttribute('aria-labelledby', headingId);
    form.appendChild(heading);

    const title = el('input');
    title.name = 'title';
    title.type = 'text';
    title.maxLength = MAX_TITLE;
    title.autocomplete = 'off';
    title.value = entry ? entry.title : '';
    form.appendChild(labelled('Titel', title, TITLE_HINT_TEXT));

    const dateRow = el('div', 'date-row');
    const month = el('select');
    month.name = 'month';
    month.setAttribute('aria-label', 'Månad');
    MONTH_LABELS.forEach((name, i) => {
        const opt = el('option', null, name);
        opt.value = pad(i + 1);
        month.appendChild(opt);
    });
    const day = el('select');
    day.name = 'day';
    day.setAttribute('aria-label', 'Dag');
    month.value = entry ? entry.monthDay.slice(0, 2) : '01';
    fillDays(day, Number(month.value), entry ? entry.monthDay.slice(3, 5) : '01');
    month.addEventListener('change', () => fillDays(day, Number(month.value), day.value));
    dateRow.appendChild(month);
    dateRow.appendChild(day);
    form.appendChild(labelled('Datum', dateRow, DATE_HINT_TEXT));

    const body = el('textarea');
    body.name = 'body';
    body.maxLength = MAX_BODY;
    body.rows = 4;
    body.value = entry ? entry.body : '';
    form.appendChild(labelled('Beskrivning', body, BODY_HINT_TEXT));

    // Announced on change, and kept text-only: the styling that marks it as an error is the
    // box around it, so nothing here depends on reading the colour.
    const error = el('p', 'form-error');
    error.setAttribute('role', 'alert');
    form.appendChild(error);

    const actions = el('div', 'form-actions');
    const save = el('button', 'btn', 'Spara');
    save.type = 'submit';
    actions.appendChild(save);

    const cancel = el('button', 'cancel btn btn-ghost', 'Avbryt');
    cancel.type = 'button';
    cancel.addEventListener('click', () => onCancel());
    actions.appendChild(cancel);
    form.appendChild(actions);

    // Listeners go directly on each field, not delegated via the form: a delegated
    // listener only fires on events that bubble, and callers (tests included) may
    // dispatch a plain, non-bubbling Event straight at a field.
    const markDirty = () => { form.dataset.dirty = 'true'; };
    title.addEventListener('input', markDirty);
    body.addEventListener('input', markDirty);
    month.addEventListener('change', markDirty);
    day.addEventListener('change', markDirty);

    form.addEventListener('submit', event => {
        event.preventDefault();
        error.textContent = '';

        const titleValue = title.value.trim();
        if (titleValue.length < 1) {
            fail(TITLE_REQUIRED_TEXT, title);
            return;
        }
        if (titleValue.length > MAX_TITLE) {
            fail(TITLE_TOO_LONG_TEXT, title);
            return;
        }
        const bodyValue = body.value.trim();
        if (bodyValue.length > MAX_BODY) {
            fail(BODY_TOO_LONG_TEXT, body);
            return;
        }
        const monthDay = `${month.value}-${day.value}`;
        if (!/^\d{2}-\d{2}$/.test(monthDay) || Number(day.value) > daysInMonth(Number(month.value))) {
            fail(INVALID_DATE_TEXT, month);
            return;
        }

        onSave({ title: titleValue, body: bodyValue, monthDay, version: entry ? entry.version : undefined });
    });

    // The field that failed takes focus, so the fix is one keystroke away rather than a
    // scroll back up the form.
    function fail(text, field) {
        error.textContent = text;
        if (field && typeof field.focus === 'function') field.focus();
    }

    return form;
}

export function showFormError(form, text) {
    const error = form.querySelector('.form-error');
    if (error) error.textContent = text;
}
