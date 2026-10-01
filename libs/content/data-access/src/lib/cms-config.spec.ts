import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CREDIT_KINDS,
  LINK_KINDS,
  LOCALES,
  NARRATION_LANDMARKS,
  NARRATION_LIMITS,
  PROJECT_LINK_KINDS,
  SITE_COPY_KEYS,
  formatContentErrors,
  parseContent,
  type ContentFileKey,
} from '@qa3elhamor/content-domain';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { CONTENT_FILE_PATHS } from './content-files.js';

// Parity between the Decap CMS config (apps/web/public/admin/config.yml) and the content model.
// `parseContent` is the authority: samples are generated from the CMS widgets, then fed to it.
// - a sample with every widget filled in must be accepted (no widget the parser rejects),
// - a sample with only the required widgets must be accepted (required fields are covered),
// - dropping any one field must fail exactly when the widget says `required` (required-ness
//   parity in both directions).
// `yaml` is a root devDependency.

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');

interface Widget {
  readonly name: string;
  readonly widget: string;
  readonly required?: boolean;
  readonly fields?: readonly Widget[];
  readonly field?: Widget;
  readonly options?: readonly string[];
  readonly pattern?: readonly [string, string];
  readonly min?: number;
  readonly max?: number;
  /** Optional in the CMS only because its parent object is optional; the parser needs it once the parent exists. */
  readonly parser_required?: boolean;
}

interface FileConfig {
  readonly name: string;
  readonly file: string;
  readonly format: string;
  readonly fields: readonly Widget[];
}

interface CmsConfig {
  readonly backend: {
    readonly name: string;
    readonly repo: string;
    readonly branch: string;
  };
  readonly media_folder: string;
  readonly public_folder: string;
  readonly collections: readonly { readonly files?: readonly FileConfig[] }[];
}

const config = parse(
  readFileSync(resolve(REPO_ROOT, 'apps/web/public/admin/config.yml'), 'utf8'),
  { merge: true },
) as CmsConfig;

const cmsFiles: readonly FileConfig[] = config.collections.flatMap(
  (c) => c.files ?? [],
);
const fileKeys = Object.keys(CONTENT_FILE_PATHS) as ContentFileKey[];

const isRequired = (w: Widget): boolean => w.required !== false;

// Decap blocks saving an absent optional object whose children are required, so children of an
// optional object are flagged `required: false` plus `parser_required: true` where the parser insists.
const parserRequires = (w: Widget): boolean =>
  isRequired(w) || w.parser_required === true;

const isLocalizedText = (w: Widget): boolean =>
  w.widget === 'object' &&
  JSON.stringify((w.fields ?? []).map((f) => f.name)) ===
    JSON.stringify(LOCALES);

function sampleString(w: Widget, siblings: Record<string, unknown>): string {
  const pattern = w.pattern?.[0];
  let value = 'Sample';
  if (w.name === 'id') value = 'sample-id';
  else if (w.name === 'start') value = '2024-01';
  else if (w.name === 'end') value = '2024-02';
  else if (pattern !== undefined && /mailto/.test(pattern)) {
    value =
      siblings['kind'] === 'email'
        ? 'mailto:you@example.com'
        : 'https://example.com/x';
  } else if (w.name === 'url' || w.name === 'companyUrl')
    value = 'https://example.com/x';
  if (pattern !== undefined)
    expect(new RegExp(pattern).test(value), `${w.name} pattern`).toBe(true);
  return value;
}

/** Builds a value for one widget; `full` also fills the optional widgets. */
function sample(
  w: Widget,
  full: boolean,
  siblings: Record<string, unknown>,
): unknown {
  switch (w.widget) {
    case 'string':
      return w.name === 'ar' ? 'عينة' : sampleString(w, siblings);
    case 'image':
      return '/media/sample.png';
    case 'boolean':
      return true;
    case 'number':
      return 1;
    case 'select':
      return w.options?.[0];
    case 'object':
      return sampleFields(w.fields ?? [], full);
    case 'list': {
      const item =
        w.field === undefined
          ? sampleFields(w.fields ?? [], full)
          : sample(w.field, full, {});
      return Array.from({ length: Math.max(w.min ?? 1, 1) }, () =>
        structuredClone(item),
      );
    }
    default:
      throw new Error(`Unsupported widget "${w.widget}" at ${w.name}`);
  }
}

function sampleFields(
  fields: readonly Widget[],
  full: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // `kind` must be generated before `url`, which depends on it.
  const ordered = [...fields].sort((a) => (a.name === 'kind' ? -1 : 0));
  for (const f of ordered) {
    if (full || isRequired(f)) out[f.name] = sample(f, full, out);
  }
  return out;
}

type Step = string | number;

