import type { IUniform } from 'three';

/**
 * Per-narrator shader inputs, shared by reference with its material and written by
 * `<Narrator>` each frame: `time` the narrator's own clock (seconds, wrapped at
 * `AMBIENT_TIME_PERIOD`, frozen under reduced motion), `talk` the current talk beat 0..1,
 * `swim` the swim effort 0..1+, `bend` a jointed fish's body bend (its tail root's sideways
 * offset, model units: `narrator-jointed.ts`).
 */
export interface NarratorUniforms {
  readonly time: IUniform<number>;
  readonly talk: IUniform<number>;
  readonly swim: IUniform<number>;
  readonly bend: IUniform<number>;
}

export const createNarratorUniforms = (): NarratorUniforms => ({
  time: { value: 0 },
  talk: { value: 0 },
  swim: { value: 0 },
  bend: { value: 0 },
});
