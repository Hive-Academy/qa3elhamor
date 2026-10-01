import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Vec3 } from './view-layout';

export interface TalkBubblesProps {
  /** Where they rise from: in front of the narrator's mouth, world units. */
  readonly from: Vec3;
  /** The narrator's rendered height: sets their size and how high they rise. */
  readonly size: number;
  /** True while a line is typed: a stream of little bubbles. False: the last ones float off. */
  readonly talking: boolean;
  readonly reducedMotion: boolean;
}

const COUNT = 10;
/** Seconds one bubble takes to rise and pop. */
const LIFE = 1.7;

const matrix = new Matrix4();
const position = new Vector3();
const scale = new Vector3();
const still = new Quaternion();

interface Bubble {
  born: number;
  alive: boolean;
  seed: number;
}

/**
 * A narrator's breath underwater: little bubbles rising from its mouth while it talks, wobbling
 * as they go, each a little bigger near the top. One instanced draw. Nothing under reduced motion.
 */
export function TalkBubbles({
  from,
  size,
  talking,
  reducedMotion,
}: TalkBubblesProps) {
  const geometry = useMemo(() => new SphereGeometry(1, 12, 8), []);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color('#d8f6ff'),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        fog: true,
      }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const mesh = useRef<InstancedMesh>(null);
  const bubbles = useRef<Bubble[]>(
    Array.from({ length: COUNT }, (_, i) => ({
      born: -10,
      alive: false,
      seed: i * 1.37,
    })),
  );
  const nextAt = useRef(0);

  useFrame(({ clock }) => {
    const instanced = mesh.current;
    if (!instanced) return;
    const now = clock.elapsedTime;
    if (talking && !reducedMotion && now >= nextAt.current) {
      const free = bubbles.current.find((b) => !b.alive);
      if (free) {
        free.alive = true;
        free.born = now;
        free.seed = (free.seed * 7.31 + 0.53) % 6.283;
      }
      nextAt.current = now + 0.16 + Math.abs(Math.sin(now * 3.1)) * 0.14;
    }
    let shown = 0;
    for (const b of bubbles.current) {
      const age = (now - b.born) / LIFE;
      if (!b.alive || age >= 1) {
        b.alive = false;
        continue;
      }
      const rise = age * size * 1.6;
      const wobble = Math.sin(age * 9 + b.seed) * size * 0.06;
      position.set(
        from[0] + wobble + Math.cos(b.seed) * size * 0.08,
        from[1] + rise,
        from[2] + Math.sin(b.seed) * size * 0.08,
      );
      const r = size * (0.025 + 0.03 * age) * (age < 0.1 ? age / 0.1 : 1);
      matrix.compose(position, still, scale.setScalar(r));
      instanced.setMatrixAt(shown, matrix);
      shown += 1;
    }
    instanced.count = shown;
    instanced.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, COUNT]}
      count={0}
      frustumCulled={false}
      raycast={() => undefined}
    />
  );
}
