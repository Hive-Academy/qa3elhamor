import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  MeshStandardMaterial,
  Plane,
  Vector3,
  type Group,
} from 'three';
import type { SignSpec } from '@qa3elhamor/world-ui';
import { placeObjectDom, screenPointOf } from '../narrators/object-dom';
import { acceptsPick, type SelectSource } from '../narrators/object-selection';
import type { VisitObject, VisitObjectsProps } from '../narrators/visit-types';
import { SIGN_FONTS, SignDecal } from '../ocean-text/sign-decal';
import {
  FACE_DEPTH,
  rowCentre,
  rowLift,
  type MenuRowSlot,
} from './krusty-layout';
import { DISH_KINDS, MenuDishes, dishOf, type DishKind } from './menu-dish';

/** Seconds for the whole opening (rise, flip, rows), and for putting it all away again. */
const OPEN_SECONDS = 2.6;
const CLOSE_SECONDS = 1.3;
/** The opening's beats, as fractions of it: the stand rises, then the face flips, then the rows. */
const RISE = [0, 0.3] as const;
const FLIP = [0.24, 0.72] as const;
const ROWS_FROM = 0.66;
const ROW_SPAN = 0.18;

/** Awning stripes across the board's width, and its tilt down towards the visitor. */
const STRIPES = 7;
const AWNING_TILT = 0.5;
/** The dish over the board: its plate's width over the board's. */
const DISH_SIZE = 0.3;

const WOOD = '#7a4b25';
const FRAME = '#97612f';
const PLANKS = '#a8733f';
const CHALK = '#2a5446';
const SLATE = '#3a7060';
const CHALK_LINE = '#dfeee4';
const AWNING_RED = '#c8392e';
const AWNING_WHITE = '#f3e8d2';
const GLOW = new Color('#ffbf66');
const SLATE_COLOR = new Color(SLATE);
const DIMMED = new Color('#1a2a26');
const SLATE_GLOW = new Color('#10302a');
const glow = new Color();

/** The chalked part of a row, between its two chalk rules (the row's own units). */
const ROW_TEXT = { width: 0.93, height: 0.86 } as const;
/** Logical pixels down a row; the texture is this times the pixel ratio (and the zoom). */
const ROW_PX = 120;

/** A menu row, chalked: the dish's name, and the real service under it, smaller. */
export function menuRowSign(
  object: VisitObject,
  aspect: number,
  pixelRatio: number,
  seed: number,
): SignSpec {
  return {
    width: Math.round(ROW_PX * aspect),
    height: ROW_PX,
    style: 'chalk',
    pixelRatio,
    seed,
    gap: 4,
    padding: ROW_PX * 0.2,
    lines: [
      {
        text: object.label,
        size: 44,
        weight: 700,
        family: SIGN_FONTS.paper,
        maxLines: 1,
      },
      {
        text: object.caption?.[0] ?? '',
        size: 26,
        weight: 600,
        family: SIGN_FONTS.ui,
        maxLines: 1,
        color: '#ffe9a8',
        tracking: 1.5,
        uppercase: true,
      },
    ],
  };
}

const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);
const span = (t: number, [from, to]: readonly [number, number]): number =>
  clamp01((t - from) / (to - from));
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
/** Past the end and back: the flip slaps shut, the rows pop. */
const easeOutBack = (t: number): number => {
  const s = 1.70158;
  return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
};

/** How far into the opening row `index` of `count` has popped out (0 to 1). */
export function rowProgress(
  opening: number,
  index: number,
  count: number,
): number {
  const stagger = count > 1 ? (1 - ROWS_FROM - ROW_SPAN) / (count - 1) : 0;
  return clamp01((opening - ROWS_FROM - index * stagger) / ROW_SPAN);
}

/**
 * The services as the Krusty Krab's menu board: a wooden board on two posts with a striped
 * awning rises out of the sand beside the restaurant, its face flips over from bare planks to the
 * chalkboard, and one row per service pops onto it. Pointing at a row (or focusing its label)
 * brings it out of the board towards the visitor, bigger and warm, while the others darken, and
 * its dish spins up over the awning. The labels and the detail are DOM in the stage (accessible,
 * crisp); this places them over the rows every frame.
 */
