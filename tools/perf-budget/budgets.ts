/**
 * The performance budgets for the built site, in one place. `check.ts` fails CI when a
 * budget is exceeded; docs/perf-budget.md explains how to change one.
 *
 * Model bytes are not listed here: the initial-load model budget is derived from the asset
 * manifest (`initialLoadBudgetBytes()` in @qa3elhamor/world-domain), so it cannot drift from
 * the per-asset budgets the compression pipeline already enforces.
 */
const KiB = 1024;

export const BUDGETS = {
  /**
   * Gzipped size of the JavaScript the first view downloads: the entry chunk plus everything it
   * imports statically (modulepreload links included). Dynamic imports are excluded.
   *
   * Ceiling today = measured size (389 KiB) + ~15 % headroom. The real target is ~250 KiB once the 3D
   * shell is lazy-loaded behind the page-view fallback (see .ptah/specs/perf-budget/notes.md);
   * ratchet this number down when that lands.
   */
  initialJsGzipBytes: 450 * KiB,

  /** Raw (minified, ungzipped) size of any single JavaScript chunk. */
  maxChunkBytes: 850 * KiB,

  /** Gzipped size of the CSS the first view downloads. */
  initialCssGzipBytes: 20 * KiB,
} as const;
