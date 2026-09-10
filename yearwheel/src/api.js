const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
    constructor(status, code, body) {
        super(`${status} ${code}`);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        // A 409 carries the current server entry so the page can reload the form onto it.
        this.body = body;
    }
}

async function fail(res) {
    let code = `http_${res.status}`;
    let body;
    try {
        body = await res.json();
        if (body && body.error) code = body.error;
    } catch { /* keep the http_ fallback */ }
    return new ApiError(res.status, code, body);
}

async function handle(res) {
    if (res.ok) return res.json();
    throw await fail(res);
}

function writeOptions(method, body) {
    return {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    };
}

export async function apiGet(path, fetchFn = fetch) {
    return handle(await fetchFn(`${API_BASE}${path}`, { credentials: 'include' }));
}

export async function apiPost(path, body, fetchFn = fetch) {
    return handle(await fetchFn(`${API_BASE}${path}`, writeOptions('POST', body)));
}

export async function apiPatch(path, body, fetchFn = fetch) {
    return handle(await fetchFn(`${API_BASE}${path}`, writeOptions('PATCH', body)));
}

// DELETE answers 204 with no body, so it cannot go through handle().
export async function apiDelete(path, body, fetchFn = fetch) {
    const res = await fetchFn(`${API_BASE}${path}`, writeOptions('DELETE', body));
    if (!res.ok) throw await fail(res);
}
