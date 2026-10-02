import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  MeshStandardMaterial,
  NormalBlending,
  Plane,
  ShaderMaterial,
  Vector3,
  type Group,
} from 'three';
import { placeObjectDom, screenPointOf } from '../narrators/object-dom';
import { acceptsPick, type SelectSource } from '../narrators/object-selection';
import type { VisitObjectsProps } from '../narrators/visit-types';
import { createTabletRim, createTabletSlab } from './tablet-geometry';
import type { TabletSlot } from './tiki-layout';

/** Seconds to rise out of the sand, to sink back, and between one tablet and the next. */
const RISE_SECONDS = 1.15;
const SINK_SECONDS = 0.6;
const STAGGER = 0.24;
/** Growth of the selected tablet, on top of coming forward. */
const SELECTED_GROWTH = 0.08;
/** A sand puff: seconds, and grains per tablet. */
const PUFF_SECONDS = 1.6;
const GRAINS = 18;

const STONE = '#d6c49c';
const RIM = '#b19a70';
const GLOW = new Color('#ffbf66');
/** A little warmth of its own, so sandstone still reads as sandstone in the blue water. */
const WARMTH = new Color('#4a3a22');
const glow = new Color();
const WHITE = new Color('#ffffff');
const DIMMED = new Color('#7d8794');

const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);

interface TabletMotion {
  progress: number;
  highlight: number;
  /** Seconds since its last puff began; null when none is playing. */
  puff: number | null;
}

/**
 * The jobs as carved stone tablets that rise out of the sand before the tiki, one after another,
 * in a puff of sand, and sink back when the visit ends. Pointing at one (or focusing its label)
 * selects it: it comes forward, lifts a little and warms, while the others darken. Their labels
 * and the detail panel are DOM in the stage (accessible, crisp); this places them every frame.
 */
