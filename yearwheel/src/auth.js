const STATE_KEY = 'kiribot_oauth_state';

export function buildAuthorizeUrl({ clientId, redirectUri, state }) {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'identify',
        state,
    });
    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

export function newState() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const state = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(STATE_KEY, state);
    return state;
}

export function readState() {
    return sessionStorage.getItem(STATE_KEY);
}

export function clearState() {
    sessionStorage.removeItem(STATE_KEY);
}
