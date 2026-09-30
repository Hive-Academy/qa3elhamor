import { describe, expect, it } from 'vitest';
import type { ContentFiles } from '../content.js';
import { localize } from '../localized-text.js';
import { sortProjects } from '../project-item.js';
import { SITE_COPY_KEYS } from '../site-profile.js';
import { formatContentErrors, parseContent } from './parse-content.js';

type Json = Record<string, unknown>;

/** A fresh, valid set of content files. Each test mutates its own copy. */
const validFiles = () => ({
  site: {
    _sample: 'editor notes are ignored',
    profile: {
      name: { en: 'Test Person', ar: 'شخص تجريبي' },
      headline: 'Developer',
      bio: ['First paragraph.', { en: 'Second paragraph.' }],
      location: 'Qaa El-Hamour',
      avatar: { src: '/avatar.webp', alt: 'A portrait' },
      skills: [{ id: 'frontend', label: 'Frontend', skills: ['TypeScript'] }],
      links: [
        { kind: 'github', label: 'GitHub', url: 'https://github.com/example' },
        { kind: 'email', label: 'Email', url: 'mailto:someone@example.com' },
      ],
    } as Json,
    copy: Object.fromEntries(SITE_COPY_KEYS.map((key) => [key, `copy ${key}`])) as Json,
  },
  resume: {
    items: [
      {
        id: 'reef-co',
        company: 'Reef Co',
        role: 'Engineer',
        period: { start: '2020-01', end: '2022-06' } as Json,
        highlights: ['Did a thing'],
        tech: ['TypeScript', 'Node.js'],
        quip: 'Adequate.',
      },
      { id: 'kelp-co', company: 'Kelp Co', role: 'Lead', period: { start: '2022-07' } },
    ] as Json[],
  },
  services: {
    items: [
      {
        id: 'kelp-shake',
        menuName: 'Kelp Shake',
        title: 'Performance audit',
        description: 'Makes it fast.',
      },
      {
        id: 'secret-formula',
        menuName: 'Secret Formula',
        title: '3D web',
        description: 'Makes it wet.',
      },
    ] as Json[],
  },
  projects: {
    items: [
      {
        id: 'tide-tables',
        title: 'Tide Tables',
        summary: { en: 'A tide app.', ar: 'تطبيق للمد والجزر.' },
        role: 'Solo developer',
        period: { start: '2021-04', end: '2021-09' },
        tech: ['Svelte'],
        links: [
          { kind: 'repo', url: 'https://github.com/example/tide-tables' },
          { kind: 'live', label: 'Try it', url: 'https://tide.example.com' },
        ],
        media: { src: '/projects/tide.webp', alt: 'Tide chart screenshot' },
      },
      { id: 'reef-kit', title: 'Reef Kit', summary: 'A UI kit.', featured: true, order: 1 },
    ] as Json[],
  },
  credits: {
    items: [{ id: 'three', kind: 'library', title: 'three.js', license: 'MIT' }] as Json[],
  },
});

const errorsOf = (files: ContentFiles) => {
  const result = parseContent(files);
  if (result.ok) throw new Error('expected content to be invalid');
  return result.error;
};

