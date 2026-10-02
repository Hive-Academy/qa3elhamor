import { Canvas } from '@react-three/fiber';
import { DiveCamera, DiveProvider, DiveScroll } from '@qa3elhamor/dive-feature';
import {
  LandmarkLayer,
  LandmarkNav,
  LandmarkOverlays,
  LandmarkProvider,
} from '@qa3elhamor/landmarks-feature';
import type { ComponentProps, ReactNode } from 'react';
import {
  QUALITY_PROFILES,
  profilePixelRatio,
  shouldAntialias,
} from '@qa3elhamor/world-domain';
import {
  OceanWorld,
  QualityMonitor,
  QualityProvider,
  QualityReadout,
  assetUrl,
  readDeviceCapabilities,
  usePrefersReducedMotion,
  useQuality,
} from '@qa3elhamor/world-feature';
import { buildAmbientLife } from './ambient.config';
import { DiveAudioMix } from './audio/dive-audio-mix';
import { SiteCredits } from './credits';
import { FrameFreeze } from './frame-freeze';
import { SceneCredits } from './scene-credits';
import { DepthGauge } from './depth-gauge';
import { buildDivePath } from './dive.config';
import { DIVE_CONFIG, LANDMARKS, SITE, TOUR } from '../site.config';
import { InWorldAtmosphere } from './in-world/in-world-atmosphere';
import { OceanBeaconLabel } from './ocean-text/ocean-beacon-label';
import {
  OceanTextProvider,
  useOceanText,
} from './ocean-text/ocean-text-context';
import { oceanTextAllowed } from './ocean-text/ocean-text-mode';
import { inWorldAvailable } from './in-world/in-world-mode';
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
import { DiveFailureBoundary, useCanvasGuard } from './page-view/dive-guard';
import { SiteTelemetry, trackQualityTier } from './telemetry';
import { useLocale } from './i18n/locale-context';
import { CHROME_COPY } from './i18n/ui-strings';
import {
  TourCaption,
  TourCaptionScene,
  TourControls,
  TourDirector,
  TourIntro,
  TourIntroScene,
  TourProvider,
  TourReplay,
  introStyle,
  tourStops,
  useTourSetup,
} from './tour';

/*
 * The 3D dive: everything that imports three, R3F or drei. Loaded on demand by
 * `dive-shell-loader.tsx` only when the presentation is the dive, so the page view and a
 * browser without WebGL never download it. The scene note, the skip link and the language
 * switch stay in the entry (`app.tsx`) and are on screen before this chunk arrives.
 */

/** Resolved once: the manifest owns the path, Vite owns the deploy base. */
const ENVIRONMENT_URL = assetUrl('environment', import.meta.env.BASE_URL);

/** Built and validated once per page load from `DIVE_CONFIG` (`site.config.ts`). */
const DIVE_PATH = buildDivePath();
const CAMERA_START = DIVE_PATH.pointAt(0);

/** Fish, the Hamour and kelp, fitted to the dive once per page load (`ambient.config.ts`). */
const AMBIENT_LIFE = buildAmbientLife(DIVE_PATH);

/** Built and validated once per page load from `landmarks.config.ts`, against the dive. */
const LANDMARK_REGISTRY = buildLandmarkRegistry();

/** The cinematic tour's stops (`TOUR`, site.config.ts): every landmark in dive order by default. */
const TOUR_STOPS = tourStops(TOUR, LANDMARKS, (waypoint) =>
  DIVE_PATH.progressOf(waypoint),
);

/**
 * Joins the landmark kernel to the dive camera. Must sit inside `<DiveProvider>`. `inWorld`
 * off (reduced motion, low tier, no WebGL) opens in-world landmarks in their dialog instead.
 */
function Landmarks({
  inWorld,
  children,
}: {
  readonly inWorld: boolean;
  readonly children: ReactNode;
}) {
  const camera = useDiveLandmarkCamera();
  const { locale } = useLocale();
  return (
    <LandmarkProvider
      registry={LANDMARK_REGISTRY}
      camera={camera}
      locale={locale}
      inWorld={inWorld}
      onLandmarkEvent={reportLandmarkEvent}
    >
      {children}
    </LandmarkProvider>
  );
}

/** The landmarks, their beacons' names drawn as underwater text in ocean text mode. */
function OceanLandmarkLayer(
  props: Omit<ComponentProps<typeof LandmarkLayer>, 'beaconLabel'>,
) {
  const { on } = useOceanText();
  return (
    <LandmarkLayer {...props} beaconLabel={on ? OceanBeaconLabel : null} />
  );
}

export interface DiveShellProps {
  /** The canvas failed: renderer creation, a scene error, or a context that never came back. */
  readonly onDiveFailure: () => void;
}

