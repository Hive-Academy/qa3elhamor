/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  server: {
    port: 4200,
    host: 'localhost',
    // Dev only: the API dev server (`npm run api:dev`) runs on 8787. Proxying keeps calls
    // same-origin, as they are in production where Netlify serves both. `server.proxy` does
    // not apply to `vite build` or `vite preview`.
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
    },
  },
  preview: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [react()],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    // Two pages, two entry graphs: the moderation console is its own input so no moderation
    // code ever lands in the public site's bundle.
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        moderation: resolve(import.meta.dirname, 'moderation.html'),
      },
    },
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: '@qa3elhamor/web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    // jsdom + three/R3F module graphs are slow to import when the whole workspace tests in
    // parallel (CI, `run-many`); the 5 s default flaked there while passing in isolation.
    testTimeout: 15_000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
