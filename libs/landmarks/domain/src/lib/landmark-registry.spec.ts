import { describe, expect, it } from 'vitest';
import {
  resolveText,
  textDirection,
  type LandmarkDefinition,
} from './landmark-definition.js';
import {
  createLandmarkRegistry,
  formatLandmarkIssues,
  validateLandmark,
} from './landmark-registry.js';

const pineapple: LandmarkDefinition = {
  id: 'pineapple',
  model: 'landmark-pineapple',
  position: [0.79, 0.07, -0.1],
  waypoint: 'landmark-pineapple',
  overlay: 'pineapple',
  label: { en: 'The Pineapple', ar: 'بيت الأناناس' },
};

const fieldsOf = (result: ReturnType<typeof validateLandmark>) =>
  result.ok ? [] : result.error.map((i) => i.field);

describe('validateLandmark', () => {
  it('accepts a minimal definition', () => {
    expect(validateLandmark(pineapple)).toEqual({ ok: true, value: pineapple });
  });

  it('rejects non-slug ids, missing references and blank labels', () => {
    const result = validateLandmark({
      ...pineapple,
      id: 'Pine Apple',
      model: '',
      waypoint: ' ',
      overlay: '',
      label: { en: '' },
    });
    expect(fieldsOf(result)).toEqual([
      'id',
      'model',
      'waypoint',
      'overlay',
      'label',
    ]);
  });

  it('rejects non-finite vectors and non-positive scale', () => {
    const result = validateLandmark({
      ...pineapple,
      position: [0, Number.NaN, 0],
      rotation: [0, 0] as unknown as [number, number, number],
      scale: [1, 0, 1],
    });
    expect(fieldsOf(result)).toEqual(['position', 'rotation', 'scale']);
  });

  it('checks every hit target shape', () => {
    expect(
      validateLandmark({
        ...pineapple,
        hitTarget: { kind: 'bounds', padding: 0.01 },
      }).ok,
    ).toBe(true);
    expect(
      validateLandmark({
        ...pineapple,
        hitTarget: { kind: 'sphere', radius: 0.05 },
      }).ok,
    ).toBe(true);
    expect(
      fieldsOf(
        validateLandmark({
          ...pineapple,
          hitTarget: { kind: 'bounds', padding: -1 },
        }),
      ),
    ).toEqual(['hitTarget']);
    expect(
      fieldsOf(
        validateLandmark({
          ...pineapple,
          hitTarget: { kind: 'box', size: [1, -1, 1] },
        }),
      ),
    ).toEqual(['hitTarget']);
    expect(
      fieldsOf(
        validateLandmark({
          ...pineapple,
          hitTarget: { kind: 'sphere', radius: 0, center: [0, 0, 0] },
        }),
      ),
    ).toEqual(['hitTarget']);
  });
});

describe('presentation', () => {
  it('needs an overlay for a dialog and a scene for an in-world landmark', () => {
    const bare: LandmarkDefinition = { ...pineapple, overlay: undefined };
    expect(fieldsOf(validateLandmark(bare))).toEqual(['overlay']);
    expect(
      fieldsOf(validateLandmark({ ...bare, presentation: 'in-world' })),
    ).toEqual(['scene']);
    expect(
      validateLandmark({ ...bare, presentation: 'in-world', scene: 'board' })
        .ok,
    ).toBe(true);
    expect(validateLandmark({ ...bare, presentation: 'none' }).ok).toBe(true);
    expect(
      fieldsOf(
        validateLandmark({
          ...pineapple,
          presentation: 'popup' as unknown as 'none',
        }),
      ),
    ).toEqual(['presentation']);
  });

  it('checks scene keys against the registered scene components', () => {
    const board: LandmarkDefinition = {
      ...pineapple,
      id: 'wall',
      presentation: 'in-world',
      scene: 'board',
    };
    const result = createLandmarkRegistry([board], { sceneKeys: ['menu'] });
    expect(result.ok ? [] : result.error.map((i) => i.message)).toEqual([
      'no scene component is registered under "board"',
    ]);
  });
});

describe('createLandmarkRegistry', () => {
  const tiki: LandmarkDefinition = {
    ...pineapple,
    id: 'tiki',
    waypoint: 'landmark-tiki',
    overlay: 'tiki',
    label: 'Tiki',
  };

  it('keeps declaration order and looks landmarks up by id', () => {
    const result = createLandmarkRegistry([pineapple, tiki]);
    if (!result.ok) throw new Error(formatLandmarkIssues(result.error));
    expect(result.value.all.map((d) => d.id)).toEqual(['pineapple', 'tiki']);
    expect(result.value.get('tiki')).toBe(tiki);
    expect(result.value.has('bureau')).toBe(false);
  });

  it('reports duplicate ids, unknown waypoints and unregistered overlays together', () => {
    const result = createLandmarkRegistry([pineapple, tiki, { ...tiki }], {
      waypointIds: ['landmark-pineapple'],
      overlayKeys: ['pineapple'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(formatLandmarkIssues(result.error)).toBe(
      [
        '- tiki.waypoint: "landmark-tiki" is not a dive waypoint',
        '- tiki.overlay: no overlay is registered under "tiki"',
        '- tiki.id: duplicates landmark #1',
        '- tiki.waypoint: "landmark-tiki" is not a dive waypoint',
        '- tiki.overlay: no overlay is registered under "tiki"',
      ].join('\n'),
    );
  });

  it('names a definition without a usable id by its index', () => {
    const result = createLandmarkRegistry([{ ...pineapple, id: '' }]);
    expect(result.ok ? [] : result.error.map((i) => i.landmark)).toEqual([
      '#0',
    ]);
  });
});

describe('localised text', () => {
  it('prefers the locale and falls back to English', () => {
    expect(resolveText('Tiki', 'ar')).toBe('Tiki');
    expect(resolveText({ en: 'Pineapple', ar: 'أناناس' }, 'ar')).toBe('أناناس');
    expect(resolveText({ en: 'Pineapple' }, 'ar')).toBe('Pineapple');
    expect(resolveText({ en: 'Pineapple', ar: 'أناناس' })).toBe('Pineapple');
    expect(textDirection('ar')).toBe('rtl');
    expect(textDirection('en')).toBe('ltr');
  });
});