export function MenuBoard({
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
}: VisitObjectsProps<MenuRowSlot>) {
  const gl = useThree((state) => state.gl);
  // Painted at the zoom a selected row comes forward to, for the screen's pixel density.
  const signRatio = Math.min(gl.getPixelRatio(), 2) * 1.6;
  const chalk = useRef<(MeshStandardMaterial | null)[]>([]);
  const size = useThree((state) => state.size);
  // The board rises out of the seabed: everything under it is clipped away.
  useEffect(() => {
    const before = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    // The renderer is shared: hand it back as it was.
    return () => {
      gl.localClippingEnabled = before;
    };
  }, [gl]);

  const board = slots[0]?.board;
  const ground = board?.ground ?? 0;
  const clip = useMemo(
    () => [new Plane(new Vector3(0, 1, 0), -ground)],
    [ground],
  );
  const box = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const scallop = useMemo(
    // A half disc (its round side down once turned to face the visitor).
    () =>
      new CylinderGeometry(0.5, 0.5, 1, 12, 1, false, -Math.PI / 2, Math.PI),
    [],
  );
  const parts = useMemo(() => {
    const make = (color: string) =>
      new MeshStandardMaterial({
        color,
        flatShading: true,
        roughness: 0.9,
        metalness: 0,
        clippingPlanes: clip,
      });
    const wood = make(WOOD);
    const frame = make(FRAME);
    const planks = make(PLANKS);
    const chalk = make(CHALK);
    chalk.roughness = 1;
    // A little light of its own: the blue water would otherwise swallow the green.
    chalk.emissive.set('#0c2219');
    const line = make(CHALK_LINE);
    line.emissive.set('#3a4a44');
    const red = make(AWNING_RED);
    const white = make(AWNING_WHITE);
    // A face is one box: its edges wood, the chalkboard in front, bare planks behind.
    const face = [frame, frame, frame, frame, chalk, planks];
    return { wood, frame, planks, chalk, line, red, white, face };
  }, [clip]);
  const rowMaterials = useMemo(
    () =>
      ids.map(
        () =>
          new MeshStandardMaterial({
            color: SLATE,
            flatShading: true,
            roughness: 0.95,
            metalness: 0,
            clippingPlanes: clip,
          }),
      ),
    [ids, clip],
  );
  useEffect(
    () => () => {
      box.dispose();
      scallop.dispose();
      for (const material of new Set([
        ...Object.values(parts).flat(),
        ...rowMaterials,
      ]))
        material.dispose();
    },
    [box, scallop, parts, rowMaterials],
  );

  const stand = useRef<Group>(null);
  const face = useRef<Group>(null);
  const rows = useRef<(Group | null)[]>([]);
  const dishSpin = useRef<Group>(null);
  const dishes = useRef<Partial<Record<DishKind, Group | null>>>({});
  const opening = useRef(0);
  const highlight = useRef<number[]>([]);
  const dishShown = useRef<Record<DishKind, number>>({
    patty: 0,
    shake: 0,
    formula: 0,
  });
  const progress = useRef<number[]>([]);

  useFrame(({ clock, camera }, delta) => {
    if (!board) return;
    const dt = Math.min(Math.max(delta, 0), 0.1);
    const now = clock.elapsedTime;
    opening.current = reducedMotion
      ? out
        ? 1
        : 0
      : clamp01(
          opening.current + (out ? dt / OPEN_SECONDS : -dt / CLOSE_SECONDS),
        );
    const p = opening.current;
    const rise = easeOut(span(p, RISE));
    const flip = easeOutBack(span(p, FLIP));
    const sunk = (1 - rise) * board.height * 1.02;

    const group = stand.current;
    if (group) {
      group.visible = p > 0.001;
      group.position.set(board.foot[0], board.foot[1] - sunk, board.foot[2]);
      // A little sway on its posts once it stands.
      const sway = reducedMotion || p < 1 ? 0 : Math.sin(now * 0.6) * 0.006;
      group.rotation.set(0, board.yaw, sway);
    }
    // Bare planks to the visitor until it flips over to the chalkboard.
    if (face.current) face.current.rotation.x = -Math.PI * (1 - flip);

    const hub = screenPointOf(camera, size, door.current);
    const anySelected = selected !== null;
    const k = reducedMotion ? 1 : clamp01(dt * 7);

    ids.forEach((id, i) => {
      const slot = slots[i];
      const row = rows.current[i];
      const material = rowMaterials[i];
      if (!slot || !material) return;
      const isSelected = selected === id;
      const h =
        (highlight.current[i] ?? 0) +
        ((isSelected ? 1 : 0) - (highlight.current[i] ?? 0)) * k;
      highlight.current[i] = h;
      const rp = rowProgress(p, i, ids.length);
      progress.current[i] = rp;
      const pop = rp <= 0 ? 0 : easeOutBack(rp);
      const zoom = 1 + (board.zoom - 1) * h;
      // Out of the face along the line of sight: it stays put on screen and grows.
      const lift = rowLift(slot, h);
      if (row) {
        row.visible = rp > 0.001;
        row.position.set(
          0,
          slot.centre - (board.legs + board.face / 2) + lift.up,
          (board.width * FACE_DEPTH) / 2 + lift.out,
        );
        row.scale.set(slot.width * zoom * pop, slot.height * zoom * pop, 1);
      }
      const dim = anySelected && !isSelected ? 1 : 0;
      material.color.copy(SLATE_COLOR).lerp(DIMMED, dim * 0.55);
      material.emissive
        .copy(SLATE_GLOW)
        .multiplyScalar(1 - dim * 0.6)
        .add(glow.copy(GLOW).multiplyScalar(0.32 * h));
      const written = chalk.current[i];
      if (written)
        written.emissiveIntensity = 0.32 * (1 - dim * 0.55) + 0.18 * h;

      const [x, y, z] = rowCentre(slot, h);
      placeObjectDom({
        camera,
        size,
        x,
        y: y - sunk,
        z,
        halfWidth: (slot.width * zoom) / 2,
        halfHeight: (slot.height * zoom) / 2,
        progress: rp,
        faded: dim > 0,
        label: labels.current?.[i],
        panel: isSelected ? panel.current : null,
        hub,
        insets,
        // Towards the restaurant: the narrator and its bubble are on the other side.
        panelSide: 'right',
      });
    });

    // The selected row's dish spins up over the awning.
    const index = selected === null ? -1 : ids.indexOf(selected);
    const kind = index < 0 ? null : dishOf(index);
    const plate = board.width * DISH_SIZE;
    for (const each of DISH_KINDS) {
      const shown =
        dishShown.current[each] +
        ((kind === each ? 1 : 0) - dishShown.current[each]) * k;
      dishShown.current[each] = shown;
      const dish = dishes.current[each];
      if (!dish) continue;
      dish.visible = shown > 0.01 && p >= 1 - 1e-6;
      dish.scale.setScalar(plate * easeOut(shown));
    }
    if (dishSpin.current) {
      // Over the awning's restaurant end: the narrator's bubble is over its other end.
      dishSpin.current.position.set(
        board.width * 0.3,
        board.height +
          plate * 0.12 +
          (reducedMotion ? 0 : Math.sin(now * 1.7) * plate * 0.05),
        board.width * 0.05,
      );
      dishSpin.current.rotation.y = reducedMotion ? 0.5 : now * 1.4;
    }
  });

  const pointerPick =
    (id: string, i: number, source: SelectSource) =>
    (event: ThreeEvent<PointerEvent | MouseEvent>) => {
      const pointerType = (event.nativeEvent as Partial<PointerEvent>)
        .pointerType;
      if (!acceptsPick(source, pointerType, progress.current[i] ?? 0)) return;
      event.stopPropagation();
      onPick(id, source);
    };

  if (!board) return null;
  const { width, height, legs, face: faceTall } = board;
  const depth = width * FACE_DEPTH;
  const roof = height - legs - faceTall;
  const post = width * 0.07;
  const postTall = legs + faceTall + roof * 0.35;
  const rim = width * 0.045;
  const stripe = (width * 1.14) / STRIPES;
  const awningDeep = width * 0.2;
  const rowDeep = width * 0.022;

  return (
    <group ref={stand} name="menu-board" visible={false}>
      {/* Two posts, the face hinged between them. */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={box}
          material={parts.wood}
          position={[side * (width / 2 + post / 2), postTall / 2, 0]}
          scale={[post, postTall, post]}
        />
      ))}

      {/* The striped awning over it, tilted down towards the visitor, with a scalloped edge. */}
      <group
        position={[0, legs + faceTall + roof * 0.55, awningDeep * 0.25]}
        rotation={[AWNING_TILT, 0, 0]}
      >
        {Array.from({ length: STRIPES }, (_, s) => (
          <mesh
            key={s}
            geometry={box}
            material={s % 2 === 0 ? parts.red : parts.white}
            position={[-width * 0.57 + stripe * (s + 0.5), 0, 0]}
            scale={[stripe, roof * 0.12, awningDeep]}
          />
        ))}
        {/* The valance: a half disc hanging under each stripe's front end. */}
        {Array.from({ length: STRIPES }, (_, s) => (
          <mesh
            key={`edge-${s}`}
            geometry={scallop}
            material={s % 2 === 0 ? parts.red : parts.white}
            position={[-width * 0.57 + stripe * (s + 0.5), 0, awningDeep / 2]}
            rotation={[Math.PI / 2 - AWNING_TILT, 0, 0]}
            scale={[stripe, roof * 0.1, stripe * 0.7]}
          />
        ))}
      </group>
      <mesh
        geometry={box}
        material={parts.frame}
        position={[0, legs + faceTall + roof * 0.86, -awningDeep * 0.1]}
        scale={[width * 1.18, roof * 0.22, depth * 1.4]}
      />

      {/* The face: flips over on its hinges. Chalkboard in front, planks behind. */}
      <group ref={face} position={[0, legs + faceTall / 2, 0]}>
        <mesh
          geometry={box}
          material={parts.face}
          scale={[width, faceTall, depth]}
        />
        {/* A raised wooden frame round the chalkboard. */}
        {[-1, 1].map((side) => (
          <mesh
            key={`h${side}`}
            geometry={box}
            material={parts.frame}
            position={[0, side * (faceTall / 2 - rim / 2), depth * 0.15]}
            scale={[width + rim * 0.5, rim, depth * 1.3]}
          />
        ))}
        {[-1, 1].map((side) => (
          <mesh
            key={`v${side}`}
            geometry={box}
            material={parts.frame}
            position={[side * (width / 2 - rim / 2), 0, depth * 0.15]}
            scale={[rim, faceTall, depth * 1.3]}
          />
        ))}
        {/* One row per service: a slate with chalk rules over and under it. */}
        {ids.map((id, i) => {
          const material = rowMaterials[i];
          return (
            <group
              key={id}
              ref={(row) => {
                rows.current[i] = row;
              }}
              name={`menu-row:${id}`}
              visible={false}
            >
              <mesh
                geometry={box}
                material={material}
                scale={[1, 1, rowDeep]}
                onPointerOver={pointerPick(id, i, 'hover')}
                onClick={pointerPick(id, i, 'tap')}
              />
              {[-1, 1].map((side) => (
                <mesh
                  key={side}
                  geometry={box}
                  material={parts.line}
                  position={[0, side * 0.47, rowDeep * 0.55]}
                  scale={[0.94, 0.035, rowDeep * 0.2]}
                />
              ))}
              {oceanLabels?.objects[i] && slots[i] && (
                <SignDecal
                  spec={menuRowSign(
                    oceanLabels.objects[i],
                    (slots[i].width * ROW_TEXT.width) /
                      (slots[i].height * ROW_TEXT.height),
                    signRatio,
                    i + 3,
                  )}
                  anisotropy={oceanLabels.anisotropy}
                  width={ROW_TEXT.width}
                  height={ROW_TEXT.height}
                  position={[0, 0, rowDeep * 0.7]}
                  clippingPlanes={clip}
                  glow={0.32}
                  materialRef={(m) => {
                    chalk.current[i] = m;
                  }}
                />
              )}
            </group>
          );
        })}
      </group>

      <group ref={dishSpin} name="menu-dish">
        <MenuDishes dishes={dishes} clip={clip} />
      </group>
    </group>
  );
}
