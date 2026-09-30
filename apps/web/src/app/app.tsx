import { Canvas } from '@react-three/fiber';
import { WEB_ASSETS, initialLoadBudgetBytes } from '@qa3elhamor/world-domain';

/**
 * Foundation scaffold.
 *
 * This renders a fogged, empty ocean volume to prove the R3F + Vite + Nx pipeline works
 * end to end and that the world manifest resolves across library boundaries. It is NOT the
 * environment — fog density, caustics, bubbles, and the ocean floor are the
 * `world-environment` roadmap item, and the camera dive is `dive-camera`. Both replace this
 * component wholesale.
 *
 * `apps/web` is the composition root: it is the only place allowed to wire content into
 * scene libraries, which is what keeps a fork's changes confined to data.
 */
export function App() {
  const budgetMb = (initialLoadBudgetBytes() / (1024 * 1024)).toFixed(1);

  return (
    <div className="shell">
      <Canvas camera={{ position: [0, 1.5, 6], fov: 55 }}>
        <color attach="background" args={['#0a1e3f']} />
        <fogExp2 attach="fog" args={['#0a1e3f', 0.06]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 8, 4]} intensity={1.2} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
          <planeGeometry args={[60, 60]} />
          <meshStandardMaterial color="#123a5e" />
        </mesh>
      </Canvas>

      <aside className="scaffold-note">
        <h1>قاع الهامور</h1>
        <p>
          Foundation scaffold — {WEB_ASSETS.length} assets manifested, {budgetMb} MB
          initial-load budget. See <code>.ptah/roadmap.md</code> for what comes next.
        </p>
      </aside>
    </div>
  );
}

export default App;
