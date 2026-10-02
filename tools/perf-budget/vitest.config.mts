import { defineConfig } from 'vitest/config';

// Specs for the perf-budget gate. Run with:
//   npx vitest run --config tools/perf-budget/vitest.config.mts
export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'perf-budget-tools',
    watch: false,
    environment: 'node',
    include: ['*.spec.ts'],
  },
});
