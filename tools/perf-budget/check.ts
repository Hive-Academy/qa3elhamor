/**
 * Performance-budget gate. Run after `nx run web:build`:
 *
 *   npm run perf:budget
 *
 * Fails (exit 1) with one line per violation when:
 *   - the JavaScript the first view downloads (entry + static imports) is over budget (gzip),
 *   - the first view's CSS is over budget (gzip),
 *   - any single JavaScript chunk is over budget (raw),
 *   - the models the first view loads exceed the manifest's `initialLoadBudgetBytes()`,
 *   - a model the manifest lists is missing from the build.
 *
 * Budgets: tools/perf-budget/budgets.ts. Docs: docs/perf-budget.md.
 *
 * Options (for CI and for proving the gate):
 *   --dist <dir>   build output to read (default apps/web/dist)
 *   --base <path>  deploy base the build used (default /, or $SITE_BASE)
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { WEB_ASSETS, initialLoadBudgetBytes } from '@qa3elhamor/world-domain';
import { BUDGETS } from './budgets';
import { listFiles, pageLoad } from './dist-graph';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const distDir = resolve(option('--dist') ?? resolve(repoRoot, 'apps/web/dist'));
const siteBase = (option('--base') ?? process.env['SITE_BASE'] ?? '/').replace(/^\/+|\/+$/g, '');
const base = siteBase === '' ? '/' : `/${siteBase}/`;

const kib = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;
const gzipSize = (file: string): number => gzipSync(readFileSync(resolve(distDir, file))).length;
const rawSize = (file: string): number => statSync(resolve(distDir, file)).size;
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

if (!existsSync(resolve(distDir, 'index.html'))) {
  console.error(`perf-budget: ${distDir}/index.html not found. Run "npx nx run web:build" first.`);
  process.exit(2);
}

const violations: string[] = [];
const lines: string[] = [];

// 1. Initial JS and CSS.
const initial = pageLoad(distDir, 'index.html', base);
const initialJs = sum(initial.js.map(gzipSize));
const initialCss = sum(initial.css.map(gzipSize));
lines.push(
  `initial JS     ${kib(initialJs)} gzip of ${kib(BUDGETS.initialJsGzipBytes)}  (${initial.js.length} files, ${initial.lazyJs.length} lazy)`,
);
lines.push(
  `initial CSS    ${kib(initialCss)} gzip of ${kib(BUDGETS.initialCssGzipBytes)}  (${initial.css.length} files)`,
);
if (initialJs > BUDGETS.initialJsGzipBytes) {
  const biggest = [...initial.js].sort((a, b) => gzipSize(b) - gzipSize(a)).slice(0, 3);
  violations.push(
    `Initial JavaScript is ${kib(initialJs)} gzipped, over the ${kib(BUDGETS.initialJsGzipBytes)} budget ` +
      `(+${kib(initialJs - BUDGETS.initialJsGzipBytes)}). Largest: ${biggest
        .map((f) => `${f} ${kib(gzipSize(f))}`)
        .join(', ')}. Lazy-load code the first view does not need.`,
  );
}
if (initialCss > BUDGETS.initialCssGzipBytes) {
  violations.push(
    `Initial CSS is ${kib(initialCss)} gzipped, over the ${kib(BUDGETS.initialCssGzipBytes)} budget.`,
  );
}

// 2. Single chunk size, over every JavaScript file in the build (lazy chunks included).
const chunks = listFiles(distDir).filter((f) => f.endsWith('.js'));
for (const chunk of chunks) {
  const size = rawSize(chunk);
  if (size > BUDGETS.maxChunkBytes) {
    violations.push(
      `Chunk ${chunk} is ${kib(size)}, over the ${kib(BUDGETS.maxChunkBytes)} single-chunk budget. ` +
        'Split it (build.rolldownOptions.output.advancedChunks) or lazy-load it.',
    );
  }
}
const largest = [...chunks].sort((a, b) => rawSize(b) - rawSize(a))[0];
if (largest) {
  lines.push(`largest chunk  ${largest} ${kib(rawSize(largest))} of ${kib(BUDGETS.maxChunkBytes)}`);
}

// 3. Models in the initial-load set, measured from the build, against the manifest budget.
const initialModels = WEB_ASSETS.filter((asset) => !asset.lazy);
const modelBudget = initialLoadBudgetBytes();
let modelBytes = 0;
for (const asset of WEB_ASSETS) {
  const file = resolve(distDir, asset.compressedPath);
  if (!existsSync(file)) {
    violations.push(
      `Model ${asset.compressedPath} (${asset.lazy ? 'lazy' : 'initial load'}) is missing from the build output.`,
    );
  } else if (!asset.lazy) {
    modelBytes += statSync(file).size;
  }
}
lines.push(
  `initial models ${kib(modelBytes)} of ${kib(modelBudget)}  (${initialModels.length} files)`,
);
if (modelBytes > modelBudget) {
  violations.push(
    `Initial-load models total ${kib(modelBytes)}, over the manifest's initialLoadBudgetBytes() of ` +
      `${kib(modelBudget)}. Re-run "npm run assets:compress" or mark rarely-needed models lazy.`,
  );
}

console.log(`perf-budget: ${distDir}`);
for (const line of lines) console.log(`  ${line}`);
if (violations.length > 0) {
  console.error(`\nperf-budget FAILED (${violations.length}):`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log('perf-budget OK');
