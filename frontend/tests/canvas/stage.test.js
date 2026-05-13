import { describe, it, expect, beforeEach } from 'vitest';
import { instrumentColor, isStale, renderStage } from '../../src/canvas/stage.js';

describe('instrumentColor', () => {
    it('returns a hex color for each known instrument', () => {
        for (const inst of ['1:a', '2:a', '3:a', '4:a', 'repenique', 'skak/agogo', 'tarol', 'timbal']) {
            expect(instrumentColor(inst)).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
    });

    it('returns default hex color for unknown instrument', () => {
        expect(instrumentColor('unknown_inst')).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
});

const baseEvent = {
    lineup: [
        {
            userId: 'u1',
            displayName: 'Andrea W',
            instrument: '1:a',
            position: { x: 200, y: 150 },
            manuallyAdded: false,
            placedAt: '2026-05-13T10:00:00Z',
        },
        {
            userId: 'u2',
            displayName: 'Gäst',
            instrument: 'tarol',
            position: { x: 500, y: 300 },
            manuallyAdded: true,
            placedAt: '2026-05-13T10:01:00Z',
        },
    ],
    signups: {
        '1:a': [
            { name: 'Andrea W', id: 'u1', response: 'ja', note: '' },
        ],
    },
};

describe('isStale', () => {
    it('returns false when signup entry has response ja', () => {
        expect(isStale(baseEvent.lineup[0], baseEvent)).toBe(false);
    });

    it('returns true when userId has no matching signup', () => {
        const entry = { ...baseEvent.lineup[0], userId: 'u99' };
        expect(isStale(entry, baseEvent)).toBe(true);
    });

    it('returns true when only nej signup exists for userId', () => {
        const event = {
            lineup: [],
            signups: { '1:a': [{ name: 'X', id: 'u1', response: 'nej', note: '' }] },
        };
        expect(isStale({ userId: 'u1', manuallyAdded: false }, event)).toBe(true);
    });

    it('returns false for manuallyAdded regardless of signups', () => {
        expect(isStale(baseEvent.lineup[1], baseEvent)).toBe(false);
    });
});

describe('renderStage', () => {
    let stage;
    beforeEach(() => { stage = document.createElement('div'); });

    it('renders one dot per lineup entry', () => {
        renderStage(stage, baseEvent);
        expect(stage.querySelectorAll('.stage-dot')).toHaveLength(2);
    });

    it('dot has data-user-id attribute', () => {
        renderStage(stage, baseEvent);
        expect(stage.querySelector('[data-user-id="u1"]')).not.toBeNull();
        expect(stage.querySelector('[data-user-id="u2"]')).not.toBeNull();
    });

    it('dot label shows displayName as text', () => {
        renderStage(stage, baseEvent);
        const dot = stage.querySelector('[data-user-id="u1"]');
        expect(dot.querySelector('.dot-label').textContent).toBe('Andrea W');
    });

    it('dot has non-empty background color', () => {
        renderStage(stage, baseEvent);
        const dot = stage.querySelector('[data-user-id="u1"]');
        expect(dot.style.backgroundColor).not.toBe('');
    });

    it('no stale badge when signup is ja', () => {
        renderStage(stage, baseEvent);
        expect(stage.querySelector('[data-user-id="u1"]').querySelector('.stale-badge')).toBeNull();
    });

    it('stale badge present when userId has no ja/kanske signup', () => {
        const staleEvent = {
            lineup: [{
                userId: 'u99',
                displayName: 'Ghost',
                instrument: '1:a',
                position: { x: 100, y: 100 },
                manuallyAdded: false,
                placedAt: '',
            }],
            signups: { '1:a': [{ name: 'Ghost', id: 'u99', response: 'nej', note: '' }] },
        };
        renderStage(stage, staleEvent);
        expect(stage.querySelector('[data-user-id="u99"]').querySelector('.stale-badge')).not.toBeNull();
    });

    it('no stale badge for manuallyAdded even with no signup', () => {
        renderStage(stage, baseEvent);
        expect(stage.querySelector('[data-user-id="u2"]').querySelector('.stale-badge')).toBeNull();
    });

    it('clears previous content on re-render', () => {
        renderStage(stage, baseEvent);
        renderStage(stage, baseEvent);
        expect(stage.querySelectorAll('.stage-dot')).toHaveLength(2);
    });

    it('renders empty stage when lineup is empty', () => {
        renderStage(stage, { lineup: [], signups: {} });
        expect(stage.querySelectorAll('.stage-dot')).toHaveLength(0);
    });
});
