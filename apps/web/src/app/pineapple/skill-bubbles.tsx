import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { SphereGeometry, Vector3, type Mesh } from 'three';
import { placePanel, type ScreenInsets } from '../narrators/screen-placement';
import type { Vec3 } from '../narrators/view-layout';
import {
  SKILL_BUBBLE_TINTS,
  createSkillBubbleMaterial,
} from './skill-bubble-material';
import {
  PICKABLE_FROM,
  acceptsPick,
  type SelectSource,
} from './skill-selection';

export interface SkillBubbleSlot {
  readonly centre: Vec3;
  readonly radius: number;
}

export interface SkillBubblesProps {
  /** One bubble per id, in order. */
  readonly ids: readonly string[];
  readonly slots: readonly SkillBubbleSlot[];
  /** Where they come out of, and go back into (world); kept current by the scene. */
  readonly door: { readonly current: Vec3 };
  /** True: out in the water around the landmark. False: back inside the door. */
  readonly out: boolean;
  readonly selected: string | null;
  readonly reducedMotion: boolean;
  readonly onPick: (id: string, source: SelectSource) => void;
  /** The bubbles' DOM labels, by index: positioned over them every frame. */
  readonly labels: RefObject<(HTMLElement | null)[]>;
  /** The selected bubble's skills panel: placed under (or over) it every frame. */
  readonly panel: RefObject<HTMLElement | null>;
  /** Screen space kept clear for the page chrome. */
  readonly insets: ScreenInsets;
}

/** Seconds out of the door, back in, and between one bubble and the next. */
const OUT_SECONDS = 1.3;
const IN_SECONDS = 0.6;
const STAGGER = 0.16;
/** Growth of the selected bubble. */
const SELECTED_GROWTH = 0.24;

const easeOutBack = (t: number): number => {
  const c = 1.4;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};
const easeInOut = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);

const scratch = new Vector3();
const projected = new Vector3();
const camSpace = new Vector3();
const hubVec = new Vector3();

interface BubbleMotion {
  progress: number;
  highlight: number;
}

/**
 * The skill groups as glowing underwater bubbles that drift out of the landmark's door to their
 * slots, bob there, and drift back in. Pointing at one (or focusing its label) selects it: it
 * grows and brightens while the others fade back. Their labels and the skills panel are DOM in
 * the stage (accessible, crisp); this places them over the bubbles every frame.
 */
