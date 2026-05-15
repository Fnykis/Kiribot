import { describe, it, expect, vi } from 'vitest';
import { createVoiceControls } from '../src/voiceControls.js';

function makeSdk() {
    const subs = {};
    return {
        subscribe: vi.fn((evt, cb) => { subs[evt] = cb; return () => { delete subs[evt]; }; }),
        _fire: (evt, payload) => subs[evt]?.(payload),
    };
}

function mount(extra = {}) {
    const root = document.createElement('div');
    const calls = { mute: [], leave: 0 };
    const handle = createVoiceControls({
        root,
        sdk: makeSdk(),
        userId: 'u1',
        setMute: async (m) => { calls.mute.push(m); return { muted: m }; },
        leaveVoice: async () => { calls.leave++; return { ok: true }; },
        getToken: () => 't',
        ...extra,
    });
    return { root, handle, calls };
}

describe('voiceControls', () => {
    it('mounts mute and leave buttons', () => {
        const { root } = mount();
        expect(root.querySelector('button.voice-mute-btn')).toBeTruthy();
        expect(root.querySelector('button.voice-leave-btn')).toBeTruthy();
    });

    it('defaults to muted', () => {
        const { root } = mount();
        expect(root.querySelector('button.voice-mute-btn').dataset.muted).toBe('true');
    });

    it('toggles mute on click', async () => {
        const { root, calls } = mount();
        root.querySelector('button.voice-mute-btn').click();
        await Promise.resolve();
        expect(calls.mute).toEqual([false]);
    });

    it('calls leaveVoice on Avsluta click', async () => {
        const { root, calls } = mount();
        root.querySelector('button.voice-leave-btn').click();
        await Promise.resolve();
        expect(calls.leave).toBe(1);
    });

    it('reflects external Discord-side mute via SDK', () => {
        const root = document.createElement('div');
        const sdk = makeSdk();
        createVoiceControls({
            root, sdk, userId: 'u1',
            setMute: async () => ({}), leaveVoice: async () => ({}), getToken: () => 't',
        });
        sdk._fire('VOICE_STATE_UPDATE', { user: { id: 'u1' }, mute: false });
        expect(root.querySelector('button.voice-mute-btn').dataset.muted).toBe('false');
    });
});
