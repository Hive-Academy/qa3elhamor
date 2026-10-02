import { defineConfig } from 'vitest/config';

// Specs for the deploy tooling (CSP builder and plugin). Run with:
//   npx vitest run --config tools/deploy/vitest.config.mts
export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'deploy-tools',
    watch: false,
    environment: 'node',
    include: ['*.spec.ts'],
  },
});
