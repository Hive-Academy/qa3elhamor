import { describe, expect, it } from 'vitest';
import { LANDMARKS, TOUR } from '../../site.config';
import { buildDivePath } from '../dive.config';
import {
  TOUR_STORAGE_KEY,
  introStyle,
  readTourChoice,
  tourEntry,
  tourParam,
  tourStops,
  writeTourChoice,
  type TourStorage,
} from './tour-entry';

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  const storage: TourStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
  return { storage, data };
};

describe('tourParam', () => {
  it('reads ?tour=on|off and ignores anything else', () => {
    expect(tourParam('?tour=on')).toBe('on');
    expect(tourParam('?lang=en&tour=off')).toBe('off');
    expect(tourParam('?tour=yes')).toBeNull();
    expect(tourParam('')).toBeNull();
  });
});

describe('tourEntry', () => {
  const base = {
    enabled: true,
    param: null,
    automated: false,
    stored: null,
  } as const;

  it('shows the intro on every visit, whatever was chosen before', () => {
    expect(tourEntry(base)).toBe('intro');
    expect(tourEntry({ ...base, stored: 'skipped' })).toBe('intro');
    expect(tourEntry({ ...base, stored: 'done' })).toBe('intro');
  });

  it('stays off for automated browsers unless ?tour=on asks for it', () => {
    expect(tourEntry({ ...base, automated: true })).toBe('off');
    expect(
      tourEntry({ ...base, automated: true, param: 'on', stored: 'done' }),
    ).toBe('intro');
  });

  it('is off with ?tour=off or when the site turns it off', () => {
    expect(tourEntry({ ...base, param: 'off' })).toBe('off');
    expect(tourEntry({ ...base, enabled: false, param: 'on' })).toBe('off');
  });
});

describe('introStyle', () => {
  it('is cinematic on the medium and high tiers, a card otherwise', () => {
    expect(introStyle({ reducedMotion: false, tier: 'high' })).toBe(
      'cinematic',
    );
    expect(introStyle({ reducedMotion: false, tier: 'medium' })).toBe(
      'cinematic',
    );
    expect(introStyle({ reducedMotion: false, tier: 'low' })).toBe('card');
    expect(introStyle({ reducedMotion: true, tier: 'high' })).toBe('card');
  });
});

describe('the remembered choice', () => {
  it('round-trips through storage and ignores junk', () => {
    const { storage, data } = memory({ [TOUR_STORAGE_KEY]: 'maybe' });
    expect(readTourChoice(storage)).toBeNull();
    writeTourChoice(storage, 'skipped');
    expect(data.get(TOUR_STORAGE_KEY)).toBe('skipped');
    expect(readTourChoice(storage)).toBe('skipped');
  });

  it('never downgrades a finished journey to skipped', () => {
    const { storage } = memory({ [TOUR_STORAGE_KEY]: 'done' });
    writeTourChoice(storage, 'skipped');
    expect(readTourChoice(storage)).toBe('done');
  });

  it('survives storage that throws, or none at all', () => {
    const blocked: TourStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readTourChoice(blocked)).toBeNull();
    expect(() => writeTourChoice(blocked, 'done')).not.toThrow();
    expect(readTourChoice(null)).toBeNull();
  });
});

describe('tourStops', () => {
  const path = buildDivePath();
  const progressOf = (waypoint: string) => path.progressOf(waypoint);

  it('is every landmark in dive order by default, ending at the Bureau', () => {
    const stops = tourStops(TOUR, LANDMARKS, progressOf);
    expect(stops.map((stop) => stop.id)).toEqual([
      'pineapple',
      'tiki',
      'krusty-krab',
      'bureau',
    ]);
  });

  it('follows the configured order, and may leave landmarks out', () => {
    const stops = tourStops(
      { enabled: true, stops: ['bureau', 'pineapple'] },
      LANDMARKS,
      progressOf,
    );
    expect(stops.map((stop) => stop.id)).toEqual(['bureau', 'pineapple']);
  });

  it('throws for unknown or repeated ids', () => {
    expect(() =>
      tourStops({ enabled: true, stops: ['atlantis'] }, LANDMARKS, progressOf),
    ).toThrow(/unknown landmark "atlantis"/);
    expect(() =>
      tourStops(
        { enabled: true, stops: ['tiki', 'tiki'] },
        LANDMARKS,
        progressOf,
      ),
    ).toThrow(/listed twice/);
  });
});
