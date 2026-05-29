async function handleResponse(res) {
    if (res.ok) return res.json();
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || `http_${res.status}`), { status: res.status });
}

export async function get(path, token, fetchFn = fetch) {
    const res = await fetchFn(path, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleResponse(res);
}

export async function getWithQuery(path, params, token, fetchFn = fetch) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
        if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
    }
    const qs = usp.toString();
    const url = qs ? `${path}?${qs}` : path;
    const res = await fetchFn(url, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleResponse(res);
}

export async function post(path, body, token, fetchFn = fetch) {
    const res = await fetchFn(path, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    return handleResponse(res);
}

export async function postBlob(path, blob, contentType, token, fetchFn = fetch) {
    const res = await fetchFn(path, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': contentType,
        },
        body: blob,
    });
    return handleResponse(res);
}
