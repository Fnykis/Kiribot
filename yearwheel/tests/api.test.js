import { describe, it, expect, vi } from 'vitest';
import { apiGet, apiPost, ApiError } from '../src/api.js';

describe('apiGet', () => {
    it('sends credentials so the session cookie travels', async () => {
        const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ member: true }) }));
        await apiGet('/api/web/me', fetchFn);
        expect(fetchFn.mock.calls[0][1].credentials).toBe('include');
    });

    it('returns the parsed body on success', async () => {
        const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ member: true }) });
        expect(await apiGet('/api/web/me', fetchFn)).toEqual({ member: true });
    });

    it('throws ApiError carrying status and error code', async () => {
        const fetchFn = async () => ({ ok: false, status: 403, json: async () => ({ error: 'missing_role' }) });
        await expect(apiGet('/api/web/yearwheel/r1', fetchFn)).rejects.toMatchObject({
            status: 403,
            code: 'missing_role'
        });
    });

    it('still throws ApiError when the error body is not JSON', async () => {
        const fetchFn = async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
        const err = await apiGet('/x', fetchFn).catch(e => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(502);
        expect(err.code).toBe('http_502');
    });
});

describe('apiPost', () => {
    it('posts JSON with credentials', async () => {
        const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
        await apiPost('/api/web/token', { code: 'abc' }, fetchFn);
        const [, opts] = fetchFn.mock.calls[0];
        expect(opts.method).toBe('POST');
        expect(opts.credentials).toBe('include');
        expect(opts.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(opts.body)).toEqual({ code: 'abc' });
    });
});

import { apiPatch, apiDelete } from '../src/api.js';

describe('apiPatch', () => {
    it('sends a PATCH with credentials and a JSON body', async () => {
        let seen;
        const fetchFn = async (url, opts) => {
            seen = { url, opts };
            return { ok: true, json: async () => ({ id: 'e1', version: 2 }) };
        };
        const out = await apiPatch('/api/web/yearwheel/entry/e1', { title: 'B', version: 1 }, fetchFn);
        expect(out).toEqual({ id: 'e1', version: 2 });
        expect(seen.opts.method).toBe('PATCH');
        expect(seen.opts.credentials).toBe('include');
        expect(seen.opts.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(seen.opts.body)).toEqual({ title: 'B', version: 1 });
    });

    it('throws an ApiError carrying the server error code', async () => {
        const fetchFn = async () => ({
            ok: false, status: 409,
            json: async () => ({ error: 'version_conflict', entry: { id: 'e1' } })
        });
        await expect(apiPatch('/x', {}, fetchFn)).rejects.toBeInstanceOf(ApiError);
        await expect(apiPatch('/x', {}, fetchFn)).rejects.toMatchObject({ status: 409, code: 'version_conflict' });
    });

    it('exposes the conflicting entry from a 409 body', async () => {
        const fetchFn = async () => ({
            ok: false, status: 409,
            json: async () => ({ error: 'version_conflict', entry: { id: 'e1', version: 7 } })
        });
        await expect(apiPatch('/x', {}, fetchFn)).rejects.toMatchObject({ body: { entry: { id: 'e1', version: 7 } } });
    });
});

describe('apiDelete', () => {
    it('sends a DELETE with the version and resolves with nothing on 204', async () => {
        let seen;
        const fetchFn = async (url, opts) => {
            seen = { url, opts };
            return { ok: true, status: 204 };
        };
        const out = await apiDelete('/api/web/yearwheel/entry/e1', { version: 1 }, fetchFn);
        expect(out).toBeUndefined();
        expect(seen.opts.method).toBe('DELETE');
        expect(JSON.parse(seen.opts.body)).toEqual({ version: 1 });
    });

    it('throws an ApiError on failure', async () => {
        const fetchFn = async () => ({ ok: false, status: 409, json: async () => ({ error: 'version_conflict' }) });
        await expect(apiDelete('/x', { version: 1 }, fetchFn)).rejects.toMatchObject({ code: 'version_conflict' });
    });
});
