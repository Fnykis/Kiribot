import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

const gitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'nogit'; }
})();
const gitDirty = (() => {
  try { return execSync('git status --porcelain').toString().trim() ? '+' : ''; }
  catch { return ''; }
})();
const buildInfo = `${gitHash}${gitDirty} · ${new Date().toISOString().replace('T', ' ').slice(0, 16)}`;

export default defineConfig({
  base: '/',
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
  },
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
