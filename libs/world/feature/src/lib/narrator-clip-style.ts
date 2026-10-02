import type { NarratorFidgetId } from './narrator-clips.js';
import type { Side } from './narrator-rig.js';

/*
 * How a character plays the shared clips: its personality, as data. Every narrator runs the same
 * animator and the same clips (`narrator-animator.ts`, `narrator-clips.ts`); a style only scales
 * and selects (tempo, amplitudes, which arm waves, which fidgets, hop or swim). A new character
 * is a new style, never a forked animator.
 */

/** How it travels to and from its post: hops, a swim (tail and body), or a crab's scuttle. */
export type NarratorLocomotion = 'hop' | 'swim' | 'scuttle';

export interface ClipStyle {
  /** Names it in snapshots and diagnostics. */
  readonly id: string;
  /** Multiplies the idle's clock (its drift, sway and glances): below 1 is slower, dopier. */
  readonly tempo: number;
  readonly breath: {
    /** Multiplies the breathing rate. */
    readonly rate: number;
    /**
     * Breath as a squash, x height per unit breath: positive stretches up on the in-breath, negative
     * widens instead (a belly breath).
     */
    readonly depth: number;
  };
  /** Multiplies the idle's drifting (weight shift, arm drift, head tilt). */
  readonly idle: number;
  readonly talk: {
    /** Multiplies the gesture clock (which hand leads, the head's turn). */
    readonly tempo: number;
    /** How far the talk posture goes, 0..1 of the clip's. */
    readonly amplitude: number;
  };
  readonly wave: {
    /** Multiplies the forearm's rock: below 1 is a slow, regal wave. */
    readonly tempo: number;
    /** Which arm (or fin, or claw) waves. */
    readonly side: Side;
    /** How high the arm goes, radians above horizontal. */
    readonly lift: number;
  };
  /** How big the surprised react is, 0..1 of the clip's. */
  readonly react: number;
  readonly locomotion: NarratorLocomotion;
  readonly hop: {
    /** Multiplies the hop's height (a heavy character hops low). */
    readonly height: number;
    /** Multiplies its crouch and landing squash. */
    readonly crouch: number;
    /** Hops (or strokes, or scuttles) on the way in, and on the way out. */
    readonly hopsIn: number;
    readonly hopsOut: number;
  };
  /** The fidgets it plays when it has nothing else to do (at least two). */
  readonly fidgets: readonly NarratorFidgetId[];
  /** Seconds between two fidgets, the least and the most. */
  readonly fidgetGap: { readonly min: number; readonly max: number };
  /** Added to its rest pose, radians: chest pitch (negative puffs it out) and head pitch. */
  readonly posture: { readonly chest: number; readonly head: number };
}

/** SpongeBob: brisk, bouncy, all arms. Every other style is measured against this one. */
export const SPONGEBOB_STYLE: ClipStyle = {
  id: 'spongebob',
  tempo: 1,
  breath: { rate: 1, depth: 0.013 },
  idle: 1,
  talk: { tempo: 1, amplitude: 1 },
  wave: { tempo: 1, side: -1, lift: 0.75 },
  react: 1,
  locomotion: 'hop',
  hop: { height: 1, crouch: 1, hopsIn: 3, hopsOut: 2 },
  fidgets: ['scratch', 'bounce', 'look', 'hips'],
  fidgetGap: { min: 4, max: 9 },
  posture: { chest: 0, head: 0 },
};

/**
 * Patrick: slow and dopey. A lazy idle with deep belly breaths, big loose arm-point gestures, a
 * heavy low hop with a deep landing, and he nods off now and then.
 */
export const PATRICK_STYLE: ClipStyle = {
  id: 'patrick',
  tempo: 0.6,
  breath: { rate: 0.7, depth: -0.022 },
  idle: 1.3,
  talk: { tempo: 0.7, amplitude: 0.85 },
  wave: { tempo: 0.75, side: -1, lift: 0.4 },
  react: 0.75,
  locomotion: 'hop',
  hop: { height: 0.6, crouch: 0.35, hopsIn: 2, hopsOut: 2 },
  fidgets: ['doze', 'belly', 'look', 'bounce'],
  fidgetGap: { min: 5, max: 10 },
  posture: { chest: 0.03, head: 0.04 },
};

/** The Crab Clerk: quick and clicky. Snappy claws, eyestalk glances, a sideways scuttle. */
export const CRAB_CLERK_STYLE: ClipStyle = {
  id: 'crab-clerk',
  tempo: 1.4,
  breath: { rate: 1.3, depth: 0.01 },
  idle: 0.9,
  talk: { tempo: 1.5, amplitude: 0.5 },
  // The free claw waves (the other holds the stamp).
  wave: { tempo: 1.4, side: -1, lift: 0.9 },
  react: 1,
  locomotion: 'scuttle',
  hop: { height: 0.35, crouch: 0.8, hopsIn: 6, hopsOut: 5 },
  fidgets: ['clack', 'look', 'bounce'],
  fidgetGap: { min: 3, max: 7 },
  posture: { chest: 0, head: 0 },
};

/** The Sardine President: slow, grand, chest out. A regal fin wave, a puff of importance. */
export const SARDINE_PRESIDENT_STYLE: ClipStyle = {
  id: 'sardine-president',
  tempo: 0.8,
  breath: { rate: 0.85, depth: 0.012 },
  idle: 0.8,
  talk: { tempo: 0.8, amplitude: 1 },
  wave: { tempo: 0.45, side: 1, lift: 0.9 },
  react: 0.9,
  locomotion: 'swim',
  hop: { height: 1, crouch: 1, hopsIn: 3, hopsOut: 2 },
  fidgets: ['puff', 'look'],
  fidgetGap: { min: 5, max: 10 },
  posture: { chest: -0.08, head: -0.05 },
};

/** The Hamour: an unhurried grouper. Swims rather than hops, flutters its fins, yawns. */
export const HAMOUR_STYLE: ClipStyle = {
  id: 'hamour',
  tempo: 0.9,
  breath: { rate: 0.9, depth: 0.01 },
  idle: 1,
  talk: { tempo: 0.9, amplitude: 1 },
  // It shows the visitor its -X flank (three-quarter on), so that fin waves.
  wave: { tempo: 0.8, side: -1, lift: 0.9 },
  react: 1,
  locomotion: 'swim',
  hop: { height: 1, crouch: 1, hopsIn: 3, hopsOut: 2 },
  fidgets: ['yawn', 'look'],
  fidgetGap: { min: 5, max: 10 },
  posture: { chest: 0, head: 0 },
};

/** The style a rig plays with when it names none. */
export const DEFAULT_CLIP_STYLE: ClipStyle = SPONGEBOB_STYLE;
