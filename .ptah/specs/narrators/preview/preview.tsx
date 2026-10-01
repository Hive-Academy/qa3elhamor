// Throwaway narrator preview.
//   ?view=lineup | hamour | sardine-president | crab-clerk    (default lineup)
//   ?mode=idle | talking | reduced | reduced-talking | cycle   (default idle; cycle = enter, talk, exit, repeat)
//   ?angle=front | three-quarter | side | high                 (camera position, default front)
//   ?anchors=1                                                  (small markers at narratorSpeechAnchor)
//   ?reference=1                                                (the ambient Hamour beside the lineup, for scale/style)
import { Canvas, useThree } from '@react-three/fiber';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Color, FogExp2 } from 'three';
import { Narrator } from '../../../../libs/world/feature/src/lib/narrator';
import { narratorSpeechAnchor, type NarratorCastId } from '../../../../libs/world/feature/src/lib/narrator-cast';
import { createHamourGeometry, createHamourMaterial } from '../../../../libs/world/feature/src/lib/hamour-model';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'lineup';
const mode = params.get('mode') ?? 'idle';
const angle = params.get('angle') ?? 'front';
const anchors = params.get('anchors') === '1';
const reference = params.get('reference') === '1';

const LINEUP: { id: NarratorCastId; at: [number, number, number] }[] =
  view === 'lineup'
    ? [
        { id: 'hamour', at: [-1.25, 0.25, 0] },
        { id: 'sardine-president', at: [0.05, 0.32, 0.1] },
        { id: 'crab-clerk', at: [1.25, 0, 0] },
      ]
    : [{ id: view as NarratorCastId, at: [0, view === 'crab-clerk' ? 0 : 0.15, 0] }];

const SCALE = view === 'lineup' ? 1 : 2;

function Scene() {
  const { scene, camera } = useThree();
  useEffect(() => {
    scene.background = new Color('#0a1e3f');
    scene.fog = new FogExp2('#0a1e3f', 0.03);
    const distance = view === 'lineup' ? 3.6 : 2.6;
    const target: [number, number, number] = [0, view === 'lineup' ? 0.45 : 0.55, 0];
    const poses: Record<string, [number, number, number]> = {
      front: [0, 0.75, distance],
      'three-quarter': [distance * 0.72, 0.9, distance * 0.72],
      side: [distance, 0.6, 0.2],
      high: [0.3, distance * 0.9, distance * 0.6],
    };
    camera.position.set(...(poses[angle] ?? poses.front));
    camera.lookAt(...target);
  }, [scene, camera]);

  const [present, setPresent] = useState(mode !== 'cycle');
  const [talking, setTalking] = useState(mode === 'talking' || mode === 'reduced-talking');
  useEffect(() => {
    if (mode !== 'cycle') return;
    const ids: number[] = [];
    const run = (): void => {
      setPresent(true);
      ids.push(window.setTimeout(() => setTalking(true), 2200));
      ids.push(window.setTimeout(() => setTalking(false), 5200));
      ids.push(window.setTimeout(() => setPresent(false), 6000));
      ids.push(window.setTimeout(run, 8000));
    };
    ids.push(window.setTimeout(run, 300));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, []);

  const label = document.getElementById('label');
  if (label) label.textContent = `${view} / ${mode} / ${angle}${present ? '' : ' (away)'}${talking ? ' (talking)' : ''}`;

  return (
    <>
      <ambientLight color="#1d4f7a" intensity={0.9} />
      <hemisphereLight args={['#5fb4d9', '#06101f', 1.1]} />
      <directionalLight color="#a9dcff" intensity={1.6} position={[18, 60, 12]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
        <circleGeometry args={[6, 24]} />
        <meshStandardMaterial color="#c8b48a" roughness={1} />
      </mesh>
      {LINEUP.map(({ id, at }) => (
        <group key={id}>
          <Narrator
            cast={id}
            position={at}
            scale={SCALE}
            talking={talking}
            present={present}
            reducedMotion={mode.startsWith('reduced')}
            onSettled={() => console.info('settled', id)}
            onExited={() => console.info('exited', id)}
          />
          {anchors && (
            <mesh position={[...narratorSpeechAnchor(id, at, SCALE)]}>
              <sphereGeometry args={[0.025, 8, 6]} />
              <meshBasicMaterial color="#ffef5a" />
            </mesh>
          )}
        </group>
      ))}
      {reference && <ReferenceHamour />}
    </>
  );
}

function ReferenceHamour() {
  const [mesh] = useState(() => ({
    geometry: createHamourGeometry(),
    material: createHamourMaterial({ time: { value: 1.3 }, swim: { value: 0.6 } }),
  }));
  return <mesh geometry={mesh.geometry} material={mesh.material} position={[0, 1.5, -1.5]} rotation={[0, Math.PI / 2, 0]} />;
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Canvas camera={{ fov: 40, near: 0.05, far: 200 }} dpr={1} gl={{ antialias: true }}>
      <Scene />
    </Canvas>
  </StrictMode>
);
