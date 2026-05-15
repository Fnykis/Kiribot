import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import { bootSdk, authenticateSdk } from './sdk.js';
import { exchangeCode, setToken, getToken } from './auth.js';
import {
    isDevMode,
    fetchConcerts,
    fetchState,
    fetchMembers,
    placeMember,
    moveMember,
    removeMember,
    setMute,
    leaveVoice,
} from './dataSource.js';
import { createVoiceControls } from './voiceControls.js';
import {
    setEvent,
    getEvent,
    clearSelectedIds,
    clearSelectedGhostIds,
    setConcerts,
    getConcerts,
    setSelectedConcertId,
    clearSelectedConcert,
    getDraggingId,
    setDraggingId,
    getDraggingPosition,
    setDraggingPosition,
    getDraggingSidebarUserId,
    setDraggingSidebarUserId,
    getIsSelecting,
    toggleMestre,
    setMestrePos,
} from './state.js';
import { toBlob } from 'html-to-image';

let _cachedFontCSS = null;
async function buildFontEmbedCSS() {
    if (_cachedFontCSS !== null) return _cachedFontCSS;
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .filter(l => /fonts\.googleapis\.com/.test(l.href));
    const urlToDataUrl = async (url) => {
        const blob = await fetch(url, { credentials: 'omit' }).then(r => r.blob());
        return await new Promise(res => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.readAsDataURL(blob);
        });
    };
    let combined = '';
    for (const link of links) {
        try {
            const css = await fetch(link.href, { credentials: 'omit' }).then(r => r.text());
            const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map(m => m[1]))];
            let inlined = css;
            for (const url of urls) {
                try {
                    const dataUrl = await urlToDataUrl(url);
                    inlined = inlined.split(url).join(dataUrl);
                } catch (e) { console.warn('font url fetch failed', url, e); }
            }
            combined += inlined + '\n';
        } catch (e) { console.warn('font css fetch failed', link.href, e); }
    }
    _cachedFontCSS = combined;
    return combined;
}
import { renderPicker } from './picker.js';
import { renderAvailable } from './sidebar/available.js';
import { renderStage, GRID_STEP, STAGE_W, STAGE_H } from './canvas/stage.js';
import { startPoll, stopPoll } from './poll.js';
import { wireDrag, applySelectionVisual } from './canvas/drag.js';
import { openManualAdd } from './sidebar/manualAdd.js';
import { openStallUppAlla } from './sidebar/stallUppAlla.js';
import { computeAutoPositions } from './canvas/autoPlace.js';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

let _accessToken = null;
let _pollHandle = null;
let _sdk = null;
let _userId = null;
const _activeVoiceControls = new Set();

function mountVoiceControls(root) {
    if (!root || !_sdk || !_userId) return null;
    for (const h of [..._activeVoiceControls]) h.destroy();
    const handle = createVoiceControls({
        root,
        sdk: _sdk,
        userId: _userId,
        setMute,
        leaveVoice,
        getToken,
    });
    _activeVoiceControls.add(handle);
    const origDestroy = handle.destroy;
    handle.destroy = () => { origDestroy(); _activeVoiceControls.delete(handle); };
    return handle;
}

function showStatus(message, isError = false) {
    document.body.replaceChildren();
    const p = document.createElement('p');
    p.className = isError ? 'status-message error' : 'status-message';
    p.textContent = message;
    document.body.appendChild(p);
}

function openConfirm(modalEl, { message, confirmLabel = 'Bekräfta', cancelLabel = 'Avbryt', onConfirm }) {
    modalEl.replaceChildren();
    modalEl.style.display = 'flex';
    const box = document.createElement('div');
    box.className = 'confirm-box';
    const msg = document.createElement('p');
    msg.className = 'confirm-msg';
    msg.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'confirm-btn';
    cancel.textContent = cancelLabel;
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'confirm-btn danger';
    confirm.textContent = confirmLabel;
    const close = () => { modalEl.style.display = 'none'; modalEl.replaceChildren(); };
    cancel.onclick = close;
    confirm.onclick = async () => { close(); if (onConfirm) await onConfirm(); };
    modalEl.onclick = (e) => { if (e.target === modalEl) close(); };
    actions.append(cancel, confirm);
    box.append(msg, actions);
    modalEl.appendChild(box);
}

function hideEl(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}
function showEl(id, display = 'block') {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
}

async function fetchAndShowPicker() {
    let concerts;
    try {
        concerts = await fetchConcerts(_accessToken);
    } catch (err) {
        if (err.status === 403) {
            showStatus('Åtkomst nekad. Harmonian-rollen krävs.', true);
        } else {
            showStatus('Kunde inte hämta konserter. Ladda om sidan.', true);
        }
        return;
    }
    setConcerts(concerts);

    hideEl('loading');
    hideEl('app');
    showEl('picker');

    renderPicker(
        document.getElementById('picker'),
        concerts,
        (concertId) => loadPlanner(concertId),
    );
    mountVoiceControls(document.getElementById('picker-voice-slot'));
}

