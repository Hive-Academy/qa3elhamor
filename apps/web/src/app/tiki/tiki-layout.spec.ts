import { framingScale } from '@qa3elhamor/dive-feature';
import { describe, expect, it } from 'vitest';
import { stopView } from '../narrators/stop-view';
import { screenOf, viewFrame, worldPerPx, type Vec3 } from '../narrators/view-layout';
import { pixelSize } from '../narrators/visit-layout';
import {
  TIKI_LANDSCAPE,
  TIKI_PORTRAIT,
  tabletFeet,
  tikiLayout,
  tikiLayoutSpecFor,
} from './tiki-layout';

const stop = stopView('landmark-tiki');
const frameFor = (width: number, height: number) =>
  viewFrame(stop.eye, stop.focus, 55, { width, height }, framingScale(width / height));

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'phone', width: 390, height: 844 },
] as const;

const up = (p: Vec3, by: number): Vec3 => [p[0], p[1] + by, p[2]];

describe('tikiLayout', () => {
  it('uses two rows on phones, one fanned row on wide screens', () => {
    expect(tikiLayoutSpecFor(390 / 844)).toBe(TIKI_PORTRAIT);
    expect(tikiLayoutSpecFor(1440 / 900)).toBe(TIKI_LANDSCAPE);
  });

  it('puts the newest jobs in the back row, read left to right', () => {
    const feet = tabletFeet(TIKI_PORTRAIT.tablets, 4);
    expect(feet[0]?.y).toBeLessThan(feet[2]?.y ?? 0);
    expect(feet[0]?.x).toBeLessThan(feet[1]?.x ?? 0);
    const outer = tabletFeet(TIKI_LANDSCAPE.tablets, 4).map((f) => f.outer);
    [-1, -1 / 3, 1 / 3, 1].forEach((wanted, i) => expect(outer[i]).toBeCloseTo(wanted, 9));
    expect(tabletFeet(TIKI_LANDSCAPE.tablets, 1)[0]).toMatchObject({ x: 0.5, outer: 0 });
  });

  for (const { name, width, height } of viewports) {
    describe(name, () => {
      const view = frameFor(width, height);
      const spec = tikiLayoutSpecFor(width / height);
      const layout = tikiLayout(view, 4, stop.ground);

      it('stands every tablet on the sand, where the composition wants its foot', () => {
        const feet = tabletFeet(spec.tablets, 4);
        expect(layout.slots).toHaveLength(4);
        layout.slots.forEach((slot, i) => {
          expect(slot.foot[1]).toBeCloseTo(stop.ground, 6);
          expect(slot.ground).toBe(stop.ground);
          const at = screenOf(view, slot.foot);
          expect(at.x).toBeCloseTo((feet[i]?.x ?? 0) * width, 3);
          expect(at.y).toBeCloseTo((feet[i]?.y ?? 0) * height, 3);
          // As tall on screen as the composition asks.
          const px = slot.height / worldPerPx(view, at.depth);
          expect(px).toBeCloseTo(pixelSize(spec.tablets.height, width, height), 3);
        });
      });

      it('keeps every tablet whole on screen, clear of the stage bar', () => {
        for (const slot of layout.slots) {
          const foot = screenOf(view, slot.foot);
          const top = screenOf(view, up(slot.foot, slot.height));
          const halfPx = slot.width / 2 / worldPerPx(view, foot.depth);
          expect(foot.x - halfPx).toBeGreaterThan(0);
          expect(foot.x + halfPx).toBeLessThan(width);
          expect(top.y).toBeGreaterThan(0);
          // The "Back to the dive" bar takes the bottom 86 px.
          expect(foot.y).toBeLessThan(height - 70);
        }
      });

      it('keeps the tablets of a row apart, so every label reads', () => {
        const perRow = spec.tablets.perRow;
        for (let i = 0; i + 1 < layout.slots.length; i++) {
          if ((i + 1) % perRow === 0) continue;
          const a = layout.slots[i];
          const b = layout.slots[i + 1];
          if (!a || !b) continue;
          const pa = screenOf(view, a.foot);
          const pb = screenOf(view, b.foot);
          const wa = a.width / 2 / worldPerPx(view, pa.depth);
          const wb = b.width / 2 / worldPerPx(view, pb.depth);
          expect(pb.x - pa.x).toBeGreaterThan(wa + wb);
        }
      });

      it('presents a selected tablet nearer the visitor, and up off the sand', () => {
        for (const slot of layout.slots) {
          const before = screenOf(view, slot.foot).depth;
          const presented: Vec3 = [
            slot.foot[0] + slot.presented[0],
            slot.foot[1] + slot.presented[1],
            slot.foot[2] + slot.presented[2],
          ];
          const shown = screenOf(view, presented);
          expect(shown.depth).toBeLessThan(before);
          expect(slot.presented[1]).toBeGreaterThan(0);
          // Still whole on screen, grown as `StoneTablets` grows it (8%).
          const halfPx = (slot.width * 1.08) / 2 / worldPerPx(view, shown.depth);
          expect(shown.x - halfPx).toBeGreaterThan(0);
          expect(shown.x + halfPx).toBeLessThan(width);
        }
      });

      it('floats the narrator above the seabed, at its spot, facing the visitor', () => {
        const n = layout.narrator;
        expect(n.post[1]).toBeGreaterThan(stop.ground);
        const middle = screenOf(view, up(n.post, n.height / 2));
        expect(Math.abs(middle.x - spec.narrator.x * width)).toBeLessThan(8);
        expect(Math.abs(middle.y - spec.narrator.y * height)).toBeLessThan(8);
      });
    });
  }
});
