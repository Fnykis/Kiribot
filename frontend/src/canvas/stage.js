import { getSelectedIds, getMestres } from '../state.js';

export const STAGE_W = 1000;
export const STAGE_H = 600;
export const DOT_SIZE = 44; // matches .stage-dot width/height in CSS
export const GRID_STEP = 36;

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

const INSTRUMENT_GLOW = {
    '1:a':        'rgba(231, 76, 60, 0.55)',
    '2:a':        'rgba(230, 126, 34, 0.55)',
    '3:a':        'rgba(241, 196, 15, 0.55)',
    '4:a':        'rgba(46, 204, 113, 0.55)',
    'repenique':  'rgba(52, 152, 219, 0.55)',
    'skak/agogo': 'rgba(155, 89, 182, 0.55)',
    'tarol':      'rgba(26, 188, 156, 0.55)',
    'timbal':     'rgba(233, 30, 99, 0.55)',
};
const DEFAULT_GLOW = 'rgba(149, 165, 166, 0.45)';

function instrumentGlow(instrument) {
    return INSTRUMENT_GLOW[instrument] ?? DEFAULT_GLOW;
}

const _prevUserIds = new Set();

export function instrumentColor(instrument) {
    return INSTRUMENT_COLORS[instrument] ?? DEFAULT_COLOR;
}

// Returns SVG viewBox (0-100) endpoints trimmed to dot edges.
// stageRect is the stage element's getBoundingClientRect().
export function edgeEndpoints(x1, y1, x2, y2, stageRect) {
    const r = DOT_SIZE / 2;
    const px1 = x1 / 100 * stageRect.width,  py1 = y1 / 100 * stageRect.height;
    const px2 = x2 / 100 * stageRect.width,  py2 = y2 / 100 * stageRect.height;
    const len = Math.hypot(px2 - px1, py2 - py1);
    if (len < r * 2) return { x1, y1, x2, y2 };
    const ux = (px2 - px1) / len, uy = (py2 - py1) / len;
    return {
        x1: (px1 + r * ux) / stageRect.width  * 100,
        y1: (py1 + r * uy) / stageRect.height * 100,
        x2: (px2 - r * ux) / stageRect.width  * 100,
        y2: (py2 - r * uy) / stageRect.height * 100,
    };
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
    const selectedIds = getSelectedIds();
    const mestres = getMestres();
    const lineup = event.lineup || [];
    stageEl.replaceChildren();
    const currentIds = new Set(lineup.map(e => String(e.userId)));
    const newlyPlaced = new Set([...currentIds].filter(id => !_prevUserIds.has(id)));

    // SVG overlay for mestre lines (rendered first = behind everything)
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'mestre-svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.pointerEvents = 'none';
    stageEl.appendChild(svg);

    // Ghost dots (rendered second = behind real dots)
    const stageRect = stageEl.getBoundingClientRect();
    for (const entry of lineup) {
        const ghostPos = mestres.get(String(entry.userId));
        if (!ghostPos) continue;
        const xPct  = (entry.position.x / STAGE_W) * 100;
        const yPct  = (entry.position.y / STAGE_H) * 100;
        const gxPct = (ghostPos.x / STAGE_W) * 100;
        const gyPct = (ghostPos.y / STAGE_H) * 100;
        const ep = edgeEndpoints(xPct, yPct, gxPct, gyPct, stageRect);

        const line = document.createElementNS(svgNS, 'line');
        line.classList.add('mestre-line');
        line.setAttribute('data-mestre-user-id', String(entry.userId));
        line.setAttribute('data-cx1', String(xPct));
        line.setAttribute('data-cy1', String(yPct));
        line.setAttribute('data-cx2', String(gxPct));
        line.setAttribute('data-cy2', String(gyPct));
        line.setAttribute('x1', String(ep.x1));
        line.setAttribute('y1', String(ep.y1));
        line.setAttribute('x2', String(ep.x2));
        line.setAttribute('y2', String(ep.y2));
        svg.appendChild(line);

        const ghost = document.createElement('div');
        ghost.className = 'mestre-ghost';
        ghost.setAttribute('data-mestre-user-id', String(entry.userId));
        ghost.style.left = `${gxPct}%`;
        ghost.style.top  = `${gyPct}%`;
        ghost.style.backgroundColor = instrumentColor(entry.instrument);
        stageEl.appendChild(ghost);
    }

    // Real dots (rendered last = on top)
    for (const entry of lineup) {
        const dot = document.createElement('div');
        dot.className = selectedIds.has(String(entry.userId)) ? 'stage-dot selected' : 'stage-dot';
        dot.dataset.userId = entry.userId;
        dot.dataset.instrument = entry.instrument;
        dot.dataset.displayName = entry.displayName;
        if (newlyPlaced.has(String(entry.userId))) {
            dot.classList.add('newly-placed');
        }
        dot.style.left = `${(entry.position.x / STAGE_W) * 100}%`;
        dot.style.top = `${(entry.position.y / STAGE_H) * 100}%`;
        dot.style.backgroundColor = instrumentColor(entry.instrument);
        dot.style.backgroundImage = 'radial-gradient(circle at 35% 32%, rgba(255,255,255,0.32), rgba(0,0,0,0.18))';
        dot.style.setProperty('--dot-glow', instrumentGlow(entry.instrument));

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
    _prevUserIds.clear();
    for (const id of currentIds) _prevUserIds.add(id);
}
