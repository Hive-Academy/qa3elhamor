/** How the visitor reached a landmark. Pointer and keyboard take the same paths. */
export type InputSource = 'pointer' | 'keyboard';

/**
 * Why a landmark closed. `switch` means another landmark was opened straight from this one;
 * the camera goes on to the next stop instead of returning to the scroll. `scroll` means the
 * visitor scrolled the page away from a non-modal (in-world or camera-only) landmark.
 */
export type CloseReason =
  'escape' | 'button' | 'backdrop' | 'programmatic' | 'switch' | 'scroll';

/**
 * The page's landmark interaction, one landmark at a time:
 *
 *   idle --hover--> hovered --activate--> focused (camera on it, overlay open) --close--> idle
 *
 * `activate` from idle is allowed (a click without a hover on touch screens, or a list button).
 * `activate` on another landmark while one is focused switches: focused(A) -> focused(B).
 * Keyboard focus on a landmark's list entry is `hover`, Enter/Space is `activate`, Esc is
 * `close`, so both inputs drive the same machine.
 */
export type LandmarkInteractionState =
  | { readonly phase: 'idle' }
  | {
      readonly phase: 'hovered';
      readonly id: string;
      readonly source: InputSource;
    }
  | {
      readonly phase: 'focused';
      readonly id: string;
      readonly source: InputSource;
    };

export type LandmarkInteractionEvent =
  | {
      readonly type: 'hover';
      readonly id: string;
      readonly source: InputSource;
    }
  | { readonly type: 'unhover'; readonly id: string }
  | {
      readonly type: 'activate';
      readonly id: string;
      readonly source: InputSource;
    }
  | { readonly type: 'close'; readonly reason: CloseReason };

/**
 * What a transition means to the outside world: the camera moves on `open`/`close`, and every
 * effect is a telemetry event.
 */
export type LandmarkEffect =
  | {
      readonly type: 'hover';
      readonly id: string;
      readonly source: InputSource;
    }
  | { readonly type: 'open'; readonly id: string; readonly source: InputSource }
  | {
      readonly type: 'close';
      readonly id: string;
      readonly reason: CloseReason;
    };

export const IDLE: LandmarkInteractionState = Object.freeze({ phase: 'idle' });

/**
 * The pure transition. While a landmark is focused, hover is ignored (a dialog is modal; an
 * in-world landmark owns the pointer), activating it again is a no-op, and activating another
 * landmark switches to it.
 */
export function transition(
  state: LandmarkInteractionState,
  event: LandmarkInteractionEvent,
): LandmarkInteractionState {
  switch (event.type) {
    case 'hover':
      if (state.phase === 'focused') return state;
      if (
        state.phase === 'hovered' &&
        state.id === event.id &&
        state.source === event.source
      )
        return state;
      return { phase: 'hovered', id: event.id, source: event.source };
    case 'unhover':
      return state.phase === 'hovered' && state.id === event.id ? IDLE : state;
    case 'activate':
      return state.phase === 'focused' && state.id === event.id
        ? state
        : { phase: 'focused', id: event.id, source: event.source };
    case 'close':
      return state.phase === 'focused' ? IDLE : state;
  }
}

/** Effects implied by moving from `previous` to `next` on `event`. */
export function effectsOf(
  previous: LandmarkInteractionState,
  next: LandmarkInteractionState,
  event: LandmarkInteractionEvent,
): LandmarkEffect[] {
  if (previous === next) return [];
  if (next.phase === 'focused') {
    const open: LandmarkEffect = {
      type: 'open',
      id: next.id,
      source: next.source,
    };
    return previous.phase === 'focused'
      ? [{ type: 'close', id: previous.id, reason: 'switch' }, open]
      : [open];
  }
  if (previous.phase === 'focused' && event.type === 'close') {
    return [{ type: 'close', id: previous.id, reason: event.reason }];
  }
  if (
    next.phase === 'hovered' &&
    (previous.phase !== 'hovered' || previous.id !== next.id)
  ) {
    return [{ type: 'hover', id: next.id, source: next.source }];
  }
  return [];
}

/**
 * A small observable holder of the machine for one page, framework-free so the scene, the
 * DOM overlays and tests share one instance. Events naming unknown landmarks are ignored.
 */
export class LandmarkInteraction {
  private state: LandmarkInteractionState = IDLE;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly isKnown: (id: string) => boolean,
    private readonly onEffect: (effect: LandmarkEffect) => void = () =>
      undefined,
  ) {}

  readonly getState = (): LandmarkInteractionState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly dispatch = (event: LandmarkInteractionEvent): void => {
    if (event.type !== 'close' && !this.isKnown(event.id)) return;
    const previous = this.state;
    const next = transition(previous, event);
    if (next === previous) return;
    this.state = next;
    for (const effect of effectsOf(previous, next, event))
      this.onEffect(effect);
    for (const listener of [...this.listeners]) listener();
  };
}
