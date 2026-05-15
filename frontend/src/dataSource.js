// Single data layer for the planner. In dev mode (VITE_DEV_MODE=true) it serves
// local repo JSON via devData.js; otherwise it calls the real backend API.
import { get, getWithQuery, post } from './api.js';
import { createDevData } from './devData.js';

export const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';

let _dev = null;
function dev() {
    if (!_dev) {
        const modules = import.meta.glob('../../src/events/active/*.json', { eager: true });
        const rawEvents = Object.values(modules).map(m => m.default ?? m);
        _dev = createDevData(rawEvents);
    }
    return _dev;
}

export async function fetchConcerts(token) {
    return isDevMode ? dev().getConcerts() : get('/api/concerts', token);
}

export async function fetchState(concertId, token) {
    return isDevMode ? dev().getState(concertId) : get(`/api/state/${concertId}`, token);
}

export async function fetchMembers(q, token) {
    return isDevMode ? dev().getMembers(q) : getWithQuery('/api/guild/members', { q }, token);
}

export async function placeMember(body, token) {
    return isDevMode ? dev().place(body) : post('/api/lineup/place', body, token);
}

export async function moveMember(body, token) {
    return isDevMode ? dev().move(body) : post('/api/lineup/move', body, token);
}

export async function removeMember(body, token) {
    return isDevMode ? dev().remove(body) : post('/api/lineup/remove', body, token);
}

export async function setMute(muted, token) {
    return isDevMode ? dev().setMute(muted) : post('/api/voice/mute', { muted }, token);
}

export async function leaveVoice(token) {
    return isDevMode ? dev().leaveVoice() : post('/api/voice/leave', {}, token);
}
