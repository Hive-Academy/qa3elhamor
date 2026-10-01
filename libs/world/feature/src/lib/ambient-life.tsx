import { assetAllowed, findAsset, type AmbientLifeBudget, type QualityTier } from '@qa3elhamor/world-domain';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import type { Object3D } from 'three';
import { createAmbientClock, tickAmbientClock } from './ambient-clock.js';
import { resolveAmbientLife, type AmbientCharacterPlacement, type AmbientLifeConfig } from './ambient-config.js';
import { assetUrl } from './asset-url.js';
import { createFishGeometry } from './fish-mesh.js';
import { FishSchoolMesh } from './fish-school-mesh.js';
import { Hamour } from './hamour.js';
import { KelpForest } from './kelp-forest.js';
import { ModelErrorBoundary } from './ocean-floor.js';
import { useCompressedModel } from './use-compressed-model.js';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion.js';
import { WorldSpace } from './world-space.js';

/** Frames longer than this (tab switch, GC pause) do not jump the life forward. */
const MAX_FRAME_SECONDS = 0.1;

export interface AmbientLifeProps {
  readonly config: AmbientLifeConfig;
  /** The tier's budget, usually `useQuality().profile.ambientLife`. */
  readonly budget: AmbientLifeBudget;
  /** The current tier: gates `characters` by their manifest `minimumTier`. */
  readonly tier: QualityTier;
  /** The loaded seabed, for rooting kelp; null until it loads. */
  readonly ground: Object3D | null;
  /** Deploy base URL for `characters` models (Vite's `BASE_URL`). */
  readonly assetBaseUrl?: string;
}

/**
 * Fish schools, the patrolling Hamour, the kelp bed and any configured character models.
 * World-unit content, rendered by `OceanWorld` beside the particles; characters go inside a
 * `<WorldSpace>` like landmarks. Draw calls: one per visible school, one for the Hamour, one
 * for the kelp. Everything is fogged by the scene fog and disposed on unmount.
 */
export function AmbientLife({ config, budget, tier, ground, assetBaseUrl = '/' }: AmbientLifeProps) {
  const life = useMemo(() => resolveAmbientLife(config, budget), [config, budget]);
  const reducedMotion = usePrefersReducedMotion();
  const motionScale = reducedMotion ? life.reducedMotionScale : 1;
  const time = useMemo(createAmbientClock, []);
  const fishGeometry = useMemo(() => createFishGeometry(), []);
  useEffect(() => () => fishGeometry.dispose(), [fishGeometry]);

  useFrame((_, delta) => tickAmbientClock(time, Math.min(delta, MAX_FRAME_SECONDS) * motionScale));

  return (
    <>
      {life.fishPerSchool > 0 &&
        life.schools.map((spec, index) => (
          <FishSchoolMesh
            key={`${index}:${life.fishPerSchool}`}
            spec={spec}
            count={life.fishPerSchool}
            neighbourSamples={life.neighbourSamples}
            seed={life.seed * 101 + index}
            geometry={fishGeometry}
            time={time}
            motionScale={motionScale}
          />
        ))}
      {life.hamour && <Hamour config={life.hamour} time={time} motionScale={motionScale} />}
      {life.kelp && <KelpForest kelp={life.kelp} seed={life.seed} ground={ground} time={time} />}
      {life.characters.length > 0 && (
        <WorldSpace>
          {life.characters.map((placement, index) => (
            <AmbientCharacter
              key={`${placement.asset}:${index}`}
              placement={placement}
              tier={tier}
              baseUrl={assetBaseUrl}
            />
          ))}
        </WorldSpace>
      )}
    </>
  );
}

interface AmbientCharacterProps {
  readonly placement: AmbientCharacterPlacement;
  readonly tier: QualityTier;
  readonly baseUrl: string;
}

const reportCharacterError = (error: unknown, url: string): void => {
  console.error(`Ambient character model failed to load from ${url}; skipping it.`, error);
};

/** One configured model, loaded only when its manifest tier allows; a failed load hides only it. */
function AmbientCharacter({ placement, tier, baseUrl }: AmbientCharacterProps) {
  if (!findAsset(placement.asset)) {
    console.warn(`Ambient life config: "${placement.asset}" is not in WEB_ASSETS; not placed.`);
    return null;
  }
  const url = assetAllowed(placement.asset, tier) ? assetUrl(placement.asset, baseUrl) : null;
  if (url === null) return null;
  return (
    <ModelErrorBoundary url={url} onError={reportCharacterError}>
      <Suspense fallback={null}>
        <CharacterModel url={url} placement={placement} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

function CharacterModel({ url, placement }: { readonly url: string; readonly placement: AmbientCharacterPlacement }) {
  const model = useCompressedModel(url);
  return (
    <primitive
      object={model}
      position={[...placement.position]}
      rotation={[0, placement.rotationY ?? 0, 0]}
      scale={placement.scale ?? 1}
    />
  );
}
