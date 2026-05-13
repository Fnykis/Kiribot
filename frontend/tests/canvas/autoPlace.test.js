import { describe, it, expect } from 'vitest';
import { computeAutoPositions, ROW_MAP } from '../../src/canvas/autoPlace.js';
import { GRID_STEP, STAGE_W, STAGE_H } from '../../src/canvas/stage.js';

describe('computeAutoPositions', () => {
    it('places members in instrument-group rows from front to back', () => {
        const members = [
            { userId: 'a', displayName: 'A', instrument: '1:a' },
            { userId: 'b', displayName: 'B', instrument: '1:a' },
            { userId: 'c', displayName: 'C', instrument: 'tarol' },
        ];
        const placed = computeAutoPositions(members, GRID_STEP, STAGE_W, STAGE_H);
        expect(placed).toHaveLength(3);
        const row1a = placed.filter(p => p.instrument === '1:a').map(p => p.y);
        expect(new Set(row1a).size).toBe(1); // all '1:a' on same y
        const rowTar = placed.find(p => p.instrument === 'tarol').y;
        expect(rowTar).not.toBe(row1a[0]); // tarol on different row
    });

    it('snaps all positions to grid', () => {
        const members = [{ userId: 'a', displayName: 'A', instrument: '1:a' }];
        const placed = computeAutoPositions(members, GRID_STEP, STAGE_W, STAGE_H);
        for (const p of placed) {
            expect(p.x % GRID_STEP).toBe(0);
            expect(p.y % GRID_STEP).toBe(0);
        }
    });

    it('avoids overlap by spacing along x within a row', () => {
        const members = Array.from({ length: 5 }, (_, i) => ({
            userId: `u${i}`, displayName: `U${i}`, instrument: '1:a'
        }));
        const placed = computeAutoPositions(members, GRID_STEP, STAGE_W, STAGE_H);
        const xs = placed.map(p => p.x).sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) {
            expect(xs[i] - xs[i-1]).toBeGreaterThanOrEqual(GRID_STEP);
        }
    });

    it('does not stack members when group overflows right edge', () => {
        const members = Array.from({ length: 20 }, (_, i) => ({
            userId: `u${i}`, displayName: `U${i}`, instrument: 'repenique' // center column
        }));
        const placed = computeAutoPositions(members, GRID_STEP, STAGE_W, STAGE_H);
        const xs = placed.map(p => p.x).sort((a, b) => a - b);
        const unique = new Set(xs);
        expect(unique.size).toBe(xs.length); // no two members share x in same row
    });

    it('preserves userId/displayName/instrument on output', () => {
        const members = [{ userId: 'a', displayName: 'A', instrument: '1:a' }];
        const [p] = computeAutoPositions(members, GRID_STEP, STAGE_W, STAGE_H);
        expect(p.userId).toBe('a');
        expect(p.displayName).toBe('A');
        expect(p.instrument).toBe('1:a');
    });
});
