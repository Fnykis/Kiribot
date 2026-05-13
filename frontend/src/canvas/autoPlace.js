// Row indices: 0 = front of stage, higher = further back.
// Layout:
//   Row 0 (front): 3:a (sides), 4:a (center)
//   Row 1:         tarol (center)
//   Row 2 (back):  1:a + 2:a (left/center), repenique (center), timbal (right), skak/agogo (right)
export const ROW_MAP = {
    '3:a':        0,
    '4:a':        0,
    'tarol':      1,
    '1:a':        2,
    '2:a':        2,
    'repenique':  2,
    'timbal':     2,
    'skak/agogo': 2,
};

export const COLUMN_HINT = {
    '3:a':        'left',
    '4:a':        'center',
    'tarol':      'center',
    '1:a':        'left',
    '2:a':        'left',
    'repenique':  'center',
    'timbal':     'right',
    'skak/agogo': 'right',
};

const TOTAL_ROWS = 3;
const COLUMN_FRACTIONS = { left: 0.25, center: 0.5, right: 0.75 };

export function computeAutoPositions(members, gridStep, stageW, stageH) {
    const yPadding = gridStep * 2;
    const usableH = stageH - 2 * yPadding;
    const rowHeight = usableH / Math.max(1, TOTAL_ROWS - 1);

    const buckets = new Map(); // key `${row}:${col}` -> [members]
    for (const m of members) {
        const row = ROW_MAP[m.instrument] ?? (TOTAL_ROWS - 1);
        const col = COLUMN_HINT[m.instrument] ?? 'center';
        const key = `${row}:${col}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(m);
    }

    const result = [];
    for (const [key, list] of buckets) {
        const [rowStr, col] = key.split(':');
        const row = Number(rowStr);
        const rawY = stageH - yPadding - row * rowHeight;
        const y = Math.round(rawY / gridStep) * gridStep;
        const centerX = stageW * COLUMN_FRACTIONS[col];
        const totalWidth = (list.length - 1) * gridStep;
        const startX = Math.max(gridStep, Math.round((centerX - totalWidth / 2) / gridStep) * gridStep);
        list.forEach((m, i) => {
            const x = Math.min(stageW - gridStep, startX + i * gridStep);
            result.push({
                userId: m.userId,
                displayName: m.displayName,
                instrument: m.instrument,
                x,
                y,
            });
        });
    }
    return result;
}