/** Every field in the tree with its path into the sample (lists descend into item 0). */
function fieldPaths(
  fields: readonly Widget[],
  base: readonly Step[] = [],
): { readonly path: readonly Step[]; readonly widget: Widget }[] {
  return fields.flatMap((f) => {
    const path = [...base, f.name];
    const children =
      f.widget === 'object'
        ? fieldPaths(f.fields ?? [], path)
        : f.widget === 'list' && f.fields !== undefined
          ? fieldPaths(f.fields, [...path, 0])
          : [];
    return [{ path, widget: f }, ...children];
  });
}

function setAt(data: unknown, path: readonly Step[], value: unknown): unknown {
  const copy = structuredClone(data) as Record<Step, unknown>;
  let node: Record<Step, unknown> = copy;
  for (const step of path.slice(0, -1))
    node = node[step] as Record<Step, unknown>;
  node[path[path.length - 1] as Step] = value;
  return copy;
}

function without(data: unknown, path: readonly Step[]): unknown {
  const copy = structuredClone(data) as Record<Step, unknown>;
  let node: Record<Step, unknown> = copy;
  for (const step of path.slice(0, -1))
    node = node[step] as Record<Step, unknown>;
  delete node[path[path.length - 1] as Step];
  return copy;
}

const buildFiles = (full: boolean) =>
  Object.fromEntries(
    fileKeys.map((key) => {
      const file = cmsFiles.find((f) => f.name === key);
      return [
        key,
        file === undefined ? undefined : sampleFields(file.fields, full),
      ];
    }),
  ) as Record<ContentFileKey, unknown>;

const errorsFor = (
  files: Record<ContentFileKey, unknown>,
): string | undefined => {
  const result = parseContent(files);
  return result.ok ? undefined : formatContentErrors(result.error);
};

