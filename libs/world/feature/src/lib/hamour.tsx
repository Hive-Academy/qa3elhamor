import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Matrix4, Quaternion, Vector3, type Camera, type Group, type IUniform } from 'three';
import type { HamourConfig } from './ambient-config.js';
import { createHamourGeometry, createHamourMaterial } from './hamour-model.js';
import {
  advancePatrol,
  createPatrolLoop,
  type ViewClearance,
  nearestLoopFraction,
  viewClearanceOffset,
  wrapFraction,
} from './hamour-patrol.js';

export interface HamourProps {
  readonly config: HamourConfig;
  /** Shared ambient clock: drives the body wave. */
  readonly time: IUniform<number>;
  /** 1 normally; the reduced-motion scale otherwise (0 holds it still, near the camera). */
  readonly motionScale: number;
}

const MAX_FRAME = 0.1;
const UP = new Vector3(0, 1, 0);
/** How far ahead on the loop it looks to set its heading, world units. */
const LOOK_AHEAD = 2.5;
/** Beyond this distance from the camera the fog hides it, so it may be moved. */
const HIDDEN_DISTANCE = 34;
/** Narrowest the clearance cone gets on a portrait screen, as a share of the configured one. */
const MIN_PORTRAIT_SHARE = 0.45;

/**
 * The clearance cone scaled to the frame: on a portrait screen the horizontal field of view
 * is narrower than the cone, which would keep the Hamour out of frame altogether, so the cone
 * narrows with the aspect ratio (the landmark still owns the middle of the frame).
 */
function fitClearance(base: ViewClearance, camera: Camera, out: { -readonly [K in keyof ViewClearance]: ViewClearance[K] }): void {
  const aspect = (camera as { aspect?: number }).aspect;
  const share = typeof aspect === 'number' && aspect < 1 ? Math.max(MIN_PORTRAIT_SHARE, aspect) : 1;
  out.minDistance = base.minDistance;
  out.distance = base.distance;
  out.radius = base.radius * share;
  out.slope = base.slope * share;
}

interface PatrolRuntime {
  u: number;
  cameraU: number;
  started: boolean;
  swim: number;
  readonly point: Vector3;
  readonly ahead: Vector3;
  readonly forward: Vector3;
  readonly offset: Vector3;
  readonly targetOffset: { x: number; y: number; z: number };
  readonly look: Matrix4;
  readonly heading: Quaternion;
  readonly clearance: { minDistance: number; distance: number; radius: number; slope: number };
}

/**
 * The Hamour (grouper), the creature the trend is named after: one draw call, patrolling its
 * loop near the visitor (see `advancePatrol`) and pushed out of the cone in front of the camera
 * so it never blocks a framed landmark (see `viewClearanceOffset`). Swims with a vertex-shader
 * body wave whose strength follows its speed. Allocates nothing per frame.
 */
export function Hamour({ config, time, motionScale }: HamourProps) {
  const group = useRef<Group>(null);
  const loop = useMemo(() => createPatrolLoop(config.patrol), [config.patrol]);
  const swim = useMemo<IUniform<number>>(() => ({ value: 0.6 }), []);
  const geometry = useMemo(() => createHamourGeometry(), []);
  const material = useMemo(() => createHamourMaterial({ time, swim }), [time, swim]);
  const runtime = useRef<PatrolRuntime>({
    u: 0,
    cameraU: 0,
    started: false,
    swim: 0.6,
    point: new Vector3(),
    ahead: new Vector3(),
    forward: new Vector3(),
    offset: new Vector3(),
    targetOffset: { x: 0, y: 0, z: 0 },
    look: new Matrix4(),
    heading: new Quaternion(),
    clearance: { ...config.viewClearance },
  });

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ camera }, delta) => {
    const body = group.current;
    if (!body || !loop) return;
    const r = runtime.current;
    const dt = Math.min(Math.max(delta, 0), MAX_FRAME);
    const { tuning } = config;

    const cameraPosition = camera.position;
    camera.getWorldDirection(r.forward);
    const cameraU = nearestLoopFraction(
      loop,
      cameraPosition.x,
      cameraPosition.y,
      cameraPosition.z,
      r.started ? r.cameraU : undefined
    );
    r.cameraU = cameraU;

    let snapped = !r.started;
    if (!r.started) {
      r.u = wrapFraction(cameraU + tuning.lead / loop.length);
      r.started = true;
    } else {
      const previous = r.u;
      // Out of sight: far into the fog, or behind the camera.
      const dx = body.position.x - cameraPosition.x;
      const dy = body.position.y - cameraPosition.y;
      const dz = body.position.z - cameraPosition.z;
      const hidden =
        dx * dx + dy * dy + dz * dz > HIDDEN_DISTANCE * HIDDEN_DISTANCE ||
        dx * r.forward.x + dy * r.forward.y + dz * r.forward.z < 0;
      const step = advancePatrol(r.u, cameraU, loop, dt * motionScale, tuning, hidden);
      r.u = step.u;
      snapped = step.speed === 0 && step.u !== previous;
      if (step.speed > 0) r.swim += (step.speed / tuning.cruiseSpeed - r.swim) * (1 - Math.exp(-dt * 1.5));
    }

    loop.curve.getPointAt(r.u, r.point);
    loop.curve.getPointAt(wrapFraction(r.u + LOOK_AHEAD / loop.length), r.ahead);
    // A slow bob, so a pause never looks like a freeze-frame.
    r.point.y = Math.max(config.minY, r.point.y + Math.sin(time.value * 0.4) * 0.3);

    fitClearance(config.viewClearance, camera, r.clearance);
    viewClearanceOffset(r.point.x, r.point.y, r.point.z, cameraPosition, r.forward, r.clearance, r.targetOffset);
    const ease = snapped ? 1 : 1 - Math.exp(-dt * 2.5);
    r.offset.x += (r.targetOffset.x - r.offset.x) * ease;
    r.offset.y += (r.targetOffset.y - r.offset.y) * ease;
    r.offset.z += (r.targetOffset.z - r.offset.z) * ease;
    body.position.copy(r.point).add(r.offset);

    // Heading: along the loop, pitch halved so it cruises rather than dives.
    r.ahead.sub(r.point);
    r.ahead.y *= 0.5;
    if (r.ahead.lengthSq() > 1e-8) {
      r.ahead.add(body.position);
      r.look.lookAt(r.ahead, body.position, UP);
      r.heading.setFromRotationMatrix(r.look);
      if (snapped) body.quaternion.copy(r.heading);
      else body.quaternion.slerp(r.heading, 1 - Math.exp(-dt * 1.8));
    }

    swim.value = Math.min(1.6, Math.max(0.45, 0.35 + 0.5 * r.swim));
  });

  if (!loop) return null;
  return (
    <group ref={group} scale={config.length}>
      <mesh geometry={geometry} material={material} />
    </group>
  );
}
