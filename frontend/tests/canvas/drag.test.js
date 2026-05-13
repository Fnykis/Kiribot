import { describe, it, expect } from 'vitest';
import { clientToStage } from '../../src/canvas/drag.js';

describe('clientToStage', () => {
    it('converts client coords into stage logical coords', () => {
        const rect = { left: 100, top: 50, width: 500, height: 300 };
        // Cursor at (350, 200) on screen → stage offset (250, 150) → logical (500, 300)
        expect(clientToStage(rect, 350, 200)).toEqual({ x: 500, y: 300 });
    });

    it('clamps inside 0..1000 / 0..600 (route also clamps, but UI should not jitter)', () => {
        const rect = { left: 0, top: 0, width: 1000, height: 600 };
        expect(clientToStage(rect, -50, -50)).toEqual({ x: 0, y: 0 });
        expect(clientToStage(rect, 9999, 9999)).toEqual({ x: 1000, y: 600 });
    });
});
