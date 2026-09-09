import { describe, it, expect, beforeEach } from 'vitest';
import { buildAuthorizeUrl, newState, readState, clearState } from '../src/auth.js';

beforeEach(() => sessionStorage.clear());

describe('buildAuthorizeUrl', () => {
    it('requests only the identify scope', () => {
        const url = new URL(buildAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://s.example/cb', state: 'st' }));
        expect(url.searchParams.get('scope')).toBe('identify');
    });

    it('carries client id, redirect uri, response type and state', () => {
        const url = new URL(buildAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://s.example/cb', state: 'st' }));
        expect(url.origin + url.pathname).toBe('https://discord.com/api/oauth2/authorize');
        expect(url.searchParams.get('client_id')).toBe('cid');
        expect(url.searchParams.get('redirect_uri')).toBe('https://s.example/cb');
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('state')).toBe('st');
    });
});

describe('state', () => {
    it('newState stores a value that readState returns', () => {
        const s = newState();
        expect(s.length).toBeGreaterThan(10);
        expect(readState()).toBe(s);
    });

    it('two states differ', () => {
        const a = newState();
        const b = newState();
        expect(a).not.toBe(b);
    });

    it('clearState removes it', () => {
        newState();
        clearState();
        expect(readState()).toBeNull();
    });
});
