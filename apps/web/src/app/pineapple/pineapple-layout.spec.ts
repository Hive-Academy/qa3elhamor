import { framingScale } from '@qa3elhamor/dive-feature';
import { describe, expect, it } from 'vitest';
import { stopView } from '../narrators/stop-view';
import { screenOf, viewFrame, worldPerPx } from '../narrators/view-layout';
import {
  PINEAPPLE_LANDSCAPE,
  PINEAPPLE_PORTRAIT,
  pineappleLayout,
  pineappleLayoutSpecFor,
  pixelSize,
  ringSlots,
} from './pineapple-layout';

const stop = stopView('landmark-pineapple');
const frameFor = (width: number, height: number) =>
  viewFrame(stop.eye, stop.focus, 55, { width, height }, framingScale(width / height));

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'phone', width: 390, height: 844 },
] as const;

describe('pineappleLayout', () => {
  it('uses the portrait composition on phones, the landscape one on wide screens', () => {
    expect(pineappleLayoutSpecFor(390 / 844)).toBe(PINEAPPLE_PORTRAIT);
    expect(pineappleLayoutSpecFor(1440 / 900)).toBe(PINEAPPLE_LANDSCAPE);
  });

  for (const { name, width, height } of viewports) {
    describe(name, () => {
      const view = frameFor(width, height);
      const spec = pineappleLayoutSpecFor(width / height);
      const layout = pineappleLayout(view, 6, stop.ground);

      it('puts every skill bubble where the composition wants it, whole, on screen', () => {
        expect(layout.bubbles).toHaveLength(6);
        layout.bubbles.forEach((bubble, i) => {
          const at = screenOf(view, bubble.centre);
          const slot = spec.bubbles.slots[i];
          expect(at.x).toBeCloseTo((slot?.x ?? 0) * width, 4);
          expect(at.y).toBeCloseTo((slot?.y ?? 0) * height, 4);
          const radiusPx = bubble.radius / worldPerPx(view, at.depth);
          expect(radiusPx * 2).toBeCloseTo(pixelSize(spec.bubbles.diameter, width, height), 4);
          expect(at.x - radiusPx).toBeGreaterThan(0);
          expect(at.x + radiusPx).toBeLessThan(width);
          expect(at.y - radiusPx).toBeGreaterThan(0);
          // Clear of the stage's "Back to the dive" bar.
          expect(at.y + radiusPx).toBeLessThan(height - 70);
        });
      });

      it('keeps the bubbles apart, so every label reads', () => {
        const shown = layout.bubbles.map((b) => ({ ...screenOf(view, b.centre), r: b.radius }));
        for (let i = 0; i < shown.length; i++)
          for (let j = i + 1; j < shown.length; j++) {
            const a = shown[i];
            const b = shown[j];
            if (!a || !b) continue;
            const ra = a.r / worldPerPx(view, a.depth);
            const rb = b.r / worldPerPx(view, b.depth);
            expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(ra + rb);
          }
      });

      it('keeps everything above the seabed', () => {
        for (const bubble of layout.bubbles)
          expect(bubble.centre[1] - bubble.radius).toBeGreaterThan(stop.ground);
        expect(layout.narrator.post[1]).toBeGreaterThan(stop.ground);
      });

      it('places the narrator at its slot, the height it should look, facing the visitor', () => {
        const middle = screenOf(view, [
          layout.narrator.post[0],
          layout.narrator.post[1] + layout.narrator.height / 2,
          layout.narrator.post[2],
        ]);
        // World-up is not quite screen-up under a camera looking down: a few pixels' slack.
        expect(Math.abs(middle.x - spec.narrator.x * width)).toBeLessThan(8);
        expect(Math.abs(middle.y - spec.narrator.y * height)).toBeLessThan(8);
        const px = layout.narrator.height / worldPerPx(view, middle.depth);
        const wanted = pixelSize(spec.narrator.height, width, height);
        expect(Math.abs(px - wanted) / wanted).toBeLessThan(0.1);
        // Rest yaw points from the post towards the eye.
        const [x, , z] = layout.narrator.post;
        const toEye = Math.atan2(view.eye[0] - x, view.eye[2] - z);
        expect(layout.narrator.restYaw).toBeCloseTo(toEye, 9);
        // It swims in from off screen, to the left.
        const start = screenOf(view, [
          x + layout.narrator.enterFrom[0] * layout.narrator.height,
          layout.narrator.post[1] + layout.narrator.enterFrom[1] * layout.narrator.height,
          z + layout.narrator.enterFrom[2] * layout.narrator.height,
        ]);
        expect(start.x).toBeLessThan(spec.narrator.x * width);
      });
    });
  }

  it('makes room for more skill groups than the composition has slots', () => {
    const slots = ringSlots(PINEAPPLE_LANDSCAPE.bubbles.slots, 8);
    expect(slots).toHaveLength(8);
    for (const slot of slots) {
      expect(slot.x).toBeGreaterThan(0);
      expect(slot.x).toBeLessThan(1);
      expect(slot.y).toBeGreaterThan(0);
      expect(slot.y).toBeLessThan(1);
    }
    expect(ringSlots(PINEAPPLE_LANDSCAPE.bubbles.slots, 2)).toHaveLength(2);
  });

  it('clamps pixel sizes to their range', () => {
    const size = { ofHeight: 0.1, ofWidth: 0.1, min: 50, max: 80 };
    expect(pixelSize(size, 300, 300)).toBe(50);
    expect(pixelSize(size, 4000, 4000)).toBe(80);
    expect(pixelSize(size, 600, 700)).toBe(60);
  });
});
