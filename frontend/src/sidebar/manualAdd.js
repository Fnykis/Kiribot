const DEBOUNCE_MS = 250;

export function openManualAdd({ modalEl, fetchMembers, instruments, onSubmit }) {
    modalEl.replaceChildren();
    modalEl.style.display = 'flex';

    const box = document.createElement('div');
    box.className = 'manual-box';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'manual-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => closeManualAdd(modalEl));

    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Sök medlem...';
    input.className = 'manual-search';

    const results = document.createElement('div');
    results.className = 'manual-results';

    box.appendChild(closeBtn);
    box.appendChild(input);
    box.appendChild(results);
    modalEl.appendChild(box);

    let timer = null;
    input.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
            const q = input.value.trim();
            const members = await fetchMembers(q);
            renderResults(results, members, (m) => {
                renderInstrumentPicker(results, instruments, (instrument) => {
                    onSubmit({ userId: m.id, displayName: m.displayName, instrument });
                    closeManualAdd(modalEl);
                });
            });
        }, DEBOUNCE_MS);
    });
}

function renderResults(container, members, onPick) {
    container.replaceChildren();
    if (!members || members.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'manual-empty';
        empty.textContent = 'Inga träffar';
        container.appendChild(empty);
        return;
    }
    for (const m of members) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'manual-result';
        row.textContent = m.displayName + (m.hasHarmonian ? '' : ' (gäst)');
        row.addEventListener('click', () => onPick(m));
        container.appendChild(row);
    }
}

function renderInstrumentPicker(container, instruments, onPick) {
    container.replaceChildren();
    const heading = document.createElement('p');
    heading.className = 'manual-instrument-heading';
    heading.textContent = 'Välj instrument';
    container.appendChild(heading);
    for (const inst of instruments) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'manual-instrument';
        btn.textContent = inst;
        btn.addEventListener('click', () => onPick(inst));
        container.appendChild(btn);
    }
}

export function closeManualAdd(modalEl) {
    modalEl.style.display = 'none';
    modalEl.replaceChildren();
}
