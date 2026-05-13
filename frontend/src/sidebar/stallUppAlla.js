const VALID = new Set(['ja', 'kanske']);

export function openStallUppAlla({ modalEl, event, onSubmit }) {
    modalEl.hidden = false;
    modalEl.replaceChildren();

    // Build userId → { name, Set<instrument> } from signups
    const userInstruments = new Map();
    for (const [instrument, entries] of Object.entries(event.signups || {})) {
        for (const e of entries) {
            if (!VALID.has(e.response)) continue;
            if (!userInstruments.has(e.id)) userInstruments.set(e.id, { name: e.name, instruments: new Set() });
            userInstruments.get(e.id).instruments.add(instrument);
        }
    }

    const selections = new Map(); // userId → { instrument, displayName }

    const wrap = document.createElement('div');
    wrap.className = 'stua-wrap';

    const title = document.createElement('h2');
    title.textContent = 'Ställ upp alla';
    wrap.appendChild(title);

    const list = document.createElement('div');
    list.className = 'stua-list';

    for (const [userId, { name, instruments }] of userInstruments) {
        for (const instrument of instruments) {
            const row = document.createElement('div');
            row.className = 'stua-row';
            row.dataset.user = userId;

            const label = document.createElement('span');
            label.textContent = `${name} — ${instrument}`;
            row.appendChild(label);

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
            list.appendChild(row);
        }
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
        ok.disabled = selections.size !== userInstruments.size;
    }
    function closeModal() {
        modalEl.hidden = true;
        modalEl.replaceChildren();
    }
}
