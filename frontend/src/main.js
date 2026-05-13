import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import { bootSdk, authenticateSdk } from './sdk.js';
import { exchangeCode, setToken } from './auth.js';
import { get, getWithQuery, post } from './api.js';
import {
    setEvent,
    getEvent,
    setConcerts,
    getConcerts,
    setSelectedConcertId,
    clearSelectedConcert,
    getDraggingId,
    setDraggingId,
} from './state.js';
import { renderPicker } from './picker.js';
import { renderAvailable } from './sidebar/available.js';
import { renderStage } from './canvas/stage.js';
import { startPoll, stopPoll } from './poll.js';
import { wireDrag } from './canvas/drag.js';
import { openManualAdd } from './sidebar/manualAdd.js';

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
        concerts = await get('/api/concerts', _accessToken);
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

async function refreshState(concertId, sidebar, stage) {
    try {
        const fresh = await get(`/api/state/${concertId}`, _accessToken);
        setEvent(fresh);
        renderAvailable(sidebar, fresh);
        renderStage(stage, fresh);
    } catch (err) {
        console.warn('refresh failed', err);
    }
}

async function loadPlanner(concertId) {
    let event;
    try {
        event = await get(`/api/state/${concertId}`, _accessToken);
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
    const stage = document.getElementById('stage');
    const trash = document.getElementById('trash');

    renderAvailable(sidebar, event);
    renderStage(stage, event);

    wireDrag({
        stageEl: stage,
        sidebarEl: sidebar,
        trashEl: trash,
        getEvent,
        setDraggingId,
        onPlace: async (payload) => {
            const updated = await post('/api/lineup/place', { concertId, ...payload }, _accessToken);
            setEvent(updated);
            renderAvailable(sidebar, updated);
            renderStage(stage, updated);
        },
        onMove: async ({ userId, x, y }) => {
            const updated = await post('/api/lineup/move', { concertId, userId, x, y }, _accessToken);
            setEvent(updated);
            renderStage(stage, updated);
        },
        onRemove: async ({ userId }) => {
            const updated = await post('/api/lineup/remove', { concertId, userId }, _accessToken);
            setEvent(updated);
            renderAvailable(sidebar, updated);
            renderStage(stage, updated);
        },
        onError: (err) => {
            if (err.status === 409) {
                refreshState(concertId, sidebar, stage);
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
            fetchMembers: (q) => getWithQuery('/api/guild/members', { q }, _accessToken),
            instruments: Object.keys(event.signups || {}),
            onSubmit: async ({ userId, displayName, instrument }) => {
                try {
                    const updated = await post('/api/lineup/place',
                        { concertId, userId, displayName, instrument, x: 500, y: 300, manuallyAdded: true },
                        _accessToken);
                    setEvent(updated);
                    renderAvailable(sidebar, updated);
                    renderStage(stage, updated);
                } catch (err) {
                    showStatus('Kunde inte lägga till medlem: ' + (err.message || err), true);
                }
            }
        });
    }

    if (_pollHandle) stopPoll(_pollHandle);
    _pollHandle = startPoll({
        fetchState: () => get(`/api/state/${concertId}`, _accessToken),
        intervalMs: 5000,
        getDraggingId,
        onUpdate: (updated) => {
            setEvent(updated);
            renderAvailable(sidebar, updated);
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

    const backBtn = document.getElementById('back-btn');
    if (backBtn) backBtn.addEventListener('click', backToPicker);

    await fetchAndShowPicker();
}

boot();
