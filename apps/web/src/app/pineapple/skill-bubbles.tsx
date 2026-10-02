import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OceanText } from '@qa3elhamor/world-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SphereGeometry, Vector3, type Group, type Mesh } from 'three';
import { faceCamera } from '../ocean-text/screen-pose';
import { placeObjectDom, screenPointOf } from '../narrators/object-dom';
import { acceptsPick, type SelectSource } from '../narrators/object-selection';
import type { Vec3 } from '../narrators/view-layout';
import type { VisitObjectsProps } from '../narrators/visit-types';
import {
  SKILL_BUBBLE_TINTS,
  createSkillBubbleMaterial,
} from './skill-bubble-material';

export interface SkillBubbleSlot {
  readonly centre: Vec3;
  readonly radius: number;
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

interface BubbleMotion {
  progress: number;
  highlight: number;
}

/** A label surfaces once its bubble is this far out, and sinks again below `LABEL_SINK`. */
const LABEL_SURFACE = 0.72;
const LABEL_SINK = 0.5;
const toCamera = new Vector3();

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
  oceanLabels = null,
}: VisitObjectsProps<SkillBubbleSlot>) {
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
  // Ocean mode: each bubble's name in the water, on its front, facing the visitor.
  const labelGroups = useRef<(Group | null)[]>([]);
  const [surfaced, setSurfaced] = useState<readonly boolean[]>([]);
  const surfacedNow = useRef<boolean[]>([]);
  const motion = useRef<BubbleMotion[]>([]);
  const outSince = useRef<number | null>(null);
  const size = useThree((state) => state.size);

  useFrame(({ clock, camera }, delta) => {
    const now = clock.elapsedTime;
    const dt = Math.min(Math.max(delta, 0), 0.1);
    if (out && outSince.current === null) outSince.current = now;
    if (!out) outSince.current = null;
    const anySelected = selected !== null;
    // The landmark on screen: panels open on a bubble's far side from it.
    const hub = screenPointOf(camera, size, door.current);

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
      const labelGroup = labelGroups.current[i];
      if (labelGroup) {
        labelGroup.visible = p > LABEL_SINK;
        faceCamera(labelGroup, camera, toCamera);
        // On the bubble's front, a little inside its skin.
        toCamera
          .set(toCamera.x - x, toCamera.y - y, toCamera.z - z)
          .normalize();
        labelGroup.position.set(
          x + toCamera.x * radius * 0.55,
          y + toCamera.y * radius * 0.55,
          z + toCamera.z * radius * 0.55,
        );
        labelGroup.scale.setScalar(Math.max(radius, 1e-4));
        const up = surfacedNow.current[i] ?? false;
        const next = up ? p > LABEL_SINK : p >= LABEL_SURFACE;
        if (next !== up) {
          surfacedNow.current[i] = next;
          setSurfaced([...surfacedNow.current]);
        }
      }
      const u = material.uniforms;
      if (!reducedMotion) u.uTime.value = now;
      u.uHighlight.value = m.highlight;
      const faded = anySelected && !isSelected;
      u.uOpacity.value = clamp01(p * 1.6) * (faded ? 0.55 : 1);

      // The label over it, and the skills panel beside the selected one.
      placeObjectDom({
        camera,
        size,
        x,
        y,
        z,
        halfWidth: radius,
        halfHeight: radius,
        progress: p,
        faded,
        label: labels.current?.[i],
        panel: isSelected ? panel.current : null,
        hub,
        insets,
      });
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
      {oceanLabels &&
        ids.map((id, i) => {
          const object = oceanLabels.objects[i];
          if (!object) return null;
          const faded = selected !== null && selected !== id;
          return (
            <group
              key={`label:${id}`}
              ref={(group) => {
                labelGroups.current[i] = group;
              }}
              visible={false}
            >
              {/* In bubble radii: wraps inside the bubble's face. */}
              <OceanText
                text={object.label}
                fontUrl={oceanLabels.fontUrl}
                size={0.27}
                maxWidth={1.5}
                lineHeight={1.12}
                color={selected === id ? '#fff6d6' : '#f4fdff'}
                glowColor={SKILL_BUBBLE_TINTS[i % SKILL_BUBBLE_TINTS.length]}
                glowOpacity={0.75}
                shimmer={0.55}
                reveal={surfaced[i] ? 1 : 0}
                reducedMotion={reducedMotion}
                opacity={faded ? 0.6 : 1}
                renderOrder={3}
                onError={oceanLabels.onError}
              />
            </group>
          );
        })}
    </group>
  );
}
