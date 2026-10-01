import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { HitShape } from '@qa3elhamor/landmarks-feature';
import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
  type Group,
  type Object3D,
} from 'three';
import {
  DEFAULT_IN_WORLD_TIMING,
  IN_WORLD_DISTANCE_FACTOR,
  bobAt,
  clamp01,
  createBob,
  emergeProgress,
  facingPoint,
  htmlScaleFor,
  leaveProgress,
  mix,
  worldPerPixel,
  type InWorldTiming,
} from './in-world-pose';
import './in-world-card.css';

export type InWorldCardPhase = 'emerging' | 'settled' | 'leaving';

/** What the card's DOM is rendered with. */
export interface InWorldCardState {
  readonly phase: InWorldCardPhase;
}

export interface InWorldCardProps {
  /** True while the landmark is open (`LandmarkSceneProps.phase === 'focused'`). */
  readonly open: boolean;
  /** Where the DOM goes: the stage's scene slot (`LandmarkSceneProps.sceneLayer`). */
  readonly sceneLayer: HTMLElement | null;
  /** The landmark's hit volume in its frame (`LandmarkSceneProps.bounds`): the card's door. */
  readonly bounds: HitShape;
  /** Height of the door on the model, as a fraction of its bounds (0 = ground). Default 0.2. */
  readonly doorHeight?: number;
  /** World units between the camera and the settled card. Default 2. */
  readonly depth?: number;
  /** Screen pixels the settled card sits above the viewport centre (clear of the stage bar). */
  readonly liftPx?: number;
  readonly timing?: InWorldTiming;
  /** The card's DOM: real, selectable, focusable HTML. */
  readonly children: (state: InWorldCardState) => ReactNode;
}

/**
 * Real DOM, in the world: a card that floats out of its landmark's door (the side of the model
 * facing the camera), tumbling slightly, and settles in front of the camera, bobbing gently in
 * the current. Rendered with drei `<Html transform>` into the landmark stage's scene slot, which
 * sits outside the aria-hidden canvas inside the landmark's named region, so the DOM stays
 * reachable by keyboard and screen readers.
 *
 * Crispness: the settled card is posed at the exact scale where one CSS pixel is one screen
 * pixel (`htmlScaleFor`), so the browser rasterises its text at its own size. Pointing at the
 * card or focusing inside it calms the bob, holding it perfectly still while it is read.
 * Responsive size is the DOM's job (CSS `min()` against the viewport): the card "leans in"
 * until it fills a phone, at the same pixel-exact scale.
 *
 * After closing it flies back into the door, inert, then unmounts. Mount it from a landmark
 * scene component (`LandmarkSceneProps`), so it renders in the landmark's frame.
 */
export function InWorldCard({
  open,
  sceneLayer,
  bounds,
  doorHeight = 0.2,
  depth = 2,
  liftPx = 28,
  timing = DEFAULT_IN_WORLD_TIMING,
  children,
}: InWorldCardProps) {
  const [phase, setPhase] = useState<InWorldCardPhase | null>(
    open ? 'emerging' : null,
  );
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setPhase(open ? 'emerging' : phase === null ? null : 'leaving');
  }

  const group = useRef<Group>(null);
  const surface = useRef<HTMLDivElement>(null);
  const calm = useRef(false);
  const portal = useMemo(() => ({ current: sceneLayer }), [sceneLayer]);

  if (!phase || !sceneLayer) return null;

  return (
    <group ref={group} matrixAutoUpdate={false}>
      {/* Before the <Html>, so the pose is written before drei reads it in the same frame. */}
      <CardPose
        target={group}
        surface={surface}
        calm={calm}
        phase={phase}
        bounds={bounds}
        doorHeight={doorHeight}
        depth={depth}
        liftPx={liftPx}
        timing={timing}
        onSettled={() => setPhase((p) => (p === 'emerging' ? 'settled' : p))}
        onGone={() => setPhase((p) => (p === 'leaving' ? null : p))}
      />
      <Html
        transform
        portal={portal as RefObject<HTMLElement>}
        distanceFactor={IN_WORLD_DISTANCE_FACTOR}
        zIndexRange={[10, 0]}
        wrapperClass="in-world-card-anchor"
      >
        <div
          ref={surface}
          className="in-world-surface"
          data-phase={phase}
          // Leaving: on its way back into the door, out of reach and out of the a11y tree.
          inert={phase === 'leaving'}
          aria-hidden={phase === 'leaving' ? true : undefined}
          onPointerEnter={() => (calm.current = true)}
          onPointerLeave={(event) => {
            const inside = event.currentTarget.contains(document.activeElement);
            calm.current = inside;
          }}
          onFocus={() => (calm.current = true)}
          onBlur={(event) => {
            const next = event.relatedTarget;
            calm.current =
              next instanceof Node && event.currentTarget.contains(next);
          }}
        >
          {children({ phase })}
        </div>
      </Html>
    </group>
  );
}

interface CardPoseProps {
  readonly target: RefObject<Group | null>;
  readonly surface: RefObject<HTMLDivElement | null>;
  readonly calm: RefObject<boolean>;
  readonly phase: InWorldCardPhase;
  readonly bounds: HitShape;
  readonly doorHeight: number;
  readonly depth: number;
  readonly liftPx: number;
  readonly timing: InWorldTiming;
  readonly onSettled: () => void;
  readonly onGone: () => void;
}

/** Apparent size at the door, as a fraction of the settled size. */
const DOOR_APPARENT = 0.05;
/** Yaw and roll (radians) the card tumbles out with; both unwind to zero as it settles. */
const TUMBLE_YAW = 0.9;
const TUMBLE_ROLL = -0.3;

