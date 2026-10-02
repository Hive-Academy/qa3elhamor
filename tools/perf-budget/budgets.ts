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
   * The 3D dive is a lazy chunk (`apps/web/src/app/dive-shell-loader.tsx`), so this is React,
   * the page view and the dive's chrome. Ceiling = measured size (95.7 KiB) + ~10 % headroom.
   * Before the split it was 415 KiB against a 450 KiB ceiling (.ptah/specs/lazy-shell/notes.md).
   */
  initialJsGzipBytes: 105 * KiB,

  /** Raw (minified, ungzipped) size of any single JavaScript chunk. */
  maxChunkBytes: 850 * KiB,

  /** Gzipped size of the CSS the first view downloads. */
  initialCssGzipBytes: 20 * KiB,
} as const;

/**
 * Chunks no page may load up front: the 3D vendor groups (`codeSplitting` in
 * apps/web/vite.config.mts). Only the dive's dynamic import reaches them, so the page view (no
 * WebGL, `?view=page`) and moderation.html never download three, R3F or drei.
 */
export const FIRST_VIEW_FORBIDDEN_CHUNK =
  /(?:^|\/)(?:vendor-(?:three|r3f|drei)|dive-shell)-[^/]*\.js$/;