export function SkillBubbles({
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
}: SkillBubblesProps) {
  const geometry = useMemo(() => new SphereGeometry(1, 48, 32), []);
  const materials = useMemo(
    () =>
      ids.map((_, i) =>
        createSkillBubbleMaterial(
          SKILL_BUBBLE_TINTS[i % SKILL_BUBBLE_TINTS.length] ?? '#7cc8ff',
          i * 2.39,
        ),
      ),
    [ids],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
    },
    [materials],
  );

  const meshes = useRef<(Mesh | null)[]>([]);
  const motion = useRef<BubbleMotion[]>([]);
  const outSince = useRef<number | null>(null);
  const size = useThree((state) => state.size);

  useFrame(({ clock, camera }, delta) => {
    const now = clock.elapsedTime;
    const dt = Math.min(Math.max(delta, 0), 0.1);
    if (out && outSince.current === null) outSince.current = now;
    if (!out) outSince.current = null;
    const focal = camera.projectionMatrix.elements[5] * (size.height / 2);
    const anySelected = selected !== null;
    // The landmark on screen: panels open on a bubble's far side from it.
    hubVec
      .set(door.current[0], door.current[1], door.current[2])
      .project(camera);
    const hub = {
      x: ((hubVec.x + 1) / 2) * size.width,
      y: ((1 - hubVec.y) / 2) * size.height,
    };

    ids.forEach((id, i) => {
      const slot = slots[i];
      const mesh = meshes.current[i];
      const material = materials[i];
      if (!slot || !material) return;
      const m = (motion.current[i] ??= { progress: 0, highlight: 0 });

      // Out: each leaves the door in turn. In: all at once, a little faster.
      if (out) {
        const since = outSince.current ?? now;
        if (reducedMotion) m.progress = 1;
        else if (now - since >= i * STAGGER)
          m.progress = clamp01(m.progress + dt / OUT_SECONDS);
      } else {
        m.progress = reducedMotion ? 0 : clamp01(m.progress - dt / IN_SECONDS);
      }
      const isSelected = selected === id;
      const k = reducedMotion ? 1 : clamp01(dt * 9);
      m.highlight += ((isSelected ? 1 : 0) - m.highlight) * k;

      const p = m.progress;
      const travel = easeInOut(p);
      // Along a rising arc: the current carries them up out of the door, then they settle.
      const [dx, dy, dz] = door.current;
      const [sx, sy, sz] = slot.centre;
      const lift = Math.sin(Math.PI * travel) * slot.radius * 2.2;
      let x = dx + (sx - dx) * travel;
      let y = dy + (sy - dy) * travel + lift;
      let z = dz + (sz - dz) * travel;
      if (!reducedMotion) {
        const settle = p * p;
        y += Math.sin(now * 0.9 + i * 1.7) * slot.radius * 0.12 * settle;
        x += Math.sin(now * 0.55 + i * 2.3) * slot.radius * 0.08 * settle;
        z += Math.cos(now * 0.5 + i * 1.1) * slot.radius * 0.08 * settle;
      }
      const grow = p >= 1 ? 1 : 0.12 + 0.88 * clamp01(easeOutBack(p));
      const radius = slot.radius * grow * (1 + SELECTED_GROWTH * m.highlight);

      if (mesh) {
        mesh.visible = p > 0.001;
        mesh.position.set(x, y, z);
        mesh.scale.setScalar(Math.max(radius, 1e-4));
      }
      const u = material.uniforms;
      if (!reducedMotion) u.uTime.value = now;
      u.uHighlight.value = m.highlight;
      const faded = anySelected && !isSelected ? 0.55 : 1;
      u.uOpacity.value = clamp01(p * 1.6) * faded;

      // The label over it, and the skills panel under the selected one.
      const label = labels.current?.[i];
      if (!label) return;
      scratch.set(x, y, z);
      camSpace.copy(scratch).applyMatrix4(camera.matrixWorldInverse);
      const depth = -camSpace.z;
      projected.copy(scratch).project(camera);
      const px = ((projected.x + 1) / 2) * size.width;
      const py = ((1 - projected.y) / 2) * size.height;
      const shown = depth > 0.05 && p > 0.6;
      label.style.transform = `translate3d(${Math.round(px)}px, ${Math.round(py)}px, 0) translate(-50%, -50%)`;
      label.style.opacity = shown
        ? String(clamp01((p - 0.6) / 0.3) * (faded < 1 ? 0.7 : 1))
        : '0';
      label.style.visibility = shown ? 'visible' : 'hidden';
      // Not a target until it is (nearly) out of the door.
      label.style.pointerEvents = p >= PICKABLE_FROM ? '' : 'none';
      const pxRadius = depth > 0.05 ? (radius * focal) / depth : 0;
      label.style.setProperty('--bubble-px', `${Math.round(pxRadius * 2)}px`);

      const box = panel.current;
      if (isSelected && box) {
        const place = placePanel({
          centre: { x: px, y: py },
          radius: pxRadius,
          hub,
          size: { width: box.offsetWidth, height: box.offsetHeight },
          viewport: size,
          insets,
          gap: 12,
        });
        box.style.transform = `translate3d(${place.left}px, ${place.top}px, 0)`;
        box.dataset['side'] = place.side;
        box.style.visibility = shown ? 'visible' : 'hidden';
      }
    });
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
    <group name="skill-bubbles">
      {ids.map((id, i) => (
        <mesh
          key={id}
          ref={(mesh) => {
            meshes.current[i] = mesh;
          }}
          name={`skill-bubble:${id}`}
          geometry={geometry}
          material={materials[i]}
          visible={false}
          renderOrder={2}
          onPointerOver={pointerPick(id, i, 'hover')}
          onClick={pointerPick(id, i, 'tap')}
        />
      ))}
    </group>
  );
}
