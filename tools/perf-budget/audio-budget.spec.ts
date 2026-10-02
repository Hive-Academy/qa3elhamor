import { describe, expect, it } from 'vitest';
import { auditAudio } from './audio-budget';
import { BUDGETS } from './budgets';

const MiB = 1024 * 1024;
const PAGE = '<!doctype html><html><head><script type="module" src="/assets/index.js"></script></head></html>';

describe('auditAudio', () => {
  it('passes small audio that no page loads up front', () => {
    const audit = auditAudio({
      files: [
        { path: 'audio/bed.opus', bytes: 0.9 * MiB },
        { path: 'audio/bed.m4a', bytes: 1.3 * MiB },
        { path: 'assets/index.js', bytes: 100_000 },
      ],
      pages: { 'index.html': PAGE },
      upFront: ['assets/index.js'],
      maxFileBytes: BUDGETS.maxAudioFileBytes,
    });
    expect(audit.violations).toEqual([]);
    expect(audit.lines.join('\n')).toMatch(/audio files\s+2/);
  });

  it('fails an audio file over the per-file budget, naming it', () => {
    const audit = auditAudio({
      files: [{ path: 'audio/bed.m4a', bytes: 2 * MiB }],
      pages: {},
      upFront: [],
      maxFileBytes: BUDGETS.maxAudioFileBytes,
    });
    expect(audit.violations).toHaveLength(1);
    expect(audit.violations[0]).toMatch(/audio\/bed\.m4a.*over the 1638\.4 KiB/);
  });

  it('fails a page that references or preloads audio', () => {
    const files = [{ path: 'audio/bed.opus', bytes: MiB }];
    const referencing = auditAudio({
      files,
      pages: { 'index.html': PAGE.replace('</head>', '<audio src="/audio/bed.opus"></audio></head>') },
      upFront: [],
      maxFileBytes: BUDGETS.maxAudioFileBytes,
    });
    expect(referencing.violations[0]).toMatch(/index\.html loads or preloads audio.*audio\/bed\.opus/);

    const preloading = auditAudio({
      files: [],
      pages: { 'index.html': PAGE.replace('</head>', '<link rel="preload" as="audio" href="/x"></head>') },
      upFront: [],
      maxFileBytes: BUDGETS.maxAudioFileBytes,
    });
    expect(preloading.violations).toHaveLength(1);
  });

  it('fails audio in a page’s up-front load', () => {
    const audit = auditAudio({
      files: [],
      pages: {},
      upFront: ['assets/index.js', 'audio/bed.opus'],
      maxFileBytes: BUDGETS.maxAudioFileBytes,
    });
    expect(audit.violations).toEqual(['Audio is in the initial load: audio/bed.opus.']);
  });

  it('budgets 1.6 MiB per audio file', () => {
    expect(BUDGETS.maxAudioFileBytes).toBe(1.6 * MiB);
  });
});
