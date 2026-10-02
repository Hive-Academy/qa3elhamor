import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findAsset } from '@qa3elhamor/world-domain';
import { describe, expect, it } from 'vitest';
import { ComingSoonOverlay } from './coming-soon-overlay';
import { effectivePresentation } from '@qa3elhamor/landmarks-domain';
import { DIVE_CONFIG, LANDMARKS } from '../site.config';
import {
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
    expect(buildLandmarkRegistry().all.map((d) => d.id)).toEqual(
      LANDMARKS.map((d) => d.id),
    );
  });

  it('stays in sync with the dive: one landmark per stop, in route order', () => {
    expect(LANDMARKS.map((d) => d.waypoint)).toEqual(diveWaypointIds());
    const stops = DIVE_CONFIG.route.flatMap((entry) =>
      entry.kind === 'stop' ? [entry.landmark] : [],
    );
    expect(LANDMARKS.map((d) => d.waypoint)).toEqual(stops);
  });

  it('places every landmark cut from the map where the pipeline cut it, with a manifested model', () => {
    for (const definition of LANDMARKS) {
      expect(findAsset(definition.model), definition.model).toBeDefined();
      // A whole model of a fork's own (`offset: null`) stands wherever the config puts it.
      const cut = placements[definition.model]?.offset;
      if (cut) expect(definition.position, definition.id).toEqual(cut);
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
    for (const definition of LANDMARKS)
      if (definition.overlay) expect(LANDMARK_OVERLAYS[definition.overlay], definition.id).toBeDefined();
    // Only the scenes a configured landmark shows are built.
    expect(Object.keys(LANDMARK_SCENES).sort()).toEqual(
      LANDMARKS.flatMap((d) => (d.scene ? [d.scene] : [])).sort(),
    );
  });

  it('binds real overlays to the finished landmarks', () => {
    for (const key of ['pineapple', 'bureau', 'tiki', 'krusty-krab'])
      expect(LANDMARK_OVERLAYS[key], key).not.toBe(ComingSoonOverlay);
  });

  it('presents the in-world landmarks in the world, with their dialogs as the fallback', () => {
    for (const definition of LANDMARKS) {
      if (definition.presentation !== 'in-world') continue;
      expect(definition.scene && LANDMARK_SCENES[definition.scene], definition.id).toBeDefined();
      expect(effectivePresentation(definition, true), definition.id).toBe('in-world');
      expect(effectivePresentation(definition, false), definition.id).toBe('dialog');
    }
  });
});
