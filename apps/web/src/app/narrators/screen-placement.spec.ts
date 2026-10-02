import { describe, expect, it } from 'vitest';
import {
  CHROME_GAP,
  clearOfChrome,
  placePanel,
  placeSpeechBubble,
} from './screen-placement';

const viewport = { width: 1440, height: 900 };
const insets = { top: 14, right: 12, bottom: 86, left: 12 };

describe('placeSpeechBubble', () => {
  it('sits above its anchor with the tail pointing straight down at it', () => {
    const place = placeSpeechBubble({
      anchor: { x: 400, y: 500 },
      size: { width: 480, height: 170 },
      viewport,
      insets,
      bias: 0.5,
      tail: 22,
    });
    expect(place).toMatchObject({
      visible: true,
      left: 160,
      top: 308,
      tailX: 240,
      tailLean: 0,
      tailLength: 22,
    });
  });

  it('slides along the edge to stay on screen, and leans its tail to keep pointing', () => {
    const place = placeSpeechBubble({
      anchor: { x: 20, y: 500 },
      size: { width: 366, height: 160 },
      viewport: { width: 390, height: 844 },
      insets,
    });
    expect(place.left).toBe(12);
    // The tail keeps clear of the rounded corner and leans left to reach the anchor.
    expect(place.tailX).toBe(30);
    expect(place.tailLean).toBeLessThan(0);
  });

  it('stays below the top inset when there is no room above, growing its tail instead', () => {
    const place = placeSpeechBubble({
      anchor: { x: 200, y: 120 },
      size: { width: 300, height: 200 },
      viewport,
      insets,
    });
    expect(place.top).toBe(14);
    expect(place.tailLength).toBeGreaterThanOrEqual(11);
  });

  it('hides when the anchor is off screen or not a number', () => {
    const size = { width: 300, height: 100 };
    expect(
      placeSpeechBubble({ anchor: { x: -200, y: 300 }, size, viewport })
        .visible,
    ).toBe(false);
    const nan = placeSpeechBubble({
      anchor: { x: Number.NaN, y: 300 },
      size,
      viewport,
    });
    expect(nan.visible).toBe(false);
    expect(Number.isFinite(nan.left + nan.top + nan.tailX + nan.tailLean)).toBe(
      true,
    );
  });
});

describe('placePanel', () => {
  const size = { width: 300, height: 180 };
  const hub = { x: 720, y: 600 };

  it('opens on the side away from the landmark', () => {
    const right = placePanel({
      centre: { x: 1050, y: 500 },
      radius: 60,
      hub,
      size,
      viewport,
      insets,
      gap: 10,
    });
    expect(right).toMatchObject({ side: 'right', left: 1120, top: 410 });
    const above = placePanel({
      centre: { x: 730, y: 500 },
      radius: 40,
      hub,
      size: { width: 200, height: 100 },
      viewport,
      insets,
    });
    expect(above).toMatchObject({ side: 'above', top: 350 });
  });

  it('turns to the other axis when the outward side has no room', () => {
    // High above the landmark: no room above, so it goes beside, outward.
    const top = placePanel({
      centre: { x: 860, y: 200 },
      radius: 60,
      hub,
      size,
      viewport,
      insets,
      gap: 10,
    });
    expect(top.side).toBe('right');
    expect(top.left).toBe(930);
  });

  it('always lands inside the viewport and insets', () => {
    const cramped = placePanel({
      centre: { x: 200, y: 400 },
      radius: 45,
      hub: { x: 195, y: 470 },
      size: { width: 366, height: 260 },
      viewport: { width: 390, height: 844 },
      insets,
    });
    expect(cramped.left).toBeGreaterThanOrEqual(12);
    expect(cramped.left + 366).toBeLessThanOrEqual(390 - 12);
    expect(cramped.top).toBeGreaterThanOrEqual(14);
    expect(cramped.top + 260).toBeLessThanOrEqual(844 - 86);
  });
});

