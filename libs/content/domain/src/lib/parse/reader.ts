import { brandId, type Branded } from '@qa3elhamor/shared-domain';
import { LOCALES, type LocalizedText } from '../localized-text.js';

/** One problem in a content file. `path` locates it, e.g. `resume.items[2].period.start`. */
export interface ContentValidationError {
  readonly path: string;
  readonly message: string;
}

/**
 * Collects validation errors while untrusted content JSON is read.
 *
 * Readers never throw and never stop at the first problem: an invalid field is recorded with
 * its exact path and a neutral fallback is returned, so parsing continues and one pass reports
 * every problem (a CMS editor can fix them all at once). The fallbacks never escape, because
 * `parseContent` returns a value only when no error was recorded.
 */
export class ContentReader {
  private readonly issues: ContentValidationError[] = [];

  get errors(): readonly ContentValidationError[] {
    return this.issues;
  }

  fail(path: string, message: string): void {
    this.issues.push({ path, message });
  }
}

export type Fields = Readonly<Record<string, unknown>>;

/** Reads one list item at `path`. */
export type ItemReader<T> = (value: unknown, path: string) => T;

const MISSING = 'required field is missing';

/**
 * Returned in place of an object that failed to read. Its already-reported error explains the
 * problem, so fields read from it are not reported again as missing.
 */
const UNREADABLE: Fields = Object.freeze({});

/** Reports a missing required field, unless its parent object was itself unreadable. */
const reportMissing = (r: ContentReader, fields: Fields, path: string): void => {
  if (fields !== UNREADABLE) r.fail(path, MISSING);
};

export const childPath = (path: string, key: string): string =>
  path === '' ? key : `${path}.${key}`;

export const itemPath = (path: string, index: number): string =>
  `${path}[${index}]`;

const describe = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'a list' : typeof value;

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Optional fields treat `null` like absence, since CMS editors write `null` for cleared fields. */
const isAbsent = (value: unknown): value is null | undefined =>
  value === undefined || value === null;

/**
 * Reads `value` as an object whose keys must come from `allowed`. Unknown keys are errors, so
 * a misspelt field is caught instead of silently ignored. Keys starting with `_` are editor
 * notes (e.g. `_sample`) and are skipped.
 */
export function readObject(
  r: ContentReader,
  value: unknown,
  path: string,
  allowed: readonly string[]
): Fields {
  if (!isFields(value)) {
    r.fail(path, `expected an object, got ${describe(value)}`);
    return UNREADABLE;
  }
  for (const key of Object.keys(value)) {
    if (!key.startsWith('_') && !allowed.includes(key)) {
      r.fail(
        childPath(path, key),
        `unknown field; expected one of: ${allowed.join(', ')}`
      );
    }
  }
  return value;
}

export function requiredObject(
  r: ContentReader,
  fields: Fields,
  path: string,
  key: string,
  allowed: readonly string[]
): Fields {
  const at = childPath(path, key);
  if (isAbsent(fields[key])) {
    reportMissing(r, fields, at);
    return UNREADABLE;
  }
  return readObject(r, fields[key], at, allowed);
}

function stringValue(
  r: ContentReader,
  value: unknown,
  path: string
): string | undefined {
  if (typeof value !== 'string') {
    r.fail(path, `expected a string, got ${describe(value)}`);
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    r.fail(path, 'must not be empty');
    return undefined;
  }
  return trimmed;
}

export const stringItem =
  (r: ContentReader): ItemReader<string> =>
  (value, path) =>
    stringValue(r, value, path) ?? '';

export function requiredString(
  r: ContentReader,
  fields: Fields,
  path: string,
  key: string
): string {
  const at = childPath(path, key);
  if (isAbsent(fields[key])) {
    reportMissing(r, fields, at);
    return '';
  }
  return stringValue(r, fields[key], at) ?? '';
}

export function optionalString(
  r: ContentReader,
  fields: Fields,
  path: string,
  key: string
): string | undefined {
  const value = fields[key];
  return isAbsent(value) ? undefined : stringValue(r, value, childPath(path, key));
}

/** Reads a `LocalizedText`, accepting a bare string as shorthand for `{ en }`. */
export const textItem =
  (r: ContentReader): ItemReader<LocalizedText> =>
  (value, path) => {
    if (typeof value === 'string') return { en: stringValue(r, value, path) ?? '' };
    if (!isFields(value)) {
      r.fail(
        path,
        `expected a string or a translations object { ${LOCALES.join(', ')} }, got ${describe(value)}`
      );
      return { en: '' };
    }
    const translations = readObject(r, value, path, LOCALES);
    const en = requiredString(r, translations, path, 'en');
    const ar = optionalString(r, translations, path, 'ar');
    return ar === undefined ? { en } : { en, ar };
  };

export function requiredText(
  r: ContentReader,
  fields: Fields,
  path: string,
  key: string
): LocalizedText {
  const at = childPath(path, key);
  if (isAbsent(fields[key])) {
    reportMissing(r, fields, at);
    return { en: '' };
  }
  return textItem(r)(fields[key], at);
}

export function optionalText(
  r: ContentReader,
  fields: Fields,
  path: string,
  key: string
): LocalizedText | undefined {
  const value = fields[key];
  return isAbsent(value) ? undefined : textItem(r)(value, childPath(path, key));
}

/** Reads one of `allowed`. The first member is the fallback returned alongside an error. */
export function requiredEnum<T extends string>(
  r: ContentReader,
  fields: Fields,
  path: string,
  key: string,
  allowed: readonly [T, ...T[]]
): T {
  const at = childPath(path, key);
  const value = fields[key];
  if (isAbsent(value)) {
    reportMissing(r, fields, at);
    return allowed[0];
  }
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    r.fail(at, `expected one of: ${allowed.join(', ')}; got ${JSON.stringify(value)}`);
    return allowed[0];
  }
  return match;
}

