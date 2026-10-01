import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import type { Vec3 } from './world-space.js';

/**
 * Collects flat-coloured triangles for procedural low-poly creatures and plants. Every
 * triangle owns its three vertices (non-indexed), so each face keeps its own colour and the
 * mesh reads as faceted under `flatShading`.
 */
export class LowPolyBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];

  /** Triangle count so far. */
  get triangles(): number {
    return this.positions.length / 9;
  }

  /** One triangle, wound counter-clockwise when seen from its front. */
  triangle(a: Vec3, b: Vec3, c: Vec3, color: Color | readonly [Color, Color, Color]): this {
    this.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    const [ca, cb, cc] = color instanceof Color ? [color, color, color] : color;
    this.colors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
    return this;
  }

  /** Two triangles over the quad a-b-c-d (counter-clockwise). */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Color, color2: Color = color): this {
    return this.triangle(a, b, c, color).triangle(a, c, d, color2);
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
