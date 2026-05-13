export const STAGE_W = 1000;
export const STAGE_H = 600;

const INSTRUMENT_COLORS = {
    '1:a':        '#e74c3c',
    '2:a':        '#e67e22',
    '3:a':        '#f1c40f',
    '4:a':        '#2ecc71',
    'repenique':  '#3498db',
    'skak/agogo': '#9b59b6',
    'tarol':      '#1abc9c',
    'timbal':     '#e91e63',
};
const DEFAULT_COLOR = '#95a5a6';

export function instrumentColor(instrument) {
    return INSTRUMENT_COLORS[instrument] ?? DEFAULT_COLOR;
}

export function isStale(entry, event) {
    if (entry.manuallyAdded) return false;
    for (const entries of Object.values(event.signups || {})) {
        if (entries.some(e =>
            e.id === entry.userId && (e.response === 'ja' || e.response === 'kanske')
        )) return false;
    }
    return true;
}

export function renderStage(stageEl, event) {
    stageEl.replaceChildren();
    for (const entry of (event.lineup || [])) {
        const dot = document.createElement('div');
        dot.className = 'stage-dot';
        dot.dataset.userId = entry.userId;
        dot.style.left = `${(entry.position.x / STAGE_W) * 100}%`;
        dot.style.top = `${(entry.position.y / STAGE_H) * 100}%`;
        dot.style.backgroundColor = instrumentColor(entry.instrument);

        const label = document.createElement('span');
        label.className = 'dot-label';
        label.textContent = entry.displayName;
        dot.appendChild(label);

        if (isStale(entry, event)) {
            const badge = document.createElement('span');
            badge.className = 'stale-badge';
            badge.textContent = '!';
            dot.appendChild(badge);
        }

        stageEl.appendChild(dot);
    }
}