describe('parseContent', () => {
  it('parses valid content and normalizes bare strings to localized text', () => {
    const result = parseContent(validFiles());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { profile, copy, resume, services, credits } = result.value;
    expect(profile.name).toEqual({ en: 'Test Person', ar: 'شخص تجريبي' });
    expect(profile.headline).toEqual({ en: 'Developer' });
    expect(profile.bio).toEqual([{ en: 'First paragraph.' }, { en: 'Second paragraph.' }]);
    expect(copy.closeLabel).toEqual({ en: 'copy closeLabel' });
    expect(resume[1]?.period).toEqual({ start: '2022-07' });
    expect(resume[1]?.highlights).toEqual([]);
    expect(services.map((s) => s.id)).toEqual(['kelp-shake', 'secret-formula']);
    expect(credits[0]?.kind).toBe('library');
  });

  it('parses projects with defaults, and sorts explicitly ordered ones first', () => {
    const result = parseContent(validFiles());
    if (!result.ok) throw new Error(formatContentErrors(result.error));
    const [tide, reef] = result.value.projects;
    expect(tide?.featured).toBe(false);
    expect(tide?.period).toEqual({ start: '2021-04', end: '2021-09' });
    expect(tide?.links[1]).toEqual({ kind: 'live', label: { en: 'Try it' }, url: 'https://tide.example.com' });
    expect(reef).toMatchObject({ featured: true, order: 1, links: [], highlights: [] });
    expect(reef?.period).toBeUndefined();
    expect(sortProjects(result.value.projects).map((p) => p.id)).toEqual([
      'reef-kit',
      'tide-tables',
    ]);
  });

  it('accepts null for optional fields, as CMS editors write for cleared values', () => {
    const files = validFiles();
    files.site.profile['location'] = null;
    files.site.profile['avatar'] = null;
    expect(parseContent(files).ok).toBe(true);
  });

  const cases: ReadonlyArray<{
    readonly name: string;
    readonly mutate: (files: ReturnType<typeof validFiles>) => void;
    readonly path: string;
    readonly message: RegExp;
  }> = [
    {
      name: 'a file that is not an object',
      mutate: (f) => Object.assign(f, { credits: [] }),
      path: 'credits',
      message: /expected an object, got a list/,
    },
    {
      name: 'a missing required field',
      mutate: (f) => delete f.site.profile['name'],
      path: 'site.profile.name',
      message: /required field is missing/,
    },
    {
      name: 'a wrong type inside a list',
      mutate: (f) => (f.resume.items[0] = { ...f.resume.items[0], tech: ['TS', 42] }),
      path: 'resume.items[0].tech[1]',
      message: /expected a string, got number/,
    },
    {
      name: 'an empty string',
      mutate: (f) => (f.site.profile['headline'] = '   '),
      path: 'site.profile.headline',
      message: /must not be empty/,
    },
    {
      name: 'a misspelt field',
      mutate: (f) => (f.services.items[1] = { ...f.services.items[1], menuNmae: 'x' }),
      path: 'services.items[1].menuNmae',
      message: /unknown field/,
    },
    {
      name: 'an unsupported locale',
      mutate: (f) => (f.site.profile['headline'] = { en: 'Dev', fr: 'Dév' }),
      path: 'site.profile.headline.fr',
      message: /expected one of: en, ar/,
    },
    {
      name: 'a translation without English',
      mutate: (f) => (f.site.profile['headline'] = { ar: 'مطوّر' }),
      path: 'site.profile.headline.en',
      message: /required field is missing/,
    },
    {
      name: 'an unknown enum value',
      mutate: (f) => (f.credits.items[0] = { ...f.credits.items[0], kind: 'vibes' }),
      path: 'credits.items[0].kind',
      message: /expected one of: design, inspiration/,
    },
    {
      name: 'a dangerous URL scheme',
      mutate: (f) =>
        (f.site.profile['links'] = [
          { kind: 'website', label: 'Site', url: 'javascript:alert(1)' },
        ]),
      path: 'site.profile.links[0].url',
      message: /scheme "javascript:" is not allowed/,
    },
    {
      name: 'an email link that is not mailto',
      mutate: (f) =>
        (f.site.profile['links'] = [
          { kind: 'email', label: 'Mail', url: 'https://example.com' },
        ]),
      path: 'site.profile.links[0].url',
      message: /must be a "mailto:" URL/,
    },
    {
      name: 'a relative URL where an absolute one is required',
      mutate: (f) => (f.resume.items[0] = { ...f.resume.items[0], companyUrl: 'reef.co' }),
      path: 'resume.items[0].companyUrl',
      message: /expected an absolute URL/,
    },
    {
      name: 'an id that is not a slug',
      mutate: (f) => (f.services.items[0] = { ...f.services.items[0], id: 'Kelp Shake' }),
      path: 'services.items[0].id',
      message: /lowercase slug/,
    },
    {
      name: 'a duplicate id',
      mutate: (f) => (f.services.items[1] = { ...f.services.items[1], id: 'kelp-shake' }),
      path: 'services.items[1].id',
      message: /duplicate id "kelp-shake", already used by services.items\[0\]/,
    },
    {
      name: 'a malformed month',
      mutate: (f) => (f.resume.items[0] = { ...f.resume.items[0], period: { start: '2024-13' } }),
      path: 'resume.items[0].period.start',
      message: /expected a month as YYYY-MM/,
    },
    {
      name: 'a period that ends before it starts',
      mutate: (f) =>
        (f.resume.items[0] = {
          ...f.resume.items[0],
          period: { start: '2022-01', end: '2021-12' },
        }),
      path: 'resume.items[0].period.end',
      message: /ends \(2021-12\) before it starts \(2022-01\)/,
    },
    {
      name: 'a missing site copy key',
      mutate: (f) => delete f.site.copy['closeLabel'],
      path: 'site.copy.closeLabel',
      message: /required field is missing/,
    },
    {
      name: 'an empty mailto address',
      mutate: (f) =>
        (f.site.profile['links'] = [{ kind: 'email', label: 'Mail', url: 'mailto:' }]),
      path: 'site.profile.links[0].url',
      message: /expected an email address after "mailto:"/,
    },
    {
      name: 'a protocol-relative avatar with a backslash',
      mutate: (f) => (f.site.profile['avatar'] = { src: '/\\evil.example/a.png', alt: 'x' }),
      path: 'site.profile.avatar.src',
      message: /expected an absolute URL/,
    },
    {
      name: 'a protocol-relative project image',
      mutate: (f) =>
        (f.projects.items[1] = { ...f.projects.items[1], media: { src: '//evil.example/a.png', alt: 'x' } }),
      path: 'projects.items[1].media.src',
      message: /scheme "http:" is not allowed|expected an absolute URL/,
    },
    {
      name: 'an unknown project link kind',
      mutate: (f) =>
        (f.projects.items[0] = {
          ...f.projects.items[0],
          links: [{ kind: 'demo', url: 'https://example.com' }],
        }),
      path: 'projects.items[0].links[0].kind',
      message: /expected one of: repo, live, case-study/,
    },
    {
      name: 'a mailto project link',
      mutate: (f) =>
        (f.projects.items[0] = {
          ...f.projects.items[0],
          links: [{ kind: 'live', url: 'mailto:someone@example.com' }],
        }),
      path: 'projects.items[0].links[0].url',
      message: /scheme "mailto:" is not allowed/,
    },
    {
      name: 'a non-boolean featured flag',
      mutate: (f) => (f.projects.items[1] = { ...f.projects.items[1], featured: 'yes' }),
      path: 'projects.items[1].featured',
      message: /expected true or false, got string/,
    },
    {
      name: 'a fractional order',
      mutate: (f) => (f.projects.items[1] = { ...f.projects.items[1], order: 1.5 }),
      path: 'projects.items[1].order',
      message: /expected a whole number, got 1.5/,
    },
    {
      name: 'a project period that ends before it starts',
      mutate: (f) =>
        (f.projects.items[0] = {
          ...f.projects.items[0],
          period: { start: '2021-09', end: '2021-04' },
        }),
      path: 'projects.items[0].period.end',
      message: /before it starts/,
    },
    {
      name: 'an empty bio',
      mutate: (f) => (f.site.profile['bio'] = []),
      path: 'site.profile.bio',
      message: /expected at least 1 item/,
    },
  ];

  it.each(cases)('reports $name at $path', ({ mutate, path, message }) => {
    const files = validFiles();
    mutate(files);
    expect(errorsOf(files)).toEqual([{ path, message: expect.stringMatching(message) }]);
  });

  it('reports every problem across files in one pass', () => {
    const files = validFiles();
    delete files.site.profile['name'];
    files.services.items[0] = { ...files.services.items[0], title: 7 };
    const errors = errorsOf(files);
    expect(errors.map((e) => e.path)).toEqual([
      'site.profile.name',
      'services.items[0].title',
    ]);
    expect(formatContentErrors(errors)).toBe(
      'site.profile.name: required field is missing\n' +
        'services.items[0].title: expected a string or a translations object { en, ar }, got number'
    );
  });
});

describe('localize', () => {
  it('prefers the requested locale and falls back to English', () => {
    expect(localize({ en: 'Hello', ar: 'مرحبا' }, 'ar')).toBe('مرحبا');
    expect(localize({ en: 'Hello' }, 'ar')).toBe('Hello');
  });
});