describe('placePanel for things that are not round', () => {
  const size = { width: 300, height: 200 };

  it('clears a tall, narrow tablet by its own half width and half height', () => {
    const extent = { x: 70, y: 90 };
    const right = placePanel({
      centre: { x: 900, y: 600 },
      radius: 90,
      extent,
      hub: { x: 700, y: 600 },
      size,
      viewport,
      insets,
      gap: 12,
    });
    expect(right).toMatchObject({ side: 'right', left: 900 + 70 + 12 });
    const above = placePanel({
      centre: { x: 900, y: 600 },
      radius: 90,
      extent,
      hub: { x: 700, y: 600 },
      size,
      viewport,
      insets,
      gap: 12,
      prefer: 'above',
    });
    expect(above).toMatchObject({ side: 'above', top: 600 - 90 - 12 - 200 });
  });

  it('falls back from a preferred side that has no room', () => {
    const place = placePanel({
      centre: { x: 900, y: 200 },
      radius: 90,
      extent: { x: 70, y: 90 },
      hub: { x: 700, y: 200 },
      size,
      viewport,
      insets,
      gap: 12,
      prefer: 'above',
    });
    expect(place.side).toBe('right');
  });
});

describe('placeSpeechBubble around the page chrome', () => {
  // The dive's top-left chrome (credits, language switch) and top-right (depth, sound), English.
  const chrome = [
    { left: 24, top: 24, right: 102, bottom: 70 },
    { left: 24, top: 76, right: 124, bottom: 120 },
    { left: 1315, top: 24, right: 1416, bottom: 80 },
    { left: 1299, top: 88, right: 1416, bottom: 132 },
  ];
  const overlaps = (
    place: { left: number; top: number },
    size: { width: number; height: number },
  ) =>
    chrome.some(
      (r) =>
        place.left < r.right &&
        place.left + size.width > r.left &&
        place.top < r.bottom &&
        place.top + size.height > r.top,
    );

  it('steps out from under the credits and the language switch (a narrator high on the left)', () => {
    const size = { width: 480, height: 150 };
    const anchor = { x: 200, y: 250 };
    const without = placeSpeechBubble({
      anchor,
      size,
      viewport,
      insets,
      bias: 0.6,
    });
    expect(overlaps(without, size)).toBe(true);
    const place = placeSpeechBubble({
      anchor,
      size,
      viewport,
      insets,
      bias: 0.6,
      keepOut: chrome,
    });
    expect(overlaps(place, size)).toBe(false);
    // Still above the narrator, the tail pointing down at it.
    expect(place.top + size.height).toBeLessThan(anchor.y);
  });

  it('does the same for the mirrored chrome in Arabic (depth and sound on the left)', () => {
    const mirrored = chrome.map((r) => ({
      left: viewport.width - r.right,
      right: viewport.width - r.left,
      top: r.top,
      bottom: r.bottom,
    }));
    const size = { width: 480, height: 150 };
    const place = placeSpeechBubble({
      anchor: { x: 1250, y: 330 },
      size,
      viewport,
      insets,
      bias: 0.4,
      keepOut: mirrored,
    });
    expect(
      mirrored.some(
        (r) =>
          place.left < r.right &&
          place.left + size.width > r.left &&
          place.top < r.bottom &&
          place.top + size.height > r.top,
      ),
    ).toBe(false);
  });

  it('slides a bubble pressed to the top inset sideways, clear of the chrome (no room above)', () => {
    const size = { width: 480, height: 170 };
    const anchor = { x: 240, y: 205 };
    const place = placeSpeechBubble({
      anchor,
      size,
      viewport,
      insets,
      bias: 0.6,
      keepOut: chrome,
    });
    expect(overlaps(place, size)).toBe(false);
    expect(place.top).toBe(insets.top);
  });

  it('leaves a bubble that is clear where it is', () => {
    const size = { width: 480, height: 150 };
    const anchor = { x: 700, y: 600 };
    expect(
      placeSpeechBubble({ anchor, size, viewport, insets, keepOut: chrome }),
    ).toEqual(placeSpeechBubble({ anchor, size, viewport, insets }));
  });

  it('keeps its natural place when no clear spot is above the narrator', () => {
    const box = { left: 12, top: 14 };
    const size = { width: 480, height: 150 };
    const everywhere = [{ left: 0, top: 0, right: 1440, bottom: 200 }];
    expect(
      clearOfChrome(box, size, everywhere, {
        minLeft: 12,
        maxLeft: 948,
        minTop: 14,
        maxBottom: 190,
      }),
    ).toBe(box);
  });

  it('keeps the gap from the chrome it steps beside', () => {
    const place = clearOfChrome(
      { left: 40, top: 30 },
      { width: 300, height: 100 },
      [{ left: 24, top: 24, right: 124, bottom: 120 }],
      { minLeft: 12, maxLeft: 1128, minTop: 14, maxBottom: 400 },
    );
    expect(place).toEqual({ left: 124 + CHROME_GAP, top: 30 });
  });
});
