import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import type { Vec3 } from './world-space.js';

/** Name of the optional per-vertex part-id attribute (see `LowPolyBuilder.part`). */
export const LOW_POLY_PART_ATTRIBUTE = 'part';

/**
 * Collects flat-coloured triangles for procedural low-poly creatures and plants. Every
 * triangle owns its three vertices (non-indexed), so each face keeps its own colour and the
 * mesh reads as faceted under `flatShading`.
 */
export class LowPolyBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly parts: number[] = [];
  private anyPart = false;

  /**
   * Part id stamped on every triangle added while it is set (default 0). When any triangle
   * carries a non-zero id, `build()` adds a float `part` attribute so a vertex-motion patch can
   * move a limb exactly (a claw finger, a fin) instead of guessing it from position ranges.
   */
  part = 0;

  /** Triangle count so far. */
  get triangles(): number {
    return this.positions.length / 9;
  }

  /** One triangle, wound counter-clockwise when seen from its front. */
  triangle(a: Vec3, b: Vec3, c: Vec3, color: Color | readonly [Color, Color, Color]): this {
    this.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    const [ca, cb, cc] = color instanceof Color ? [color, color, color] : color;
    this.colors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
    this.parts.push(this.part, this.part, this.part);
    if (this.part !== 0) this.anyPart = true;
    return this;
  }

  /** Two triangles over the quad a-b-c-d (counter-clockwise). */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Color, color2: Color = color): this {
    return this.triangle(a, b, c, color).triangle(a, c, d, color2);
  }

  /** Runs `draw` with `part` set to `id`, then restores the previous part. */
  withPart(id: number, draw: () => void): this {
    const previous = this.part;
    this.part = id;
    try {
      draw();
    } finally {
      this.part = previous;
    }
    return this;
  }

  /**
   * One geometry per part id (position, colour, normals; no part attribute), for a character
   * built of jointed parts: each part is mounted on its own pivot and moved as a whole.
   */
  buildParts(): Map<number, BufferGeometry> {
    const byPart = new Map<number, { positions: number[]; colors: number[] }>();
    for (let v = 0; v < this.parts.length; v++) {
      const id = this.parts[v] ?? 0;
      let bucket = byPart.get(id);
      if (!bucket) {
        bucket = { positions: [], colors: [] };
        byPart.set(id, bucket);
      }
      for (let k = 0; k < 3; k++) {
        bucket.positions.push(this.positions[v * 3 + k] ?? 0);
        bucket.colors.push(this.colors[v * 3 + k] ?? 0);
      }
    }
    const geometries = new Map<number, BufferGeometry>();
    for (const [id, { positions, colors }] of byPart) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometries.set(id, geometry);
    }
    return geometries;
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    if (this.anyPart) geometry.setAttribute(LOW_POLY_PART_ATTRIBUTE, new Float32BufferAttribute(this.parts, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
