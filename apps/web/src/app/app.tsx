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
  readDeviceCapabilities,
  usePrefersReducedMotion,
  useQuality,
} from '@qa3elhamor/world-feature';
import { buildAmbientLife } from './ambient.config';
import { SceneCredits, SiteCredits } from './credits';
import { DepthGauge } from './depth-gauge';
import { DIVE_CONFIG, buildDivePath } from './dive.config';
import { InWorldAtmosphere } from './in-world/in-world-atmosphere';
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
import {
  DiveFailureBoundary,
  PageView,
  ReadAsPageLink,
  buildPageContent,
  hrefFor,
  useCanvasGuard,
  usePresentation,
} from './page-view';
import { SiteTelemetry, trackQualityTier } from './telemetry';
import { LanguageToggle } from './i18n/language-toggle';
import { formatNumber } from './i18n/locale';
import { LocaleProvider, useLocale } from './i18n/locale-context';
import { CHROME_COPY } from './i18n/ui-strings';
import { fillCopy } from './overlays/overlay-copy';

/** Resolved once: the manifest owns the path, Vite owns the deploy base. */
const ENVIRONMENT_URL = assetUrl('environment', import.meta.env.BASE_URL);

/** Built and validated once per page load from `dive.config.ts`. */
const DIVE_PATH = buildDivePath();
const CAMERA_START = DIVE_PATH.pointAt(0);

/** Fish, the Hamour and kelp, fitted to the dive once per page load (`ambient.config.ts`). */
const AMBIENT_LIFE = buildAmbientLife(DIVE_PATH);

/** Built and validated once per page load from `landmarks.config.ts`, against the dive. */
const LANDMARK_REGISTRY = buildLandmarkRegistry();

/** The page view's content, from the same content module; built on first use, once. */
let cachedPageContent: ReturnType<typeof buildPageContent> | undefined;
const pageContent = () => (cachedPageContent ??= buildPageContent());

/** Whether this browser can create a WebGL context (probed once, cached by the world library). */
const hasWebgl = () => readDeviceCapabilities().webgl;

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
    <LocaleProvider>
      <Views />
    </LocaleProvider>
  );
}

/** Dive or page (`page-view/presentation.ts`), both in the site's language. */
function Views() {
  const view = usePresentation(hasWebgl);
  const { locale } = useLocale();

  // No WebGL, `?view=page`, the "read it as a page" link, or a dive that broke: the same
  // content as a readable 2D page (`page-view/`).
  if (view.presentation.kind === 'page') {
    return (
      <PageView
        content={pageContent()}
        reason={view.presentation.reason}
        diveHref={hrefFor(window.location, 'dive')}
        onReturnToDive={view.returnToDive}
        focusOnMount={view.switched}
        locale={locale}
      />
    );
  }

  return (
    <QualityProvider onSettled={trackQualityTier}>
      <Site
        onReadAsPage={view.readAsPage}
        onDiveFailure={view.diveFailed}
        returnedFromPage={view.switched}
      />
    </QualityProvider>
  );
}

/**
 * The page under `<QualityProvider>`. The tier's profile gates the pixel ratio, particles,
 * caustics, texture filtering, beacon occlusion and ambient life; `?quality=low|medium|high`
 * pins it.
 */
function Site({
  onReadAsPage,
  onDiveFailure,
  returnedFromPage,
}: {
  /** The visitor chose the page over the dive. */
  readonly onReadAsPage: () => void;
  /** The canvas failed: renderer creation, a scene error, or a context that never came back. */
  readonly onDiveFailure: () => void;
  /** The dive was just switched back to from the page: focus its "read it as a page" link. */
  readonly returnedFromPage: boolean;
}) {
  const budgetMb = initialLoadBudgetBytes() / (1024 * 1024);
  const reducedMotion = usePrefersReducedMotion();
  const quality = useQuality();
  const canvasGuard = useCanvasGuard(onDiveFailure);
  const { locale } = useLocale();
  const words = CHROME_COPY[locale];

  return (
    <DiveProvider path={DIVE_PATH} reducedMotion={reducedMotion}>
      <SiteTelemetry />
      <Landmarks
        inWorld={inWorldAvailable({
          reducedMotion,
          tier: quality.tier,
          webgl: readDeviceCapabilities().webgl,
        })}
      >
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
              dpr={profilePixelRatio(quality.profile, window.devicePixelRatio)}
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
                controls={false}
                quality={quality.profile}
                ambientLife={AMBIENT_LIFE}
                assetBaseUrl={import.meta.env.BASE_URL}
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
          </DiveFailureBoundary>
        </div>

        <aside className="scene-note">
          {/* The district's own name, always Arabic, whatever the site's language. */}
          <h1 lang="ar" dir="rtl">
            قاع الهامور
          </h1>
          <p>{words.sceneNoteLead}</p>
          <ReadAsPageLink
            onActivate={onReadAsPage}
            focusOnMount={returnedFromPage}
            locale={locale}
          />
          <p className="scene-note__meta">
            {fillCopy(words.sceneNoteMeta, {
              count: formatNumber(WEB_ASSETS.length, locale),
              budget: formatNumber(budgetMb, locale, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }),
            })}
          </p>
        </aside>

        <DepthGauge />
        <SiteCredits />
        <LanguageToggle />
        <LandmarkNav label={words.landmarksNav} />
        <DiveScroll screens={DIVE_CONFIG.screens} />
        <InWorldAtmosphere />
        <LandmarkOverlays
          overlays={LANDMARK_OVERLAYS}
          closeLabel={words.dialogClose}
          returnLabel={words.returnToDive}
        />
        {import.meta.env.DEV && <QualityReadout />}
      </Landmarks>
    </DiveProvider>
  );
}

export default App;
