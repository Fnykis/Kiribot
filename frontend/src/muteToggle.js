export function createMuteToggle({ root, sdk, userId, setMute, getToken }) {
    const btn = document.createElement('button');
    btn.className = 'mute-toggle';
    btn.dataset.muted = 'false';
    btn.setAttribute('aria-label', 'Toggle mute');
    btn.textContent = '🎙';
    root.appendChild(btn);

    let muted = false;
    let inFlight = false;

    function render() {
        btn.dataset.muted = String(muted);
        btn.textContent = muted ? '🔇' : '🎙';
    }

    btn.addEventListener('click', async () => {
        if (inFlight) return;
        inFlight = true;
        const next = !muted;
        try {
            await setMute(next, getToken());
            muted = next;
            render();
        } catch (err) {
            console.error('mute toggle failed', err);
        } finally {
            inFlight = false;
        }
    });

    sdk.subscribe('VOICE_STATE_UPDATE', (payload) => {
        if (!payload || !payload.user || payload.user.id !== userId) return;
        if (typeof payload.mute === 'boolean') {
            muted = payload.mute;
            render();
        }
    });

    return { destroy: () => btn.remove() };
}
