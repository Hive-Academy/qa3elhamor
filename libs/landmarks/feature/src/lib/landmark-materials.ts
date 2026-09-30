import { useEffect, useLayoutEffect } from 'react';
import {
  Color,
  type ColorRepresentation,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';

const meshesOf = (root: Object3D): Mesh[] => {
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if ((object as Mesh).isMesh) meshes.push(object as Mesh);
  });
  return meshes;
};

/**
 * Gives this landmark instance its own material objects, so its hover tint cannot leak into
 * another instance of the same model (or any other mesh sharing a material). Textures stay
 * shared. The clones are disposed and the originals put back on unmount.
 */
export function useInstanceMaterials(model: Object3D | null): void {
  useLayoutEffect(() => {
    if (!model) return;
    const clones = new Map<Material, Material>();
    const swapped: { mesh: Mesh; original: Mesh['material'] }[] = [];
    const own = (material: Material): Material => {
      let clone = clones.get(material);
      if (!clone) {
        clone = material.clone();
        clones.set(material, clone);
      }
      return clone;
    };
    for (const mesh of meshesOf(model)) {
      swapped.push({ mesh, original: mesh.material });
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(own)
        : own(mesh.material);
    }
    return () => {
      for (const { mesh, original } of swapped) mesh.material = original;
      for (const clone of clones.values()) clone.dispose();
    };
  }, [model]);
}

interface EmissiveMaterial extends Material {
  emissive: Color;
  emissiveIntensity: number;
}

const isEmissive = (material: Material): material is EmissiveMaterial =>
  (material as Partial<EmissiveMaterial>).emissive instanceof Color;

/**
 * Tints the model's emissive while `active`, restoring the authored values after. Only
 * colour uniforms change, so no shader recompiles. Pair with `useInstanceMaterials`.
 */
export function useHoverTint(
  model: Object3D | null,
  active: boolean,
  tint: ColorRepresentation,
  intensity: number,
): void {
  useEffect(() => {
    if (!model || !active) return;
    const saved: {
      material: EmissiveMaterial;
      color: Color;
      intensity: number;
    }[] = [];
    const seen = new Set<Material>();
    const color = new Color(tint);
    for (const mesh of meshesOf(model)) {
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        if (seen.has(material) || !isEmissive(material)) continue;
        seen.add(material);
        saved.push({
          material,
          color: material.emissive.clone(),
          intensity: material.emissiveIntensity,
        });
        material.emissive.copy(color);
        material.emissiveIntensity = intensity;
      }
    }
    return () => {
      for (const entry of saved) {
        entry.material.emissive.copy(entry.color);
        entry.material.emissiveIntensity = entry.intensity;
      }
    };
  }, [model, active, tint, intensity]);
}
