import { Canvas } from '@react-three/fiber';
import { DiveCamera, DiveProvider, DiveScroll } from '@qa3elhamor/dive-feature';
import {
  LandmarkLayer,
  LandmarkNav,
  LandmarkOverlays,
  LandmarkProvider,
} from '@qa3elhamor/landmarks-feature';
import type { ReactNode } from 'react';
import {
  QUALITY_PROFILES,
  WEB_ASSETS,
  initialLoadBudgetBytes,
  profilePixelRatio,
  shouldAntialias,
} from '@qa3elhamor/world-domain';
import {
  OceanWorld,
  QualityMonitor,
  QualityProvider,
  QualityReadout,
  assetUrl,
  usePrefersReducedMotion,
  useQuality,
} from '@qa3elhamor/world-feature';
import { SceneCredits, SiteCredits } from './credits';
import { DepthGauge } from './depth-gauge';
import { DIVE_CONFIG, buildDivePath } from './dive.config';
import {
  evictLandmarkModel,
  reportLandmarkEvent,
  useDiveLandmarkCamera,
  useLandmarkModel,
} from './landmark-ports';
import {
  LANDMARK_OVERLAYS,
  LANDMARK_SCENES,
  buildLandmarkRegistry,
} from './landmarks.config';
import { SiteTelemetry, trackQualityTier } from './telemetry';

/** Resolved once: the manifest owns the path, Vite owns the deploy base. */
const ENVIRONMENT_URL = assetUrl('environment', import.meta.env.BASE_URL);

/** Built and validated once per page load from `dive.config.ts`. */
const DIVE_PATH = buildDivePath();
const CAMERA_START = DIVE_PATH.pointAt(0);

/** Built and validated once per page load from `landmarks.config.ts`, against the dive. */
const LANDMARK_REGISTRY = buildLandmarkRegistry();

/** Joins the landmark kernel to the dive camera. Must sit inside `<DiveProvider>`. */
function Landmarks({ children }: { readonly children: ReactNode }) {
  const camera = useDiveLandmarkCamera();
  return (
    <LandmarkProvider
      registry={LANDMARK_REGISTRY}
      camera={camera}
      onLandmarkEvent={reportLandmarkEvent}
    >
      {children}
    </LandmarkProvider>
  );
}

/**
 * Composition root. `apps/web` is the only place allowed to wire content into scene
 * libraries, which keeps a fork's changes confined to data.
 *
 * The page is a tall native scroll track (`<DiveScroll>`) under a fixed canvas: scrolling
 * moves the camera down the dive, which replaces `OceanWorld`'s orbit controls.
 * Landmarks (`landmarks.config.ts`) render as `OceanWorld` children in scene-world units; the
 * kernel drives the camera through the dive and opens overlays in the DOM, outside the canvas.
 */
export function App() {
  return (
    <QualityProvider onSettled={trackQualityTier}>
      <Site />
    </QualityProvider>
  );
}

/**
 * The page under `<QualityProvider>`. The tier's profile gates the pixel ratio, particles,
 * caustics, texture filtering and beacon occlusion; `?quality=low|medium|high` pins it.
 */
function Site() {
  const budgetMb = (initialLoadBudgetBytes() / (1024 * 1024)).toFixed(1);
  const reducedMotion = usePrefersReducedMotion();
  const quality = useQuality();

  return (
    <DiveProvider path={DIVE_PATH} reducedMotion={reducedMotion}>
      <SiteTelemetry />
      <Landmarks>
        <div
          className="stage"
          data-quality-tier={quality.tier}
          data-quality-settled={quality.settled}
        >
          <Canvas
            className="ocean-canvas"
            dpr={profilePixelRatio(quality.profile, window.devicePixelRatio)}
            // The context is created once, so MSAA follows the tier the page started at
            // (`shouldAntialias`); later downgrades shed pixels, particles and caustics instead.
            gl={{
              antialias: shouldAntialias(
                QUALITY_PROFILES[quality.initialTier],
                window.devicePixelRatio,
              ),
              powerPreference: 'high-performance',
            }}
            camera={{
              position: [...CAMERA_START],
              fov: 55,
              near: 0.1,
              far: 400,
            }}
            aria-hidden="true"
          >
            <OceanWorld
              environmentUrl={ENVIRONMENT_URL}
              controls={false}
              quality={quality.profile}
            >
              <LandmarkLayer
                useModel={useLandmarkModel}
                evictModel={evictLandmarkModel}
                scenes={LANDMARK_SCENES}
                reducedMotion={reducedMotion}
                beaconOcclusion={quality.profile.beaconOcclusion}
              />
              <SceneCredits />
            </OceanWorld>
            <DiveCamera />
            <QualityMonitor />
          </Canvas>
        </div>

        <aside className="scene-note">
          <h1 lang="ar" dir="rtl">
            قاع الهامور
          </h1>
          <p>Scroll to dive.</p>
          <p className="scene-note__meta">
            {WEB_ASSETS.length} assets manifested, {budgetMb} MB initial-load
            budget.
          </p>
        </aside>

        <DepthGauge />
        <SiteCredits />
        <LandmarkNav />
        <DiveScroll screens={DIVE_CONFIG.screens} />
        <LandmarkOverlays overlays={LANDMARK_OVERLAYS} />
        {import.meta.env.DEV && <QualityReadout />}
      </Landmarks>
    </DiveProvider>
  );
}

export default App;
