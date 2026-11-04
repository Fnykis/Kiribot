import { describe, it, expect } from 'vitest';
import { abbreviateInstrument, instrumentColor } from '../../src/canvas/stage.js';
import { computeAutoPositions } from '../../src/canvas/autoPlace.js';

describe('repinique', () => {
    it('uses the same label and colour as repenique', () => {
        expect(abbreviateInstrument('repinique')).toBe('rep');
        expect(instrumentColor('repinique')).toBe(instrumentColor('repenique'));
    });

    it('stays in the back row', () => {
        const members = [
            { userId: 't', displayName: 'T', instrument: 'tarol' },
            { userId: 'r', displayName: 'R', instrument: 'repinique' },
        ];
        const placed = computeAutoPositions(members, 36, 1000, 600);
        const y = id => placed.find(p => p.userId === id).y;
        expect(y('r')).toBeLessThan(y('t'));
    });
});
