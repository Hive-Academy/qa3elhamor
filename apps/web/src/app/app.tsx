import { Canvas } from '@react-three/fiber';
import { DiveCamera, DiveProvider, DiveScroll } from '@qa3elhamor/dive-feature';
import { WEB_ASSETS, initialLoadBudgetBytes } from '@qa3elhamor/world-domain';
import { OceanWorld, assetUrl, usePrefersReducedMotion } from '@qa3elhamor/world-feature';
import { DepthGauge } from './depth-gauge';
import { DIVE_CONFIG, buildDivePath } from './dive.config';

/** Resolved once: the manifest owns the path, Vite owns the deploy base. */
const ENVIRONMENT_URL = assetUrl('environment', import.meta.env.BASE_URL);

/** Built and validated once per page load from `dive.config.ts`. */
const DIVE_PATH = buildDivePath();
const CAMERA_START = DIVE_PATH.pointAt(0);

/**
 * Composition root. `apps/web` is the only place allowed to wire content into scene
 * libraries, which keeps a fork's changes confined to data.
 *
 * The page is a tall native scroll track (`<DiveScroll>`) under a fixed canvas: scrolling
 * moves the camera down the dive, which replaces `OceanWorld`'s orbit controls.
 * `landmark-kernel` mounts landmarks as `OceanWorld` children (scene-world units, see
 * `WORLD_SCALE`) and drives the camera through `useDive()`.
 */
export function App() {
  const budgetMb = (initialLoadBudgetBytes() / (1024 * 1024)).toFixed(1);
  const reducedMotion = usePrefersReducedMotion();

  return (
    <DiveProvider path={DIVE_PATH} reducedMotion={reducedMotion}>
      <div className="stage">
        <Canvas
          className="ocean-canvas"
          dpr={[1, 2]}
          // At a device pixel ratio of 1.5 or more the canvas already renders 2.25-4x the
          // fragments, which smooths edges on its own; MSAA on top would double the cost where
          // it is least visible. quality-tiers takes over this policy.
          gl={{ antialias: window.devicePixelRatio < 1.5, powerPreference: 'high-performance' }}
          camera={{ position: [...CAMERA_START], fov: 55, near: 0.1, far: 400 }}
          aria-hidden="true"
        >
          <OceanWorld environmentUrl={ENVIRONMENT_URL} controls={false} />
          <DiveCamera />
        </Canvas>
      </div>

      <aside className="scene-note">
        <h1 lang="ar" dir="rtl">
          قاع الهامور
        </h1>
        <p>Scroll to dive.</p>
        <p className="scene-note__meta">
          {WEB_ASSETS.length} assets manifested, {budgetMb} MB initial-load budget.
        </p>
      </aside>

      <DepthGauge />
      <DiveScroll screens={DIVE_CONFIG.screens} />
    </DiveProvider>
  );
}

export default App;
