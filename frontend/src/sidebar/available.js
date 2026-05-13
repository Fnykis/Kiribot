const VALID_RESPONSES = new Set(['ja', 'kanske']);

export function computeAvailable(event) {
    const placed = new Set((event.lineup || []).map(e => e.userId));
    const result = {};
    for (const [instrument, entries] of Object.entries(event.signups || {})) {
        const filtered = entries.filter(e =>
            VALID_RESPONSES.has(e.response) && !placed.has(e.id)
        );
        if (filtered.length > 0) result[instrument] = filtered;
    }
    return result;
}

export function renderAvailable(container, event) {
    container.replaceChildren();
    const available = computeAvailable(event);
    for (const [instrument, entries] of Object.entries(available)) {
        const section = document.createElement('div');
        section.className = 'available-section';

        const header = document.createElement('h3');
        header.textContent = instrument;
        section.appendChild(header);

        for (const entry of entries) {
            const row = document.createElement('div');
            row.className = 'available-row';
            row.dataset.userId = entry.id;
            row.dataset.instrument = instrument;
            row.textContent = entry.name;
            section.appendChild(row);
        }

        container.appendChild(section);
    }
}
