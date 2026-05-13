import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bootSdk } from '../src/sdk.js';

function makeSdkClass({ readyThrows = false, authCode = 'code_abc' } = {}) {
    return class MockDiscordSDK {
        constructor(clientId) { this.clientId = clientId; }
        async ready() {
            if (readyThrows) throw new Error('not in discord');
        }
        commands = {
            authorize: vi.fn(async () => ({ code: authCode })),
            authenticate: vi.fn(async ({ access_token }) => ({ user: { id: 'u1' } })),
        };
    };
}

beforeEach(() => {
    document.body.replaceChildren();
});

describe('bootSdk', () => {
    it('returns sdk and code on success', async () => {
        const result = await bootSdk(makeSdkClass(), 'client_123');
        expect(result.code).toBe('code_abc');
        expect(result.sdk).toBeDefined();
    });

    it('calls authorize with correct params', async () => {
        const Cls = makeSdkClass();
        const { sdk } = await bootSdk(Cls, 'client_123');
        expect(sdk.commands.authorize).toHaveBeenCalledWith({
            client_id: 'client_123',
            response_type: 'code',
            state: '',
            prompt: 'none',
            scope: ['identify', 'guilds.members.read'],
        });
    });

    it('renders standalone refusal and throws when ready() rejects', async () => {
        await expect(bootSdk(makeSdkClass({ readyThrows: true }), 'client_123'))
            .rejects.toThrow('not_in_discord');
        expect(document.body.textContent).toMatch(/Discord/i);
    });
});
