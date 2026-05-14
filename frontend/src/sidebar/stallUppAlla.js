const VALID = new Set(['ja', 'kanske']);

export function openStallUppAlla({ modalEl, event, onSubmit }) {
    // Build userId → { name, Set<instrument> } from signups
    const placed = new Set((event.lineup || []).map(e => e.userId));
    const userInstruments = new Map();
    for (const [instrument, entries] of Object.entries(event.signups || {})) {
        for (const e of entries) {
            if (!VALID.has(e.response)) continue;
            if (placed.has(e.id)) continue;
            if (!userInstruments.has(e.id)) userInstruments.set(e.id, { name: e.name, instruments: new Set() });
            userInstruments.get(e.id).instruments.add(instrument);
        }
    }

    // Split into single- and multi-instrument groups
    const single = new Map();
    const multi = new Map();
    for (const [userId, data] of userInstruments) {
        if (data.instruments.size === 1) single.set(userId, data);
        else multi.set(userId, data);
    }

    // Pre-fill selections for single-instrument members
    const selections = new Map(); // userId → { instrument, displayName }
    for (const [userId, { name, instruments }] of single) {
        const [instrument] = instruments;
        selections.set(userId, { instrument, displayName: name });
    }

    // No-multi shortcut: skip modal entirely
    // multi.size === 0 check only fires when there are members (userInstruments.size > 0);
    // the size === 0 empty-state is handled below after modalEl opens
    if (multi.size === 0 && userInstruments.size > 0) {
        const payload = [];
        for (const [userId, { instrument, displayName }] of selections) {
            payload.push({ userId, displayName, instrument });
        }
        onSubmit(payload);
        return;
    }

    modalEl.hidden = false;
    modalEl.replaceChildren();

    const wrap = document.createElement('div');
    wrap.className = 'stua-wrap';

    const title = document.createElement('h2');
    title.textContent = 'Ställ upp alla';
    wrap.appendChild(title);

    if (userInstruments.size === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'Alla anmälda är redan utställda.';
        wrap.appendChild(empty);
        const cancelOnly = document.createElement('button');
        cancelOnly.type = 'button';
        cancelOnly.textContent = 'Stäng';
        cancelOnly.addEventListener('click', () => { modalEl.hidden = true; modalEl.replaceChildren(); });
        wrap.appendChild(cancelOnly);
        modalEl.appendChild(wrap);
        return;
    }

    const list = document.createElement('div');
    list.className = 'stua-list';

    // Render only multi-instrument members — one row per user
    for (const [userId, { name, instruments }] of multi) {
        const row = document.createElement('div');
        row.className = 'stua-row';
        row.dataset.user = userId;

        const label = document.createElement('span');
        label.textContent = name;
        row.appendChild(label);

        for (const instrument of instruments) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = instrument;
            btn.dataset.user = userId;
            btn.dataset.instrument = instrument;
            btn.className = 'stua-pick';
            btn.addEventListener('click', () => {
                selections.set(userId, { instrument, displayName: name });
                list.querySelectorAll(`button[data-user="${userId}"]`).forEach(b => {
                    b.classList.toggle('selected', b.dataset.instrument === instrument);
                });
                updateOkState();
            });
            row.appendChild(btn);
        }

        list.appendChild(row);
    }
    wrap.appendChild(list);

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'stua-ok';
    ok.textContent = 'OK';
    ok.disabled = true;
    ok.addEventListener('click', async () => {
        const payload = [];
        for (const [userId, { instrument, displayName }] of selections) {
            payload.push({ userId, displayName, instrument });
        }
        ok.disabled = true;
        try { await onSubmit(payload); } finally { closeModal(); }
    });
    wrap.appendChild(ok);

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'stua-cancel';
    cancel.textContent = 'Avbryt';
    cancel.addEventListener('click', closeModal);
    wrap.appendChild(cancel);

    modalEl.appendChild(wrap);

    function updateOkState() {
        ok.disabled = selections.size !== single.size + multi.size;
    }
    function closeModal() {
        modalEl.hidden = true;
        modalEl.replaceChildren();
    }
}
