import { Center, Text3D } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useDive } from '@qa3elhamor/dive-feature';
import { OceanText } from '@qa3elhamor/world-ui';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { PMREMGenerator, PerspectiveCamera, Vector3, type Group } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useLocale } from '../i18n/locale-context';
import { toContentLocale } from '../overlays/overlay-copy';
import { SITE, placeName } from '../../site.config';
import { useTourState } from './tour-context';
import { TOUR_COPY } from './tour-copy';
import { createTitleMaterial } from './tour-title-material';

/** Self-hosted fonts, resolved against the deploy base (`OceanText` must never use troika's CDN). */
const TITLE_FONT_URL = `${import.meta.env.BASE_URL}fonts/qaa-title/qaa-title.typeface.json`;
const SDF_FONT_URL = `${import.meta.env.BASE_URL}fonts/ibm-plex-sans-arabic/IBMPlexSansArabic-SemiBold.ttf`;

/** How far ahead of the surface camera the title floats, in world units. */
const TITLE_DISTANCE = 9;
/** The title's width at scale 1 (13 letters at size 1), measured once; used to fit narrow screens. */
const TITLE_WIDTH = 7.6;
/** How long the title takes to surface, and to sink once the journey starts. */
const RISE_S = 1.8;
const SINK_S = 1.6;

/**
 * The intro's hero title, in the water in front of the surface camera: the place's name as
 * extruded mother-of-pearl letters with caustics playing over them (`Text3D`, Latin only: a
 * typeface font is not shaped), its Arabic name and the tagline under it as underwater SDF text
 * (`OceanText`, shaped). It rises into view while the intro waits; when the journey begins it
 * stays where it is, sinks and fades as the camera dives beneath it, then unmounts.
 *
 * Decorative (the canvas is hidden from assistive technology): the same words are the intro's
 * DOM heading (`tour-chrome.tsx`).
 */
export function TourIntroScene() {
  const intro = useTourState((s) => s.phase === 'intro');
  const [mounted, setMounted] = useState(intro);
  const [wasIntro, setWasIntro] = useState(intro);
  if (intro !== wasIntro) {
    setWasIntro(intro);
    if (intro) setMounted(true);
  }
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <IntroTitle shown={intro} onGone={() => setMounted(false)} />
    </Suspense>
  );
}

const scratch = new Vector3();

function IntroTitle({
  shown,
  onGone,
}: {
  readonly shown: boolean;
  readonly onGone: () => void;
}) {
  const dive = useDive();
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const camera = useThree((state) => state.camera);
  const { locale } = useLocale();
  const words = TOUR_COPY[toContentLocale(locale)];

  // Where the surface camera looks: the dive's start, facing a little way down the path.
  const placement = useMemo(() => {
    const path = dive.path;
    const eye = new Vector3(...path.pointAt(0));
    const ahead = new Vector3(...path.pointAt(Math.min(1, 12 / path.length)));
    const forward = ahead.sub(eye).normalize();
    return { at: eye.clone().addScaledVector(forward, TITLE_DISTANCE) };
  }, [dive]);

  // The visible height and width at the title's distance, to place and fit everything on screen.
  const fov = camera instanceof PerspectiveCamera ? camera.fov : 55;
  const viewHeight = 2 * TITLE_DISTANCE * Math.tan((fov * Math.PI) / 360);
  const viewWidth = viewHeight * (size.width / Math.max(1, size.height));
  const fit = Math.min(1, (viewWidth * 0.84) / TITLE_WIDTH);
  const portrait = size.width < size.height;

  const envMap = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    return target;
  }, [gl]);
  const title = useMemo(() => createTitleMaterial(envMap.texture), [envMap]);
  useEffect(
    () => () => {
      title.material.dispose();
      envMap.dispose();
    },
    [title, envMap],
  );

  const group = useRef<Group>(null);
  const lift = useRef<Group>(null);
  const presence = useRef(0);
  const [reveal, setReveal] = useState(0);
  const gone = useRef(false);

  useFrame((state, delta) => {
    const root = group.current;
    if (!root) return;
    const dt = Math.min(delta, 0.1);
    // In while shown; out (slower) once the journey has begun.
    presence.current = shown
      ? Math.min(1, presence.current + dt / RISE_S)
      : Math.max(0, presence.current - dt / SINK_S);
    const p = presence.current;
    const eased = p * p * (3 - 2 * p);
    const t = state.clock.elapsedTime;
    root.position.copy(placement.at);
    if (lift.current) {
      lift.current.position.y = (eased - 1) * 1.4 + Math.sin(t * 0.6) * 0.06;
      lift.current.rotation.y = Math.sin(t * 0.27) * 0.05;
      lift.current.rotation.x = Math.sin(t * 0.21 + 1.3) * 0.025;
    }
    title.material.opacity = eased;
    title.material.visible = eased > 0.01;
    title.uniforms.uTitleTime.value = t;
    // The SDF lines surface glyph by glyph after the title; on "Begin" they sink at once (the
    // reveal head runs back as a quick wave) while the title stays to be dived under.
    const next = shown
      ? Math.round(Math.max(0, Math.min(1, (p - 0.35) / 0.6)) * 20) / 20
      : 0;
    if (next !== reveal) setReveal(next);
    if (!shown && p === 0 && !gone.current) {
      gone.current = true;
      onGone();
    }
    // Facing the live eye: square to the screen through the camera's sway and as it dives under.
    root.lookAt(scratch.copy(state.camera.position));
  });

  const titleTop = viewHeight * (portrait ? 0.2 : 0.17);
  return (
    <group ref={group}>
      <group ref={lift} scale={fit}>
        <pointLight
          position={[-3, 3, 4]}
          intensity={30}
          distance={14}
          color="#bff3ff"
        />
        <pointLight
          position={[4, -1, 3]}
          intensity={18}
          distance={12}
          color="#ffd9f2"
        />
        <Center position={[0, titleTop / fit, 0]}>
          <Text3D
            font={TITLE_FONT_URL}
            size={1}
            height={0.32}
            curveSegments={10}
            bevelEnabled
            bevelThickness={0.06}
            bevelSize={0.045}
            bevelSegments={5}
            letterSpacing={0.02}
            material={title.material}
          >
            {placeName('en')}
          </Text3D>
        </Center>
        {SITE.locales.includes('ar') && (
          <OceanText
            text={placeName('ar')}
            fontUrl={SDF_FONT_URL}
            size={0.62}
            direction="rtl"
            reveal={reveal}
            glowOpacity={0.7}
            shimmer={0.8}
            position={[0, titleTop / fit - 1.25, 0.1]}
          />
        )}
        <OceanText
          text={words.tagline}
          fontUrl={SDF_FONT_URL}
          size={0.27}
          maxWidth={TITLE_WIDTH * 0.95}
          reveal={reveal}
          glowOpacity={0.45}
          color="#dff4ff"
          position={[0, titleTop / fit - 2.05, 0.1]}
        />
      </group>
    </group>
  );
}
