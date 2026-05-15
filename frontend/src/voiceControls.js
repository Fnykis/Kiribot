const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(attrs, children) {
    const el = document.createElementNS(SVG_NS, 'svg');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    for (const child of children) el.appendChild(child);
    return el;
}
function path(d, extra = {}) {
    const el = document.createElementNS(SVG_NS, 'path');
    el.setAttribute('d', d);
    for (const [k, v] of Object.entries(extra)) el.setAttribute(k, v);
    return el;
}
function line(x1, y1, x2, y2) {
    const el = document.createElementNS(SVG_NS, 'line');
    el.setAttribute('x1', x1); el.setAttribute('y1', y1);
    el.setAttribute('x2', x2); el.setAttribute('y2', y2);
    return el;
}
function rect(x, y, w, h, rx) {
    const el = document.createElementNS(SVG_NS, 'rect');
    el.setAttribute('x', x); el.setAttribute('y', y);
    el.setAttribute('width', w); el.setAttribute('height', h);
    el.setAttribute('rx', rx);
    return el;
}

const ICON_ATTRS = {
    xmlns: SVG_NS,
    width: '20', height: '20', viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor',
    'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
};

function micOnIcon() {
    return svg(ICON_ATTRS, [
        rect(9, 2, 6, 13, 3),
        path('M19 10v2a7 7 0 0 1-14 0v-2'),
        path('M12 19v3'),
    ]);
}
function micOffIcon() {
    return svg(ICON_ATTRS, [
        path('M15 9.34V5a3 3 0 0 0-5.68-1.33'),
        path('M9 9v3a3 3 0 0 0 5.12 2.12'),
        path('M19 10v2a7 7 0 0 1-.11 1.17'),
        path('M5 10v2a7 7 0 0 0 12 5'),
        path('M12 19v3'),
        line(2, 2, 22, 22),
    ]);
}

export function createVoiceControls({ root, sdk, userId, setMute, leaveVoice, getToken, onLeft }) {
    const panel = document.createElement('div');
    panel.className = 'voice-controls';

    const leaveBtn = document.createElement('button');
    leaveBtn.type = 'button';
    leaveBtn.className = 'voice-leave-btn';
    leaveBtn.textContent = 'Avsluta';

    const muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = 'voice-mute-btn';
    muteBtn.dataset.muted = 'true';

    panel.append(leaveBtn, muteBtn);
    root.appendChild(panel);

    let muted = true;
    let muteInFlight = false;
    let leaveInFlight = false;

    function render() {
        muteBtn.dataset.muted = String(muted);
        muteBtn.replaceChildren(muted ? micOffIcon() : micOnIcon());
        muteBtn.setAttribute('aria-label', muted ? 'Slå på mikrofon' : 'Stäng av mikrofon');
    }
    render();

    muteBtn.addEventListener('click', async () => {
        if (muteInFlight) return;
        muteInFlight = true;
        const next = !muted;
        try {
            await setMute(next, getToken());
            muted = next;
            render();
        } catch (err) {
            console.error('mute toggle failed', err);
        } finally {
            muteInFlight = false;
        }
    });

    leaveBtn.addEventListener('click', async () => {
        if (leaveInFlight) return;
        leaveInFlight = true;
        leaveBtn.disabled = true;
        try {
            await leaveVoice(getToken());
            if (onLeft) onLeft();
        } catch (err) {
            console.error('leave voice failed', err);
        } finally {
            leaveInFlight = false;
            leaveBtn.disabled = false;
        }
    });

    const unsubscribe = sdk.subscribe('VOICE_STATE_UPDATE', (payload) => {
        if (!payload || !payload.user || payload.user.id !== userId) return;
        if (typeof payload.mute === 'boolean') {
            muted = payload.mute;
            render();
        }
    });

    return {
        destroy: () => {
            panel.remove();
            if (typeof unsubscribe === 'function') unsubscribe();
        }
    };
}
