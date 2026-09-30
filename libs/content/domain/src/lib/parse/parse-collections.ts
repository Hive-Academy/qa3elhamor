import { brandId } from '@qa3elhamor/shared-domain';
import { CREDIT_KINDS, type Credit } from '../credit.js';
import type { Period, ResumeEntry, YearMonth } from '../resume-entry.js';
import type { ServiceItem } from '../service-item.js';
import {
  WEB_URL,
  checkUniqueIds,
  childPath,
  optionalString,
  optionalText,
  optionalUrl,
  readList,
  readObject,
  requiredEnum,
  requiredId,
  requiredObject,
  requiredString,
  requiredText,
  stringItem,
  textItem,
  type ContentReader,
  type Fields,
  type ItemReader,
} from './reader.js';

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function readYearMonth(
  r: ContentReader,
  fields: Fields,
  path: string,
  key: string,
  required: boolean
): YearMonth | undefined {
  const raw = required
    ? requiredString(r, fields, path, key)
    : optionalString(r, fields, path, key);
  if (raw === undefined || raw === '') return undefined;
  if (!YEAR_MONTH.test(raw)) {
    r.fail(childPath(path, key), `expected a month as YYYY-MM, got "${raw}"`);
    return undefined;
  }
  return brandId<'YearMonth'>(raw);
}

const PERIOD_KEYS = ['start', 'end'];

const readPeriod = (r: ContentReader, entry: Fields, path: string): Period =>
  periodFrom(
    r,
    requiredObject(r, entry, path, 'period', PERIOD_KEYS),
    childPath(path, 'period')
  );

export function optionalPeriod(
  r: ContentReader,
  entry: Fields,
  path: string
): Period | undefined {
  const value = entry['period'];
  if (value === undefined || value === null) return undefined;
  const at = childPath(path, 'period');
  return periodFrom(r, readObject(r, value, at, PERIOD_KEYS), at);
}

function periodFrom(r: ContentReader, fields: Fields, at: string): Period {
  const start = readYearMonth(r, fields, at, 'start', true);
  const end = readYearMonth(r, fields, at, 'end', false);
  if (start !== undefined && end !== undefined && end < start) {
    r.fail(childPath(at, 'end'), `ends (${end}) before it starts (${start})`);
  }
  const safeStart = start ?? brandId<'YearMonth'>('');
  return end === undefined ? { start: safeStart } : { start: safeStart, end };
}

const readResumeEntry =
  (r: ContentReader): ItemReader<ResumeEntry> =>
  (value, path) => {
    const fields = readObject(r, value, path, [
      'id',
      'company',
      'companyUrl',
      'role',
      'location',
      'period',
      'summary',
      'highlights',
      'tech',
      'quip',
    ]);
    return {
      id: requiredId<'ResumeEntry'>(r, fields, path),
      company: requiredText(r, fields, path, 'company'),
      companyUrl: optionalUrl(r, fields, path, 'companyUrl', WEB_URL),
      role: requiredText(r, fields, path, 'role'),
      location: optionalText(r, fields, path, 'location'),
      period: readPeriod(r, fields, path),
      summary: optionalText(r, fields, path, 'summary'),
      highlights: readList(r, fields, path, 'highlights', textItem(r), { optional: true }),
      tech: readList(r, fields, path, 'tech', stringItem(r), { optional: true }),
      quip: optionalText(r, fields, path, 'quip'),
    };
  };

const readServiceItem =
  (r: ContentReader): ItemReader<ServiceItem> =>
  (value, path) => {
    const fields = readObject(r, value, path, [
      'id',
      'menuName',
      'title',
      'description',
      'price',
      'tags',
    ]);
    return {
      id: requiredId<'ServiceItem'>(r, fields, path),
      menuName: requiredText(r, fields, path, 'menuName'),
      title: requiredText(r, fields, path, 'title'),
      description: requiredText(r, fields, path, 'description'),
      price: optionalText(r, fields, path, 'price'),
      tags: readList(r, fields, path, 'tags', stringItem(r), { optional: true }),
    };
  };

const readCredit =
  (r: ContentReader): ItemReader<Credit> =>
  (value, path) => {
    const fields = readObject(r, value, path, [
      'id',
      'kind',
      'title',
      'author',
      'url',
      'license',
      'note',
    ]);
    return {
      id: requiredId<'Credit'>(r, fields, path),
      kind: requiredEnum(r, fields, path, 'kind', CREDIT_KINDS),
      title: requiredText(r, fields, path, 'title'),
      author: optionalString(r, fields, path, 'author'),
      url: optionalUrl(r, fields, path, 'url', WEB_URL),
      license: optionalString(r, fields, path, 'license'),
      note: optionalText(r, fields, path, 'note'),
    };
  };

/**
 * Reads a collection file. Every collection file is `{ "items": [...] }` rather than a bare
 * array, because Git-based CMSes (Decap, Tina) store a file-backed list as a field of an object.
 */
export function readCollectionFile<T extends { readonly id: string }>(
  r: ContentReader,
  value: unknown,
  path: string,
  item: ItemReader<T>
): readonly T[] {
  const file = readObject(r, value, path, ['items']);
  const items = readList(r, file, path, 'items', item);
  checkUniqueIds(r, items, childPath(path, 'items'));
  return items;
}

export const readResumeFile = (r: ContentReader, value: unknown, path: string) =>
  readCollectionFile(r, value, path, readResumeEntry(r));

export const readServicesFile = (r: ContentReader, value: unknown, path: string) =>
  readCollectionFile(r, value, path, readServiceItem(r));

export const readCreditsFile = (r: ContentReader, value: unknown, path: string) =>
  readCollectionFile(r, value, path, readCredit(r));
