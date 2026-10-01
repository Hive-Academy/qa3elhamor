import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { createKelpGeometry, createKelpMaterial, planKelpBed, probeSeabed, type KelpPlanOptions } from './kelp-bed.js';

const OPTIONS: KelpPlanOptions = {
  count: 60,
  seed: 5,
  area: { min: [-30, -30], max: [30, 30] },
  clearings: [
    { center: [0, 2, 0], radius: 8 },
    { center: [15, 2, 15], radius: 5 },
  ],
  stalksPerPatch: 6,
  patchRadius: 1.5,
  minHeight: 2,
  maxHeight: 5,
};

describe('planKelpBed', () => {
  it('is deterministic and fills the requested count when there is room', () => {
    const a = planKelpBed(OPTIONS);
    expect(a).toEqual(planKelpBed(OPTIONS));
    expect(a.stalks).toHaveLength(60);
    expect(a.patches).toHaveLength(10);
  });

  it('keeps every stalk inside the area (with its clump) and out of every clearing', () => {
    const { stalks, patches } = planKelpBed(OPTIONS);
    for (const p of patches) {
      expect(p.x).toBeGreaterThanOrEqual(-30);
      expect(p.x).toBeLessThanOrEqual(30);
      for (const c of OPTIONS.clearings) {
        expect(Math.hypot(p.x - c.center[0], p.z - c.center[2])).toBeGreaterThanOrEqual(c.radius + OPTIONS.patchRadius);
      }
    }
    for (const s of stalks) {
      for (const c of OPTIONS.clearings) {
        expect(Math.hypot(s.x - c.center[0], s.z - c.center[2])).toBeGreaterThanOrEqual(c.radius);
      }
      expect(s.height).toBeGreaterThanOrEqual(2);
      expect(s.height).toBeLessThanOrEqual(5);
    }
  });

  it('drops clumps that find no legal spot instead of breaking a clearing', () => {
    const crowded = planKelpBed({ ...OPTIONS, clearings: [{ center: [0, 0, 0], radius: 100 }] });
    expect(crowded.stalks).toHaveLength(0);
    expect(planKelpBed({ ...OPTIONS, count: 0 }).stalks).toHaveLength(0);
  });
});

describe('probeSeabed', () => {
  const ground = new Group();
  const floor = new Mesh(new PlaneGeometry(100, 100).rotateX(-Math.PI / 2), new MeshBasicMaterial());
  floor.position.y = 1.5;
  // A rock with steep walls at x = 10 (its flat top is still rootable).
  const rock = new Mesh(new BoxGeometry(4, 6, 4), new MeshBasicMaterial());
  rock.position.set(10, 3, 0);
  ground.add(floor, rock);
  ground.scale.setScalar(1);
  ground.updateWorldMatrix(true, true);

  it('finds the ground under each patch and rejects misses', () => {
    const heights = probeSeabed(ground, [{ x: -5, z: 3 }, { x: 10, z: 0 }, { x: 500, z: 0 }], 40);
    expect(heights[0]).toBeCloseTo(1.5);
    expect(heights[1]).toBeCloseTo(6);
    expect(heights[2]).toBeNull();
  });

  it('respects the world transform of the ground (WorldSpace scale)', () => {
    const scaled = new Group();
    const tiny = new Mesh(new PlaneGeometry(10, 10).rotateX(-Math.PI / 2), new MeshBasicMaterial());
    tiny.position.y = 0.07;
    scaled.add(tiny);
    scaled.scale.setScalar(20);
    scaled.updateWorldMatrix(true, true);
    expect(probeSeabed(scaled, [{ x: 30, z: -30 }], 40)[0]).toBeCloseTo(1.4);
  });
});

describe('kelp mesh', () => {
  it('builds a unit-tall stalk from root to tip', () => {
    const geometry = createKelpGeometry('#264a20', '#a3b84c');
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.y).toBeCloseTo(0);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(1);
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
  });

  it('patches the vertex shader with the sway, keeping fog and instancing', () => {
    const time = { value: 0 };
    const material = createKelpMaterial({ time, sway: 0.5 });
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <fog_vertex>\n}',
      fragmentShader: '',
    };
    material.onBeforeCompile(shader as never, undefined as never);
    expect(shader.uniforms['uAmbientTime']).toBe(time);
    expect(shader.vertexShader).toContain('instanceMatrix[3]');
    expect(shader.vertexShader).toContain('#include <fog_vertex>');
    expect(material.fog).toBe(true);
    material.dispose();
  });
});
