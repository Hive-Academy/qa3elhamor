import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type Group,
  type Mesh,
  type PointLight,
} from 'three';
import type { Vec3 } from '../narrators/view-layout';

/** The pane, dark and lit, and the lamplight it throws. */
const PANE_DARK = new Color('#16303f');
const PANE_LIT = new Color('#ffd68a');
const FRAME = '#2c5a4c';
const BRASS = '#c9a24c';
/** A few bubbles of air out of the tube's mouth whenever the scroll comes out. */
const PUFF_BUBBLES = 7;
const PUFF_SECONDS = 1.4;

const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);

export interface ClerkWindowProps {
  /** The point on the Bureau facing the visitor (world), kept current by `WorldFrame`. */
  readonly door: { readonly current: Vec3 };
  /** The stop's eye: the window faces it. */
  readonly eye: Vec3;
  /** The window's width, world units. */
  readonly width: number;
  /** The clerk is in: the window lights up. */
  readonly lit: boolean;
  /** The scroll is out (the clerk is busy): brighter, and the tube puffs as it comes out. */
  readonly busy: boolean;
  /** "Municipal Complaints" on the sign over the window, in the visitor's language. */
  readonly sign: string;
  readonly reducedMotion: boolean;
}

/**
 * The Bureau's clerk window, on the side of the building facing the visitor: a painted frame,
 * a counter, a sign, and a brass pneumatic tube whose mouth opens onto the counter. Its pane
 * lights up (with a flicker, like an old office lamp) when the clerk is in, and the tube puffs
 * air bubbles when the complaint scroll shoots out of it.
 */
