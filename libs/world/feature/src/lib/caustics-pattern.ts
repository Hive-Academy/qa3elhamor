import { seededRandom } from './seeded-random.js';

/**
 * Generates a seamlessly tiling caustic network as 8-bit luminance, row-major.
 *
 * Caustics are bright where refracted rays bunch together, which reads as the edges of a
 * Voronoi diagram: brightness peaks where the distances to the two nearest feature points
 * (F2 - F1) are nearly equal. Feature points sit on a jittered `cells` x `cells` grid and the
 * neighbour search wraps, so the texture tiles. Built once at startup (about 0.6M distance
 * tests at 256 px) instead of shipping a binary asset.
 */
export function createCausticsPattern(size = 256, cells = 8, seed = 7): Uint8Array {
  if (!Number.isInteger(size) || size < 8) {
    throw new RangeError(`Caustics pattern size must be an integer >= 8, got ${size}.`);
  }
  if (!Number.isInteger(cells) || cells < 2) {
    throw new RangeError(`Caustics cell count must be an integer >= 2, got ${cells}.`);
  }

  const random = seededRandom(seed);
  const points = new Float32Array(cells * cells * 2);
  for (let i = 0; i < cells * cells; i++) {
    points[i * 2] = 0.15 + random() * 0.7;
    points[i * 2 + 1] = 0.15 + random() * 0.7;
  }

  const wrap = (value: number): number => ((value % cells) + cells) % cells;
  const data = new Uint8Array(size * size);
  const cellSize = size / cells;
  const edgeWidth = 0.22; // in cell units: how wide the bright filaments are

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = x / cellSize;
      const cy = y / cellSize;
      const ix = Math.floor(cx);
      const iy = Math.floor(cy);
      let f1 = Infinity;
      let f2 = Infinity;

      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const gx = ix + ox;
          const gy = iy + oy;
          const point = wrap(gy) * cells + wrap(gx);
          const dx = gx + points[point * 2] - cx;
          const dy = gy + points[point * 2 + 1] - cy;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < f1) {
            f2 = f1;
            f1 = distance;
          } else if (distance < f2) {
            f2 = distance;
          }
        }
      }

      const edge = Math.max(0, 1 - (f2 - f1) / edgeWidth);
      data[y * size + x] = Math.round(edge * edge * 255);
    }
  }

  return data;
}
