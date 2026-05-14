import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import { bootSdk, authenticateSdk } from './sdk.js';
import { exchangeCode, setToken } from './auth.js';
import {
    isDevMode,
    fetchConcerts,
    fetchState,
    fetchMembers,
    placeMember,
    moveMember,
    removeMember,
} from './dataSource.js';
import {
    setEvent,
    getEvent,
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
import { renderPicker } from './picker.js';
import { renderAvailable } from './sidebar/available.js';
import { renderStage, GRID_STEP, STAGE_W, STAGE_H } from './canvas/stage.js';
import { startPoll, stopPoll } from './poll.js';
import { wireDrag } from './canvas/drag.js';
import { openManualAdd } from './sidebar/manualAdd.js';
import { openStallUppAlla } from './sidebar/stallUppAlla.js';
import { computeAutoPositions } from './canvas/autoPlace.js';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

let _accessToken = null;
let _pollHandle = null;

function showStatus(message, isError = false) {
    document.body.replaceChildren();
    const p = document.createElement('p');
    p.className = isError ? 'status-message error' : 'status-message';
    p.textContent = message;
    document.body.appendChild(p);
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
}

async function refreshState(concertId, sidebarInner, stage) {
    try {
        const fresh = await fetchState(concertId, _accessToken);
        setEvent(fresh);
        renderAvailable(sidebarInner, fresh);
        renderStage(stage, fresh);
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
    if (title) title.textContent = concertMeta ? `${concertMeta.name} — ${concertMeta.date}` : '';

    hideEl('picker');
    showEl('app', 'flex');

    const sidebar = document.getElementById('sidebar');
    const sidebarInner = document.getElementById('sidebar-inner');
    const stage = document.getElementById('stage');

    renderAvailable(sidebarInner, event);
    renderStage(stage, event);

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
                    onUpdate: (u) => { setEvent(u); renderAvailable(sidebarInner, u); renderStage(stage, u); },
                    onError: (err) => { console.warn('poll', err); }
                });
            }
        });
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
            await authenticateSdk(sdk, _accessToken);
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
