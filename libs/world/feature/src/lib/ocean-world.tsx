import { QUALITY_PROFILES, type QualityProfile } from '@qa3elhamor/world-domain';
import { OrbitControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import type { IUniform, Object3D } from 'three';
import { AMBIENT_LIFE_DEFAULTS, type AmbientLifeConfig } from './ambient-config.js';
import { AmbientLife } from './ambient-life.js';
import {
  CAUSTICS_TIME_PERIOD,
  createCausticsTexture,
  createCausticsUniforms,
  updateCausticsUniforms,
} from './caustics-material.js';
import {
  OCEAN_ENVIRONMENT_DEFAULTS,
  resolveOceanConfig,
  type OceanEnvironmentConfig,
  type OceanEnvironmentOverrides,
} from './ocean-config.js';
import { OceanFloor } from './ocean-floor.js';
import { OceanLights } from './ocean-lights.js';
import { OceanParticles } from './ocean-particles.js';
import { PARTICLE_TIME_PERIOD } from './particle-field.js';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion.js';
import { WATER_VOLUME, WORLD_SCALE, WorldScaleProvider, WorldSpace, type Vec3 } from './world-space.js';

/** Frames longer than this (tab switch, GC pause) do not jump the water forward. */
const MAX_FRAME_SECONDS = 0.1;

/** Where the orbit camera starts and looks, in world units. */
export const OCEAN_CAMERA_START: Vec3 = [26, 14, 34];
export const OCEAN_CAMERA_TARGET: Vec3 = [0, 3, 0];

export interface OceanWorldProps {
  /** Public URL of the environment GLB. */
  readonly environmentUrl: string;
  /** Partial overrides of `OCEAN_ENVIRONMENT_DEFAULTS`, merged section by section. */
  readonly config?: OceanEnvironmentOverrides;
  /**
   * Per-device budgets (see `QUALITY_PROFILES`, usually `useQuality().profile`): particle
   * counts win over `config.particles`, and caustics on/off, caustics texture resolution and
   * texture anisotropy come from here. Defaults to the high tier.
   */
  readonly quality?: QualityProfile;
  /**
   * Scene-world to world multiplier: the one source of the scene's scale. It is provided to
   * the map and to `children` through context (`useWorldScale`, `useSceneToWorld`).
   */
  readonly worldScale?: number;
  /**
   * Orbit controls bounded to the water volume. Turn off when another rig (dive-camera)
   * owns the camera.
   */
  readonly controls?: boolean;
  /**
   * Called when the environment model cannot be loaded; the ocean keeps rendering without
   * it. Defaults to a console error.
   */
  readonly onEnvironmentError?: (error: unknown, url: string) => void;
  /**
   * Fish schools, the Hamour and kelp (`AMBIENT_LIFE_DEFAULTS` when omitted; null for none).
   * How much of it renders is `quality.ambientLife`'s call.
   */
  readonly ambientLife?: AmbientLifeConfig | null;
  /** Deploy base URL (Vite's `BASE_URL`) for models `ambientLife.characters` places. */
  readonly assetBaseUrl?: string;
  /** Scene-world content (landmarks), mounted inside the same `<WorldSpace>` as the map. */
  readonly children?: ReactNode;
}

interface WaterClockProps {
  readonly time: IUniform<number>;
  readonly causticsTime: IUniform<number>;
  readonly config: OceanEnvironmentConfig;
}

/**
 * Advances the shared shader clocks. Writes two numbers per frame and allocates nothing. Both
 * clocks wrap at periods their shaders are built to repeat on, so a page left open for days
 * never loses float32 precision and the wrap is invisible.
 */
function WaterClock({ time, causticsTime, config }: WaterClockProps) {
  const reducedMotion = usePrefersReducedMotion();
  const motionScale = reducedMotion ? config.reducedMotionScale : 1;
  const causticsSpeed = config.caustics.speed;

  useFrame((_, delta) => {
    const step = Math.min(delta, MAX_FRAME_SECONDS) * motionScale;
    time.value = (time.value + step) % PARTICLE_TIME_PERIOD;
    causticsTime.value = (causticsTime.value + step * causticsSpeed) % CAUSTICS_TIME_PERIOD;
  });

  return null;
}

/**
 * The deep-ocean atmosphere: exponential fog, the seabed map with projected caustics, drifting
 * plankton and bubbles, ambient life (fish schools, the Hamour, kelp rooted on the loaded
 * seabed; see `AmbientLife`), and the ambient light rig. Render inside an R3F `<Canvas>`.
 *
 * GPU resources created here (caustics texture, particle geometry and materials) are built
 * in `useMemo` and disposed by an effect keyed to the same object. React's StrictMode may
 * invoke those initialisers twice and discard one result; three.js allocates GPU memory only
 * when an object is first rendered, so a discarded instance holds none and is simply
 * garbage-collected. The expensive CPU part (the caustics pattern) is cached per page.
 */
export function OceanWorld({
  environmentUrl,
  config: overrides,
  quality = QUALITY_PROFILES.high,
  worldScale = WORLD_SCALE,
  controls = true,
  onEnvironmentError,
  ambientLife = AMBIENT_LIFE_DEFAULTS,
  assetBaseUrl,
  children,
}: OceanWorldProps) {
  // The loaded seabed, for ambient life to root on.
  const [ground, setGround] = useState<Object3D | null>(null);

  const { plankton, bubbles } = quality.particles;
  const config = useMemo(() => {
    const particleCount = plankton + bubbles;
    const bubbleShare = particleCount > 0 ? bubbles / particleCount : undefined;
    const tiered: OceanEnvironmentOverrides = {
      ...overrides,
      particles: { ...overrides?.particles, ...(bubbleShare === undefined ? {} : { bubbleShare }) },
    };
    return resolveOceanConfig(tiered, particleCount);
  }, [overrides, plankton, bubbles]);

  // One uniform set per mount, so the caustics clock survives a tier change. The texture is
  // rebuilt only when the tier changes its resolution, and swapped into the live uniform.
  // Config values are written into the uniforms by the layout effects, before the first frame.
  const { enabled: causticsEnabled, resolution: causticsResolution } = quality.caustics;
  const causticsTexture = useMemo(() => createCausticsTexture(causticsResolution), [causticsResolution]);
  const [causticsUniforms] = useState(() =>
    createCausticsUniforms(causticsTexture, OCEAN_ENVIRONMENT_DEFAULTS.caustics)
  );
  const particleTime = useMemo<IUniform<number>>(() => ({ value: 0 }), []);

  useLayoutEffect(() => {
    causticsUniforms.uCausticsMap.value = causticsTexture;
  }, [causticsUniforms, causticsTexture]);
  useLayoutEffect(
    () => updateCausticsUniforms(causticsUniforms, config.caustics),
    [causticsUniforms, config.caustics]
  );
  useEffect(() => () => causticsTexture.dispose(), [causticsTexture]);

  return (
    <WorldScaleProvider scale={worldScale}>
      <color attach="background" args={[config.fog.color]} />
      <fogExp2 attach="fog" args={[config.fog.color, config.fog.density]} />
      <OceanLights config={config.lights} />
      <WaterClock
        time={particleTime}
        causticsTime={causticsUniforms.uCausticsTime}
        config={config}
      />

      <WorldSpace>
        <OceanFloor
          url={environmentUrl}
          caustics={causticsEnabled ? causticsUniforms : null}
          anisotropy={quality.anisotropy}
          onError={onEnvironmentError}
          onLoad={setGround}
        />
        {children}
      </WorldSpace>

      <OceanParticles config={config.particles} time={particleTime} />
      {ambientLife && (
        <AmbientLife
          config={ambientLife}
          budget={quality.ambientLife}
          tier={quality.tier}
          ground={ground}
          assetBaseUrl={assetBaseUrl}
        />
      )}

      {controls && (
        <OrbitControls
          makeDefault
          target={[...OCEAN_CAMERA_TARGET]}
          enableDamping
          enablePan={false}
          minDistance={6}
          maxDistance={(WATER_VOLUME.max[0] - WATER_VOLUME.min[0]) * 0.45}
          maxPolarAngle={Math.PI * 0.47}
          minPolarAngle={Math.PI * 0.12}
        />
      )}
    </WorldScaleProvider>
  );
}
