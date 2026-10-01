import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findAsset } from '@qa3elhamor/world-domain';
import { describe, expect, it } from 'vitest';
import { ComingSoonOverlay } from './coming-soon-overlay';
import { DIVE_CONFIG } from './dive.config';
import { effectivePresentation } from '@qa3elhamor/landmarks-domain';
import {
  LANDMARKS,
  LANDMARK_OVERLAYS,
  LANDMARK_SCENES,
  buildLandmarkRegistry,
  diveWaypointIds,
} from './landmarks.config';

const placements = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../public/models/placements.json'),
    'utf8',
  ),
) as Record<string, { offset: [number, number, number] | null }>;

describe('landmarks config', () => {
  it('builds a valid registry against the dive and the overlays', () => {
    expect(buildLandmarkRegistry().all.map((d) => d.id)).toEqual([
      'pineapple',
      'tiki',
      'krusty-krab',
      'bureau',
    ]);
  });

  it('stays in sync with the dive: one landmark per stop, in route order', () => {
    expect(LANDMARKS.map((d) => d.waypoint)).toEqual(diveWaypointIds());
    const stops = DIVE_CONFIG.route.flatMap((entry) =>
      entry.kind === 'stop' ? [entry.landmark] : [],
    );
    expect(LANDMARKS.map((d) => d.waypoint)).toEqual(stops);
  });

  it('places every landmark where the asset pipeline put it, with a manifested model', () => {
    for (const definition of LANDMARKS) {
      expect(findAsset(definition.model), definition.model).toBeDefined();
      expect(definition.position).toEqual(placements[definition.model]?.offset);
    }
  });

  it('fails loudly on a landmark with no dive stop or no overlay', () => {
    const stray = {
      ...LANDMARKS[0],
      id: 'jellyfish-fields',
      waypoint: 'landmark-jellyfish',
      overlay: 'jellyfish',
    };
    expect(() => buildLandmarkRegistry([...LANDMARKS, stray])).toThrow(
      /jellyfish-fields\.waypoint: "landmark-jellyfish" is not a dive waypoint[\s\S]*jellyfish-fields\.overlay/,
    );
    expect(Object.keys(LANDMARK_OVERLAYS).sort()).toEqual(
      LANDMARKS.flatMap((d) => (d.overlay ? [d.overlay] : [])).sort(),
    );
  });

  it('binds real overlays to the MVP landmarks; the rest stay placeholders', () => {
    expect(LANDMARK_OVERLAYS['pineapple']).not.toBe(ComingSoonOverlay);
    expect(LANDMARK_OVERLAYS['bureau']).not.toBe(ComingSoonOverlay);
    expect(LANDMARK_OVERLAYS['tiki']).toBe(ComingSoonOverlay);
    expect(LANDMARK_OVERLAYS['krusty-krab']).toBe(ComingSoonOverlay);
  });

  it('presents the pineapple in the world, with its dialog card as the fallback', () => {
    const pineapple = LANDMARKS.find((d) => d.id === 'pineapple');
    expect(pineapple?.scene && LANDMARK_SCENES[pineapple.scene]).toBeDefined();
    expect(pineapple && effectivePresentation(pineapple, true)).toBe('in-world');
    expect(pineapple && effectivePresentation(pineapple, false)).toBe('dialog');
    expect(pineapple?.overlay).toBe('pineapple');
  });

  it('keeps the other landmarks in their dialogs until their in-world versions are signed off', () => {
    for (const definition of LANDMARKS.filter((d) => d.id !== 'pineapple')) {
      expect(effectivePresentation(definition, true), definition.id).toBe(
        'dialog',
      );
    }
  });
});