/**
 * Which URLs a field accepts. Restricting schemes keeps `javascript:` and `data:` URLs out of
 * rendered links even if a content file is compromised.
 */
export interface UrlPolicy {
  readonly protocols: readonly string[];
  /** Accept a site-relative path such as `/avatar.webp`. */
  readonly siteRelative?: boolean;
}

export const WEB_URL: UrlPolicy = { protocols: ['https:', 'http:'] };
export const LINK_URL: UrlPolicy = { protocols: ['https:', 'http:', 'mailto:'] };
export const ASSET_URL: UrlPolicy = { protocols: ['https:'], siteRelative: true };

const SITE_RELATIVE = /^\/[^/\\]/;
/** Deliberately loose: one `@`, no whitespace, a dot in the domain. Delivery is not our job. */
const EMAIL_ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function urlValue(
  r: ContentReader,
  value: unknown,
  path: string,
  policy: UrlPolicy
): string | undefined {
  const url = stringValue(r, value, path);
  if (url === undefined) return undefined;
  // `//host` and `/\host` are protocol-relative in browsers, so they would leave the site.
  if (policy.siteRelative && SITE_RELATIVE.test(url)) return url;
  if (!URL.canParse(url)) {
    r.fail(path, `expected an absolute URL, got "${url}"`);
    return undefined;
  }
  const { protocol, pathname } = new URL(url);
  if (!policy.protocols.includes(protocol)) {
    r.fail(
      path,
      `URL scheme "${protocol}" is not allowed; expected ${policy.protocols.join(', ')}`
    );
    return undefined;
  }
  if (protocol === 'mailto:' && !EMAIL_ADDRESS.test(pathname)) {
    r.fail(path, `expected an email address after "mailto:", got "${url}"`);
    return undefined;
  }
  return url;
}

export function requiredUrl(
  r: ContentReader,
  fields: Fields,
  path: string,
  key: string,
  policy: UrlPolicy
): string {
  const at = childPath(path, key);
  if (isAbsent(fields[key])) {
    reportMissing(r, fields, at);
    return '';
  }
  return urlValue(r, fields[key], at, policy) ?? '';
}

export function optionalUrl(
  r: ContentReader,
  fields: Fields,
  path: string,
  key: string,
  policy: UrlPolicy
): string | undefined {
  const value = fields[key];
  return isAbsent(value) ? undefined : urlValue(r, value, childPath(path, key), policy);
}

export function optionalBoolean(
  r: ContentReader,
  fields: Fields,
  path: string,
  key: string
): boolean | undefined {
  const value = fields[key];
  if (isAbsent(value)) return undefined;
  if (typeof value !== 'boolean') {
    r.fail(childPath(path, key), `expected true or false, got ${describe(value)}`);
    return undefined;
  }
  return value;
}

export function optionalInteger(
  r: ContentReader,
  fields: Fields,
  path: string,
  key: string
): number | undefined {
  const value = fields[key];
  if (isAbsent(value)) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    r.fail(childPath(path, key), `expected a whole number, got ${JSON.stringify(value)}`);
    return undefined;
  }
  return value;
}

export interface ListOptions {
  /** A missing list reads as empty instead of failing. */
  readonly optional?: boolean;
  readonly min?: number;
}

export function readList<T>(
  r: ContentReader,
  fields: Fields,
  path: string,
  key: string,
  item: ItemReader<T>,
  options: ListOptions = {}
): readonly T[] {
  const at = childPath(path, key);
  const value = fields[key];
  if (isAbsent(value)) {
    if (!options.optional) reportMissing(r, fields, at);
    return [];
  }
  if (!Array.isArray(value)) {
    r.fail(at, `expected a list, got ${describe(value)}`);
    return [];
  }
  if (options.min !== undefined && value.length < options.min) {
    r.fail(at, `expected at least ${options.min} item(s), got ${value.length}`);
  }
  return value.map((entry: unknown, index) => item(entry, itemPath(at, index)));
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Reads the `id` field: a lowercase slug, stable across edits so it can key UI and analytics. */
export function requiredId<TBrand extends string>(
  r: ContentReader,
  fields: Fields,
  path: string
): Branded<TBrand> {
  const id = requiredString(r, fields, path, 'id');
  if (id !== '' && !SLUG.test(id)) {
    r.fail(childPath(path, 'id'), `expected a lowercase slug like "kelp-shake", got "${id}"`);
  }
  return brandId<TBrand>(id);
}

/** Reports every item whose id repeats an earlier one, at the repeating item's path. */
export function checkUniqueIds(
  r: ContentReader,
  items: readonly { readonly id: string }[],
  listPath: string
): void {
  const firstIndex = new Map<string, number>();
  items.forEach(({ id }, index) => {
    if (id === '') return;
    const first = firstIndex.get(id);
    if (first === undefined) {
      firstIndex.set(id, index);
      return;
    }
    r.fail(
      childPath(itemPath(listPath, index), 'id'),
      `duplicate id "${id}", already used by ${itemPath(listPath, first)}`
    );
  });
}

/** Builds a record with exactly `keys`, reading each value with `read`. */
export function readRecord<K extends string, V>(
  keys: readonly K[],
  read: (key: K) => V
): Readonly<Record<K, V>> {
  const record: Partial<Record<K, V>> = {};
  for (const key of keys) record[key] = read(key);
  // Every key in `keys` was assigned by the loop above, so the partial record is complete.
  return record as Record<K, V>;
}
