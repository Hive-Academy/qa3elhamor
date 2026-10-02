import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  Color,
  DoubleSide,
  LatheGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
} from 'three';

/** Where it lets go: this far in front of the eye (world units), as the paper was. */
const DEPTH = 2;
/** Seconds to cork and turn upright, then the climb's speed and acceleration (px/s, px/s²). */
const CORK_SECONDS = 0.7;
const RISE_SPEED = 30;
const RISE_ACCEL = 150;
/** Gone once its foot is this far over the top of the screen (px). */
const GONE_MARGIN = 40;
/** World units per second it drifts away from the visitor while it climbs. */
const DRIFT = 0.25;
const TRAIL = 6;

const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);
const easeOut = (t: number): number => 1 - (1 - clamp01(t)) ** 3;

export interface MessageBottleProps {
  /** Bumped for every complaint stamped: a bottle lets go. Null: none. */
  readonly launch: number | null;
  /** Its height on screen as it lets go (CSS px). */
  readonly heightPx: number;
  /** Screen pixels above the viewport centre it starts at: where the paper was. */
  readonly liftPx: number;
  readonly reducedMotion: boolean;
}

interface Flight {
  readonly id: number;
  start: number | null;
  readonly origin: Vector3;
  readonly up: Vector3;
  readonly right: Vector3;
  readonly back: Vector3;
  readonly facing: Quaternion;
  perPx: number;
  viewHalf: number;
}

const forward = new Vector3();
const tilt = new Quaternion();
const lean = new Quaternion();
const axisZ = new Vector3(0, 0, 1);
const axisX = new Vector3(1, 0, 0);

/**
 * The complaint, rolled up in a corked bottle, floating up to the surface. It appears where the
 * paper rolled up (in front of the visitor), lying on its side like the roll, turns neck-up and
 * climbs, rocking in the current with a trail of bubbles, until it leaves the top of the screen.
 */
export function MessageBottle({
  launch,
  heightPx,
  liftPx,
  reducedMotion,
}: MessageBottleProps) {
  const group = useRef<Group>(null);
  const trail = useRef<(Mesh | null)[]>([]);
  const flight = useRef<Flight | null>(null);

  const glassGeometry = useMemo(
    () =>
      new LatheGeometry(
        [
          [0, -0.5],
          [0.19, -0.5],
          [0.215, -0.47],
          [0.215, 0.08],
          [0.17, 0.2],
          [0.085, 0.28],
          [0.075, 0.42],
          [0.088, 0.44],
          [0.088, 0.47],
        ].map(([x, y]) => new Vector2(x, y)),
        24,
      ),
    [],
  );
  const glass = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#a8e6d4',
        emissive: new Color('#1d4a44'),
        transparent: true,
        opacity: 0.42,
        roughness: 0.08,
        metalness: 0.1,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );
  const paper = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#f3e6c4',
        emissive: new Color('#3a3020'),
        roughness: 0.9,
      }),
    [],
  );
  const ribbon = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#8c3b2a',
        emissive: new Color('#2e0e08'),
      }),
    [],
  );
  const cork = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#b98a52',
        emissive: new Color('#2a1a0a'),
        roughness: 0.95,
        flatShading: true,
      }),
    [],
  );
  const bubble = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#d8f4ff',
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
    [],
  );
  const bubbleGeometry = useMemo(() => new SphereGeometry(1, 10, 8), []);
  useEffect(
    () => () => {
      for (const disposable of [
        glassGeometry,
        glass,
        paper,
        ribbon,
        cork,
        bubble,
        bubbleGeometry,
      ])
        disposable.dispose();
    },
    [glassGeometry, glass, paper, ribbon, cork, bubble, bubbleGeometry],
  );

  useFrame(({ camera, size, clock }) => {
    const g = group.current;
    if (!g) return;
    if (launch === null) {
      flight.current = null;
      g.visible = false;
      return;
    }
    const now = clock.elapsedTime;
    if (flight.current?.id !== launch) {
      // Fixed in the world where it lets go: the camera's sway does not drag it along.
      camera.updateMatrixWorld();
      const focal = camera.projectionMatrix.elements[5] * (size.height / 2);
      if (!(Number.isFinite(focal) && focal > 0)) return;
      const perPx = DEPTH / focal;
      camera.getWorldDirection(forward);
      const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      flight.current = {
        id: launch,
        start: now,
        origin: camera.position
          .clone()
          .addScaledVector(forward, DEPTH)
          .addScaledVector(up, liftPx * perPx),
        up,
        right,
        back: forward.clone().negate(),
        facing: camera.quaternion.clone(),
        perPx,
        viewHalf: size.height / 2,
      };
    }
    const f = flight.current;
    if (!f || f.start === null) return;
    const t = now - f.start;
    const climb = Math.max(t - CORK_SECONDS * 0.5, 0);
    const risePx = reducedMotion
      ? 0
      : RISE_SPEED * climb + 0.5 * RISE_ACCEL * climb * climb;
    const swayPx = reducedMotion ? 0 : 16 * Math.sin(t * 2.1) * clamp01(t);
    const height = heightPx * f.perPx;
    const drift = DRIFT * climb;
    // How high it shows on screen, seen from further away as it drifts off.
    const shownPx = (risePx * DEPTH) / (DEPTH + drift);
    if (shownPx - heightPx / 2 > f.viewHalf - liftPx + GONE_MARGIN) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position
      .copy(f.origin)
      .addScaledVector(f.up, risePx * f.perPx)
      .addScaledVector(f.right, swayPx * f.perPx)
      // Drifting a little away as it goes up, towards the light.
      .addScaledVector(f.back, -drift);
    // On its side like the rolled paper, then neck-up, rocking.
    const upright = easeOut(t / CORK_SECONDS);
    const roll =
      (1 - upright) * (Math.PI / 2) +
      (reducedMotion ? 0 : 0.22 * Math.sin(t * 1.7) * upright);
    g.quaternion
      .copy(f.facing)
      .multiply(tilt.setFromAxisAngle(axisZ, roll))
      // Leaning its neck a little towards the visitor, so the cork reads.
      .multiply(lean.setFromAxisAngle(axisX, 0.25));
    g.scale.setScalar(height * (0.75 + 0.25 * easeOut(t / 0.35)));
    glass.opacity = 0.42 * clamp01(t / 0.25);

    trail.current.forEach((mesh, i) => {
      if (!mesh) return;
      const age = (t * 1.6 + i / TRAIL) % 1;
      mesh.visible = !reducedMotion && climb > 0;
      mesh.position.set(
        Math.sin(i * 2.3 + t * 3) * 0.08,
        -0.55 - age * 0.9,
        0.05 * Math.cos(i),
      );
      mesh.scale.setScalar(0.025 + 0.03 * (1 - age));
    });
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={glassGeometry} material={glass} renderOrder={2} />
      {/* The rolled complaint inside, with the Bureau's red band round it. */}
      <mesh material={paper} position={[0, -0.18, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.5, 16]} />
      </mesh>
      <mesh material={ribbon} position={[0, -0.18, 0]}>
        <cylinderGeometry args={[0.136, 0.136, 0.07, 16]} />
      </mesh>
      <mesh material={cork} position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.07, 0.08, 0.12, 10]} />
      </mesh>
      {Array.from({ length: TRAIL }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            trail.current[i] = mesh;
          }}
          geometry={bubbleGeometry}
          material={bubble}
        />
      ))}
    </group>
  );
}
