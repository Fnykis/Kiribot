let _token = null;

export function setToken(token) {
    _token = token;
}

export function getToken() {
    return _token;
}

export async function exchangeCode(code, fetchFn = fetch) {
    const res = await fetchFn('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error || 'exchange_failed'), { status: res.status });
    }
    return res.json();
}
