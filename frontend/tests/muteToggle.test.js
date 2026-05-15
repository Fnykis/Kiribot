import { describe, it, expect, vi } from 'vitest';
import { createMuteToggle } from '../src/muteToggle.js';

function makeSdk() {
    const subs = {};
    return {
        subscribe: vi.fn((evt, cb) => { subs[evt] = cb; }),
        _fire: (evt, payload) => subs[evt]?.(payload),
    };
}

describe('muteToggle', () => {
    it('mounts a button into a container', () => {
        const root = document.createElement('div');
        createMuteToggle({
            root,
            sdk: makeSdk(),
            userId: 'u1',
            setMute: async () => ({ muted: true }),
            getToken: () => 't',
        });
        expect(root.querySelector('button.mute-toggle')).toBeTruthy();
    });

    it('calls setMute(true) when clicking from unmuted state', async () => {
        const root = document.createElement('div');
        const calls = [];
        createMuteToggle({
            root,
            sdk: makeSdk(),
            userId: 'u1',
            setMute: async (m) => { calls.push(m); return { muted: m }; },
            getToken: () => 't',
        });
        const btn = root.querySelector('button.mute-toggle');
        btn.click();
        await Promise.resolve();
        expect(calls).toEqual([true]);
    });

    it('reflects external Discord-side mute via SDK VOICE_STATE_UPDATE', () => {
        const root = document.createElement('div');
        const sdk = makeSdk();
        createMuteToggle({
            root,
            sdk,
            userId: 'u1',
            setMute: async () => ({}),
            getToken: () => 't',
        });
        sdk._fire('VOICE_STATE_UPDATE', { user: { id: 'u1' }, mute: true });
        const btn = root.querySelector('button.mute-toggle');
        expect(btn.dataset.muted).toBe('true');
    });

    it('ignores VOICE_STATE_UPDATE for other users', () => {
        const root = document.createElement('div');
        const sdk = makeSdk();
        createMuteToggle({
            root,
            sdk,
            userId: 'u1',
            setMute: async () => ({}),
            getToken: () => 't',
        });
        sdk._fire('VOICE_STATE_UPDATE', { user: { id: 'someone-else' }, mute: true });
        const btn = root.querySelector('button.mute-toggle');
        expect(btn.dataset.muted).toBe('false');
    });
});
