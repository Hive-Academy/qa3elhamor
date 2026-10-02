// DEV-ONLY: a stage for the underwater 3D text (OceanText, OceanSpeechBubble) so it can be looked
// at and screenshotted in isolation. Loaded only by apps/web/ocean-text-preview.html, which is not
// a build input. See that file for the query parameters.
import { OceanSpeechBubble, OceanText } from '@qa3elhamor/world-ui';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Color, ShaderMaterial, Vector3 } from 'three';

const FONT_URL = `${import.meta.env.BASE_URL}fonts/ibm-plex-sans-arabic/IBMPlexSansArabic-SemiBold.ttf`;

const EN_LINE = "Hi! I'm Abdallah's biggest fan — come in, the Pineapple's open!";
const AR_LINE = 'أهلاً! تعالى نتفرج على شغل عبدالله';
const TITLE = 'Qaa El-Hamour · قاع الهامور';

type Shot = 'all' | 'en' | 'ar' | 'title' | 'reveal';
const SHOTS: Record<Shot, { readonly eye: readonly [number, number, number]; readonly look: readonly [number, number, number] }> = {
  all: { eye: [0, 0.2, 7.4], look: [0, 0.2, 0] },
  en: { eye: [-1.7, 0.25, 4.3], look: [-1.7, 0.05, 0] },
  ar: { eye: [1.9, -0.75, 4.1], look: [1.9, -0.9, 0] },
  title: { eye: [0, 1.95, 5.6], look: [0, 1.95, 0] },
  reveal: { eye: [-1.7, 0.25, 4.3], look: [-1.7, 0.05, 0] },
};

function readParams() {
  const q = new URLSearchParams(window.location.search);
  const shotParam = q.get('shot') ?? 'all';
  const shot: Shot = shotParam in SHOTS ? (shotParam as Shot) : 'all';
  const revealParam = Number(q.get('reveal'));
  return {
    shot,
    reveal: q.has('reveal') && Number.isFinite(revealParam) ? revealParam : shot === 'reveal' ? 0.45 : 0.62,
    typewriter: q.get('type') === '1',
    reducedMotion: q.get('rm') === '1',
  };
}

const BACKDROP_FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  vec3 deep = vec3(0.004, 0.05, 0.09);
  vec3 mid = vec3(0.02, 0.22, 0.32);
  vec3 surface = vec3(0.16, 0.55, 0.62);
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.65, uv.y));
  col = mix(col, surface, smoothstep(0.6, 1.0, uv.y) * 0.8);
  // Light shafts from the surface, swaying.
  float x = uv.x + (1.0 - uv.y) * 0.25;
  float shafts = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float s = sin(x * (9.0 + fi * 5.0) + uTime * (0.15 + fi * 0.05) + fi * 1.9);
    shafts += pow(max(s, 0.0), 10.0) * (0.5 - fi * 0.08);
  }
  col += vec3(0.35, 0.75, 0.8) * shafts * smoothstep(0.1, 1.0, uv.y) * 0.22;
  // Sand glow at the bottom: warm, not grey.
  col = mix(col, vec3(0.045, 0.07, 0.06), smoothstep(0.2, 0.0, uv.y) * 0.6);
  // Vignette.
  vec2 v = uv - 0.5;
  col *= 1.0 - dot(v, v) * 0.9;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function Backdrop() {
  const time = useMemo(() => ({ value: 0 }), []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
        fragmentShader: BACKDROP_FRAGMENT,
        uniforms: { uTime: time },
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    [time],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame((state) => {
    time.value = state.clock.elapsedTime;
  });
  return (
    <mesh material={material} renderOrder={-10} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

function CameraRig({ shot }: { readonly shot: Shot }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const { eye, look } = SHOTS[shot];
    camera.position.set(...eye);
    camera.lookAt(new Vector3(...look));
  }, [camera, shot]);
  return null;
}

/** Typewriter: one character every 55 ms, like voice blips, then a pause and again. */
function useTypewriter(enabled: boolean, length: number): number | null {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const id = window.setInterval(() => setCount((c) => (c >= length + 30 ? 0 : c + 1)), 55);
    return () => window.clearInterval(id);
  }, [enabled, length]);
  return enabled ? count : null;
}

function Stage() {
  const params = useMemo(readParams, []);
  // The typewriter starts once the English line has laid out (font loaded), and the page flags
  // it for the capture script.
  const [laidOut, setLaidOut] = useState(false);
  useEffect(() => {
    if (laidOut) document.body.dataset['oceanReady'] = '1';
  }, [laidOut]);
  const typed = useTypewriter(params.typewriter && laidOut, [...EN_LINE].length);
  const enReveal = typed === null ? params.reveal : { characters: typed };
  const { reducedMotion } = params;

  return (
    <Canvas
      camera={{ fov: 40, near: 0.1, far: 60, position: [0, 0, 7] }}
      dpr={[1, 2]}
      onCreated={({ scene }) => {
        scene.background = new Color('#021a2b');
      }}
    >
      <CameraRig shot={params.shot} />
      <Backdrop />
      <OceanText
        text={TITLE}
        fontUrl={FONT_URL}
        size={0.46}
        color="#ffe7a3"
        glowColor="#3fd9ff"
        glowOpacity={0.6}
        shimmer={0.8}
        position={[0, 2.0, 0]}
        reducedMotion={reducedMotion}
      />
      <OceanText
        text="SpongeBob"
        fontUrl={FONT_URL}
        size={0.15}
        color="#fff15c"
        glowColor="#ff9f1c"
        glowOpacity={0.45}
        position={[-3.05, 0.86, 0.02]}
        reducedMotion={reducedMotion}
      />
      <OceanSpeechBubble
        text={EN_LINE}
        fontUrl={FONT_URL}
        size={0.2}
        maxWidth={3.1}
        tail="left"
        reveal={enReveal}
        onLayout={() => setLaidOut(true)}
        position={[-1.7, 0.05, 0]}
        reducedMotion={reducedMotion}
      />
      <OceanSpeechBubble
        text={AR_LINE}
        fontUrl={FONT_URL}
        size={0.24}
        maxWidth={3.6}
        direction="rtl"
        tail="right"
        position={[1.9, -0.9, 0]}
        reducedMotion={reducedMotion}
      />
    </Canvas>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Stage />
    </StrictMode>,
  );
}