async function refreshState(concertId, sidebarInner, stage) {
    try {
        const fresh = await fetchState(concertId, _accessToken);
        setEvent(fresh);
        renderAvailable(sidebarInner, fresh);
        renderStage(stage, fresh);
        applySelectionVisual(stage);
    } catch (err) {
        console.warn('refresh failed', err);
    }
}

async function loadPlanner(concertId) {
    let event;
    try {
        event = await fetchState(concertId, _accessToken);
    } catch (err) {
        if (err.status === 403) {
            showStatus('Åtkomst nekad. Harmonian-rollen krävs.', true);
        } else if (err.status === 404) {
            showStatus('Konserten är stängd eller hittades inte.');
        } else {
            showStatus('Kunde inte ladda evenemanget. Ladda om sidan.', true);
        }
        return;
    }

    setSelectedConcertId(concertId);
    setEvent(event);

    const concertMeta = (getConcerts() || []).find(c => c.concertId === concertId);
    const title = document.getElementById('planner-title');
    if (title) title.textContent = concertMeta ? `${concertMeta.name.replace(/\[.*?\]\s*/g, '').replace(/^[^a-zA-ZåäöÅÄÖ0-9]+/, '').trim()} — ${concertMeta.date}` : '';

    hideEl('picker');
    showEl('app', 'flex');

    const sidebar = document.getElementById('sidebar');
    const sidebarInner = document.getElementById('sidebar-inner');
    const stage = document.getElementById('stage');

    renderAvailable(sidebarInner, event);
    renderStage(stage, event);

    const voiceSlot = document.getElementById('sidebar-voice-slot');
    if (voiceSlot) {
        voiceSlot.replaceChildren();
        mountVoiceControls(voiceSlot);
    }

    wireDrag({
        stageEl: stage,
        sidebarEl: sidebar,
        sidebarContentEl: sidebarInner,
        getEvent,
        setDraggingId,
        setDraggingPosition,
        setDraggingSidebarUserId,
        onPlace: async (payload) => {
            const updated = await placeMember({ concertId, ...payload }, _accessToken);
            setEvent(updated);
            renderAvailable(sidebarInner, updated);
            renderStage(stage, updated);
        },
        onMove: async ({ userId, x, y }) => {
            const updated = await moveMember({ concertId, userId, x, y }, _accessToken);
            setEvent(updated);
            renderStage(stage, updated);
        },
        onMoveMany: async (moves) => {
            let updated;
            for (const { userId, x, y } of moves) {
                updated = await moveMember({ concertId, userId, x, y }, _accessToken);
                setEvent(updated);
            }
            if (updated) renderStage(stage, updated);
        },
        renderLocal: () => renderStage(stage, getEvent()),
        onMestre: ({ userId }) => {
            const entry = (getEvent().lineup || []).find(e => String(e.userId) === String(userId));
            if (!entry) return;
            const initX = entry.position.x;
            const initY = Math.min(STAGE_H - GRID_STEP, entry.position.y + GRID_STEP * 3);
            toggleMestre(userId, { x: initX, y: initY });
            renderStage(stage, getEvent());
        },
        onMestreMove: ({ userId, x, y }) => {
            setMestrePos(userId, { x, y });
        },
        onRemove: async ({ userId }) => {
            const updated = await removeMember({ concertId, userId }, _accessToken);
            setEvent(updated);
            renderAvailable(sidebarInner, updated);
            renderStage(stage, updated);
        },
        onError: (err) => {
            if (err.status === 409) {
                refreshState(concertId, sidebarInner, stage);
            } else {
                showStatus('Något gick fel: ' + (err.message || err), true);
            }
        }
    });

    const manualBtn = document.getElementById('manual-add-btn');
    const modalEl = document.getElementById('manual-add-modal');
    if (manualBtn && modalEl) {
        manualBtn.onclick = () => openManualAdd({
            modalEl,
            fetchMembers: (q) => fetchMembers(q, _accessToken),
            instruments: Object.keys(event.signups || {}),
            onSubmit: async ({ userId, displayName, instrument }) => {
                try {
                    const updated = await placeMember(
                        { concertId, userId, displayName, instrument, x: 500, y: 300, manuallyAdded: true },
                        _accessToken);
                    setEvent(updated);
                    renderAvailable(sidebarInner, updated);
                    renderStage(stage, updated);
                } catch (err) {
                    showStatus('Kunde inte lägga till medlem: ' + (err.message || err), true);
                }
            }
        });
    }

    const stuaBtn = document.getElementById('stall-upp-alla-btn');
    const stuaModal = document.getElementById('stall-upp-alla-modal');
    if (stuaBtn && stuaModal) {
        stuaBtn.onclick = () => openStallUppAlla({
            modalEl: stuaModal,
            event: getEvent(),
            onSubmit: async (selections) => {
                if (_pollHandle) { stopPoll(_pollHandle); _pollHandle = null; }
                const positioned = computeAutoPositions(selections, GRID_STEP, STAGE_W, STAGE_H);
                for (const p of positioned) {
                    try {
                        const updated = await placeMember({
                            concertId, ...p, manuallyAdded: false
                        }, _accessToken);
                        setEvent(updated);
                    } catch (err) {
                        showStatus(`Kunde inte placera ${p.displayName}: ${err.message || err}`, true);
                        break;
                    }
                }
                renderAvailable(sidebarInner, getEvent());
                renderStage(stage, getEvent());
                _pollHandle = startPoll({
                    fetchState: () => fetchState(concertId, _accessToken),
                    intervalMs: 5000,
                    getDraggingId,
                    getDraggingPosition,
                    getDraggingSidebarUserId,
                    getIsSelecting,
                    onUpdate: (u) => { setEvent(u); renderAvailable(sidebarInner, u); renderStage(stage, u); applySelectionVisual(stage); },
                    onError: (err) => { console.warn('poll', err); }
                });
            }
        });
    }

    const rensaBtn = document.getElementById('rensa-btn');
    const rensaModal = document.getElementById('rensa-modal');
    if (rensaBtn && rensaModal) {
        rensaBtn.onclick = () => openConfirm(rensaModal, {
            message: 'Är du säker? Detta kommer rensa hela uppställningen.',
            confirmLabel: 'Rensa',
            onConfirm: async () => {
                const lineup = (getEvent().lineup || []).slice();
                for (const entry of lineup) {
                    try {
                        const updated = await removeMember({ concertId, userId: entry.userId }, _accessToken);
                        setEvent(updated);
                    } catch (err) {
                        showStatus('Kunde inte rensa: ' + (err.message || err), true);
                        return;
                    }
                }
                renderAvailable(sidebarInner, getEvent());
                renderStage(stage, getEvent());
            }
        });
    }

    const cameraBtn = document.getElementById('camera-btn');
    if (cameraBtn) {
        cameraBtn.onclick = async () => {
            clearSelectedIds();
            clearSelectedGhostIds();
            renderStage(stage, getEvent());
            stage.classList.add('no-grid');
            const titleEl = document.getElementById('planner-title');
            const watermark = document.createElement('div');
            watermark.className = 'stage-watermark';
            watermark.textContent = titleEl ? titleEl.textContent : '';
            stage.appendChild(watermark);
            try {
                if (document.fonts && document.fonts.ready) await document.fonts.ready;
                const fontEmbedCSS = await buildFontEmbedCSS();
                const blob = await toBlob(stage, { pixelRatio: 2, cacheBust: true, fontEmbedCSS, skipFonts: true });
                if (!blob) throw new Error('Tom bild');
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                cameraBtn.classList.add('flash');
                setTimeout(() => cameraBtn.classList.remove('flash'), 400);
                const toast = document.getElementById('camera-toast');
                if (toast) {
                    toast.classList.add('show');
                    clearTimeout(toast._hideTimer);
                    toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 2000);
                }
            } catch (err) {
                console.warn('clipboard copy failed', err);
                cameraBtn.title = 'Kunde inte kopiera: ' + (err.message || err);
            } finally {
                stage.classList.remove('no-grid');
                watermark.remove();
            }
        };
    }

    if (_pollHandle) stopPoll(_pollHandle);
    _pollHandle = startPoll({
        fetchState: () => fetchState(concertId, _accessToken),
        intervalMs: 5000,
        getDraggingId,
        getDraggingPosition,
        getDraggingSidebarUserId,
        onUpdate: (updated) => {
            setEvent(updated);
            renderAvailable(sidebarInner, updated);
            renderStage(stage, updated);
            applySelectionVisual(stage);
        },
        onError: (err) => { console.warn('poll', err); }
    });
}

