import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Scene,
} from 'three';
import { describe, expect, it } from 'vitest';
import {
  chooseNarratorPlacement,
  inSight,
  narratorOnScreen,
  narratorProbePoints,
  nearerPlacement,
  sceneOccluders,
} from './narrator-post';
import {
  placeSpeechBubble,
  tailSkewDegrees,
  windowSafeInsets,
  WINDOW_MARGIN,
} from './screen-placement';
import { screenOf, viewFrame, type Vec3 } from './view-layout';
import { placeNarrator, type NarratorPlacement } from './visit-layout';

const view = viewFrame([0, 4, 10], [0, 0, 0], 55, { width: 1440, height: 900 });
const insets = { top: 14, right: 12, bottom: 86, left: 12 };
const spec = (x: number, y: number) => ({
  x,
  y,
  height: { ofHeight: 0.13, ofWidth: 0.09, min: 72, max: 132 },
  depth: 0.8,
});
const middleOf = (p: NarratorPlacement): Vec3 => [
  p.post[0],
  p.post[1] + p.height / 2,
  p.post[2],
];

/** A wall of opaque boxes between the eye and `p`, the way a building stands in front of it. */
function wallBefore(p: NarratorPlacement): Mesh {
  const wall = new Mesh(new BoxGeometry(2, 2, 0.2), new MeshBasicMaterial());
  const m = middleOf(p);
  wall.position.set(
    m[0] + (view.eye[0] - m[0]) * 0.3,
    m[1] + (view.eye[1] - m[1]) * 0.3,
    m[2] + (view.eye[2] - m[2]) * 0.3,
  );
  wall.lookAt(view.eye[0], view.eye[1], view.eye[2]);
  wall.updateMatrixWorld(true);
  return wall;
}

describe('narrator post', () => {
  const primary = placeNarrator(view, spec(0.2, 0.45), -1);
  const alternative = placeNarrator(view, spec(0.7, 0.3), -1);

  it('moves a spot nearer the visitor without moving it on screen or changing its size there', () => {
    const near = nearerPlacement(primary, view.eye);
    const before = screenOf(view, middleOf(primary));
    const after = screenOf(view, middleOf(near));
    expect(after.depth).toBeLessThan(before.depth);
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
    const tall = (p: NarratorPlacement) =>
      screenOf(view, p.post).y -
      screenOf(view, [p.post[0], p.post[1] + p.height, p.post[2]]).y;
    expect(tall(near)).toBeCloseTo(tall(primary), 0);
  });

  it('sees through open water, and not through a building', () => {
    const points = narratorProbePoints(primary, view.right);
    expect(points).toHaveLength(4);
    expect(inSight(view.eye, points, [])).toBe(true);
    expect(inSight(view.eye, points, [wallBefore(primary)])).toBe(false);
    // A wall behind the narrator hides nothing.
    const behind = wallBefore(primary);
    const m = middleOf(primary);
    behind.position.set(
      m[0] - (view.eye[0] - m[0]) * 0.3,
      m[1],
      m[2] - (view.eye[2] - m[2]) * 0.3,
    );
    behind.updateMatrixWorld(true);
    expect(inSight(view.eye, points, [behind])).toBe(true);
  });

  it('skips a hidden spot for the next one in sight, and keeps a clear first spot', () => {
    const wall = wallBefore(primary);
    const candidates = [
      primary,
      alternative,
      nearerPlacement(primary, view.eye),
    ];
    const checks = (occluders: Mesh[]) => ({
      onScreen: (p: NarratorPlacement) => narratorOnScreen(view, p, insets),
      inSight: (p: NarratorPlacement) =>
        inSight(view.eye, narratorProbePoints(p, view.right), occluders),
    });
    expect(chooseNarratorPlacement(candidates, checks([])).index).toBe(0);
    const chosen = chooseNarratorPlacement(candidates, checks([wall]));
    expect(chosen.index).toBe(1);
    expect(chosen.placement).toBe(alternative);
  });

  it('prefers a spot in sight but clipped by the edge over one behind a building, and falls back to the last', () => {
    const [a, b, c] = [
      primary,
      alternative,
      nearerPlacement(primary, view.eye),
    ];
    const pick = (onScreen: boolean[], seen: boolean[]) =>
      chooseNarratorPlacement([a, b, c], {
        onScreen: (p) => onScreen[[a, b, c].indexOf(p)] ?? false,
        inSight: (p) => seen[[a, b, c].indexOf(p)] ?? false,
      }).index;
    expect(pick([false, false, false], [true, false, false])).toBe(0);
    expect(pick([true, false, true], [false, false, true])).toBe(2);
    expect(pick([true, true, true], [false, false, false])).toBe(2);
  });

  it('knows a narrator pushed past the screen edge is not whole on screen', () => {
    expect(narratorOnScreen(view, primary, insets)).toBe(true);
    expect(
      narratorOnScreen(
        view,
        placeNarrator(view, spec(0.005, 0.45), -1),
        insets,
      ),
    ).toBe(false);
  });

  it('counts only opaque, visible, non-instanced meshes outside the visit as occluders', () => {
    const scene = new Scene();
    const building = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const glass = new Mesh(
      new BoxGeometry(),
      new MeshBasicMaterial({ transparent: true }),
    );
    const hitTarget = new Mesh(
      new BoxGeometry(),
      new MeshBasicMaterial({ colorWrite: false }),
    );
    const fish = new InstancedMesh(
      new BoxGeometry(),
      new MeshBasicMaterial(),
      3,
    );
    const visit = new Group();
    visit.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    const hidden = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    hidden.visible = false;
    scene.add(building, glass, hitTarget, fish, visit, hidden);
    expect(sceneOccluders(scene, visit)).toEqual([building]);
  });
});

