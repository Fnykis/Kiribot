import { describe, it, expect, beforeEach } from 'vitest';
import {
    clampPan, focalZoom, clampZoom,
    MIN_Z, MAX_Z,
    getViewport, setViewport, resetViewport, getZoom,
} from '../../src/canvas/viewport.js';

describe('clampZoom', () => {
    it('clamps below MIN_Z up to MIN_Z', () => {
        expect(clampZoom(0.5)).toBe(MIN_Z);
    });
    it('clamps above MAX_Z down to MAX_Z', () => {
        expect(clampZoom(99)).toBe(MAX_Z);
    });
    it('passes values inside the range unchanged', () => {
        expect(clampZoom(2)).toBe(2);
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
