import { describe, expect, it } from 'vitest';
import { createNarratorAnimator, stepNarratorAnimator, type NarratorAnimatorState } from './narrator-animator.js';
import { NARRATOR_CAST } from './narrator-cast.js';
import {
  CRAB_CLERK_STYLE,
  HAMOUR_STYLE,
  PATRICK_STYLE,
  SARDINE_PRESIDENT_STYLE,
  SPONGEBOB_STYLE,
  type ClipStyle,
} from './narrator-clip-style.js';
import { FIDGET_SECONDS, NARRATOR_FIDGET_IDS } from './narrator-clips.js';
import { PATRICK_RIG, SPONGEBOB_RIG, createRigPose, type NarratorRigSpec } from './narrator-rig.js';

const STYLES: readonly ClipStyle[] = [SPONGEBOB_STYLE, PATRICK_STYLE, CRAB_CLERK_STYLE, SARDINE_PRESIDENT_STYLE, HAMOUR_STYLE];

describe('ClipStyle', () => {
  it.each(STYLES.map((s) => [s.id, s] as const))('%s is sane: positive tempos, amplitudes in range, a real fidget set', (_id, style) => {
    for (const v of [style.tempo, style.breath.rate, style.talk.tempo, style.wave.tempo]) expect(v).toBeGreaterThan(0);
    for (const v of [style.talk.amplitude, style.react]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(style.hop.hopsIn).toBeGreaterThanOrEqual(1);
    expect(style.hop.hopsOut).toBeGreaterThanOrEqual(1);
    expect(style.fidgets.length).toBeGreaterThanOrEqual(2);
    for (const id of style.fidgets) expect(NARRATOR_FIDGET_IDS).toContain(id);
    expect(style.fidgetGap.min).toBeLessThan(style.fidgetGap.max);
    expect(Math.abs(style.wave.side)).toBe(1);
  });

  it('gives each character its own personality', () => {
    expect(
      STYLES.map((s) => ({ id: s.id, tempo: s.tempo, locomotion: s.locomotion, wave: s.wave.side, fidgets: s.fidgets.join(',') }))
    ).toMatchInlineSnapshot(`
      [
        {
          "fidgets": "scratch,bounce,look,hips",
          "id": "spongebob",
          "locomotion": "hop",
          "tempo": 1,
          "wave": -1,
        },
        {
          "fidgets": "doze,belly,look,bounce",
          "id": "patrick",
          "locomotion": "hop",
          "tempo": 0.6,
          "wave": -1,
        },
        {
          "fidgets": "clack,look,bounce",
          "id": "crab-clerk",
          "locomotion": "scuttle",
          "tempo": 1.4,
          "wave": -1,
        },
        {
          "fidgets": "puff,look",
          "id": "sardine-president",
          "locomotion": "swim",
          "tempo": 0.8,
          "wave": 1,
        },
        {
          "fidgets": "yawn,look",
          "id": "hamour",
          "locomotion": "swim",
          "tempo": 0.9,
          "wave": -1,
        },
      ]
    `);
    // Patrick is the slow, heavy one; the crab the quick one; the fish swim.
    expect(PATRICK_STYLE.tempo).toBeLessThan(SPONGEBOB_STYLE.tempo);
    expect(PATRICK_STYLE.hop.height).toBeLessThan(SPONGEBOB_STYLE.hop.height);
    expect(CRAB_CLERK_STYLE.tempo).toBeGreaterThan(SPONGEBOB_STYLE.tempo);
    expect(SARDINE_PRESIDENT_STYLE.posture.chest).toBeLessThan(0);
  });

  /** The fidgets a style plays over a long idle. */
  function fidgetsPlayed(spec: NarratorRigSpec, seconds: number): Set<string> {
    const state: NarratorAnimatorState = createNarratorAnimator(spec, 11);
    const pose = createRigPose();
    const seen = new Set<string>();
    for (let i = 0; i < seconds * 20; i++) {
      stepNarratorAnimator(state, { dt: 0.05, phase: 'present', presence: 1, talk: 0, waving: false, poke: 0, reducedMotion: false, hold: null }, spec, pose);
      if (state.fidget) seen.add(state.fidget);
    }
    return seen;
  }

  it('plays only its own fidgets', () => {
    for (const spec of [SPONGEBOB_RIG, PATRICK_RIG, NARRATOR_CAST['crab-clerk'].rig, NARRATOR_CAST.hamour.rig]) {
      const own = new Set<string>(spec.style?.fidgets ?? []);
      const played = fidgetsPlayed(spec, 120);
      expect(played.size).toBeGreaterThan(0);
      for (const id of played) expect(own.has(id), `${spec.id} played ${id}`).toBe(true);
    }
  });

  it('times every fidget', () => {
    for (const id of NARRATOR_FIDGET_IDS) expect(FIDGET_SECONDS[id]).toBeGreaterThan(0.5);
  });
});
