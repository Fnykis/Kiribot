import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import { bootSdk, authenticateSdk } from './sdk.js';
import { exchangeCode, setToken } from './auth.js';
import { get } from './api.js';
import {
    setEvent,
    setConcerts,
    getConcerts,
    setSelectedConcertId,
    clearSelectedConcert,
} from './state.js';
import { renderPicker } from './picker.js';
import { renderAvailable } from './sidebar/available.js';
import { renderStage } from './canvas/stage.js';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

let _accessToken = null;

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

    renderAvailable(document.getElementById('sidebar'), event);
    renderStage(document.getElementById('stage'), event);
}

function backToPicker() {
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
