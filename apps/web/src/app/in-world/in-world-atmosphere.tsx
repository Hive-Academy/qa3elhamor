import { useFocusedLandmark } from '@qa3elhamor/landmarks-feature';
import { useEffect, useState, type CSSProperties } from 'react';
import './in-world-atmosphere.css';

/** One bubble of the curtain, laid out once per page. */
interface Bubble {
  readonly left: number;
  readonly size: number;
  readonly delay: number;
  readonly duration: number;
  readonly drift: number;
}

/** A small deterministic generator, so the curtain looks the same on every visit. */
function curtain(count: number): Bubble[] {
  let seed = 0x2f6b1d;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  return Array.from({ length: count }, (_, i) => ({
    left: ((i + next()) / count) * 100,
    size: 10 + next() * 34,
    delay: next() * 0.35,
    duration: 0.85 + next() * 0.5,
    drift: (next() - 0.5) * 60,
  }));
}

const BUBBLES = curtain(44);

/** Set on `<html>` while an in-world landmark is open, so the page chrome can step back. */
export const IN_WORLD_ATTRIBUTE = 'data-in-world';

/** A window rectangle, in CSS pixels. */
export interface VeilHole {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How far the clear window reaches past the hole, softening into the veil. */
const HOLE_MARGIN_PX = 28;
/** An ellipse this much bigger than a rectangle (√2) passes through its corners. */
const CIRCUMSCRIBE = Math.SQRT2;

/**
 * The veil's two windows: the narrator's underwater bubble, and a card's title in the water.
 */
export type VeilWindow = 'speech' | 'title';
const SLOT: Record<VeilWindow, string> = { speech: 'a', title: 'b' };
const lastHole: Record<VeilWindow, string> = { speech: '', title: '' };

/**
 * Keeps the veil off words drawn in the water: the veil is a DOM layer over the canvas, so near
 * the screen's edge it would dim and blur them. `null` closes the window. Writes CSS variables on
 * `<html>` (`--veil-a-*`, `--veil-b-*`) only when they change: it is called every frame.
 */
export function setVeilHole(window: VeilWindow, hole: VeilHole | null): void {
  const root = document.documentElement;
  const slot = SLOT[window];
  // A soft ellipse round the rectangle, through its corners, fading out past its margin.
  const width = hole ? (hole.width + 2 * HOLE_MARGIN_PX) * CIRCUMSCRIBE : 0;
  const height = hole ? (hole.height + 2 * HOLE_MARGIN_PX) * CIRCUMSCRIBE : 0;
  const value = hole
    ? [
        hole.x + hole.width / 2 - width / 2,
        hole.y + hole.height / 2 - height / 2,
        width,
        height,
      ]
        .map(Math.round)
        .join(' ')
    : '';
  if (value === lastHole[window]) return;
  lastHole[window] = value;
  const names = ['x', 'y', 'w', 'h'].map((part) => `--veil-${slot}-${part}`);
  if (!hole) {
    for (const name of names) root.style.removeProperty(name);
    return;
  }
  value
    .split(' ')
    .forEach((part, i) =>
      root.style.setProperty(names[i] as string, `${part}px`),
    );
}

/**
 * The shared atmosphere of every in-world presentation, rendered once in the page chrome
 * (outside the canvas): while an in-world landmark is open the rest of the town dims into the
 * fog behind a veil, and opening one sends a curtain of bubbles up the screen. The page chrome
 * (landmark list, depth gauge, credits, title note) fades back and the landmark beacons give
 * way to the scene (`data-in-world` on `<html>`); pointing at or focusing the chrome brings it
 * back. Decorative only (`aria-hidden`, no pointer events). Landmarks that fall back to their dialog (reduced motion,
 * low tier, no WebGL) never present in-world, so they never see it.
 */
export function InWorldAtmosphere() {
  const focused = useFocusedLandmark();
  const activeId =
    focused?.presentation === 'in-world' ? focused.definition.id : null;
  // Each opening replays the curtain, including a switch from one landmark to another.
  const [opening, setOpening] = useState({
    id: null as string | null,
    count: 0,
  });
  if (activeId !== opening.id) {
    setOpening({
      id: activeId,
      count: activeId ? opening.count + 1 : opening.count,
    });
  }

  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute(IN_WORLD_ATTRIBUTE, activeId !== null);
    return () => root.removeAttribute(IN_WORLD_ATTRIBUTE);
  }, [activeId]);

  return (
    <div className="in-world-atmosphere" aria-hidden="true">
      <div className="in-world-veil" data-active={activeId ? '' : undefined} />
      {activeId && (
        <div key={opening.count} className="in-world-bubbles">
          {BUBBLES.map((b, i) => (
            <span
              key={i}
              className="in-world-bubble"
              style={
                {
                  '--left': `${b.left}%`,
                  '--size': `${b.size}px`,
                  '--delay': `${b.delay}s`,
                  '--duration': `${b.duration}s`,
                  '--drift': `${b.drift}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
