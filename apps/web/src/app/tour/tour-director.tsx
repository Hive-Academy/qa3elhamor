import { useDive, windowScrollSource } from '@qa3elhamor/dive-feature';
import {
  useFocusedLandmark,
  useLandmarkActions,
} from '@qa3elhamor/landmarks-feature';
import { isTextEntry } from '@qa3elhamor/landmarks-ui';
import { useSfx } from '@qa3elhamor/world-audio';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTour, useTourState } from './tour-context';
import { tourActive, type StopPresentation } from './tour-machine';
import { CUT_TIMING, flightProgress, legSeconds } from './tour-timing';

/** Keys that scroll the page: pressed during a flight, they mean the visitor wants the wheel. */
const SCROLL_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'PageDown',
  'PageUp',
  'Home',
  'End',
]);

/** Elements whose own Space (press, type, toggle) must not be taken for "pause". */
const OWN_SPACE =
  'button, a[href], input, select, textarea, summary, [contenteditable], [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], [tabindex]:not([tabindex="-1"])';

const spaceIsFree = (target: EventTarget | null): boolean =>
  !(target instanceof Element) ||
  target === document.body ||
  target === document.documentElement ||
  (!isTextEntry(target) && target.closest(OWN_SPACE) === null);

/**
 * The tour's imperative shell. Turns the machine's phases into camera flights (the page scroll
 * driven along an eased curve, so the camera stays on the dive and the dive's own spring smooths
 * it), landmark openings and closings through the kernel, and the whoosh of each leg; and turns
 * what the visitor does (a scroll, a key, closing or opening a visit) into events.
 *
 * Must sit inside `<DiveProvider>`, `<LandmarkProvider>` and `<TourProvider>`, outside the canvas.
 */
export function TourDirector({
  reducedMotion,
}: {
  readonly reducedMotion: boolean;
}) {
  const { store, entry } = useTour();
  const dive = useDive();
  const { activate, close } = useLandmarkActions();
  const { whoosh } = useSfx();
  const focused = useFocusedLandmark();
  const focusedId = focused?.definition.id ?? null;
  const phase = useTourState((s) => s.phase);
  const flightLeg = useTourState((s) => (s.phase === 'flying' ? s.leg : null));
  const visitKey = useTourState((s) =>
    s.phase === 'visiting' ? `${s.leg}:${s.stop}` : null,
  );
  const active = useTourState(tourActive);
  const [cut, setCut] = useState(false);

  /** Kernel changes the tour made itself, so they are not taken for the visitor's. */
  const expected = useRef<{ close: boolean; open: string | null }>({
    close: false,
    open: null,
  });
  const open = useRef<{ id: string | null; presentation: StopPresentation }>({
    id: focusedId,
    presentation: 'in-world',
  });
  const latest = useRef({ whoosh, reducedMotion });
  useLayoutEffect(() => {
    latest.current = { whoosh, reducedMotion };
  });

  // The visitor closing or opening a landmark the tour did not.
  useEffect(() => {
    const previous = open.current;
    open.current = {
      id: focusedId,
      presentation: focused?.presentation === 'dialog' ? 'dialog' : 'in-world',
    };
    if (previous.id === focusedId) return;
    if (focusedId === null) {
      if (expected.current.close) expected.current.close = false;
      else
        store.dispatch({
          type: 'visit-closed',
          presentation: previous.presentation,
        });
      return;
    }
    if (expected.current.open === focusedId) expected.current.open = null;
    else store.dispatch({ type: 'visit-opened' });
  }, [focusedId, focused?.presentation, store]);

  // A flight: close the visit behind, then move the page scroll along the leg (or cut).
  useEffect(() => {
    if (flightLeg === null) return undefined;
    const stop = store.stops[store.getState().stop];
    const waypoint = stop ? dive.path.waypoint(stop.waypoint) : undefined;
    if (!stop || !waypoint) return undefined;
    if (open.current.id !== null) {
      expected.current.close = true;
      close('programmatic');
    }
    const source = windowScrollSource();
    const arrive = () => {
      source.scrollTo(waypoint.scroll, false);
      store.dispatch({ type: 'arrived' });
    };
    latest.current.whoosh();

    if (latest.current.reducedMotion) {
      // No travel: the view fades out, the camera moves while it is covered, and fades back.
      setCut(true);
      const moved = window.setTimeout(() => {
        source.scrollTo(waypoint.scroll, false);
      }, CUT_TIMING.fadeMs);
      const shown = window.setTimeout(() => {
        setCut(false);
        arrive();
      }, CUT_TIMING.fadeMs + CUT_TIMING.holdMs);
      return () => {
        window.clearTimeout(moved);
        window.clearTimeout(shown);
        setCut(false);
      };
    }

    const from = dive.getState().targetProgress;
    const to = waypoint.progress;
    const duration = legSeconds((to - from) * dive.path.length);
    let frame = 0;
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const elapsed = (now - start) / 1000;
      if (elapsed >= duration) {
        arrive();
        return;
      }
      source.scrollTo(
        dive.path.scrollAtProgress(flightProgress(from, to, elapsed, duration)),
        false,
      );
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [flightLeg, store, dive, close]);

  // Arrived: open the stop's landmark (unless it is open already: a resumed visit).
  useEffect(() => {
    if (visitKey === null) return;
    const stop = store.stops[store.getState().stop];
    if (!stop || open.current.id === stop.id) return;
    expected.current.open = stop.id;
    activate(stop.id, 'keyboard');
  }, [visitKey, store, activate]);

  // The intro starts at the surface.
  useEffect(() => {
    if (phase === 'intro') windowScrollSource().scrollTo(0, false);
  }, [phase]);

  // During the intro or a flight, a scroll of the visitor's own pauses (or, at the intro,
  // means they explore on their own). Never fight the wheel.
  useEffect(() => {
    if (phase !== 'intro' && phase !== 'flying') return undefined;
    const input = () => store.dispatch({ type: 'pause', reason: 'input' });
    const onKeyDown = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key) && !isTextEntry(event.target)) input();
      // Space scrolls the page too, where it has no job of its own (during a flight it is
      // "pause" instead, below).
      else if (
        event.key === ' ' &&
        phase === 'intro' &&
        spaceIsFree(event.target)
      )
        input();
    };
    // A press on the page's scroll bar lands on the root element.
    const onPointerDown = (event: PointerEvent) => {
      if (event.target === document.documentElement) input();
    };
    window.addEventListener('wheel', input, { passive: true });
    window.addEventListener('touchmove', input, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('wheel', input);
      window.removeEventListener('touchmove', input);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [phase, store]);

  // Keyboard: Space pauses and resumes (where Space has no job of its own); Esc pauses when
  // no visit is open (with a visit open, Esc is the kernel's: it closes the visit first).
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const now = store.getState().phase;
      if (event.key === ' ' && spaceIsFree(event.target)) {
        event.preventDefault();
        if (now === 'paused') store.dispatch({ type: 'resume' });
        else store.dispatch({ type: 'pause', reason: 'user' });
      } else if (
        event.key === 'Escape' &&
        open.current.id === null &&
        now === 'flying'
      ) {
        store.dispatch({ type: 'pause', reason: 'user' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, store]);

  // `data-tour-state` on <html>: for the stylesheet (chrome that steps aside) and the e2e suite.
  const state = entry === 'off' ? 'off' : phase;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset['tourState'] = state;
    return () => {
      delete root.dataset['tourState'];
    };
  }, [state]);

  return (
    <div
      className="tour-cut"
      data-active={cut || undefined}
      aria-hidden="true"
    />
  );
}