describe('speech bubble on screen', () => {
  const viewport = { width: 390, height: 844 };

  it('keeps the bubble 12 px inside the screen, its tail re-aimed at a narrator near the edge', () => {
    const place = placeSpeechBubble({
      anchor: { x: 4, y: 300 },
      size: { width: 366, height: 140 },
      viewport,
      insets,
      bias: 0.6,
    });
    expect(place.left).toBeGreaterThanOrEqual(WINDOW_MARGIN);
    expect(place.left + 366).toBeLessThanOrEqual(
      viewport.width - WINDOW_MARGIN,
    );
    // The tail leaves the bubble as far left as the corner allows, then leans to the anchor.
    expect(place.tailLean).toBeLessThan(0);
    expect(place.left + place.tailX + place.tailLean).toBeLessThanOrEqual(
      place.left + place.tailX,
    );
  });

  it('grows the insets when the stage layer runs past the window, so the bubble still clears it', () => {
    const grown = windowSafeInsets(
      insets,
      { left: -20, top: 0, right: 1460, bottom: 940 },
      { width: 1440, height: 900 },
    );
    expect(grown).toEqual({ top: 14, right: 32, bottom: 86, left: 32 });
    // A layer running 100 px under the window: the bottom inset grows past it.
    expect(
      windowSafeInsets(
        insets,
        { left: 0, top: 0, right: 1440, bottom: 1000 },
        { width: 1440, height: 900 },
      ).bottom,
    ).toBe(112);
    const place = placeSpeechBubble({
      anchor: { x: 30, y: 400 },
      size: { width: 480, height: 140 },
      viewport: { width: 1480, height: 900 },
      insets: grown,
    });
    // 32 px into a layer that starts 20 px left of the window: 12 px into the window.
    expect(place.left - 20).toBeGreaterThanOrEqual(WINDOW_MARGIN);
    expect(
      windowSafeInsets(
        insets,
        { left: 0, top: 0, right: 1440, bottom: 900 },
        { width: 1440, height: 900 },
      ),
    ).toEqual(insets);
  });

  it('skews the tail towards the narrator: its tip lands `tailLean` px aside', () => {
    // CSS skewX(a) about the tail's top edge moves its tip (len px down) by len * tan(a), to
    // the right for a positive angle. The angle must make that the lean, sign included.
    for (const lean of [-26, -8, 0, 8, 26]) {
      const place = { tailLean: lean, tailLength: 22 };
      const degrees = tailSkewDegrees(place);
      expect(Math.sign(degrees)).toBe(Math.sign(lean));
      expect(22 * Math.tan((degrees * Math.PI) / 180)).toBeCloseTo(lean, 6);
    }
    // A narrator far left of a clamped bubble: the tail leans left, a negative skew.
    const left = placeSpeechBubble({
      anchor: { x: 6, y: 420 },
      size: { width: 366, height: 135 },
      viewport,
      insets,
      bias: 0.6,
    });
    expect(tailSkewDegrees(left)).toBeLessThan(0);
    const right = placeSpeechBubble({
      anchor: { x: 384, y: 420 },
      size: { width: 366, height: 135 },
      viewport,
      insets,
      bias: 0.6,
    });
    expect(tailSkewDegrees(right)).toBeGreaterThan(0);
  });
});
