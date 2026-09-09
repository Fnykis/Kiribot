import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

const REQUIRED_BUILD_ENV_VARS = ['VITE_DISCORD_CLIENT_ID', 'VITE_API_BASE', 'VITE_REDIRECT_URI'];

export default defineConfig(({ command, mode }) => {
    // Only `vite build` produces a deploy artifact — dev/serve and vitest must not be
    // blocked by this check. A build with missing vars silently hardcodes an empty
    // VITE_API_BASE and `undefined` client id/redirect uri into the bundle, so fail loudly
    // here instead of shipping a broken deploy (e.g. forgetting `cp .env.example .env.production`).
    if (command === 'build') {
        const env = loadEnv(mode, process.cwd(), '');
        const missing = REQUIRED_BUILD_ENV_VARS.filter(key => !env[key]);
        if (missing.length) {
            throw new Error(
                `yearwheel build: missing required env var(s): ${missing.join(', ')}. ` +
                `Create .env.production (see .env.example) with real values before building.`
            );
        }
    }

    return {
        base: './',
        build: {
            outDir: 'dist',
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'index.html'),
                    wheel: resolve(__dirname, 'wheel.html'),
                    callback: resolve(__dirname, 'callback.html'),
                },
            },
        },
        test: {
            environment: 'jsdom',
            globals: true,
        },
    };
});