describe('Decap CMS config (apps/web/public/admin/config.yml)', () => {
  it('targets the repository and media folder the site serves', () => {
    expect(config.backend).toMatchObject({ name: 'github', branch: 'main' });
    expect(config.backend.repo).toMatch(/^[\w.-]+\/[\w.-]+$/);
    expect(config.media_folder).toBe('apps/web/public/media');
    expect(config.public_folder).toBe('/media');
  });

  it('has exactly one JSON file entry per content file, at the path the site imports', () => {
    expect(cmsFiles.map((f) => f.name).sort()).toEqual([...fileKeys].sort());
    for (const key of fileKeys) {
      const file = cmsFiles.find((f) => f.name === key);
      expect(file?.file).toBe(CONTENT_FILE_PATHS[key]);
      expect(file?.format).toBe('json');
      expect(() =>
        readFileSync(resolve(REPO_ROOT, CONTENT_FILE_PATHS[key])),
      ).not.toThrow();
    }
  });

  it('accepts a sample with every widget filled in', () => {
    expect(errorsFor(buildFiles(true))).toBeUndefined();
  });

  it('accepts a sample with only the required widgets', () => {
    expect(errorsFor(buildFiles(false))).toBeUndefined();
  });

  describe.each(fileKeys)('%s: required-ness matches the parser', (key) => {
    const file = cmsFiles.find((f) => f.name === key);
    const full = buildFiles(true);
    const paths = file === undefined ? [] : fieldPaths(file.fields);

    it('covers every field', () => {
      expect(paths.length).toBeGreaterThan(0);
    });

    it.each(paths.map((p) => [p.path.join('.'), p] as const))(
      '%s',
      (_label, field) => {
        const files = { ...full, [key]: without(full[key], field.path) };
        const errors = errorsFor(files);
        if (parserRequires(field.widget)) {
          expect(
            errors,
            'the widget is required (or parser_required), so the parser must reject its absence',
          ).toBeDefined();
        } else {
          expect(
            errors,
            'the widget is optional, so the parser must accept its absence',
          ).toBeUndefined();
        }
      },
    );
  });

  it('keeps every pattern in step with the parser, in both directions', () => {
    const full = buildFiles(true);
    const badUrls = [
      'ftp://example.com',
      'example.com',
      'javascript:alert(1)',
      'https://',
      'mailto:',
    ];
    const bad: Record<string, readonly string[]> = {
      id: ['Bad_Id', 'UPPER', 'two--dashes', '-lead', 'has space'],
      start: ['2024-13', '2024-1', '2024-00', 'March', '24-01'],
      end: ['2024-13', '2024-1', '2024-00', 'March', '24-01'],
      url: badUrls,
      companyUrl: badUrls,
    };
    let checked = 0;
    for (const file of cmsFiles) {
      for (const { path, widget } of fieldPaths(file.fields)) {
        if (widget.pattern === undefined) continue;
        const regex = new RegExp(widget.pattern[0]);
        const values = bad[widget.name];
        expect(values).toBeDefined();
        const extra = /mailto/.test(widget.pattern[0])
          ? []
          : ['mailto:a@example.com'];
        for (const value of [...(values ?? []), ...extra]) {
          expect(regex.test(value)).toBe(false);
          const files = {
            ...full,
            [file.name]: setAt(full[file.name as ContentFileKey], path, value),
          };
          expect(errorsFor(files)).toBeDefined();
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  });

  it('covers list widgets: min is enforced and single-field items must be non-empty strings', () => {
    const full = buildFiles(true);
    let lists = 0;
    let singleField = 0;
    for (const file of cmsFiles) {
      for (const { path, widget } of fieldPaths(file.fields)) {
        if (widget.widget !== 'list') continue;
        lists += 1;
        const at = (value: unknown) => ({
          ...full,
          [file.name]: setAt(full[file.name as ContentFileKey], path, value),
        });
        if (widget.min !== undefined) {
          expect(errorsFor(at([]))).toBeDefined();
        }
        if (widget.max !== undefined) {
          const [item] = sample(widget, true, {}) as unknown[];
          const tooMany = Array.from({ length: widget.max + 1 }, () =>
            structuredClone(item),
          );
          expect(errorsFor(at(tooMany)), path.join('.')).toBeDefined();
          expect(errorsFor(at(tooMany.slice(0, widget.max)))).toBeUndefined();
        }
        if (widget.field !== undefined) {
          singleField += 1;
          expect(widget.field.widget, path.join('.')).toBe('string');
          expect(isRequired(widget.field), path.join('.')).toBe(true);
          expect(errorsFor(at(['']))).toBeDefined();
          expect(errorsFor(at(['Sample', 'Second']))).toBeUndefined();
        }
      }
    }
    expect(lists).toBeGreaterThan(8);
    expect(singleField).toBeGreaterThanOrEqual(4);
  });

  it('uses parser_required only on optional widgets that sit under an optional object', () => {
    const flagged = cmsFiles
      .flatMap((f) => fieldPaths(f.fields))
      .filter((p) => p.widget.parser_required);
    expect(flagged.length).toBeGreaterThan(0);
    expect(
      flagged.every((p) => !isRequired(p.widget) && p.path.length > 2),
    ).toBe(true);
  });

  it('models localized text as { en (required), ar (optional) }', () => {
    const texts: Widget[] = [];
    const visit = (fields: readonly Widget[]): void => {
      for (const f of fields) {
        if (isLocalizedText(f)) texts.push(f);
        else visit([...(f.fields ?? []), ...(f.field ? [f.field] : [])]);
      }
    };
    for (const f of cmsFiles) visit(f.fields);
    expect(texts.length).toBeGreaterThan(20);
    const [en, ar] = texts[0]?.fields ?? [];
    expect(en).toMatchObject({ name: 'en', widget: 'string' });
    expect(isRequired(en as Widget)).toBe(true);
    expect(ar).toMatchObject({ name: 'ar', widget: 'string', required: false });
    expect(ar?.name).toBe(LOCALES[1]);
  });

  it('offers exactly the enum values the domain defines', () => {
    const selects = new Map<string, readonly string[]>();
    const visit = (path: string, fields: readonly Widget[]): void => {
      for (const f of fields) {
        const at = `${path}.${f.name}`;
        if (f.widget === 'select') selects.set(at, f.options ?? []);
        visit(at, f.fields ?? []);
      }
    };
    for (const f of cmsFiles) visit(f.name, f.fields);
    expect(selects.get('site.profile.links.kind')).toEqual([...LINK_KINDS]);
    expect(selects.get('projects.items.links.kind')).toEqual([
      ...PROJECT_LINK_KINDS,
    ]);
    expect(selects.get('credits.items.kind')).toEqual([...CREDIT_KINDS]);
    expect(selects.size).toBe(3);
  });

  it('models every interface copy key', () => {
    const site = cmsFiles.find((f) => f.name === 'site');
    const copy = site?.fields.find((f) => f.name === 'copy');
    expect((copy?.fields ?? []).map((f) => f.name)).toEqual([
      ...SITE_COPY_KEYS,
    ]);
    expect(
      (copy?.fields ?? []).every((f) => isLocalizedText(f) && isRequired(f)),
    ).toBe(true);
  });

  it('models every narration landmark the domain defines, each with the same fields', () => {
    const narration = cmsFiles.find((f) => f.name === 'narration');
    const landmarks = narration?.fields.find((f) => f.name === 'landmarks');
    expect((landmarks?.fields ?? []).map((f) => f.name)).toEqual([
      ...NARRATION_LANDMARKS,
    ]);
    for (const landmark of landmarks?.fields ?? []) {
      expect(isRequired(landmark), landmark.name).toBe(true);
      expect((landmark.fields ?? []).map((f) => f.name)).toEqual([
        'lines',
        'hints',
        'farewell',
      ]);
      const lines = landmark.fields?.find((f) => f.name === 'lines');
      expect(lines).toMatchObject({
        min: NARRATION_LIMITS.minLines,
        max: NARRATION_LIMITS.maxLines,
      });
    }
  });
});
