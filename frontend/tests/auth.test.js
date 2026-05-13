import { describe, it, expect } from 'vitest';
import { exchangeCode, setToken, getToken } from '../src/auth.js';

function mockFetch(status, body) {
    return async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    });
}

describe('exchangeCode', () => {
    it('returns access_token and expires_in on success', async () => {
        const fetchFn = mockFetch(200, { access_token: 'tok_abc', expires_in: 604800 });
        const result = await exchangeCode('code_xyz', fetchFn);
        expect(result.access_token).toBe('tok_abc');
        expect(result.expires_in).toBe(604800);
    });

    it('POSTs to /api/token with code in body', async () => {
        let captured;
        const fetchFn = async (url, opts) => {
            captured = { url, opts };
            return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 600 }) };
        };
        await exchangeCode('my_code', fetchFn);
        expect(captured.url).toBe('/api/token');
        expect(JSON.parse(captured.opts.body)).toEqual({ code: 'my_code' });
        expect(captured.opts.method).toBe('POST');
    });

    it('throws with status on non-ok response', async () => {
        await expect(exchangeCode('bad_code', mockFetch(400, { error: 'exchange_failed' })))
            .rejects.toMatchObject({ status: 400 });
    });
});

describe('setToken / getToken', () => {
    it('stores and retrieves token', () => {
        setToken('abc123');
        expect(getToken()).toBe('abc123');
    });

    it('starts null after setToken(null)', () => {
        setToken(null);
        expect(getToken()).toBeNull();
    });
});
