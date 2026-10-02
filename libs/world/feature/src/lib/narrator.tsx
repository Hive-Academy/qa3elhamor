import { useCursor } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
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
import {
  createNarratorAnimator,
  seedNarratorAnimator,
  stepNarratorAnimator,
  type NarratorAnimatorState,
  type NarratorClipHold,
} from './narrator-animator.js';
import { copyRigPose, createRigPose, rigPoseFinite, type RigPose } from './narrator-rig.js';
import { rigNarratorModel, type RiggedNarrator } from './narrator-skinning.js';
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
  /** A rigged model waves while this is true (a farewell, a passer-by). Others ignore it. */
  readonly waving?: boolean;
  /** A counter: each change makes a rigged model react (a surprised jump). Others ignore it. */
  readonly poke?: number;
  /** Development preview for a rigged model: loop or freeze one clip. Null / omitted in production. */
  readonly hold?: NarratorClipHold | null;
  /**
   * A click or tap on it (a rigged model's hit proxy, a cast's body) while it is shown and
   * staying: the caller typically bumps `poke`. The click goes no further (the landmark behind
   * it does not open), and the cursor is a pointer over it. Omitted: it takes no pointer events.
   */
  readonly onPoke?: () => void;
  /** Its size at `enterFrom` / `exitTo`, a fraction of its own (see `NarratorFrameInput`). */
  readonly enterScale?: number;
  readonly exitScale?: number;
  /**
   * Another narrator's last frame (`snapshot`, same parent space) to take over from, read once
   * at mount: it starts where that one stood, at its size and heading, and (rigged) blends from
   * its pose. Within a few percent of its own height of `position`, it starts already there.
   */
  readonly handOver?: NarratorSnapshot | null;
  /** Written every frame it is shown: where it stands, its heading, size and pose. */
  readonly snapshot?: NarratorSnapshot;
  /** Seeds the idle's variety (fidgets, glances). Default: from `position`. */
  readonly seed?: number;
}

/** A narrator's frame, for handing over to another narrator (`snapshot` / `handOver`). */
export interface NarratorSnapshot {
  /** Its feet, parent units. */
  readonly position: [number, number, number];
  yaw: number;
  /** Its rendered height as shown (its travel scale included), parent units. */
  height: number;
  /** The bones' pose (a rigged model), when `hasPose`. */
  readonly pose: RigPose;
  hasPose: boolean;
  /** Set on every write; cleared by `takeNarratorSnapshot` (or by the owner, when it is stale). */
  fresh: boolean;
}

export const createNarratorSnapshot = (): NarratorSnapshot => ({
  position: [0, 0, 0],
  yaw: 0,
  height: 0,
  pose: createRigPose(),
  hasPose: false,
  fresh: false,
});

/** A copy of `snapshot` if it is fresh (and finite), consuming it; otherwise null. */
export function takeNarratorSnapshot(snapshot: NarratorSnapshot | null | undefined): NarratorSnapshot | null {
  if (!snapshot?.fresh) return null;
  snapshot.fresh = false;
  const [x, y, z] = snapshot.position;
  if (![x, y, z, snapshot.yaw, snapshot.height].every(Number.isFinite) || !(snapshot.height > 0)) return null;
  const copy = createNarratorSnapshot();
  copy.position[0] = x;
  copy.position[1] = y;
  copy.position[2] = z;
  copy.yaw = snapshot.yaw;
  copy.height = snapshot.height;
  copyRigPose(snapshot.pose, copy.pose);
  copy.hasPose = snapshot.hasPose && rigPoseFinite(snapshot.pose);
  return copy;
}

/** Within this much of its height of its post, a hand-over starts it already there. */
const IN_PLACE = 0.08;

/** A stable seed from a post (no `Math.random`): two narrators at different posts differ. */
const seedOf = (p: Vec3): number =>
  (Math.imul(Math.round(p[0] * 1000), 73856093) ^ Math.imul(Math.round(p[1] * 1000), 19349663) ^ Math.imul(Math.round(p[2] * 1000), 83492791)) >>> 0;

