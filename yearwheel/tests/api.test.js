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
