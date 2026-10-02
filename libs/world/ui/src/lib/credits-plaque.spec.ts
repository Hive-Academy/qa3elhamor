import { shippedCredits } from '@qa3elhamor/world-domain';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAQUE_FACING,
  DEFAULT_PLAQUE_POSITION,
  plaqueYaw,
} from './plaque-placement.js';
import { NOTICE, layoutNotice, wrapWords, type MeasureText } from './notice-layout.js';
import { DEFAULT_NOTICE_TEXT, drawNotice } from './notice-texture.js';

/** Monospace stand-in for `measureText`: each character is 0.55em wide. */
const measure: MeasureText = (text, font) => {
  const px = Number(/(\d+)px/.exec(font)?.[1]);
  return text.length * px * 0.55;
};

const credits = shippedCredits();

describe('wrapWords', () => {
  it('never loses or alters text, even with words wider than the column', () => {
    const text = 'short words then (https://example.org/a-very-long-unbreakable-url) end';
    const lines = wrapWords(text, 100, '10px sans-serif', measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(text);
  });
});

describe('layoutNotice', () => {
  const layout = layoutNotice(credits, measure);
  const column = NOTICE.width - 2 * NOTICE.padding;

  it('has one entry per credit, whose wrapped lines are the licence line exactly', () => {
    expect(layout.entries.map((e) => e.credit.sourceModel)).toEqual(
      credits.map((c) => c.sourceModel),
    );
    for (const entry of layout.entries) {
      expect(entry.lines.join(' ')).toBe(entry.credit.line);
      expect(entry.heading).toBe(entry.credit.attribution.title);
    }
  });

  it('picks a size where every line fits the column, long URLs included', () => {
    const font = `${layout.bodyPx}px sans-serif`;
    for (const line of layout.entries.flatMap((e) => e.lines)) {
      expect(measure(line, font)).toBeLessThanOrEqual(column);
    }
    expect(layout.bodyPx).toBeGreaterThanOrEqual(24);
  });
});

describe('drawNotice', () => {
  it('paints each credit line verbatim (wrapped) under its title', () => {
    const drawn: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_target, key) =>
          key === 'fillText'
            ? (text: string) => drawn.push(text)
            : () => undefined,
        set: () => true,
      },
    ) as CanvasRenderingContext2D;

    const layout = layoutNotice(credits, measure);
    drawNotice(ctx, layout);

    const all = drawn.join('\n');
    for (const entry of layout.entries) {
      const at = drawn.indexOf(entry.heading);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(drawn.slice(at + 1, at + 1 + entry.lines.length).join(' ')).toBe(entry.credit.line);
    }
    expect(all).toContain(DEFAULT_NOTICE_TEXT.footer);
  });
});

describe('plaqueYaw', () => {
  it('turns the board front (+z) toward the facing point', () => {
    expect(plaqueYaw([0, 0, 0], [0, 0, 5])).toBeCloseTo(0);
    expect(plaqueYaw([0, 0, 0], [5, 0, 0])).toBeCloseTo(Math.PI / 2);
    expect(plaqueYaw([0, 0, 0], [0, 3, -5])).toBeCloseTo(Math.PI);
  });

  it('faces the default spot toward the end of the dive', () => {
    const yaw = plaqueYaw(DEFAULT_PLAQUE_POSITION, DEFAULT_PLAQUE_FACING);
    const front = [Math.sin(yaw), Math.cos(yaw)];
    const toFacing = [
      DEFAULT_PLAQUE_FACING[0] - DEFAULT_PLAQUE_POSITION[0],
      DEFAULT_PLAQUE_FACING[2] - DEFAULT_PLAQUE_POSITION[2],
    ];
    expect(front[0] * toFacing[0] + front[1] * toFacing[1]).toBeGreaterThan(0);
  });
});
