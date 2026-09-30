import { useLoader } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  clearOceanModel,
  disposeObjectTree,
  retainModel,
} from './ocean-floor.js';

const withMeshopt = (loader: GLTFLoader): void => {
  loader.setMeshoptDecoder(MeshoptDecoder);
};

/**
 * Loads a Meshopt-compressed GLB (every web asset is one) with the same loader and cache as
 * the ocean floor. It suspends while loading and throws on failure (wrap it in
 * `ModelErrorBoundary` or your own).
 *
 * Each caller gets its own instance (`scene.clone()`), so two landmarks can use the same
 * model: an `Object3D` has one parent, and mounting the cached scene twice would move it.
 * Instances share geometry, materials and textures; those are disposed, and the model
 * evicted, when the last user unmounts. Static models only: skinned meshes need
 * `SkeletonUtils.clone`.
 */
export function useCompressedModel(url: string): Object3D {
  const gltf = useLoader(GLTFLoader, url, withMeshopt);

  useLayoutEffect(
    () =>
      retainModel(gltf.scene, () => {
        disposeObjectTree(gltf.scene);
        clearOceanModel(url);
      }),
    [gltf, url],
  );

  return useMemo(() => gltf.scene.clone(true), [gltf]);
}

/** Drops a model from the loader cache so the next `useCompressedModel(url)` refetches it. */
export const evictCompressedModel = (url: string): void => clearOceanModel(url);
