import type { ShippedCredit } from '@qa3elhamor/world-domain';
// Type-only: brings R3F's JSX intrinsic elements (`group`, `mesh`, ...) into scope.
import type {} from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { NOTICE } from './notice-layout.js';
import { DEFAULT_NOTICE_TEXT, createNoticeTexture, type NoticeText } from './notice-texture.js';
import {
  DEFAULT_PLAQUE_FACING,
  DEFAULT_PLAQUE_POSITION,
  DEFAULT_PLAQUE_WIDTH,
  plaqueYaw,
  type PlaqueVec3,
} from './plaque-placement.js';

export interface CreditsPlaqueProps {
  /** The credits to show; `shippedCredits()` from `@qa3elhamor/world-domain`. */
  readonly credits: readonly ShippedCredit[];
  /** Foot of the posts on the seabed, in scene-world units. */
  readonly position?: PlaqueVec3;
  /** A point the board turns to face (horizontally), in scene-world units. */
  readonly facing?: PlaqueVec3;
  /** Board width in scene-world units. */
  readonly width?: number;
  readonly text?: NoticeText;
}

// Board-local geometry: the notice face is FACE_W x FACE_H, its centre FACE_Y above the ground.
const FACE_H = 1;
const FACE_W = (NOTICE.width / NOTICE.height) * FACE_H;
const FACE_Y = 1.05;
const POST_SINK = 0.25;
const POST_TOP = FACE_Y + FACE_H / 2 + 0.08;
const POST_LENGTH = POST_TOP + POST_SINK;

const PAINT = { frame: '#2f5d5a', cap: '#7a4b2a', post: '#5b4632' } as const;

/**
 * The municipal notice board that carries the models' CC-BY-4.0 credits in the scene: two
 * posts, a painted frame, a rusty cap and a paper notice drawn from `credits` at runtime.
 * Procedural geometry plus one canvas texture, so it adds no asset and no font download.
 *
 * The notice is unlit (`meshBasicMaterial`) so it stays readable in the deep-water lighting,
 * but fogged, so it sits in the water rather than on top of it.
 */
export function CreditsPlaque({
  credits,
  position = DEFAULT_PLAQUE_POSITION,
  facing = DEFAULT_PLAQUE_FACING,
  width = DEFAULT_PLAQUE_WIDTH,
  text = DEFAULT_NOTICE_TEXT,
}: CreditsPlaqueProps) {
  const texture = useMemo(() => createNoticeTexture(credits, text), [credits, text]);
  useEffect(() => () => texture?.dispose(), [texture]);

  const scale = width / FACE_W;
  const yaw = plaqueYaw(position, facing);

  return (
    <group position={[...position]} rotation={[0, yaw, 0]} scale={scale} name="credits-plaque">
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * (FACE_W / 2 - 0.08), POST_TOP - POST_LENGTH / 2, -0.07]}
        >
          <cylinderGeometry args={[0.045, 0.055, POST_LENGTH, 10]} />
          <meshStandardMaterial color={PAINT.post} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, FACE_Y, -0.02]}>
        <boxGeometry args={[FACE_W + 0.12, FACE_H + 0.12, 0.05]} />
        <meshStandardMaterial color={PAINT.frame} roughness={0.8} />
      </mesh>
      <mesh position={[0, FACE_Y + FACE_H / 2 + 0.09, 0]}>
        <boxGeometry args={[FACE_W + 0.26, 0.07, 0.16]} />
        <meshStandardMaterial color={PAINT.cap} roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh position={[0, FACE_Y, 0.006]}>
        <planeGeometry args={[FACE_W, FACE_H]} />
        {texture ? (
          <meshBasicMaterial map={texture} toneMapped={false} />
        ) : (
          <meshBasicMaterial color="#f3ead3" toneMapped={false} />
        )}
      </mesh>
    </group>
  );
}
