import { useEffect, useMemo, type RefObject } from 'react';
import {
  BoxGeometry,
  DoubleSide,
  CylinderGeometry,
  MeshStandardMaterial,
  SphereGeometry,
  type Group,
  type Plane,
} from 'three';

/** The dishes the board serves, in turn down the menu. */
export const DISH_KINDS = ['patty', 'shake', 'formula'] as const;
export type DishKind = (typeof DISH_KINDS)[number];

/** Row `index`'s dish: a Krabby Patty, a kelp shake, a bottle of the secret formula, again. */
export const dishOf = (index: number): DishKind =>
  DISH_KINDS[
    ((index % DISH_KINDS.length) + DISH_KINDS.length) % DISH_KINDS.length
  ] ?? 'patty';

interface DishMaterials {
  readonly plate: MeshStandardMaterial;
  readonly bun: MeshStandardMaterial;
  readonly patty: MeshStandardMaterial;
  readonly lettuce: MeshStandardMaterial;
  readonly cheese: MeshStandardMaterial;
  readonly cup: MeshStandardMaterial;
  readonly shake: MeshStandardMaterial;
  readonly straw: MeshStandardMaterial;
  readonly glass: MeshStandardMaterial;
  readonly formula: MeshStandardMaterial;
  readonly cork: MeshStandardMaterial;
}

const flat = (color: string, clip: Plane[], extra = {}) =>
  new MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.75,
    metalness: 0,
    clippingPlanes: clip,
    ...extra,
  });

/**
 * Low-poly dishes, one unit across (the plate), built from a handful of primitives. Each kind
 * is a group under `dishes[kind]`; the board scales the selected row's dish up and spins it.
 */
export function MenuDishes({
  dishes,
  clip,
}: {
  readonly dishes: RefObject<Partial<Record<DishKind, Group | null>>>;
  readonly clip: Plane[];
}) {
  const geometry = useMemo(
    () => ({
      plate: new CylinderGeometry(0.5, 0.42, 0.06, 18),
      bunBottom: new CylinderGeometry(0.3, 0.27, 0.1, 14),
      patty: new CylinderGeometry(0.32, 0.32, 0.09, 14),
      lettuce: new CylinderGeometry(0.36, 0.34, 0.035, 9),
      cheese: new BoxGeometry(0.5, 0.025, 0.5),
      bunTop: new SphereGeometry(0.31, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
      cup: new CylinderGeometry(0.2, 0.14, 0.55, 12, 1, true),
      shake: new SphereGeometry(0.21, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      straw: new CylinderGeometry(0.022, 0.022, 0.42, 6),
      bottle: new CylinderGeometry(0.17, 0.17, 0.46, 10),
      shoulder: new SphereGeometry(0.17, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      neck: new CylinderGeometry(0.06, 0.07, 0.16, 8),
      cork: new CylinderGeometry(0.065, 0.06, 0.08, 8),
      formula: new CylinderGeometry(0.15, 0.15, 0.3, 10),
    }),
    [],
  );
  const materials: DishMaterials = useMemo(
    () => ({
      plate: flat('#f4efe4', clip),
      bun: flat('#d99a4e', clip),
      patty: flat('#6b3a1f', clip),
      lettuce: flat('#5aa64a', clip),
      cheese: flat('#f2c53d', clip),
      cup: flat('#e9f2ef', clip, { side: DoubleSide }),
      shake: flat('#7fbf6a', clip),
      straw: flat('#d6453a', clip),
      glass: flat('#9fd3e0', clip, { transparent: true, opacity: 0.55 }),
      formula: flat('#c43a8f', clip, {
        emissive: '#5a1240',
        emissiveIntensity: 0.6,
      }),
      cork: flat('#a8774a', clip),
    }),
    [clip],
  );
  useEffect(
    () => () => {
      for (const g of Object.values(geometry)) g.dispose();
      for (const m of Object.values(materials)) m.dispose();
    },
    [geometry, materials],
  );

  const keep = (kind: DishKind) => (group: Group | null) => {
    if (dishes.current) dishes.current[kind] = group;
  };

  return (
    <>
      <group ref={keep('patty')} name="dish:patty" scale={0} visible={false}>
        <mesh geometry={geometry.plate} material={materials.plate} />
        <mesh
          geometry={geometry.bunBottom}
          material={materials.bun}
          position={[0, 0.08, 0]}
        />
        <mesh
          geometry={geometry.patty}
          material={materials.patty}
          position={[0, 0.17, 0]}
        />
        <mesh
          geometry={geometry.cheese}
          material={materials.cheese}
          position={[0, 0.225, 0]}
          rotation={[0, Math.PI / 4, 0]}
        />
        <mesh
          geometry={geometry.lettuce}
          material={materials.lettuce}
          position={[0, 0.25, 0]}
        />
        <mesh
          geometry={geometry.bunTop}
          material={materials.bun}
          position={[0, 0.27, 0]}
        />
      </group>
      <group ref={keep('shake')} name="dish:shake" scale={0} visible={false}>
        <mesh geometry={geometry.plate} material={materials.plate} />
        <mesh
          geometry={geometry.cup}
          material={materials.cup}
          position={[0, 0.3, 0]}
        />
        <mesh
          geometry={geometry.shake}
          material={materials.shake}
          position={[0, 0.56, 0]}
        />
        <mesh
          geometry={geometry.straw}
          material={materials.straw}
          position={[0.07, 0.72, 0]}
          rotation={[0, 0, -0.3]}
        />
      </group>
      <group
        ref={keep('formula')}
        name="dish:formula"
        scale={0}
        visible={false}
      >
        <mesh geometry={geometry.plate} material={materials.plate} />
        <mesh
          geometry={geometry.formula}
          material={materials.formula}
          position={[0, 0.2, 0]}
        />
        <mesh
          geometry={geometry.bottle}
          material={materials.glass}
          position={[0, 0.26, 0]}
        />
        <mesh
          geometry={geometry.shoulder}
          material={materials.glass}
          position={[0, 0.49, 0]}
        />
        <mesh
          geometry={geometry.neck}
          material={materials.glass}
          position={[0, 0.69, 0]}
        />
        <mesh
          geometry={geometry.cork}
          material={materials.cork}
          position={[0, 0.8, 0]}
        />
      </group>
    </>
  );
}