export function StoneTablets({
  ids,
  slots,
  door,
  out,
  selected,
  reducedMotion,
  onPick,
  labels,
  panel,
  insets,
}: VisitObjectsProps<TabletSlot>) {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  // The tablets rise out of the seabed: everything under it is clipped away.
  useEffect(() => {
    const before = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    // The renderer is shared: hand it back as it was.
    return () => {
      gl.localClippingEnabled = before;
    };
  }, [gl]);

  const slab = useMemo(() => createTabletSlab(STONE), []);
  const rim = useMemo(() => createTabletRim(RIM), []);
  useEffect(
    () => () => {
      slab.dispose();
      rim.dispose();
    },
    [slab, rim],
  );
  const ground = slots[0]?.ground ?? 0;
  const clip = useMemo(
    () => [new Plane(new Vector3(0, 1, 0), -ground)],
    [ground],
  );
  const materials = useMemo(
    () =>
      ids.map(() => ({
        slab: new MeshStandardMaterial({
          vertexColors: true,
          flatShading: true,
          roughness: 0.94,
          metalness: 0,
          clippingPlanes: clip,
        }),
        rim: new MeshStandardMaterial({
          vertexColors: true,
          flatShading: true,
          roughness: 0.9,
          metalness: 0,
          clippingPlanes: clip,
        }),
      })),
    [ids, clip],
  );
  useEffect(
    () => () => {
      for (const m of materials) {
        m.slab.dispose();
        m.rim.dispose();
      }
    },
    [materials],
  );

  const puff = useMemo(() => createSandPuff(ids.length), [ids.length]);
  useEffect(
    () => () => {
      puff.geometry.dispose();
      puff.material.dispose();
    },
    [puff],
  );

  const groups = useRef<(Group | null)[]>([]);
  const motion = useRef<TabletMotion[]>([]);
  const outSince = useRef<number | null>(null);

  useFrame(({ clock, camera }, delta) => {
    const now = clock.elapsedTime;
    const dt = Math.min(Math.max(delta, 0), 0.1);
    if (out && outSince.current === null) outSince.current = now;
    if (!out) outSince.current = null;
    const anySelected = selected !== null;
    // The tiki on screen: a tablet's panel falls back to its far side from it.
    const hub = screenPointOf(camera, size, door.current);
    puff.scale.value =
      (camera.projectionMatrix.elements[5] ?? 1) *
      (size.height / 2) *
      gl.getPixelRatio();

    ids.forEach((id, i) => {
      const slot = slots[i];
      const group = groups.current[i];
      const material = materials[i];
      if (!slot || !material) return;
      const m = (motion.current[i] ??= {
        progress: 0,
        highlight: 0,
        puff: null,
      });

      // Out: each rises in turn. In: all sink at once, a little faster.
      const before = m.progress;
      if (out) {
        const since = outSince.current ?? now;
        if (reducedMotion) m.progress = 1;
        else if (now - since >= i * STAGGER)
          m.progress = clamp01(m.progress + dt / RISE_SECONDS);
      } else {
        m.progress = reducedMotion
          ? 0
          : clamp01(m.progress - dt / SINK_SECONDS);
      }
      // A puff of sand as it breaks the surface, and as it starts to sink back.
      const leavingSand = before === 0 && m.progress > 0;
      const startingDown = before === 1 && m.progress < 1;
      if (!reducedMotion && (leavingSand || startingDown)) m.puff = 0;
      if (m.puff !== null) {
        m.puff += dt;
        if (m.puff > PUFF_SECONDS) m.puff = null;
      }

      const isSelected = selected === id;
      const k = reducedMotion ? 1 : clamp01(dt * 7);
      m.highlight += ((isSelected ? 1 : 0) - m.highlight) * k;

      const p = m.progress;
      const h = m.highlight;
      const scale = 1 + SELECTED_GROWTH * h;
      const tall = slot.height * scale;
      // Up out of the sand, with a little wobble as it frees itself.
      const sunk = (1 - easeOut(p)) * tall * 1.04;
      const x = slot.foot[0] + slot.presented[0] * h;
      const y = slot.foot[1] + slot.presented[1] * h - sunk;
      const z = slot.foot[2] + slot.presented[2] * h;
      const wobble = reducedMotion
        ? 0
        : Math.sin(p * Math.PI * 3) * (1 - p) * 0.09;
      const sway =
        reducedMotion || p < 1 ? 0 : Math.sin(now * 0.7 + i * 1.9) * 0.012;

      if (group) {
        group.visible = p > 0.001;
        group.position.set(x, y, z);
        group.rotation.set(-0.05 * (1 - h), slot.yaw, wobble + sway);
        group.scale.set(slot.width * scale, tall, slot.thickness * scale);
      }
      const dim = anySelected && !isSelected ? 1 : 0;
      material.slab.color.copy(WHITE).lerp(DIMMED, dim * 0.6);
      material.rim.color.copy(material.slab.color);
      const warmth = 1 - dim * 0.5;
      material.slab.emissive
        .copy(WARMTH)
        .multiplyScalar(warmth)
        .add(glow.copy(GLOW).multiplyScalar(0.26 * h));
      material.rim.emissive
        .copy(WARMTH)
        .multiplyScalar(warmth)
        .add(glow.copy(GLOW).multiplyScalar(0.38 * h));

      writePuff(puff, i, slot, m.puff);

      placeObjectDom({
        camera,
        size,
        x,
        y: y + tall / 2,
        z,
        halfWidth: (slot.width * scale * slot.facing) / 2,
        halfHeight: tall / 2,
        progress: p,
        faded: dim > 0,
        label: labels.current?.[i],
        panel: isSelected ? panel.current : null,
        hub,
        insets,
        // Over the row, in the open water: beside it would cover the next tablet.
        panelSide: 'above',
      });
    });
    puff.geometry.getAttribute('position').needsUpdate = true;
    puff.geometry.getAttribute('aAlpha').needsUpdate = true;
    puff.geometry.getAttribute('aSize').needsUpdate = true;
  });

  const pointerPick =
    (id: string, i: number, source: SelectSource) =>
    (event: ThreeEvent<PointerEvent | MouseEvent>) => {
      const pointerType = (event.nativeEvent as Partial<PointerEvent>)
        .pointerType;
      if (!acceptsPick(source, pointerType, motion.current[i]?.progress ?? 0))
        return;
      event.stopPropagation();
      onPick(id, source);
    };

  return (
    <group name="stone-tablets">
      {ids.map((id, i) => (
        <group
          key={id}
          ref={(group) => {
            groups.current[i] = group;
          }}
          name={`stone-tablet:${id}`}
          visible={false}
        >
          <mesh
            geometry={slab}
            material={materials[i]?.slab}
            onPointerOver={pointerPick(id, i, 'hover')}
            onClick={pointerPick(id, i, 'tap')}
          />
          <mesh geometry={rim} material={materials[i]?.rim} />
        </group>
      ))}
      <points
        geometry={puff.geometry}
        material={puff.material}
        frustumCulled={false}
      />
    </group>
  );
}

