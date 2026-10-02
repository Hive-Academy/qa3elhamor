import type { RefObject } from 'react';
import type { Group } from 'three';

/*
 * The join between a narrator's speech bubble in the HUD (real DOM, in drei's own React root)
 * and its underwater twin in the scene (`OceanSpeech`, SDF text in a glass bubble). The DOM
 * bubble publishes what it says and how far it has typed; the scene draws it, posed exactly over
 * the DOM box the screen placement already keeps beside the narrator, and tells the DOM box how
 * tall the drawn text is, so the box (its buttons, its click target) matches the glass.
 */

/** What the bubble is saying right now. */
export interface OceanSpeechLine {
  readonly text: string;
  /** Characters typed so far (the whole line when not typing). */
  readonly typed: number;
  readonly speaker: string;
  readonly topic?: string;
  /** Leaving: it lingers `lingerSeconds`, then fades like the DOM bubble. */
  readonly departing: boolean;
  readonly lingerSeconds: number;
  readonly dir: 'ltr' | 'rtl';
  /** The bubble itself has the keyboard's focus: the glass shows the focus ring (its rim). */
  readonly ringed?: boolean;
}

export interface OceanSpeechLink {
  /** The DOM bubble's positioned box (the HUD's `speechRef`). */
  readonly box: RefObject<HTMLDivElement | null>;
  /** The scene bubble's root, posed by the screen placement every frame. */
  readonly frame: { current: Group | null };
  /** The DOM box as placed this frame, in CSS pixels. */
  readonly placed: {
    width: number;
    height: number;
    tailX: number;
    visible: boolean;
  };
  readonly get: () => OceanSpeechLine | null;
  readonly set: (line: OceanSpeechLine | null) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

const sameLine = (
  a: OceanSpeechLine | null,
  b: OceanSpeechLine | null,
): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.text === b.text &&
    a.typed === b.typed &&
    a.speaker === b.speaker &&
    a.topic === b.topic &&
    a.departing === b.departing &&
    a.lingerSeconds === b.lingerSeconds &&
    a.ringed === b.ringed &&
    a.dir === b.dir);

export function createOceanSpeechLink(
  box: RefObject<HTMLDivElement | null>,
): OceanSpeechLink {
  let line: OceanSpeechLine | null = null;
  const listeners = new Set<() => void>();
  return {
    box,
    frame: { current: null },
    placed: { width: 0, height: 0, tailX: 0, visible: false },
    get: () => line,
    set: (next) => {
      if (sameLine(line, next)) return;
      line = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Screen pixels per local unit of the scene bubble: its sizes read as hundreds of pixels. */
export const OCEAN_SPEECH_UNIT_PX = 100;

/** Inner padding of the bubble, in CSS pixels (the DOM box's own padding in ocean mode). */
export const OCEAN_SPEECH_PAD_PX = 20;

/**
 * Room over the glass, in CSS pixels, for the name tag that sits on its rim: inside the DOM box,
 * so the screen placement keeps the whole tag on screen and clear of the page chrome. The
 * `.speech-box[data-ocean]` padding-top.
 */
export const OCEAN_SPEECH_TAG_ROOM_PX = 16;

/** The box's widest (as the DOM bubble: 30rem, or the viewport less 1.5rem) and narrowest. */
export const OCEAN_SPEECH_MAX_PX = 480;
export const OCEAN_SPEECH_MIN_PX = 300;

/** The line's font size in pixels for a viewport width (the DOM bubble's 1.125rem, 1rem on phones). */
export const oceanSpeechFontPx = (viewportWidth: number): number =>
  viewportWidth <= 480 ? 17 : 19;

/** Widest the text may wrap at, in pixels, for a viewport width. */
export function oceanSpeechWrapPx(viewportWidth: number): number {
  const box = Math.min(
    OCEAN_SPEECH_MAX_PX,
    Math.max(viewportWidth - 24, OCEAN_SPEECH_MIN_PX),
  );
  return box - 2 * OCEAN_SPEECH_PAD_PX;
}

/** The DOM box's width for a laid-out text block `textWidthPx` wide. */
export function oceanSpeechBoxPx(
  textWidthPx: number,
  viewportWidth: number,
): number {
  const widest = oceanSpeechWrapPx(viewportWidth) + 2 * OCEAN_SPEECH_PAD_PX;
  return Math.round(
    Math.min(
      widest,
      Math.max(OCEAN_SPEECH_MIN_PX, textWidthPx + 2 * OCEAN_SPEECH_PAD_PX + 4),
    ),
  );
}

/** Which lower corner the tail leaves from: the side the DOM placement put the narrator on. */
export const oceanTailSide = (
  tailX: number,
  width: number,
): 'left' | 'right' => (tailX < width / 2 ? 'left' : 'right');

/** The bubble's pop as it appears: 0.34 s, overshooting a little, as the DOM bubble's. */
export function popScale(seconds: number): number {
  const t = Math.min(Math.max(seconds / 0.34, 0), 1);
  const c = 1.4;
  const u = t - 1;
  return 0.55 + 0.45 * (1 + (c + 1) * u * u * u + c * u * u);
}

/** A departing bubble's opacity: whole for `linger` seconds, then gone over 0.7 s. */
export function departingOpacity(
  sinceDeparted: number,
  linger: number,
): number {
  return 1 - Math.min(Math.max((sinceDeparted - linger) / 0.7, 0), 1);
}
