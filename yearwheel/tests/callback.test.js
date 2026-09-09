import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleCallback } from '../src/callback.js';
import { newState, readState } from '../src/auth.js';
import { apiPost } from '../src/api.js';

vi.mock('../src/api.js', () => ({
    apiPost: vi.fn()
}));

const FAILURE_TEXT = 'Inloggningen misslyckades. Försök igen.';

describe('handleCallback', () => {
    let root;
    let replaceSpy;

    beforeEach(() => {
        root = document.createElement('div');
        sessionStorage.clear();
        apiPost.mockReset();
        replaceSpy = vi.fn();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...window.location, replace: replaceSpy }
        });
    });

    it('matching state and a valid code exchanges the code and redirects', async () => {
        apiPost.mockResolvedValue({ ok: true });
        const state = newState();

        await handleCallback(`?code=abc123&state=${state}`, root);

        expect(apiPost).toHaveBeenCalledWith('/api/web/token', { code: 'abc123' });
        expect(replaceSpy).toHaveBeenCalledWith('./index.html');
    });

    it('mismatched state shows the failure message and never calls apiPost', async () => {
        newState();

        await handleCallback('?code=abc123&state=some-other-state', root);

        expect(root.textContent).toBe(FAILURE_TEXT);
        expect(apiPost).not.toHaveBeenCalled();
        expect(replaceSpy).not.toHaveBeenCalled();
    });

    it('a missing state param shows the failure message and never calls apiPost', async () => {
        newState();

        await handleCallback('?code=abc123', root);

        expect(root.textContent).toBe(FAILURE_TEXT);
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('a missing code param shows the failure message and never calls apiPost', async () => {
        const state = newState();

        await handleCallback(`?state=${state}`, root);

        expect(root.textContent).toBe(FAILURE_TEXT);
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('clears the state so a second callback with the same search also fails (single-use)', async () => {
        apiPost.mockResolvedValue({ ok: true });
        const state = newState();
        const search = `?code=abc123&state=${state}`;

        await handleCallback(search, root);
        expect(apiPost).toHaveBeenCalledTimes(1);
        expect(readState()).toBeNull();

        apiPost.mockClear();
        const root2 = document.createElement('div');
        await handleCallback(search, root2);

        expect(root2.textContent).toBe(FAILURE_TEXT);
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('shows the failure message when the token exchange itself fails', async () => {
        apiPost.mockRejectedValue(new Error('exchange_failed'));
        const state = newState();

        await handleCallback(`?code=abc123&state=${state}`, root);

        expect(root.textContent).toBe(FAILURE_TEXT);
        expect(replaceSpy).not.toHaveBeenCalled();
    });
});
