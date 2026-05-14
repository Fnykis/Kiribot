import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clientToStage, snapToGrid } from '../../src/canvas/drag.js';
import { GRID_STEP } from '../../src/canvas/stage.js';

// ---- Sidebar-row drop tests ----
// We need to capture the 'end' listener that wireDrag registers for '.available-row'.
// interactjs is aliased to the stub in vite.config.js test.alias, so we vi.mock it here
// to intercept draggable({ listeners }) calls and save the end handler.

vi.mock('interactjs', () => {
    let _sidebarEndListener = null;

    const interact = vi.fn((selectorOrEl, _opts) => ({
        draggable({ listeners } = {}) {
            // The second interact() call with '.available-row' context carries listeners
            if (listeners && listeners.end) {
                _sidebarEndListener = listeners.end;
            }
            return { draggable: () => {} };
        },
        dropzone() { return {}; },
    }));

    interact._getSidebarEndListener = () => _sidebarEndListener;

    return { default: interact };
});

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

    it('subtracts pointer offset to give grab-point-anchored coords', () => {
        const rect = { left: 0, top: 0, width: 1000, height: 600 };
        const { x, y } = clientToStage(rect, 540, 320, { x: 20, y: 10 });
        // offset removed: client (540,320) - offset(20,10) = effective (520,310)
        expect(x).toBe(520);
        expect(y).toBe(310);
    });

    it('clamps to stage bounds with offset', () => {
        const rect = { left: 0, top: 0, width: 1000, height: 600 };
        const out = clientToStage(rect, 5000, 5000, { x: 0, y: 0 });
        expect(out.x).toBe(1000); // STAGE_W
        expect(out.y).toBe(600);  // STAGE_H
    });
});

describe('snapToGrid', () => {
    it('snaps to nearest grid intersection', () => {
        const step = GRID_STEP; // 48
        expect(snapToGrid(0, 0, step)).toEqual({ x: 0, y: 0 });
        expect(snapToGrid(25, 25, step)).toEqual({ x: 48, y: 48 });
        expect(snapToGrid(23, 23, step)).toEqual({ x: 0, y: 0 });
        expect(snapToGrid(100, 50, step)).toEqual({ x: 96, y: 48 });
    });
});

describe('sidebar-row drop — pointer-in-stage-rect guard', () => {
    // stageRect: left=100, top=50, right=600, bottom=350, width=500, height=300
    const STAGE_RECT = { left: 100, top: 50, right: 600, bottom: 350, width: 500, height: 300 };

    let stageEl, sidebarEl, trashEl, onPlace, endListener;

    beforeEach(async () => {
        // Build minimal DOM elements
        stageEl = document.createElement('div');
        stageEl.id = 'stage';
        stageEl.getBoundingClientRect = vi.fn(() => STAGE_RECT);

        sidebarEl = document.createElement('div');
        sidebarEl.id = 'sidebar';

        trashEl = document.createElement('div');
        trashEl.id = 'trash';

        onPlace = vi.fn(() => Promise.resolve());

        // Import wireDrag fresh — vi.mock is hoisted so interactjs is already mocked
        const { wireDrag } = await import('../../src/canvas/drag.js');
        wireDrag({
            stageEl,
            sidebarEl,
            trashEl,
            getEvent: () => ({}),
            setDraggingId: () => {},
            onPlace,
            onMove: vi.fn(),
            onRemove: vi.fn(),
        });

        // Retrieve the captured end listener via the mock helper
        const interact = (await import('interactjs')).default;
        endListener = interact._getSidebarEndListener();
    });

    function makeTarget(userId = 'u1', instrument = 'Trumpet') {
        const el = document.createElement('div');
        el.className = 'available-row';
        el.dataset.userId = userId;
        el.dataset.instrument = instrument;
        el.textContent = 'Alice';
        el.classList.remove = vi.fn();
        return el;
    }

    it('calls onPlace when pointer is inside stage rect', async () => {
        expect(endListener).toBeTruthy();
        const target = makeTarget('u1', 'Trumpet');
        // Pointer at (300, 200) — inside rect (left=100, right=600, top=50, bottom=350)
        const evt = {
            target,
            client: { x: 300, y: 200 },
            relatedTarget: null,
        };
        await endListener(evt);
        expect(onPlace).toHaveBeenCalledTimes(1);
        expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'u1',
            instrument: 'Trumpet',
            displayName: 'Alice',
            manuallyAdded: false,
        }));
    });

    it('does NOT call onPlace when pointer is outside stage rect (x < left)', async () => {
        expect(endListener).toBeTruthy();
        const target = makeTarget('u2', 'Flute');
        // Pointer at (50, 200) — x=50 < left=100, outside stage
        const evt = {
            target,
            client: { x: 50, y: 200 },
            relatedTarget: null,
        };
        await endListener(evt);
        expect(onPlace).not.toHaveBeenCalled();
    });
});