const camPos = new Vector3();
const camQuat = new Quaternion();
const camScale = new Vector3();
const forward = new Vector3();
const up = new Vector3();
const right = new Vector3();
const settled = new Vector3();
const pos = new Vector3();
const local = new Vector3();
const offset = new Vector3();
const tilt = new Euler(0, 0, 0, 'YXZ');
const tiltQuat = new Quaternion();
const quat = new Quaternion();
const scaleVec = new Vector3();
const world = new Matrix4();
const bobScratch = createBob();

interface Motion {
  phase: InWorldCardPhase | null;
  since: number;
  progress: number;
  /** Progress when the current emergence began: above 0 for a re-open mid-way back in. */
  emergeFrom: number;
  leaveFrom: number;
  stillness: number;
  last: number;
  door: Vector3 | null;
}

/** The door: the model's side facing the camera, `doorHeight` up its bounds, in world space. */
function doorOf(
  frame: Object3D,
  bounds: HitShape,
  doorHeight: number,
  camera: Vector3,
): Vector3 {
  const [cx, cy, cz] = bounds.center;
  const radius =
    bounds.kind === 'box'
      ? Math.min(bounds.size[0], bounds.size[2]) / 2
      : bounds.radius;
  const height = bounds.kind === 'box' ? bounds.size[1] : bounds.radius * 2;
  const viewer = frame.worldToLocal(local.copy(camera));
  const p = facingPoint({ x: cx, z: cz }, { x: viewer.x, z: viewer.z }, radius);
  return frame.localToWorld(
    new Vector3(p.x, cy - height / 2 + height * doorHeight, p.z),
  );
}

function CardPose({
  target,
  surface,
  calm,
  phase,
  bounds,
  doorHeight,
  depth,
  liftPx,
  timing,
  onSettled,
  onGone,
}: CardPoseProps) {
  const motion = useRef<Motion>({
    phase: null,
    since: 0,
    progress: 0,
    emergeFrom: 0,
    leaveFrom: 1,
    stillness: 0,
    last: 0,
    door: null,
  });

  useFrame((state) => {
    const group = target.current;
    const frame = group?.parent;
    if (!group || !frame) return;
    const { camera, size, clock } = state;
    const now = clock.elapsedTime;
    const m = motion.current;
    const dt = Math.min(Math.max(now - m.last, 0), 0.1);
    m.last = now;

    camera.updateMatrixWorld();
    camera.matrixWorld.decompose(camPos, camQuat, camScale);
    frame.updateWorldMatrix(true, false);

    if (m.phase !== phase) {
      if (phase === 'leaving') m.leaveFrom = m.progress;
      if (phase === 'emerging') {
        // Re-opened while flying back in: turn round from where it is, from the same door.
        const reversing = m.phase === 'leaving' && m.progress > 0;
        m.emergeFrom = reversing ? m.progress : 0;
        if (!reversing) m.door = doorOf(frame, bounds, doorHeight, camPos);
      }
      if (!m.door) m.door = doorOf(frame, bounds, doorHeight, camPos);
      m.phase = phase;
      m.since = now;
    }
    const elapsed = now - m.since;

    let progress: number;
    if (phase === 'leaving') {
      progress = leaveProgress(elapsed, m.leaveFrom, timing);
      if (elapsed >= timing.leave) onGone();
    } else if (phase === 'settled') {
      progress = 1;
    } else {
      progress = emergeProgress(elapsed, timing, m.emergeFrom);
      if (progress >= 1) onSettled();
    }
    m.progress = progress;

    // Calm while pointed at or focused: ease the bob out over about half a second.
    m.stillness += ((calm.current ? 1 : 0) - m.stillness) * clamp01(dt * 5);
    const bob = bobAt(now, (1 - m.stillness) * progress ** 4, bobScratch);

    const focal = camera.projectionMatrix.elements[5] * (size.height / 2);
    // A collapsed or not-yet-laid-out viewport: keep the last good pose rather than write
    // Infinity or NaN into the matrix.
    if (!(Number.isFinite(focal) && focal > 0)) return;
    forward.set(0, 0, -1).applyQuaternion(camQuat);
    up.set(0, 1, 0).applyQuaternion(camQuat);
    right.set(1, 0, 0).applyQuaternion(camQuat);
    const perPx = worldPerPixel(depth, focal);
    settled
      .copy(camPos)
      .addScaledVector(forward, depth)
      .addScaledVector(up, (liftPx + bob.y) * perPx)
      .addScaledVector(right, bob.x * perPx);

    const door = m.door ?? settled;
    pos.copy(door).lerp(settled, progress);
    // A little lift on the way, as if the current carried it up.
    const arc = Math.sin(Math.PI * progress) * door.distanceTo(settled) * 0.12;
    pos.addScaledVector(up, arc);

    const along = Math.max(offset.copy(pos).sub(camPos).dot(forward), 0.05);
    const scale = htmlScaleFor(
      along,
      focal,
      mix(DOOR_APPARENT, 1, progress),
    );
    if (!(scale > 0) || !Number.isFinite(pos.x + pos.y + pos.z)) return;
    tilt.set(0, (1 - progress) * TUMBLE_YAW + bob.yaw, (1 - progress) * TUMBLE_ROLL + bob.roll);
    quat.copy(camQuat).multiply(tiltQuat.setFromEuler(tilt));
    world.compose(pos, quat, scaleVec.setScalar(scale));

    group.matrix.copy(frame.matrixWorld).invert().multiply(world);
    group.matrixWorldNeedsUpdate = true;

    const el = surface.current;
    if (el) el.style.opacity = String(clamp01(progress * 3));
  });

  return null;
}
