import { describe, it, expect } from 'vitest';
import { get, post } from '../src/api.js';

function mockFetch(status, body) {
    return async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    });
}

describe('get', () => {
    it('sends Authorization header', async () => {
        let capturedOpts;
        const fetchFn = async (url, opts) => {
            capturedOpts = opts;
            return { ok: true, status: 200, json: async () => ({ ok: true }) };
        };
        await get('/api/me', 'my_token', fetchFn);
        expect(capturedOpts.headers['Authorization']).toBe('Bearer my_token');
    });

    it('returns parsed JSON on success', async () => {
        const result = await get('/api/me', 't', mockFetch(200, { id: 'u1' }));
        expect(result.id).toBe('u1');
    });

    it('throws with status 401', async () => {
        await expect(get('/api/me', 't', mockFetch(401, { error: 'invalid_token' })))
            .rejects.toMatchObject({ status: 401 });
    });

    it('throws with status 403', async () => {
        await expect(get('/api/me', 't', mockFetch(403, { error: 'missing_role' })))
            .rejects.toMatchObject({ status: 403 });
    });

    it('throws with status 404', async () => {
        await expect(get('/api/concert/pending', 't', mockFetch(404, { error: 'not_found' })))
            .rejects.toMatchObject({ status: 404 });
    });
});

describe('post', () => {
    it('sends Authorization header and JSON body', async () => {
        let capturedOpts;
        const fetchFn = async (url, opts) => {
            capturedOpts = opts;
            return { ok: true, status: 200, json: async () => ({}) };
        };
        await post('/api/lineup/place', { concertId: 'c1', userId: 'u1' }, 'tok', fetchFn);
        expect(capturedOpts.headers['Authorization']).toBe('Bearer tok');
        expect(capturedOpts.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(capturedOpts.body)).toEqual({ concertId: 'c1', userId: 'u1' });
    });

    it('throws with status 409 on conflict', async () => {
        await expect(post('/api/lineup/place', {}, 't', mockFetch(409, { error: 'conflict' })))
            .rejects.toMatchObject({ status: 409 });
    });
});
