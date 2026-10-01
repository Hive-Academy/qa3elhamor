import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3, type Group } from 'three';
import { tickAmbientClock } from './ambient-clock.js';
import {
  NARRATOR_CAST,
  measureNarratorGeometry,
  measureNarratorModel,
  narratorHeight,
  narratorMotion,
  resolveNarratorCast,
  type NarratorCast,
} from './narrator-cast.js';
import {
  NARRATOR_MAX_FRAME,
  createNarratorMotionState,
  createNarratorPose,
  stepNarrator,
  yawToward,
} from './narrator-motion.js';
import { createNarratorUniforms } from './narrator-uniforms.js';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion.js';
import type { Vec3 } from './world-space.js';

/** Default turn limit around `restYaw` when facing the camera: about 70 degrees. */
export const NARRATOR_DEFAULT_MAX_TURN = 1.2;

export interface NarratorProps {
  /**
   * A built-in cast id, or a loaded static model (`{ object, height?, clone? }`). An unknown id
   * plays `NARRATOR_FALLBACK_CAST` (one console warning). A model whose `object` is still
   * null / undefined renders nothing and swims in once it arrives. A model's object is mounted
   * directly: never give the same object to two narrators at once (use `clone: true`).
   */
  readonly cast: NarratorCast;
  /** Its post (feet / belly at this point), in the parent's space. */
  readonly position: Vec3;
  /** True while a line is being delivered: squash-and-stretch, hop, mouth / claws. */
  readonly talking: boolean;
  /**
   * True: swims in to its post (then `onSettled`). False: swims away, then renders nothing
   * (then `onExited`); the caller may unmount it after that. Mounting with false renders nothing.
   */
  readonly present: boolean;
  /** Overrides the user's prefers-reduced-motion setting. */
  readonly reducedMotion?: boolean;
  /** Multiplies the cast's rendered height (see `narratorHeight`). */
  readonly scale?: number;
  /** The heading facing is limited around (radians about +Y; 0 faces +Z). */
  readonly restYaw?: number;
  /** How far it may turn from `restYaw` to face the camera, radians. */
  readonly maxTurn?: number;
  /** Swim-in start relative to `position`, x rendered height (default: per cast). */
  readonly enterFrom?: Vec3;
  /** Swim-away end relative to `position`, x rendered height (default: per cast). */
  readonly exitTo?: Vec3;
  /** Called once each time it arrives at its post (immediately under reduced motion). */
  readonly onSettled?: () => void;
  /** Called once each time it has fully swum away. */
  readonly onExited?: () => void;
}

/**
 * A narrator: any character, procedural cast or a static model, brought to life without bones.
 * It swims in, turns to the visitor (yaw-limited), idles with a bob and a sway, squashes and
 * stretches in a speech rhythm while `talking`, and swims away when no longer `present`. All
 * motion is time based (critically damped springs, a wrapped clock), allocation-free per frame.
 * Reduced motion: a static pose facing the visitor, with only a gentle scale pulse while it talks.
 *
 * Procedural cast geometry and materials are created per narrator and disposed on unmount; a
 * model narrator's object belongs to the caller and is never disposed here.
 */
export function Narrator(props: NarratorProps) {
  const { present, onExited } = props;
  const [exited, setExited] = useState(!present);
  useEffect(() => {
    if (present) setExited(false);
  }, [present]);
  // The boundary: an unknown id plays the fallback cast (warned once); a model still loading
  // renders nothing, and mounts (swimming in from its start) once its object arrives.
  const cast = resolveNarratorCast(props.cast);
  if (typeof cast !== 'string' && !cast.object) return null;
  if (exited && !present) return null;
  return (
    <NarratorBody
      {...props}
      cast={cast}
      onExited={() => {
        setExited(true);
        onExited?.();
      }}
    />
  );
}

const finite = (v: number, fallback = 0): number => (Number.isFinite(v) ? v : fallback);

function NarratorBody({
  cast,
  position,
  talking,
  present,
  reducedMotion,
  scale = 1,
  restYaw = 0,
  maxTurn = NARRATOR_DEFAULT_MAX_TURN,
  enterFrom,
  exitTo,
  onSettled,
  onExited,
}: NarratorProps) {
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const uniforms = useMemo(createNarratorUniforms, []);

  const castId = typeof cast === 'string' ? cast : null;
  const source = typeof cast === 'string' ? null : (cast.object ?? null);
  const cloneModel = typeof cast !== 'string' && cast.clone === true;
  // A clone shares geometry and materials with the cached original, so it disposes nothing.
  const model = useMemo(() => (source && cloneModel ? source.clone(true) : source), [source, cloneModel]);
  const modelHeight = typeof cast === 'string' ? undefined : cast.height;
  const mesh = useMemo(() => (castId ? NARRATOR_CAST[castId].create(uniforms) : null), [castId, uniforms]);
  useEffect(
    () => () => {
      mesh?.geometry.dispose();
      mesh?.material.dispose();
    },
    [mesh]
  );

  const bounds = useMemo(
    // A clone measures as its (cached) source does.
    () => (mesh ? measureNarratorGeometry(mesh.geometry) : source ? measureNarratorModel(source) : null),
    [mesh, source]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on what the height depends on, not the cast object's identity
  const height = useMemo(() => narratorHeight(cast, scale), [castId, source, modelHeight, scale]);
  const motion = useMemo(() => narratorMotion(cast), [cast]);
  const fit = bounds ? height / bounds.height : 1;

  const state = useRef(createNarratorMotionState());
  const pose = useRef(createNarratorPose());
  const camera = useRef(new Vector3());

  const post: Vec3 = [finite(position[0]), finite(position[1]), finite(position[2])];
  const from = enterFrom ?? motion.enterFrom;
  const to = exitTo ?? motion.exitTo;

  useFrame((frame, delta) => {
    const anchor = root.current;
    const animated = body.current;
    if (!anchor || !animated) return;

    const eye = frame.camera.getWorldPosition(camera.current);
    if (anchor.parent) anchor.parent.worldToLocal(eye);
    const dx = eye.x - post[0];
    const dz = eye.z - post[2];
    const cameraYaw = dx * dx + dz * dz > 1e-10 ? yawToward(dx, dz) : Number.NaN;

    const p = pose.current;
    const event = stepNarrator(
      state.current,
      { dt: delta, present, talking, reducedMotion: reduced, cameraYaw, restYaw, maxTurn, height, enterFrom: from, exitTo: to },
      motion,
      p
    );

    animated.visible = p.visible;
    animated.position.set(p.offsetX, p.offsetY, p.offsetZ);
    animated.rotation.set(p.pitch, p.yaw, p.roll, 'YXZ');
    animated.scale.set(p.scaleX, p.scaleY, p.scaleZ);
    uniforms.talk.value = p.talk;
    uniforms.swim.value = p.swim;
    if (!reduced) tickAmbientClock(uniforms.time, Math.min(Math.max(delta, 0), NARRATOR_MAX_FRAME));

    if (event === 'settled') onSettled?.();
    else if (event === 'exited') onExited?.();
  });

  if (!bounds) return null;
  return (
    <group ref={root} position={post}>
      <group ref={body} visible={false}>
        <group scale={fit} position={[-bounds.centreX * fit, -bounds.minY * fit, -bounds.centreZ * fit]}>
          {mesh ? <mesh geometry={mesh.geometry} material={mesh.material} /> : model && <primitive object={model} />}
        </group>
      </group>
    </group>
  );
}
