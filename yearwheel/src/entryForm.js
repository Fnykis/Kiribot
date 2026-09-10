export const TITLE_TOO_LONG_TEXT = 'Titeln får vara högst 100 tecken.';
export const BODY_TOO_LONG_TEXT = 'Beskrivningen får vara högst 1500 tecken.';
export const INVALID_DATE_TEXT = 'Välj ett giltigt datum.';
export const SAVE_FAILED_TEXT = 'Kunde inte spara. Försök igen.';
export const CONFLICT_TEXT = 'Någon annan hann före — posten laddades om.';

const MAX_TITLE = 100;
const MAX_BODY = 1500;
const MONTH_LABELS = [
    'januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december'
];
// February offers 29 so 02-29 can be chosen; the dispatcher fires it on 02-28 in non-leap years.
const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

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

function labelled(labelText, control) {
    const label = el('label');
    label.appendChild(el('span', 'field-label', labelText));
    label.appendChild(control);
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

    const title = el('input');
    title.name = 'title';
    title.type = 'text';
    title.maxLength = MAX_TITLE;
    title.value = entry ? entry.title : '';
    form.appendChild(labelled('Titel', title));

    const dateRow = el('div', 'date-row');
    const month = el('select');
    month.name = 'month';
    MONTH_LABELS.forEach((name, i) => {
        const opt = el('option', null, name);
        opt.value = pad(i + 1);
        month.appendChild(opt);
    });
    const day = el('select');
    day.name = 'day';
    month.value = entry ? entry.monthDay.slice(0, 2) : '01';
    fillDays(day, Number(month.value), entry ? entry.monthDay.slice(3, 5) : '01');
    month.addEventListener('change', () => fillDays(day, Number(month.value), day.value));
    dateRow.appendChild(month);
    dateRow.appendChild(day);
    form.appendChild(labelled('Datum', dateRow));

    const body = el('textarea');
    body.name = 'body';
    body.maxLength = MAX_BODY;
    body.rows = 4;
    body.value = entry ? entry.body : '';
    form.appendChild(labelled('Beskrivning', body));

    const error = el('p', 'form-error');
    form.appendChild(error);

    const save = el('button', 'btn', 'Spara');
    save.type = 'submit';
    form.appendChild(save);

    const cancel = el('button', 'cancel', 'Avbryt');
    cancel.type = 'button';
    cancel.addEventListener('click', () => onCancel());
    form.appendChild(cancel);

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
        if (titleValue.length < 1 || titleValue.length > MAX_TITLE) {
            error.textContent = TITLE_TOO_LONG_TEXT;
            return;
        }
        const bodyValue = body.value.trim();
        if (bodyValue.length > MAX_BODY) {
            error.textContent = BODY_TOO_LONG_TEXT;
            return;
        }
        const monthDay = `${month.value}-${day.value}`;
        if (!/^\d{2}-\d{2}$/.test(monthDay) || Number(day.value) > daysInMonth(Number(month.value))) {
            error.textContent = INVALID_DATE_TEXT;
            return;
        }

        onSave({ title: titleValue, body: bodyValue, monthDay, version: entry ? entry.version : undefined });
    });

    return form;
}

export function showFormError(form, text) {
    const error = form.querySelector('.form-error');
    if (error) error.textContent = text;
}
