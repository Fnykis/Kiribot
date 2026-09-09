import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
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
});
