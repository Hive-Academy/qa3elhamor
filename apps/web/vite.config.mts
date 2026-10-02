/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { contentSecurityPolicy } from '../../tools/deploy/csp-vite-plugin.mjs';

/**
 * Public base path. `/` suits a GitHub Pages user site (https://<user>.github.io/) and any
 * custom domain; a forker deploying to a project site sets `SITE_BASE=/<repo>/` at build time.
 * Always normalised to a leading and trailing slash. See docs/deploy.md.
 */
function siteBase(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

export default defineConfig(() => ({
  root: import.meta.dirname,
  base: siteBase(process.env['SITE_BASE']),
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
  // contentSecurityPolicy: build-time <meta> CSP per HTML entry (tools/deploy/csp.ts,
  // docs/security.md). Dev runs without one.
  plugins: [react(), contentSecurityPolicy()],
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
      output: {
        // Vendor chunks: three and its React bindings change far less often than app code,
        // so splitting them keeps them cached across deploys (file names are content-hashed).
        // Budgets live in tools/perf-budget/budgets.ts.
        advancedChunks: {
          groups: [
            { name: 'vendor-three', test: /node_modules[\\/]three[\\/]/, priority: 40 },
            {
              name: 'vendor-r3f',
              test: /node_modules[\\/](?:@react-three[\\/](?:fiber|postprocessing)|postprocessing|its-fine|react-reconciler|scheduler|zustand|suspend-react|react-use-measure|use-sync-external-store)[\\/]/,
              priority: 30,
            },
            {
              name: 'vendor-drei',
              test: /node_modules[\\/](?:@react-three[\\/]drei|three-stdlib|meshline|maath|camera-controls|detect-gpu|stats-gl|troika[^\\/]*|bidi-js|hls\.js|three-mesh-bvh|tunnel-rat)[\\/]/,
              priority: 20,
            },
          ],
        },
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
