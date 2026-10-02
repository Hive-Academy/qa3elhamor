// Runtime entry used by apps/web/vite.config.mts. Vite bundles the config, so this re-export
// compiles csp-plugin.ts (and csp.ts) as part of the config bundle. Why a separate .mjs:
// see csp-vite-plugin.d.mts.
export { contentSecurityPolicy } from './csp-plugin.ts';
