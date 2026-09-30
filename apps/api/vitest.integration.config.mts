import { defineConfig } from 'vitest/config';

/**
 * Integration suite: the real router over Prisma against the Postgres in the root
 * `docker-compose.yml`. Run with `npx nx run api:integration` (starts the container first).
 * Deliberately not matched by the default `test` target, so CI without Docker stays green.
 */
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api-integration',
  test: {
    name: 'api-integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['integration/**/*.integration.ts'],
    globalSetup: ['integration/global-setup.ts'],
    // One database, shared state: files must not run concurrently.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    reporters: ['default'],
  },
}));
