// Row order top→bottom (back→front of stage)
const MAIN_ROW_ORDER = ['repenique', 'tarol', '3:a', '4:a'];
const RIGHT_COLUMN_INSTRUMENTS = new Set(['timbal', 'skak/agogo']);

export function computeAutoPositions(members, gridStep, stageW, stageH) {
    const pad = gridStep;
    const usableH = stageH - 2 * pad;
    const centerX = Math.round((stageW / 2) / gridStep) * gridStep;
    const rightX = Math.round((stageW - gridStep) / gridStep) * gridStep;

    // Bucket members
    const byInstrument = {};
    const rightCol = [];
    for (const m of members) {
        if (RIGHT_COLUMN_INSTRUMENTS.has(m.instrument)) {
            rightCol.push(m);
        } else {
            (byInstrument[m.instrument] ??= []).push(m);
        }
    }

    // Build rows: 1:a and 2:a interleaved into one row, rest in order
    const rows = [];
    const s1 = byInstrument['1:a'] || [];
    const s2 = byInstrument['2:a'] || [];
    if (s1.length > 0 || s2.length > 0) {
        const interleaved = [];
        const len = Math.max(s1.length, s2.length);
        for (let i = 0; i < len; i++) {
            if (i < s1.length) interleaved.push(s1[i]);
            if (i < s2.length) interleaved.push(s2[i]);
        }
        rows.push(interleaved);
    }
    for (const inst of MAIN_ROW_ORDER) {
        const group = byInstrument[inst];
        if (group?.length > 0) rows.push(group);
    }

    // Fixed row spacing from top — rows anchor at top, empty space accumulates at bottom
    const rowSpacing = gridStep * 3;
    function rowY(index) {
        return pad + index * rowSpacing;
    }

    const result = [];

    // Place main rows — center each row using floor(N/2) offset for left-bias on even counts
    // Spacing = 2*gridStep so 44px dots never overlap; shrinks for very wide rows to stay in bounds
    const usableW = stageW - 2 * pad;
    for (let r = 0; r < rows.length; r++) {
        const list = rows[r];
        const y = rowY(r);
        const idealSpacing = gridStep * 2;
        const spacing = list.length <= 1
            ? idealSpacing
            : Math.min(idealSpacing, Math.floor(usableW / (list.length - 1) / gridStep) * gridStep);
        const startX = Math.round((centerX - Math.floor(list.length / 2) * spacing) / gridStep) * gridStep;
        list.forEach((m, i) => result.push({
            userId: m.userId, displayName: m.displayName, instrument: m.instrument,
            x: startX + i * spacing, y,
        }));
    }

    // Place right column — tighter spacing (2 cells) from top
    rightCol.forEach((m, i) => result.push({
        userId: m.userId, displayName: m.displayName, instrument: m.instrument,
        x: rightX,
        y: pad + i * gridStep * 2,
    }));

    return result;
}