/**
 * A narrator: any character, procedural cast or a loaded model. It swims in, turns to the
 * visitor (yaw-limited), idles with a bob and a sway, squashes and stretches in a speech rhythm
 * while `talking`, and swims away when no longer `present`. All motion is time based (critically
 * damped springs, a wrapped clock), allocation-free per frame. Reduced motion: a static pose
 * facing the visitor, with only a gentle scale pulse while it talks.
 *
 * A model with a `rig` also gets bones (skinned at load time, `narrator-skinning.ts`) and plays
 * clips on them (`narrator-animator.ts`): it hops in and waves, breathes and sways while idle,
 * gestures and nods while talking, waves while `waving`, reacts to `poke` and hops away. Under
 * reduced motion it holds its rest pose (arms down).
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
  waving = false,
  poke = 0,
  hold = null,
  onPoke,
  enterScale,
  exitScale,
  handOver,
  snapshot,
  seed,
}: NarratorProps) {
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const uniforms = useMemo(createNarratorUniforms, []);

  const castId = typeof cast === 'string' ? cast : null;
  const source = typeof cast === 'string' ? null : (cast.object ?? null);
  const cloneModel = typeof cast !== 'string' && cast.clone === true;
  const rigSpec = typeof cast === 'string' ? undefined : cast.rig;
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
  // A rigged model skins its own clone (the source is never touched). Any failure falls back to
  // the static model: the rig is resolved here, once, never inside the frame loop.
  const rigged = useMemo<RiggedNarrator | null>(() => {
    if (!source || !rigSpec || !bounds) return null;
    try {
      return rigNarratorModel(source, rigSpec, bounds);
    } catch (error) {
      console.error('Narrator: the model could not be rigged; it plays without bones.', error);
      return null;
    }
  }, [source, rigSpec, bounds]);
  useEffect(() => () => rigged?.dispose(), [rigged]);
  // A clone shares geometry and materials with the cached original, so it disposes nothing.
  const model = useMemo(
    () => (rigged ? rigged.object : source && cloneModel ? source.clone(true) : source),
    [rigged, source, cloneModel]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on what the height depends on, not the cast object's identity
  const height = useMemo(() => narratorHeight(cast, scale), [castId, source, modelHeight, scale]);
  const castMotion = useMemo(() => narratorMotion(cast), [cast]);
  // Once the clips carry the gestures, the body-level squash and bob step back.
  const motion = useMemo(
    () => (rigged?.spec.motion ? { ...castMotion, ...rigged.spec.motion } : castMotion),
    [castMotion, rigged]
  );
  const fit = bounds ? height / bounds.height : 1;

  const state = useRef(createNarratorMotionState());
  const pose = useRef(createNarratorPose());
  const camera = useRef(new Vector3());
  const animator = useRef<{ readonly rig: RiggedNarrator; readonly state: NarratorAnimatorState } | null>(null);
  const rigPose = useRef(createRigPose());

  const post: Vec3 = [finite(position[0]), finite(position[1]), finite(position[2])];
  const from = enterFrom ?? motion.enterFrom;
  const to = exitTo ?? motion.exitTo;
  // A hand-over is read once, at mount: later changes to the prop are ignored.
  const arrival = useRef(handOver ?? null);
  /** The first entry after a hand-over: from where the other narrator stood, at its size. */
  const handEntry = useRef<{ readonly from: Vec3; readonly scale: number } | null>(null);
  const firstSeed = useRef(seed ?? seedOf(post));

  useFrame((frame, delta) => {
    const anchor = root.current;
    const animated = body.current;
    if (!anchor || !animated) return;

    // Made once per rig (a new model or spec starts a fresh animator).
    if (rigged && animator.current?.rig !== rigged)
      animator.current = { rig: rigged, state: createNarratorAnimator(rigged.spec, firstSeed.current) };
    const handed = arrival.current;
    if (handed) {
      arrival.current = null;
      const s = state.current;
      s.yaw.x = handed.yaw;
      s.yaw.v = 0;
      s.initialised = true;
      const rel: Vec3 = [
        (handed.position[0] - post[0]) / height,
        (handed.position[1] - post[1]) / height,
        (handed.position[2] - post[2]) / height,
      ];
      if (Math.hypot(rel[0], rel[1], rel[2]) <= IN_PLACE) s.presence = present ? 1 : 0;
      else handEntry.current = { from: rel, scale: Math.max(0.05, handed.height / height) };
      if (handed.hasPose && animator.current) seedNarratorAnimator(animator.current.state, handed.pose);
    }
    const entry = handEntry.current;

    const eye = frame.camera.getWorldPosition(camera.current);
    if (anchor.parent) anchor.parent.worldToLocal(eye);
    const dx = eye.x - post[0];
    const dz = eye.z - post[2];
    const cameraYaw = dx * dx + dz * dz > 1e-10 ? yawToward(dx, dz) : Number.NaN;

    const p = pose.current;
    const event = stepNarrator(
      state.current,
      {
        dt: delta,
        present,
        talking,
        reducedMotion: reduced,
        cameraYaw,
        restYaw,
        maxTurn,
        height,
        enterFrom: entry?.from ?? from,
        exitTo: to,
        enterScale: entry?.scale ?? enterScale,
        exitScale,
      },
      motion,
      p
    );
    if (event === 'settled') handEntry.current = null;

    animated.visible = p.visible;
    animated.position.set(p.offsetX, p.offsetY, p.offsetZ);
    animated.rotation.set(p.pitch, p.yaw, p.roll, 'YXZ');
    animated.scale.set(p.scaleX, p.scaleY, p.scaleZ);
    uniforms.talk.value = p.talk;
    uniforms.swim.value = p.swim;
    if (!reduced) tickAmbientClock(uniforms.time, Math.min(Math.max(delta, 0), NARRATOR_MAX_FRAME));

    // The bones, in the same frame as the body (so the first visible frame is never the T-pose).
    if (rigged && animator.current) {
      stepNarratorAnimator(
        animator.current.state,
        {
          dt: delta,
          phase: p.phase,
          presence: state.current.presence,
          talk: state.current.talk.x,
          waving,
          poke,
          reducedMotion: reduced,
          hold,
        },
        rigged.spec,
        rigPose.current
      );
      rigged.apply(rigPose.current);
    }

    if (snapshot && p.visible) {
      snapshot.position[0] = post[0] + p.offsetX;
      snapshot.position[1] = post[1] + p.offsetY;
      snapshot.position[2] = post[2] + p.offsetZ;
      snapshot.yaw = p.yaw;
      snapshot.height = height * Math.cbrt(Math.max(0, p.scaleX * p.scaleY * p.scaleZ));
      snapshot.hasPose = rigged !== null && animator.current !== null;
      if (snapshot.hasPose) copyRigPose(rigPose.current, snapshot.pose);
      snapshot.fresh = true;
    }

    if (event === 'settled') onSettled?.();
    else if (event === 'exited') onExited?.();
  });

  // Pointing at it: only while it is shown and staying (not before it swims in, nor while it
  // swims away), and never passed on to what is behind it.
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && present && onPoke !== undefined);
  const reachable = () => present && body.current?.visible === true;
  const pointer = onPoke
    ? {
        onClick: (event: ThreeEvent<MouseEvent>) => {
          if (!reachable()) return;
          event.stopPropagation();
          onPoke();
        },
        onPointerOver: (event: ThreeEvent<PointerEvent>) => {
          if (!reachable()) return;
          event.stopPropagation();
          setHovered(true);
        },
        onPointerOut: () => setHovered(false),
      }
    : {};

  if (!bounds) return null;
  return (
    <group ref={root} position={post} {...pointer}>
      <group ref={body} visible={false}>
        <group scale={fit} position={[-bounds.centreX * fit, -bounds.minY * fit, -bounds.centreZ * fit]}>
          {mesh ? <mesh geometry={mesh.geometry} material={mesh.material} /> : model && <primitive object={model} />}
        </group>
      </group>
    </group>
  );
}
