/**
 * Type boundary for `apps/web/vite.config.mts`.
 *
 * The web app's spec tsconfig (`apps/web/tsconfig.spec.json`) typechecks `vite.config.mts` as
 * part of a composite project rooted at `apps/web`, which may not pull in source files from
 * outside that directory (TS6059/TS6307). Importing `csp-plugin.ts` directly would drag
 * `tools/deploy/*.ts` and a telemetry lib file into that program. TypeScript resolves the
 * `.mjs` import to this declaration and stops here; Vite's config bundler loads the real
 * implementation through `csp-vite-plugin.mjs`. Keep this signature in sync with
 * `contentSecurityPolicy` in `csp-plugin.ts`; delete both files if the web tsconfig ever
 * includes `tools/deploy`.
 */
import type { Plugin } from 'vite';

export declare const contentSecurityPolicy: () => Plugin;

/** `site-base.ts`: `SITE_BASE` as a base path; throws on a shell-mangled file path. */
export declare const siteBase: (raw: string | undefined) => string;
