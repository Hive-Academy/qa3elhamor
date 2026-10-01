import { DivePath } from '@qa3elhamor/dive-domain';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiveProvider, useDive, type DiveProviderProps } from './dive-context.js';
import type { DiveController } from './dive-controller.js';

const PATH = DivePath.create({
  controlPoints: [
    [30, 30, 30],
    [16, 4, 4],
    [0, 5, 8],
  ],
  waypoints: [{ id: 'stop', at: 1, focus: [15, 3, -2] }],
  depth: { surfaceY: 34, floorY: 1, floorMeters: 180 },
});

/** Renders a provider and hands back the controller it built. */
function mount(props: Omit<DiveProviderProps, 'path' | 'children'>) {
  const seen: DiveController[] = [];
  function Probe() {
    seen.push(useDive());
    return null;
  }
  const view = render(
    <DiveProvider path={PATH} {...props}>
      <Probe />
    </DiveProvider>
  );
  const rerender = (next: Omit<DiveProviderProps, 'path' | 'children'>) =>
    view.rerender(
      <DiveProvider path={PATH} {...next}>
        <Probe />
      </DiveProvider>
    );
  return { seen, rerender };
}

const lookAtStop = (controller: DiveController) => {
  controller.scrollToWaypoint('stop');
  controller.step(1 / 60);
  controller.step(10);
  for (let i = 0; i < 600; i++) controller.step(1 / 60);
  return [...controller.pose.lookAt];
};

describe('DiveProvider', () => {
  it('passes attention through to the controller', () => {
    const on = mount({ sway: 0 }).seen[0];
    const off = mount({ sway: 0, attention: { inner: 0, outer: 0 } }).seen[0];
    lookAtStop(on).forEach((v, i) => expect(v).toBeCloseTo([15, 3, -2][i], 6));
    expect(Math.hypot(...lookAtStop(off).map((v, i) => v - [15, 3, -2][i]))).toBeGreaterThan(1);
  });

  it('passes framing through to the controller', () => {
    const pulled = mount({ sway: 0 }).seen[0];
    const flat = mount({ sway: 0, framing: { referenceAspect: 1.6, strength: 0, maxScale: 2 } }).seen[0];
    for (const c of [pulled, flat]) {
      c.setViewAspect(0.45);
      lookAtStop(c);
    }
    const stop = PATH.waypoint('stop')?.position ?? [0, 0, 0];
    const off = (c: DiveController) => Math.hypot(...c.pose.position.map((v, i) => v - stop[i]));
    expect(off(flat)).toBeLessThan(1e-6);
    expect(off(pulled)).toBeGreaterThan(1);
  });

  it('keeps the same controller when re-rendered with equal inline options', () => {
    const { seen, rerender } = mount({ attention: { inner: 3, outer: 22 }, framing: { referenceAspect: 1.6, strength: 0.5, maxScale: 2 } });
    rerender({ attention: { inner: 3, outer: 22 }, framing: { referenceAspect: 1.6, strength: 0.5, maxScale: 2 } });
    expect(seen.length).toBeGreaterThan(1);
    expect(new Set(seen).size).toBe(1);
    rerender({ attention: { inner: 3, outer: 30 }, framing: { referenceAspect: 1.6, strength: 0.5, maxScale: 2 } });
    expect(new Set(seen).size).toBe(2);
  });
});
