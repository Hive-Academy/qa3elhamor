import { Canvas } from '@react-three/fiber';
import { WEB_ASSETS, initialLoadBudgetBytes } from '@qa3elhamor/world-domain';
import { OCEAN_CAMERA_START, OceanWorld, assetUrl } from '@qa3elhamor/world-feature';

/** Resolved once: the manifest owns the path, Vite owns the deploy base. */
const ENVIRONMENT_URL = assetUrl('environment', import.meta.env.BASE_URL);

/**
 * Composition root. `apps/web` is the only place allowed to wire content into scene
 * libraries, which keeps a fork's changes confined to data.
 *
 * The scene is the `world-environment` atmosphere with orbit controls bounded to the water
 * volume; `dive-camera` replaces the controls, `landmark-kernel` mounts landmarks as
 * `OceanWorld` children (scene-world units, see `WORLD_SCALE`).
 */
export function App() {
  const budgetMb = (initialLoadBudgetBytes() / (1024 * 1024)).toFixed(1);

  return (
    <div className="shell">
      <Canvas
        className="ocean-canvas"
        dpr={[1, 2]}
        // At a device pixel ratio of 1.5 or more the canvas already renders 2.25-4x the
        // fragments, which smooths edges on its own; MSAA on top would double the cost where
        // it is least visible. quality-tiers takes over this policy.
        gl={{ antialias: window.devicePixelRatio < 1.5, powerPreference: 'high-performance' }}
        camera={{ position: [...OCEAN_CAMERA_START], fov: 55, near: 0.1, far: 400 }}
        aria-hidden="true"
      >
        <OceanWorld environmentUrl={ENVIRONMENT_URL} />
      </Canvas>

      <aside className="scene-note">
        <h1 lang="ar" dir="rtl">
          قاع الهامور
        </h1>
        <p>Drag to look around, scroll to swim closer.</p>
        <p className="scene-note__meta">
          {WEB_ASSETS.length} assets manifested, {budgetMb} MB initial-load budget.
        </p>
      </aside>
    </div>
  );
}

export default App;