function backToPicker() {
    if (_pollHandle) { stopPoll(_pollHandle); _pollHandle = null; }
    clearSelectedConcert();
    fetchAndShowPicker();
}

async function boot() {
    if (isDevMode) {
        _accessToken = 'dev';
        setToken(_accessToken);
        _sdk = { subscribe: () => () => {} };
        _userId = 'dev';
    } else {
        let sdk, code;
        try {
            ({ sdk, code } = await bootSdk(DiscordSDK, CLIENT_ID, patchUrlMappings));
        } catch {
            return; // sdk.js already rendered standalone refusal
        }

        try {
            const result = await exchangeCode(code);
            _accessToken = result.access_token;
            setToken(_accessToken);
            const authResult = await authenticateSdk(sdk, _accessToken);
            _sdk = sdk;
            _userId = authResult.user.id;
        } catch (err) {
            const host = window.location.host;
            const fetchPatched = window.fetch.toString().indexOf('[native code]') === -1 ? 'PATCHED' : 'NATIVE';
            showStatus(
                'Auth fail [' + (err.status || 'no-status') + ']: ' + (err.message || String(err))
                + ' | code: ' + (code ? code.slice(0, 12) : 'EMPTY')
                + ' | host: ' + host
                + ' | fetch: ' + fetchPatched,
                true,
            );
            return;
        }
    }

    const backBtn = document.getElementById('back-btn');
    if (backBtn) backBtn.addEventListener('click', backToPicker);

    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarEl = document.getElementById('sidebar');
    if (sidebarToggleBtn && sidebarEl) {
        sidebarToggleBtn.addEventListener('click', () => {
            sidebarEl.classList.toggle('collapsed');
        });
    }

    await fetchAndShowPicker();
}

boot();
