import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import { bootSdk, authenticateSdk } from './sdk.js';
import { exchangeCode, setToken } from './auth.js';
import { get } from './api.js';
import { setEvent } from './state.js';
import { renderAvailable } from './sidebar/available.js';
import { renderStage } from './canvas/stage.js';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

function showStatus(message, isError = false) {
    document.body.replaceChildren();
    const p = document.createElement('p');
    p.className = isError ? 'status-message error' : 'status-message';
    p.textContent = message;
    document.body.appendChild(p);
}

async function boot() {
    let sdk, code;
    try {
        ({ sdk, code } = await bootSdk(DiscordSDK, CLIENT_ID, patchUrlMappings));
    } catch {
        return; // sdk.js already rendered standalone refusal
    }

    let accessToken;
    try {
        const result = await exchangeCode(code);
        accessToken = result.access_token;
        setToken(accessToken);
        await authenticateSdk(sdk, accessToken);
    } catch (err) {
        showStatus('Auth fail [' + (err.status || 'no-status') + ']: ' + (err.message || String(err)) + ' | code prefix: ' + (code ? code.slice(0, 12) : 'EMPTY'), true);
        return;
    }

    let concertId;
    try {
        const result = await get('/api/concert/pending', accessToken);
        concertId = result.concertId;
    } catch (err) {
        if (err.status === 404) {
            showStatus('Inget väntande konsert. Högerklicka ett signup-meddelande och välj "Lineup" först.');
        } else {
            showStatus('Kunde inte hämta konsert. Ladda om sidan.', true);
        }
        return;
    }

    let event;
    try {
        event = await get(`/api/state/${concertId}`, accessToken);
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

    setEvent(event);

    const loading = document.getElementById('loading');
    if (loading) loading.remove();
    document.getElementById('app').style.display = 'flex';

    renderAvailable(document.getElementById('sidebar'), event);
    renderStage(document.getElementById('stage'), event);
}

boot();
