import type { SoundPreference } from './sound-preference.js';

/**
 * The sound of one visit as a pure state machine: the persisted preference, whether an `unset`
 * preference may start on its own, whether the visitor has activated the page yet (browsers
 * block audio until a click, tap or key press; scrolling does not count), and whether the tab
 * is hidden.
 *
 * Whether audio plays is derived (`isAudible`), never stored, so the shell only reconciles the
 * engine with it after each event.
 */
export interface SoundSession {
  readonly preference: SoundPreference;
  /** An `unset` preference starts sound at the first activation (`autoStartAllowed`). */
  readonly autoStart: boolean;
  /** A user activation (pointer down, key down, touch end, or the toggle) has happened. */
  readonly activated: boolean;
  /** The tab is hidden: audio is suspended until it is visible again. */
  readonly hidden: boolean;
}

export type SoundEvent =
  /** The visitor's first click, tap or key press in the page. */
  | { readonly type: 'activate' }
  /** The sound toggle: flips what it shows and persists that choice. */
  | { readonly type: 'toggle' }
  | { readonly type: 'visibility'; readonly hidden: boolean }
  /** The presentation or the motion preference changed (`autoStartAllowed`). */
  | { readonly type: 'auto-start'; readonly allowed: boolean };

export interface AutoStartInputs {
  /** The 3D dive or the readable page view (no WebGL, `?view=page`, or by choice). */
  readonly presentation: 'dive' | 'page';
  /** `prefers-reduced-motion: reduce`. */
  readonly reducedMotion: boolean;
}

/**
 * Whether an `unset` preference may start sound by itself. Only in the dive, and never for a
 * visitor who asked for reduced motion: the page view and reduced motion are opt-in only.
 */
export const autoStartAllowed = ({ presentation, reducedMotion }: AutoStartInputs): boolean =>
  presentation === 'dive' && !reducedMotion;

export const createSoundSession = (
  preference: SoundPreference,
  autoStart: boolean,
): SoundSession => ({ preference, autoStart, activated: false, hidden: false });

/** Whether the visitor wants sound in this visit: chose it, or has not chosen and it may auto-start. */
const wanted = (session: SoundSession): boolean =>
  session.preference === 'on' || (session.preference === 'unset' && session.autoStart);

/** Sound is playing: wanted, unlocked by an activation, and the tab is visible. */
export const isAudible = (session: SoundSession): boolean =>
  wanted(session) && session.activated && !session.hidden;

/**
 * The toggle shows sound as on: the visitor chose it, or it is running (or would be, but for a
 * hidden tab) after it started by itself. Before the first activation an `unset` preference
 * shows off, with the prompt (`showsPrompt`), since nothing is playing yet.
 */
export const isSoundOn = (session: SoundSession): boolean =>
  session.preference === 'on' || (wanted(session) && session.activated);

/** No choice made and nothing playing: the toggle invites the visitor ("Sound on?"). */
export const showsPrompt = (session: SoundSession): boolean =>
  session.preference === 'unset' && !isSoundOn(session);

export function soundReducer(session: SoundSession, event: SoundEvent): SoundSession {
  switch (event.type) {
    case 'activate':
      return session.activated ? session : { ...session, activated: true };
    case 'toggle':
      // The toggle flips what it shows, and pressing it is itself an activation.
      return {
        ...session,
        preference: isSoundOn(session) ? 'off' : 'on',
        activated: true,
      };
    case 'visibility':
      return session.hidden === event.hidden ? session : { ...session, hidden: event.hidden };
    case 'auto-start':
      return session.autoStart === event.allowed
        ? session
        : { ...session, autoStart: event.allowed };
  }
}
