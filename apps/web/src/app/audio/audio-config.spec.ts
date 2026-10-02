import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { credits } from '@qa3elhamor/content-data-access';
import { describe, expect, it } from 'vitest';
import { AUDIO, type AudioConfig } from '../../site.config';
import { musicCredit, musicSources, soundConfigured } from './audio-config';

const PUBLIC_DIR = resolve(__dirname, '../../../public');

describe('audio config', () => {
  it('resolves the music under the deploy base', () => {
    const config: AudioConfig = {
      music: {
        sources: [
          { url: 'audio/bed.opus', type: 'audio/ogg; codecs=opus' },
          { url: '/audio/bed.m4a', type: 'audio/mp4' },
        ],
        creditId: 'x',
      },
      ambience: true,
    };
    expect(musicSources(config, '/')).toEqual([
      { url: '/audio/bed.opus', type: 'audio/ogg; codecs=opus' },
      { url: '/audio/bed.m4a', type: 'audio/mp4' },
    ]);
    expect(musicSources(config, '/repo')?.map((s) => s.url)).toEqual([
      '/repo/audio/bed.opus',
      '/repo/audio/bed.m4a',
    ]);
    expect(musicSources({ music: null, ambience: true }, '/')).toBeNull();
  });

  it('offers Opus first and an AAC fallback, each a file in public/', () => {
    const sources = AUDIO.music?.sources ?? [];
    expect(sources[0]?.type).toMatch(/opus/);
    expect(sources.some((source) => source.type === 'audio/mp4')).toBe(true);
    for (const source of sources) {
      expect(existsSync(resolve(PUBLIC_DIR, source.url)), source.url).toBe(true);
    }
  });

  it('credits the music in content: a music credit recording its licence', () => {
    if (!AUDIO.music) return;
    const credit = musicCredit(AUDIO, credits);
    expect(credit, `content/credits.json has no "${AUDIO.music.creditId}"`).not.toBeNull();
    expect(credit?.kind).toBe('music');
    expect(credit?.license).toBeTruthy();
  });

  it('has nothing to play only when both music and ambience are off', () => {
    expect(soundConfigured({ music: null, ambience: false })).toBe(false);
    expect(soundConfigured({ music: null, ambience: true })).toBe(true);
    expect(soundConfigured(AUDIO)).toBe(true);
  });
});
