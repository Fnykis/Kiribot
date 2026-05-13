import { describe, it, expect, beforeEach } from 'vitest';
import { computeAvailable, renderAvailable } from '../../src/sidebar/available.js';

const sampleEvent = {
    lineup: [
        {
            userId: 'u2',
            displayName: 'Placed User',
            instrument: '1:a',
            position: { x: 100, y: 100 },
            manuallyAdded: false,
            placedAt: '',
        },
    ],
    signups: {
        '1:a': [
            { name: 'Andrea W',  id: 'u1', response: 'ja',     note: '' },
            { name: 'Orietta R', id: 'u2', response: 'ja',     note: '' }, // placed
            { name: 'Nina H',    id: 'u3', response: 'nej',    note: '' }, // excluded
            { name: 'Kalle H',   id: 'u4', response: 'kanske', note: '' },
        ],
        '2:a': [
            { name: 'Linn R', id: 'u5', response: 'ja', note: '' },
        ],
    },
};

describe('computeAvailable', () => {
    it('excludes placed users', () => {
        const result = computeAvailable(sampleEvent);
        const ids = result['1:a'].map(e => e.id);
        expect(ids).not.toContain('u2');
    });

    it('excludes nej responses', () => {
        const result = computeAvailable(sampleEvent);
        const ids = result['1:a'].map(e => e.id);
        expect(ids).not.toContain('u3');
    });

    it('includes ja and kanske responses not yet placed', () => {
        const result = computeAvailable(sampleEvent);
        const ids = result['1:a'].map(e => e.id);
        expect(ids).toContain('u1');
        expect(ids).toContain('u4');
    });

    it('includes second instrument section', () => {
        const result = computeAvailable(sampleEvent);
        expect(result['2:a']).toHaveLength(1);
        expect(result['2:a'][0].id).toBe('u5');
    });

    it('omits instrument key when all members placed or excluded', () => {
        const event = {
            lineup: [{
                userId: 'u5',
                displayName: 'Linn',
                instrument: '2:a',
                position: { x: 0, y: 0 },
                manuallyAdded: false,
                placedAt: '',
            }],
            signups: { '2:a': [{ name: 'Linn R', id: 'u5', response: 'ja', note: '' }] },
        };
        expect(computeAvailable(event)['2:a']).toBeUndefined();
    });

    it('handles missing lineup array gracefully', () => {
        const event = { signups: { '1:a': [{ name: 'A', id: 'u1', response: 'ja', note: '' }] } };
        expect(computeAvailable(event)['1:a']).toHaveLength(1);
    });
});

describe('renderAvailable', () => {
    let container;
    beforeEach(() => { container = document.createElement('div'); });

    it('creates one section per available instrument', () => {
        renderAvailable(container, sampleEvent);
        expect(container.querySelectorAll('.available-section')).toHaveLength(2);
    });

    it('renders instrument name as h3 header', () => {
        renderAvailable(container, sampleEvent);
        const headers = [...container.querySelectorAll('h3')].map(h => h.textContent);
        expect(headers).toContain('1:a');
        expect(headers).toContain('2:a');
    });

    it('renders rows with data-user-id and name as text', () => {
        renderAvailable(container, sampleEvent);
        const row = container.querySelector('[data-user-id="u1"]');
        expect(row).not.toBeNull();
        expect(row.textContent).toBe('Andrea W');
    });

    it('does not render placed users', () => {
        renderAvailable(container, sampleEvent);
        expect(container.querySelector('[data-user-id="u2"]')).toBeNull();
    });

    it('clears previous content on re-render', () => {
        renderAvailable(container, sampleEvent);
        renderAvailable(container, sampleEvent);
        expect(container.querySelectorAll('.available-section')).toHaveLength(2);
    });
});
