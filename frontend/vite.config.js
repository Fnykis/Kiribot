import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
    // dev mode imports JSON from ../src — allow serving outside the frontend root
    fs: {
      allow: ['..'],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    alias: {
      interactjs: new URL('./tests/__mocks__/interactjs.js', import.meta.url).pathname,
    },
  },
});
