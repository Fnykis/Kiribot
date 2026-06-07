import { describe, it, expect, beforeEach } from 'vitest';
import {
    clampPan, focalZoom, clampZoom, minZoom,
    MAX_Z,
    getViewport, setViewport, resetViewport, getZoom,
} from '../../src/canvas/viewport.js';

describe('minZoom — fit-to-width factor relative to the fit-to-height baseline', () => {
    it('portrait viewport: min < 1 (zoom out to see the whole landscape canvas)', () => {
        // stage CSS width 1333 (=800*1000/600 fit-height) in a 400 viewport
        // -> min = 400/1333 = 0.30 (fit-to-width)
        expect(minZoom(1333, 400)).toBeCloseTo(0.3, 2);
    });
    it('caps at MAX_Z when the viewport is wider than the canvas (never min > max)', () => {
        expect(minZoom(800, 2000)).toBe(MAX_Z);
    });
    it('returns MAX_Z when stage width is 0 (pre-layout safety)', () => {
        expect(minZoom(0, 400)).toBe(MAX_Z);
    });
});

describe('clampZoom — dynamic bounds', () => {
    it('clamps below minZ up to minZ', () => {
        expect(clampZoom(0.1, 0.3, MAX_Z)).toBe(0.3);
    });
    it('clamps above maxZ down to maxZ', () => {
        expect(clampZoom(99, 0.3, MAX_Z)).toBe(MAX_Z);
    });
    it('passes values inside the range unchanged', () => {
        expect(clampZoom(0.6, 0.3, MAX_Z)).toBe(0.6);
    });
    it('maxZ defaults to MAX_Z (fit-to-height = 1)', () => {
        expect(clampZoom(5, 0.3)).toBe(MAX_Z);
        expect(MAX_Z).toBe(1);
    });
});

describe('clampPan', () => {
    it('clamps pan to [view-rendered, 0] when content overflows the viewport', () => {
        // rendered 1670 wide in a 400 viewport -> pan range [-1270, 0]
        expect(clampPan(50, 0, 1670, 1000, 400, 1000).panX).toBe(0);
        expect(clampPan(-2000, 0, 1670, 1000, 400, 1000).panX).toBe(-1270);
        expect(clampPan(-500, 0, 1670, 1000, 400, 1000).panX).toBe(-500);
    });
    it('centers an axis when rendered content is smaller than the viewport', () => {
        // 300 wide in a 400 viewport -> centered at (400-300)/2 = 50
        expect(clampPan(0, 0, 300, 1000, 400, 1000).panX).toBe(50);
    });
    it('clamps the Y axis independently', () => {
        expect(clampPan(0, 999, 400, 1000, 400, 1000).panY).toBe(0); // equal -> centered at 0
        expect(clampPan(0, -300, 400, 1500, 400, 1000).panY).toBe(-300);
        expect(clampPan(0, -9999, 400, 1500, 400, 1000).panY).toBe(-500);
    });
});

describe('focalZoom — keeps the focal point stationary on screen', () => {
    it('recomputes pan so the focal screen point maps to the same canvas point', () => {
        const out = focalZoom({ panX: 0, panY: 0, z: 1 }, 200, 100, 2);
        expect(out).toEqual({ z: 2, panX: -200, panY: -100 });
        // verify: canvas point under focal pre = (200-0)/1 = 200; post screen = -200 + 200*2 = 200 = focal
    });
    it('is a no-op for pan when zoom does not change', () => {
        const out = focalZoom({ panX: -50, panY: -20, z: 2 }, 100, 100, 2);
        expect(out).toEqual({ z: 2, panX: -50, panY: -20 });
    });
});

describe('viewport state', () => {
    beforeEach(() => resetViewport());
    it('defaults to identity', () => {
        expect(getViewport()).toEqual({ panX: 0, panY: 0, z: 1 });
        expect(getZoom()).toBe(1);
    });
    it('round-trips through setViewport', () => {
        setViewport({ panX: -10, panY: -5, z: 1.5 });
        expect(getViewport()).toEqual({ panX: -10, panY: -5, z: 1.5 });
        expect(getZoom()).toBe(1.5);
    });
});
