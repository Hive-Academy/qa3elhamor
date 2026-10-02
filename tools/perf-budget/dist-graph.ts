/**
 * Reads a Vite build output (`apps/web/dist`) and works out which files a page loads up front.
 * Shared by the perf-budget gate and the Pages artefact preparation, so both agree on what
 * "reachable from index.html" means.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';

const ATTRIBUTE = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
// Static `import ... from "x"`, `import "x"`, `export ... from "x"`. Dynamic `import("x")` has a
// parenthesis, so it never matches. Minified output (`import{a}from"./x.js"`) is covered.
const STATIC_IMPORT = /\b(?:import|export)\s*(?:[\w*${},\s]+?\s*from\s*)?["']([^"']+)["']/g;
// Dynamic `import("./x.js")`: reachable, but not needed up front. Vite writes the specifier as a
// template literal (import(`./x.js`)), so a backtick counts as a quote here.
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["'`]([^"'`]+\.js)["'`]\s*\)/g;

/** Every file under `dir`, as POSIX paths relative to it. */
export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Maps a URL found in a page or chunk to a dist-relative path, or null when it is external or
 * outside dist. `base` is the deploy base the build used (`/` or `/repo/`).
 */
function toDistPath(url: string, fromFile: string, base: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url)) return null;
  const clean = url.split(/[?#]/)[0];
  if (clean.startsWith('/')) {
    if (!clean.startsWith(base)) return null;
    return clean.slice(base.length);
  }
  return posix.normalize(posix.join(posix.dirname(fromFile), clean));
}

export interface PageLoad {
  /** JavaScript loaded up front: entry scripts, preloads and their static imports. */
  readonly js: readonly string[];
  readonly css: readonly string[];
  /** Every file the page needs up front, including images and icons. */
  readonly all: readonly string[];
  /** JavaScript reachable only through dynamic `import()`, transitively. */
  readonly lazyJs: readonly string[];
}

/**
 * The files `page` (e.g. `index.html`) loads before first paint, found by parsing its
 * `src`/`href` attributes and following static imports through the chunk graph.
 */
export function pageLoad(distDir: string, page: string, base = '/'): PageLoad {
  const js = new Set<string>();
  const css = new Set<string>();
  const all = new Set<string>();
  const lazy = new Set<string>();

  const sourceOf = (file: string): string => readFileSync(resolve(distDir, file), 'utf8');
  const targets = (file: string, pattern: RegExp): string[] =>
    [...sourceOf(file).matchAll(pattern)]
      .map((match) => toDistPath(match[1], file, base))
      .filter((target): target is string => target !== null && target.endsWith('.js'));

  // Static closure: what the page needs before it can run.
  const visitStatic = (file: string): void => {
    if (js.has(file)) return;
    js.add(file);
    all.add(file);
    for (const target of targets(file, STATIC_IMPORT)) visitStatic(target);
  };
  // Lazy closure: reachable only through `import()`, including those chunks' own imports.
  const visitLazy = (file: string): void => {
    if (js.has(file) || lazy.has(file)) return;
    lazy.add(file);
    for (const target of targets(file, STATIC_IMPORT)) visitLazy(target);
    for (const target of targets(file, DYNAMIC_IMPORT)) visitLazy(target);
  };

  const html = readFileSync(resolve(distDir, page), 'utf8');
  for (const match of html.matchAll(ATTRIBUTE)) {
    const target = toDistPath(match[1], page, base);
    if (!target || target.endsWith('.html')) continue;
    if (target.endsWith('.js')) visitStatic(target);
    else {
      all.add(target);
      if (target.endsWith('.css')) css.add(target);
    }
  }
  for (const file of js) for (const target of targets(file, DYNAMIC_IMPORT)) visitLazy(target);
  return {
    js: [...js].sort(),
    css: [...css].sort(),
    all: [...all].sort(),
    lazyJs: [...lazy].sort(),
  };
}
