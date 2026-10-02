import {
  BufferAttribute,
  Color,
  ExtrudeGeometry,
  Path,
  Shape,
  type BufferGeometry,
} from 'three';

/*
 * A low-poly stone tablet, 1 x 1 x 1 (width, height, thickness), its foot's middle at the
 * origin, its face towards +Z: an ancient stele with its top corners cut off and bevelled
 * edges, and a raised rim just inside its outline, like a carved border. Scaled per tablet;
 * flat-shaded.
 */

/** The cut top corners, as a fraction of the width (and of the height, a little less). */
const CUT = 0.16;
const CURVE_SEGMENTS = 1;

function outline(inset: number, path: Shape | Path): void {
  const left = -0.5 + inset;
  const right = 0.5 - inset;
  const bottom = inset;
  const top = 1 - inset;
  const cutX = Math.max(CUT - inset * 0.6, 0.03);
  const cutY = cutX * 0.8;
  path.moveTo(left, bottom);
  path.lineTo(right, bottom);
  path.lineTo(right, top - cutY);
  path.lineTo(right - cutX, top);
  path.lineTo(left + cutX, top);
  path.lineTo(left, top - cutY);
  path.lineTo(left, bottom);
}

/** Weathering: a few shades of the stone, by position, so shared corners agree (no cracks). */
function weather(geometry: BufferGeometry, base: string, seed: number): void {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const stone = new Color(base);
  const shade = new Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
    const k = 0.84 + 0.2 * (n - Math.floor(n));
    // Darker towards the foot, where the sand stains it.
    shade.copy(stone).multiplyScalar(k * (0.78 + 0.22 * Math.min(y * 1.6, 1)));
    colors[i * 3] = shade.r;
    colors[i * 3 + 1] = shade.g;
    colors[i * 3 + 2] = shade.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
}

/** The slab: depth 1, centred on z = 0. */
export function createTabletSlab(color: string): BufferGeometry {
  const shape = new Shape();
  outline(0, shape);
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.84,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.035,
    bevelSegments: 1,
    curveSegments: CURVE_SEGMENTS,
  });
  geometry.translate(0, 0, -0.42);
  weather(geometry, color, 1.7);
  geometry.computeVertexNormals();
  return geometry;
}

/** The raised border on the face: a ring inside the outline, standing proud of the front. */
export function createTabletRim(color: string): BufferGeometry {
  const ring = new Shape();
  outline(0.06, ring);
  const hole = new Path();
  outline(0.13, hole);
  ring.holes.push(hole);
  const geometry = new ExtrudeGeometry(ring, {
    depth: 0.1,
    bevelEnabled: false,
    curveSegments: CURVE_SEGMENTS,
  });
  // Its back sits in the slab's face (front at z = 0.5), its front stands proud.
  geometry.translate(0, 0, 0.44);
  weather(geometry, color, 4.1);
  geometry.computeVertexNormals();
  return geometry;
}
