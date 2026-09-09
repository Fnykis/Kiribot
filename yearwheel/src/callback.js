import { apiPost } from './api.js';
import { readState, clearState } from './auth.js';

export async function handleCallback(search, root) {
    const params = new URLSearchParams(search);
    const code = params.get('code');
    const state = params.get('state');
    const expected = readState();
    clearState();

    if (!code || !state || state !== expected) {
        root.textContent = 'Inloggningen misslyckades. Försök igen.';
        return;
    }

    try {
        await apiPost('/api/web/token', { code });
        window.location.replace('./index.html');
    } catch {
        root.textContent = 'Inloggningen misslyckades. Försök igen.';
    }
}