interface SandPuff {
  readonly geometry: BufferGeometry;
  readonly material: ShaderMaterial;
  /** Pixels per world unit at depth 1 (device pixels): grains keep their world size. */
  readonly scale: { value: number };
  /** Per grain: direction (unit, on the ground), speed and lift factors. */
  readonly grains: Float32Array;
}

/** Grains for `count` tablets, all invisible until a puff plays. */
function createSandPuff(count: number): SandPuff {
  const n = Math.max(count, 1) * GRAINS;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(n * 3), 3),
  );
  geometry.setAttribute('aAlpha', new BufferAttribute(new Float32Array(n), 1));
  geometry.setAttribute('aSize', new BufferAttribute(new Float32Array(n), 1));
  const grains = new Float32Array(n * 4);
  for (let j = 0; j < n; j++) {
    // Deterministic spread: a golden-angle ring, speeds and lifts from a hash.
    const angle = j * 2.39996;
    const h = Math.sin(j * 91.7) * 43758.5453;
    const r = h - Math.floor(h);
    grains[j * 4] = Math.cos(angle);
    grains[j * 4 + 1] = Math.sin(angle);
    grains[j * 4 + 2] = 0.55 + 0.75 * r;
    grains[j * 4 + 3] = 0.3 + 0.9 * ((r * 7.13) % 1);
  }
  const scale = { value: 400 };
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    uniforms: {
      uScale: scale,
      uColor: { value: new Color('#cdbb94') },
    },
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      attribute float aSize;
      uniform float uScale;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aAlpha > 0.0 ? aSize * uScale / max(-mv.z, 0.001) : 0.0;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
  return { geometry, material, scale, grains };
}

/** Tablet `i`'s grains at `elapsed` seconds into its puff (hidden when null). */
function writePuff(
  puff: SandPuff,
  i: number,
  slot: TabletSlot,
  elapsed: number | null,
): void {
  const position = puff.geometry.getAttribute('position') as BufferAttribute;
  const alpha = puff.geometry.getAttribute('aAlpha') as BufferAttribute;
  const sizes = puff.geometry.getAttribute('aSize') as BufferAttribute;
  const t = elapsed === null ? 1 : clamp01(elapsed / PUFF_SECONDS);
  const spread = slot.width * 0.55;
  for (let g = 0; g < GRAINS; g++) {
    const j = i * GRAINS + g;
    const dx = puff.grains[j * 4] ?? 0;
    const dz = puff.grains[j * 4 + 1] ?? 0;
    const speed = puff.grains[j * 4 + 2] ?? 1;
    const lift = puff.grains[j * 4 + 3] ?? 1;
    const reach = spread * (0.35 + speed * easeOut(t));
    position.setXYZ(
      j,
      slot.foot[0] + dx * reach,
      slot.ground +
        slot.height *
          0.32 *
          lift *
          Math.sin(Math.min(t * 1.6, 1) * Math.PI * 0.5) *
          (1 - 0.4 * t),
      slot.foot[2] + dz * reach,
    );
    alpha.setX(
      j,
      elapsed === null ? 0 : Math.min(t * 8, 1) * (1 - t) * (1 - t) * 0.75,
    );
    sizes.setX(j, slot.width * (0.16 + 0.22 * t) * (0.7 + 0.3 * speed));
  }
}
