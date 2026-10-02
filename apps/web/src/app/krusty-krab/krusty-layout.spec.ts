import { framingScale } from '@qa3elhamor/dive-feature';
import { describe, expect, it } from 'vitest';
import { stopView } from '../narrators/stop-view';
import {
  screenOf,
  viewFrame,
  worldPerPx,
  type Vec3,
} from '../narrators/view-layout';
import { VISIT_INSETS } from '../narrators/narrated-visit';
import { narratorOnScreen } from '../narrators/narrator-post';
import { pixelSize } from '../narrators/visit-layout';
import {
  KRUSTY_LANDSCAPE,
  KRUSTY_PORTRAIT,
  krustyLayout,
  krustyLayoutSpecFor,
  rowCentre,
} from './krusty-layout';
import { rowProgress } from './menu-board';
import { dishOf } from './menu-dish';

const stop = stopView('landmark-krusty-krab');
const frameFor = (width: number, height: number) =>
  viewFrame(
    stop.eye,
    stop.focus,
    55,
    { width, height },
    framingScale(width / height),
  );

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'phone', width: 390, height: 844 },
] as const;

const up = (p: Vec3, by: number): Vec3 => [p[0], p[1] + by, p[2]];

describe('krustyLayout', () => {
  it('uses the portrait composition on phones', () => {
    expect(krustyLayoutSpecFor(390 / 844)).toBe(KRUSTY_PORTRAIT);
    expect(krustyLayoutSpecFor(1440 / 900)).toBe(KRUSTY_LANDSCAPE);
  });

  for (const { name, width, height } of viewports) {
    describe(name, () => {
      const view = frameFor(width, height);
      const spec = krustyLayoutSpecFor(width / height);
      const layout = krustyLayout(view, 4, stop.ground);
      const board = layout.slots[0]?.board;

      it('stands one board on the sand where the composition wants it, as tall as asked', () => {
        expect(layout.slots).toHaveLength(4);
        expect(board).toBeDefined();
        if (!board) return;
        for (const slot of layout.slots) expect(slot.board).toBe(board);
        expect(board.foot[1]).toBeCloseTo(stop.ground, 6);
        const at = screenOf(view, board.foot);
        expect(at.x).toBeCloseTo(spec.board.x * width, 3);
        expect(at.y).toBeCloseTo(spec.board.footY * height, 3);
        expect(board.height / worldPerPx(view, at.depth)).toBeCloseTo(
          pixelSize(spec.board.height, width, height),
          3,
        );
      });

      it('keeps the board whole on screen, clear of the stage bar', () => {
        if (!board) return;
        const foot = screenOf(view, board.foot);
        const top = screenOf(view, up(board.foot, board.height));
        const halfPx = board.width / 2 / worldPerPx(view, foot.depth);
        expect(foot.x - halfPx).toBeGreaterThan(0);
        expect(foot.x + halfPx).toBeLessThan(width);
        expect(top.y).toBeGreaterThan(0);
        // The "Back to the dive" bar takes the bottom 86 px.
        expect(foot.y).toBeLessThan(height - 70);
      });

      it('stacks the rows on the face, first on top, apart and tall enough for two lines', () => {
        const centres = layout.slots.map((slot) =>
          screenOf(view, rowCentre(slot, 0)),
        );
        for (let i = 0; i + 1 < layout.slots.length; i++) {
          const a = layout.slots[i];
          const b = layout.slots[i + 1];
          const pa = centres[i];
          const pb = centres[i + 1];
          if (!a || !b || !pa || !pb) continue;
          const ha = a.height / 2 / worldPerPx(view, pa.depth);
          const hb = b.height / 2 / worldPerPx(view, pb.depth);
          expect(pb.y - pa.y).toBeGreaterThan(ha + hb);
        }
        for (const [i, slot] of layout.slots.entries()) {
          const at = centres[i];
          if (!at || !board) continue;
          const perPx = worldPerPx(view, at.depth);
          // A label's title and the service under it, at 15 px.
          expect(slot.height / perPx).toBeGreaterThan(48);
          expect(slot.width / perPx).toBeGreaterThan(260);
          expect(slot.centre).toBeGreaterThan(board.legs);
          expect(slot.centre).toBeLessThan(board.legs + board.face);
        }
      });

      it('zooms a selected row: nearer the visitor, where it was on screen, still on screen', () => {
        for (const slot of layout.slots) {
          const flush = screenOf(view, rowCentre(slot, 0));
          const shown = screenOf(view, rowCentre(slot, 1));
          expect(shown.depth).toBeLessThan(flush.depth);
          expect(Math.abs(shown.x - flush.x)).toBeLessThan(2);
          expect(Math.abs(shown.y - flush.y)).toBeLessThan(2);
          const halfPx =
            (slot.width * slot.board.zoom) / 2 / worldPerPx(view, shown.depth);
          expect(shown.x - halfPx).toBeGreaterThan(0);
          expect(shown.x + halfPx).toBeLessThan(width);
        }
      });

      it('floats the crab above the seabed, at its spot', () => {
        const n = layout.narrator;
        expect(n.post[1]).toBeGreaterThan(stop.ground);
        const middle = screenOf(view, up(n.post, n.height / 2));
        // Near the left edge, world-up leans on screen: a little slack across.
        expect(Math.abs(middle.x - spec.narrator.x * width)).toBeLessThan(14);
        expect(Math.abs(middle.y - spec.narrator.y * height)).toBeLessThan(8);
      });

      it('keeps the crab and every spot it may move to whole on screen', () => {
        const spots = [layout.narrator, ...(layout.narratorAlternatives ?? [])];
        expect(spots).toHaveLength(1 + spec.narratorAlternatives.length);
        for (const spot of spots) {
          expect(spot.post[1]).toBeGreaterThan(stop.ground);
          expect(narratorOnScreen(view, spot, VISIT_INSETS)).toBe(true);
        }
      });
    });
  }
});

describe('the menu board', () => {
  it('pops the rows out one after another, all of them out by the end of the opening', () => {
    expect(rowProgress(0.5, 0, 4)).toBe(0);
    expect(rowProgress(0.8, 0, 4)).toBeGreaterThan(rowProgress(0.8, 3, 4));
    for (let i = 0; i < 4; i++) expect(rowProgress(1, i, 4)).toBe(1);
    expect(rowProgress(1, 0, 1)).toBe(1);
  });

  it('serves a patty, a shake and the secret formula in turn down the menu', () => {
    expect([0, 1, 2, 3].map(dishOf)).toEqual([
      'patty',
      'shake',
      'formula',
      'patty',
    ]);
  });
});
