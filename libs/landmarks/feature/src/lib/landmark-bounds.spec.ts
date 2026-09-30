import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_HIT_RADIUS,
  localBounds,
  resolveHitShape,
  topOf,
} from './landmark-bounds.js';

const model = () => {
  const root = new Group();
  const body = new Mesh(
    new BoxGeometry(0.1, 0.2, 0.1),
    new MeshBasicMaterial(),
  );
  body.position.set(0, 0.1, 0);
  const chimney = new Mesh(
    new BoxGeometry(0.02, 0.02, 0.02),
    new MeshBasicMaterial(),
  );
  chimney.position.set(0.04, 0.21, 0);
  root.add(body, chimney);
  return root;
};

describe('localBounds', () => {
  it('measures the model in its parent space, whatever the world transform above it', () => {
    const world = new Group();
    world.scale.setScalar(20);
    world.position.set(5, -3, 2);
    const landmark = new Group();
    const root = model();
    landmark.add(root);
    world.add(landmark);

    const box = localBounds(root);
    expect(box.min.toArray().map((v) => +v.toFixed(6) + 0)).toEqual([
      -0.05, 0, -0.05,
    ]);
    expect(box.max.toArray().map((v) => +v.toFixed(6) + 0)).toEqual([
      0.05, 0.22, 0.05,
    ]);
  });

  it('includes the model root’s own transform', () => {
    const root = model();
    root.position.y = 1;
    expect(localBounds(root).min.y).toBeCloseTo(1, 6);
  });
});

describe('resolveHitShape', () => {
  const bounds = localBounds(model());

  it('pads the bounding box', () => {
    const shape = resolveHitShape({ kind: 'bounds', padding: 0.01 }, bounds);
    expect(shape.kind).toBe('box');
    if (shape.kind !== 'box') return;
    expect(shape.size.map((v) => +v.toFixed(6) + 0)).toEqual([
      0.12, 0.24, 0.12,
    ]);
    expect(shape.center.map((v) => +v.toFixed(6) + 0)).toEqual([0, 0.11, 0]);
    expect(topOf(shape)).toBeCloseTo(0.23, 9);
  });

  it('uses explicit shapes, resting them on the origin by default', () => {
    expect(resolveHitShape({ kind: 'sphere', radius: 0.1 }, bounds)).toEqual({
      kind: 'sphere',
      radius: 0.1,
      center: [0, 0.1, 0],
    });
    expect(
      resolveHitShape(
        { kind: 'box', size: [1, 2, 1], center: [0, 0, 0] },
        null,
      ),
    ).toEqual({
      kind: 'box',
      size: [1, 2, 1],
      center: [0, 0, 0],
    });
  });

  it('falls back to a clickable sphere when there is nothing to measure', () => {
    expect(resolveHitShape({ kind: 'bounds' }, null)).toEqual({
      kind: 'sphere',
      radius: FALLBACK_HIT_RADIUS,
      center: [0, FALLBACK_HIT_RADIUS, 0],
    });
  });
});
