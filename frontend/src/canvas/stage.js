export const STAGE_W = 1000;
export const STAGE_H = 600;
export const DOT_SIZE = 44; // matches .stage-dot width/height in CSS
export const GRID_STEP = Math.round(DOT_SIZE * 1.1); // ≈48

const INSTRUMENT_ABBREV = {
    '1:a': '1', '2:a': '2', '3:a': '3', '4:a': '4',
    'repenique': 'rep', 'skak/agogo': 'sk', 'tarol': 'tar', 'timbal': 'tim',
};

export function abbreviateInstrument(key) {
    return INSTRUMENT_ABBREV[key] ?? key.slice(0, 3);
}

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
        dot.dataset.instrument = entry.instrument;
        dot.dataset.displayName = entry.displayName;
        dot.style.left = `${(entry.position.x / STAGE_W) * 100}%`;
        dot.style.top = `${(entry.position.y / STAGE_H) * 100}%`;
        dot.style.backgroundColor = instrumentColor(entry.instrument);

        const label = document.createElement('span');
        label.className = 'dot-label';
        label.textContent = entry.displayName;
        dot.appendChild(label);

        const instLabel = document.createElement('span');
        instLabel.className = 'dot-instrument';
        instLabel.textContent = abbreviateInstrument(entry.instrument);
        dot.appendChild(instLabel);

        if (isStale(entry, event)) {
            const badge = document.createElement('span');
            badge.className = 'stale-badge';
            badge.textContent = '!';
            dot.appendChild(badge);
        }

        stageEl.appendChild(dot);
    }
}
