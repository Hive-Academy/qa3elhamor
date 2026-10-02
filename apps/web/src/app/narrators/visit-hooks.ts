import { useSfx } from '@qa3elhamor/world-audio';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { DialogueEvent } from './dialogue';
import { pickDelay, type SelectSource } from './object-selection';

/*
 * The narrated visit's state around the dialogue: whether the narrator is here, arriving or
 * leaving; picking objects with hover intent; and the full view with its own Esc.
 */

/**
 * The visit's lifecycle: here (open), leaving (farewell, then swim off), away. The narrator
 * reports when it has arrived and when it has gone; the dialogue follows.
 */
export function useVisitLifecycle(
  open: boolean,
  farewellSeconds: number,
  dispatch: (event: DialogueEvent) => void,
) {
  const [mounted, setMounted] = useState(open);
  const [present, setPresent] = useState(open);
  const arrived = useRef(false);
  const isOpen = useRef(open);
  useLayoutEffect(() => {
    isOpen.current = open;
  }, [open]);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMounted(true);
      setPresent(true);
    }
  }

  useEffect(() => {
    if (open) {
      // Re-opened while it was still here (saying goodbye): straight back to the tour.
      if (arrived.current) dispatch({ type: 'arrive' });
      return undefined;
    }
    if (!mounted) return undefined;
    dispatch({ type: 'farewell' });
    const timer = window.setTimeout(
      () => setPresent(false),
      farewellSeconds * 1000,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on open/close only
  }, [open]);

  const onSettled = useCallback(() => {
    arrived.current = true;
    // Closed before it got here: it says goodbye instead of starting the tour.
    if (isOpen.current) dispatch({ type: 'arrive' });
  }, [dispatch]);
  const onExited = useCallback(() => {
    arrived.current = false;
    dispatch({ type: 'reset' });
    setMounted(false);
  }, [dispatch]);

  return { mounted, present, onSettled, onExited };
}

/** Picking an object: select it at once on focus or a tap, after a short rest on hover. */
export function useObjectPicking(dispatch: (event: DialogueEvent) => void) {
  const hoverTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const onPick = useCallback(
    (id: string, source: SelectSource) => {
      window.clearTimeout(hoverTimer.current);
      const apply = () => dispatch({ type: 'select', id });
      const delay = pickDelay(source);
      if (delay > 0) hoverTimer.current = window.setTimeout(apply, delay);
      else apply();
    },
    [dispatch],
  );
  const onUnhover = useCallback(
    () => window.clearTimeout(hoverTimer.current),
    [],
  );
  return { onPick, onUnhover };
}

/** The full view: open from the last line's action; Esc closes it before it closes the landmark. */
export function useFullView(open: boolean) {
  const [fullOpen, setFullOpen] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setFullOpen(false);
  }
  useEffect(() => {
    if (!fullOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setFullOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [fullOpen]);
  return [fullOpen, setFullOpen] as const;
}

/** A soft whoosh as the landmark opens and as it closes (not as the visit first mounts). */
export function useVisitWhoosh(open: boolean) {
  const { whoosh } = useSfx();
  const was = useRef(open);
  useEffect(() => {
    if (was.current === open) return;
    was.current = open;
    whoosh();
  }, [open, whoosh]);
}
