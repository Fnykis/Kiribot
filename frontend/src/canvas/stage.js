import { getSelectedIds, getMestres } from '../state.js';

let _staleTipDocHandler = false;
function installStaleTipDocHandler() {
    if (_staleTipDocHandler) return;
    _staleTipDocHandler = true;
    document.addEventListener('click', (ev) => {
        if (ev.target && ev.target.closest && ev.target.closest('.stale-badge')) return;
        document.querySelectorAll('.stale-badge.show-tip').forEach(b => b.classList.remove('show-tip'));
    });
}

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
    const r = stageRect.width * 0.027; // dot is 5% of stage width → radius 2.5%
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

export function isKanske(entry, event) {
    if (entry.manuallyAdded) return false;
    const group = (event.signups || {})[entry.instrument] || [];
    const e = group.find(s => s.id === entry.userId);
    return !!(e && e.response === 'kanske');
}

const RESPONSE_LABEL = { ja: 'Ja', kanske: 'Kanske', nej: 'Nej' };

export function currentResponseLabel(userId, event) {
    const responses = new Set();
    for (const entries of Object.values(event.signups || {})) {
        for (const e of entries) {
            if (e.id === userId && e.response) responses.add(e.response);
        }
    }
    if (responses.size === 0) return 'Aktuellt svar: Inget svar';
    const parts = [...responses].map(r => RESPONSE_LABEL[r] || r);
    return `Aktuellt svar: ${parts.join(' / ')}`;
}

export function renderStage(stageEl, event) {
    installStaleTipDocHandler();
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
        line.setAttribute('stroke', 'rgba(180, 130, 255, 0.42)');
        line.setAttribute('stroke-width', '0.2');
        line.setAttribute('stroke-dasharray', '0.35 0.5');
        line.setAttribute('stroke-linecap', 'square');
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
        const handSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        handSvg.setAttribute('viewBox', '0 0 24 24');
        handSvg.setAttribute('fill', 'none');
        handSvg.setAttribute('stroke', '#000');
        handSvg.setAttribute('stroke-width', '2');
        handSvg.setAttribute('stroke-linecap', 'round');
        handSvg.setAttribute('stroke-linejoin', 'round');
        handSvg.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;width:55%;height:55%;';
        for (const d of [
            'M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2',
            'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2',
            'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8',
            'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
        ]) {
            const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            p.setAttribute('d', d);
            handSvg.appendChild(p);
        }
        ghost.appendChild(handSvg);
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

        if (isKanske(entry, event)) {
            const kBadge = document.createElement('span');
            kBadge.className = 'kanske-badge';
            kBadge.title = 'Svarade Kanske';
            const slash = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            slash.setAttribute('viewBox', '0 0 24 24');
            slash.setAttribute('class', 'kanske-slash');
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '6');
            line.setAttribute('y1', '18');
            line.setAttribute('x2', '18');
            line.setAttribute('y2', '6');
            line.setAttribute('stroke', '#fff');
            line.setAttribute('stroke-width', '3');
            line.setAttribute('stroke-linecap', 'round');
            slash.appendChild(line);
            kBadge.appendChild(slash);
            dot.appendChild(kBadge);
        }

        if (isStale(entry, event)) {
            const badge = document.createElement('span');
            badge.className = 'stale-badge';
            const mark = document.createElement('span');
            mark.className = 'stale-mark';
            mark.textContent = '!';
            const tip = document.createElement('span');
            tip.className = 'stale-tip';
            tip.textContent = currentResponseLabel(entry.userId, event);
            badge.title = tip.textContent;
            badge.appendChild(mark);
            badge.appendChild(tip);
            // Radial menu opens on pointerdown/pointerup on the dot — stop those
            // here so tapping the badge never bubbles up to trigger it.
            badge.addEventListener('pointerdown', ev => ev.stopPropagation());
            badge.addEventListener('pointerup', ev => ev.stopPropagation());
            badge.addEventListener('click', ev => {
                ev.stopPropagation();
                const wasOpen = badge.classList.contains('show-tip');
                stageEl.querySelectorAll('.stale-badge.show-tip').forEach(b => b.classList.remove('show-tip'));
                if (!wasOpen) badge.classList.add('show-tip');
            });
            dot.appendChild(badge);
        }

        stageEl.appendChild(dot);
    }
    _prevUserIds.clear();
    for (const id of currentIds) _prevUserIds.add(id);
}