/**
 * The dive under `<QualityProvider>`. The tier's profile gates the pixel ratio, particles,
 * caustics, texture filtering, beacon occlusion and ambient life; `?quality=low|medium|high`
 * pins it.
 *
 * The page is a tall native scroll track (`<DiveScroll>`) under a fixed canvas: scrolling
 * moves the camera down the dive, which replaces `OceanWorld`'s orbit controls.
 * Landmarks (`landmarks.config.ts`) render as `OceanWorld` children in scene-world units; the
 * kernel drives the camera through the dive and opens overlays in the DOM, outside the canvas.
 */
export function DiveShell({ onDiveFailure }: DiveShellProps) {
  return (
    <QualityProvider onSettled={trackQualityTier}>
      <Dive onDiveFailure={onDiveFailure} />
    </QualityProvider>
  );
}

function Dive({ onDiveFailure }: DiveShellProps) {
  const reducedMotion = usePrefersReducedMotion();
  const quality = useQuality();
  const canvasGuard = useCanvasGuard(onDiveFailure);
  const { locale } = useLocale();
  const words = CHROME_COPY[locale];
  const tour = useTourSetup(TOUR_STOPS);
  // The 3D title over the water, or a flat card (reduced motion, a page that started low).
  const intro = introStyle({ reducedMotion, tier: quality.initialTier });

  return (
    <DiveProvider path={DIVE_PATH} reducedMotion={reducedMotion}>
      {/* The dive's words as underwater SDF text and painted signage, where motion and the tier
          allow and once the font is in (`ocean-text/`); the HTML text everywhere else. */}
      <OceanTextProvider
        allowed={oceanTextAllowed({ reducedMotion, tier: quality.tier })}
        anisotropy={quality.profile.anisotropy}
      >
        <SiteTelemetry />
        {/* The ambient sound follows the depth (`audio/`); narrators duck it while they talk. */}
        <DiveAudioMix />
        <Landmarks
          inWorld={inWorldAvailable({
            reducedMotion,
            tier: quality.tier,
            webgl: readDeviceCapabilities().webgl,
          })}
        >
          {/* The cinematic tour (`tour/`, docs/tour.md): the intro, the hands-free journey and its
            controls. Narrated visits read it as their autoplay. */}
          <TourProvider store={tour.store} entry={tour.entry}>
            {/* First in the dive's DOM: Tab reaches the intro's choices right after the entry's
              chrome (it takes no focus by itself). */}
            <TourIntro style={intro} />
            <div
              className="stage"
              data-quality-tier={quality.tier}
              data-quality-settled={quality.settled}
            >
              {/* A scene error, a renderer the GPU refuses or a lost context hands the visitor
              to the page view instead of a blank stage (`page-view/dive-guard.tsx`). */}
              <DiveFailureBoundary onFailure={onDiveFailure}>
                <Canvas
                  className="ocean-canvas"
                  dpr={profilePixelRatio(
                    quality.profile,
                    window.devicePixelRatio,
                  )}
                  // The context is created once, so MSAA follows the tier the page started at
                  // (`shouldAntialias`); later downgrades shed pixels, particles and caustics instead.
                  gl={canvasGuard.renderer({
                    antialias: shouldAntialias(
                      QUALITY_PROFILES[quality.initialTier],
                      window.devicePixelRatio,
                    ),
                    powerPreference: 'high-performance',
                  })}
                  onCreated={canvasGuard.onCreated}
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
                    config={SITE.ocean}
                    controls={false}
                    quality={quality.profile}
                    ambientLife={AMBIENT_LIFE}
                    assetBaseUrl={import.meta.env.BASE_URL}
                  >
                    <OceanLandmarkLayer
                      useModel={useLandmarkModel}
                      evictModel={evictLandmarkModel}
                      scenes={LANDMARK_SCENES}
                      reducedMotion={reducedMotion}
                      beaconOcclusion={quality.profile.beaconOcclusion}
                    />
                    <SceneCredits />
                  </OceanWorld>
                  <DiveCamera />
                  {intro === 'cinematic' && <TourIntroScene />}
                  <TourCaptionScene />
                  <QualityMonitor />
                  <FrameFreeze />
                </Canvas>
              </DiveFailureBoundary>
            </div>

            <DepthGauge />
            <SiteCredits />
            <LandmarkNav label={words.landmarksNav} />
            <DiveScroll screens={DIVE_CONFIG.screens} />
            <InWorldAtmosphere />
            <LandmarkOverlays
              overlays={LANDMARK_OVERLAYS}
              closeLabel={words.dialogClose}
              returnLabel={words.returnToDive}
            />
            <TourDirector reducedMotion={reducedMotion} />
            <TourCaption />
            <TourControls />
            <TourReplay />
            {import.meta.env.DEV && <QualityReadout />}
          </TourProvider>
        </Landmarks>
      </OceanTextProvider>
    </DiveProvider>
  );
}

export default DiveShell;