export function ClerkWindow({
  door,
  eye,
  width,
  lit,
  busy,
  sign,
  reducedMotion,
}: ClerkWindowProps) {
  const group = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const puffs = useRef<(Mesh | null)[]>([]);
  const glow = useRef(0);
  const flicker = useRef(0);
  const puffAt = useRef<number | null>(null);
  const wasBusy = useRef(busy);

  const pane = useMemo(
    () =>
      new MeshBasicMaterial({ color: PANE_DARK.clone(), toneMapped: false }),
    [],
  );
  const frame = useMemo(
    () =>
      new MeshStandardMaterial({
        color: FRAME,
        emissive: new Color('#0e2620'),
        roughness: 0.7,
        flatShading: true,
      }),
    [],
  );
  const brass = useMemo(
    () =>
      new MeshStandardMaterial({
        color: BRASS,
        emissive: new Color('#3a2a08'),
        metalness: 0.55,
        roughness: 0.35,
      }),
    [],
  );
  const counter = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#8a5a32',
        emissive: new Color('#2a170a'),
        roughness: 0.8,
        flatShading: true,
      }),
    [],
  );
  const bubble = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#d8f4ff',
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );
  const bubbleGeometry = useMemo(() => new SphereGeometry(1, 10, 8), []);

  // The tube: down from behind the roof, round the window's side, its mouth on the counter.
  const tube = useMemo(
    () =>
      new TubeGeometry(
        new CatmullRomCurve3([
          new Vector3(0.66, 1.05, -0.12),
          new Vector3(0.7, 0.55, 0.0),
          new Vector3(0.68, -0.05, 0.06),
          new Vector3(0.6, -0.3, 0.16),
          new Vector3(0.5, -0.34, 0.3),
        ]),
        40,
        0.085,
        10,
        false,
      ),
    [],
  );
  const signTexture = useMemo(() => signTextureOf(sign), [sign]);
  const signMaterial = useMemo(
    () => new MeshBasicMaterial({ map: signTexture, toneMapped: false }),
    [signTexture],
  );

  useEffect(
    () => () => {
      for (const disposable of [
        pane,
        frame,
        brass,
        counter,
        bubble,
        bubbleGeometry,
        tube,
        signTexture,
        signMaterial,
      ])
        disposable.dispose();
    },
    [
      pane,
      frame,
      brass,
      counter,
      bubble,
      bubbleGeometry,
      tube,
      signTexture,
      signMaterial,
    ],
  );

  useFrame(({ clock }, delta) => {
    const g = group.current;
    if (!g) return;
    const [x, y, z] = door.current;
    const yaw = Math.atan2(eye[0] - x, eye[2] - z);
    // Just proud of the wall, facing the visitor.
    g.position.set(
      x + Math.sin(yaw) * width * 0.05,
      y,
      z + Math.cos(yaw) * width * 0.05,
    );
    g.rotation.set(0, yaw, 0);
    g.scale.setScalar(width);

    const now = clock.elapsedTime;
    if (busy && !wasBusy.current) puffAt.current = now;
    wasBusy.current = busy;

    // Lighting up: a couple of flickers, then steady. Reduced motion: straight on.
    const target = lit ? (busy ? 1 : 0.82) : 0;
    const step = reducedMotion ? 1 : clamp01(delta * 2.2);
    glow.current += (target - glow.current) * step;
    flicker.current =
      !reducedMotion && lit && glow.current < 0.7
        ? Math.sin(now * 37) * Math.sin(now * 11) > 0.35
          ? 0.45
          : 0
        : 0;
    const shine = Math.max(glow.current - flicker.current, 0);
    pane.color.copy(PANE_DARK).lerp(PANE_LIT, shine);
    if (light.current) light.current.intensity = shine * 5;

    const since = puffAt.current === null ? null : now - puffAt.current;
    puffs.current.forEach((mesh, i) => {
      if (!mesh) return;
      if (since === null || reducedMotion || since > PUFF_SECONDS) {
        mesh.visible = false;
        return;
      }
      const t = clamp01((since - i * 0.06) / (PUFF_SECONDS - 0.4));
      mesh.visible = t > 0;
      const side = ((i * 37) % 7) / 7 - 0.5;
      mesh.position.set(0.5 + side * 0.18, -0.3 + t * 0.9, 0.34 + t * 0.12);
      mesh.scale.setScalar(0.025 + 0.02 * ((i * 3) % 4) * 0.5 + t * 0.02);
    });
    bubble.opacity =
      since === null || since > PUFF_SECONDS
        ? 0
        : 0.7 * (1 - since / PUFF_SECONDS);
  });

  return (
    <group ref={group}>
      {/* The frame round the pane, and its cross bars. */}
      <mesh material={pane} position={[0, 0.06, 0]}>
        <planeGeometry args={[0.92, 0.6]} />
      </mesh>
      <mesh material={frame} position={[0, 0.41, 0.02]}>
        <boxGeometry args={[1.08, 0.1, 0.08]} />
      </mesh>
      <mesh material={frame} position={[0, -0.29, 0.02]}>
        <boxGeometry args={[1.08, 0.1, 0.08]} />
      </mesh>
      <mesh material={frame} position={[-0.5, 0.06, 0.02]}>
        <boxGeometry args={[0.08, 0.8, 0.08]} />
      </mesh>
      <mesh material={frame} position={[0.5, 0.06, 0.02]}>
        <boxGeometry args={[0.08, 0.8, 0.08]} />
      </mesh>
      <mesh material={brass} position={[0, 0.06, 0.01]}>
        <boxGeometry args={[0.025, 0.6, 0.02]} />
      </mesh>
      <mesh material={brass} position={[0, 0.16, 0.01]}>
        <boxGeometry args={[0.92, 0.022, 0.02]} />
      </mesh>
      {/* The counter, where the scroll unrolls. */}
      <mesh material={counter} position={[0, -0.37, 0.14]}>
        <boxGeometry args={[1.25, 0.07, 0.34]} />
      </mesh>
      {/* The sign over the window. */}
      <mesh material={signMaterial} position={[0, 0.6, 0.03]}>
        <planeGeometry args={[1.12, 0.24]} />
      </mesh>
      {/* The pneumatic tube and its mouth. */}
      <mesh material={brass} geometry={tube} />
      <mesh
        material={brass}
        position={[0.5, -0.34, 0.3]}
        rotation={[Math.PI / 2.6, 0, 0.5]}
      >
        <torusGeometry args={[0.095, 0.026, 8, 16]} />
      </mesh>
      <pointLight
        ref={light}
        color="#ffcf7a"
        intensity={0}
        distance={4}
        decay={1.6}
        position={[0, 0.05, 0.6]}
      />
      {Array.from({ length: PUFF_BUBBLES }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            puffs.current[i] = mesh;
          }}
          geometry={bubbleGeometry}
          material={bubble}
          visible={false}
        />
      ))}
    </group>
  );
}

/** The sign: cream enamel, a rule, the Bureau's name in its red ink. */
function signTextureOf(text: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 560;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f3ead3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#8c3b2a';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.fillStyle = '#8c3b2a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 46;
    ctx.font = `700 ${size}px Georgia, 'Noto Naskh Arabic', serif`;
    while (ctx.measureText(text).width > canvas.width - 48 && size > 18) {
      size -= 2;
      ctx.font = `700 ${size}px Georgia, 'Noto Naskh Arabic', serif`;
    }
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
