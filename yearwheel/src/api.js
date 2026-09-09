const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
    constructor(status, code) {
        super(`${status} ${code}`);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

async function handle(res) {
    if (res.ok) return res.json();
    let code = `http_${res.status}`;
    try {
        const body = await res.json();
        if (body && body.error) code = body.error;
    } catch { /* keep the http_ fallback */ }
    throw new ApiError(res.status, code);
}

export async function apiGet(path, fetchFn = fetch) {
    return handle(await fetchFn(`${API_BASE}${path}`, { credentials: 'include' }));
}

export async function apiPost(path, body, fetchFn = fetch) {
    return handle(await fetchFn(`${API_BASE}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }));
}
