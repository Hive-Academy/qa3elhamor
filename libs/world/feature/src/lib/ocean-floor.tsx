import { useLoader } from '@react-three/fiber';
import { Component, Suspense, useLayoutEffect, type ErrorInfo, type ReactNode } from 'react';
import type { Material, Mesh, Object3D, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { applyCaustics, type CausticsUniforms } from './caustics-material.js';

/**
 * Every web asset is Meshopt-compressed (EXT_meshopt_compression is marked required), so the
 * decoder is mandatory. three's own GLTFLoader and decoder are used rather than drei's
 * `useGLTF`, whose three-stdlib copies lag behind the meshoptimizer version the asset pipeline
 * encodes with. The loader awaits `MeshoptDecoder.ready` itself.
 */
const withMeshopt = (loader: GLTFLoader): void => {
  loader.setMeshoptDecoder(MeshoptDecoder);
};

/**
 * Drops a model from R3F's loader cache, so the next mount fetches it again. Used after a
 * failed load (the cache would otherwise keep re-throwing the rejection) and on unmount.
 */
export const clearOceanModel = (url: string): void => useLoader.clear(GLTFLoader, url);

const isMesh = (object: Object3D): object is Mesh => (object as Mesh).isMesh === true;

const materialsOf = (mesh: Mesh): readonly Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material];

const isTexture = (value: unknown): value is Texture =>
  typeof value === 'object' && value !== null && (value as Texture).isTexture === true;

/** Releases the GPU memory held by every geometry, material and texture under `root`. */
export function disposeObjectTree(root: Object3D): void {
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (!isMesh(object)) return;
    object.geometry.dispose();
    for (const material of materialsOf(object)) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (isTexture(value)) value.dispose();
    }
    material.dispose();
  }
}

interface OceanFloorModelProps {
  readonly url: string;
  readonly caustics: CausticsUniforms;
}

const mountedModels = new Map<Object3D, number>();

/**
 * Registers one mounted user of a loaded model and returns its release. When the last user
 * releases, the model is disposed and evicted from the loader cache on the next task, unless
 * something re-mounted it in the meantime. The deferral is what makes this StrictMode-safe:
 * React's dev-only unmount/remount re-acquires synchronously, so the model survives it
 * instead of being evicted and refetched.
 */
export function retainModel(root: Object3D, release: () => void): () => void {
  mountedModels.set(root, (mountedModels.get(root) ?? 0) + 1);
  return () => {
    mountedModels.set(root, (mountedModels.get(root) ?? 1) - 1);
    setTimeout(() => {
      if ((mountedModels.get(root) ?? 0) > 0) return;
      mountedModels.delete(root);
      release();
    }, 0);
  };
}

/**
 * Lifetime: the model is owned by the mounted scene, not by the session. When the last
 * `OceanFloor` using it unmounts it is disposed and evicted from the loader cache, so
 * swapping `url` or tearing the scene down does not pin ~65k triangles and their textures.
 */
function OceanFloorModel({ url, caustics }: OceanFloorModelProps) {
  const gltf = useLoader(GLTFLoader, url, withMeshopt);

  useLayoutEffect(() => {
    gltf.scene.traverse((object) => {
      if (!isMesh(object)) return;
      for (const material of materialsOf(object)) applyCaustics(material, caustics);
    });
  }, [gltf, caustics]);

  // Layout effect: acquire synchronously on commit so a remount re-retains before the
  // previous owner's deferred release timer can fire and dispose a still-used scene.
  useLayoutEffect(
    () =>
      retainModel(gltf.scene, () => {
        disposeObjectTree(gltf.scene);
        clearOceanModel(url);
      }),
    [gltf, url]
  );

  return <primitive object={gltf.scene} />;
}

export interface ModelErrorBoundaryProps {
  /** The model URL; a new URL resets the boundary and tries again. */
  readonly url: string;
  readonly onError: (error: unknown, url: string) => void;
  /** Evicts the failed URL from the loader cache so a retry refetches. */
  readonly clearCache?: (url: string) => void;
  readonly children?: ReactNode;
}

interface ModelErrorBoundaryState {
  readonly failedUrl: string | null;
}

/**
 * Contains a failed model load (404, offline, decoder error) to the model itself: the rest of
 * the ocean keeps rendering, the error is reported, and the loader cache is cleared so a
 * later mount (or a new `url`) is a real retry rather than a replay of the cached rejection.
 */
export class ModelErrorBoundary extends Component<ModelErrorBoundaryProps, ModelErrorBoundaryState> {
  override state: ModelErrorBoundaryState = { failedUrl: null };

  static getDerivedStateFromError(): Partial<ModelErrorBoundaryState> {
    return { failedUrl: '' };
  }

  override componentDidCatch(error: unknown, _info: ErrorInfo): void {
    const { url, onError, clearCache = clearOceanModel } = this.props;
    this.setState({ failedUrl: url });
    clearCache(url);
    onError(error, url);
  }

  override componentDidUpdate(previous: ModelErrorBoundaryProps): void {
    if (this.state.failedUrl !== null && previous.url !== this.props.url) {
      this.setState({ failedUrl: null });
    }
  }

  override render(): ReactNode {
    return this.state.failedUrl === null ? this.props.children : null;
  }
}

const reportModelError = (error: unknown, url: string): void => {
  console.error(`Ocean environment model failed to load from ${url}; rendering the ocean without it.`, error);
};

export interface OceanFloorProps {
  /** Public URL of the environment GLB; resolve it with `assetUrl('environment', base)`. */
  readonly url: string;
  readonly caustics: CausticsUniforms;
  /** Called when the model cannot be loaded. Defaults to a console error. */
  readonly onError?: (error: unknown, url: string) => void;
}

/**
 * The seabed town, in scene-world units: mount it inside `<WorldSpace>`. Renders nothing
 * while loading and nothing (plus `onError`) if the load fails, so the ocean around it is
 * never blocked by the model.
 */
export function OceanFloor({ url, caustics, onError = reportModelError }: OceanFloorProps) {
  return (
    <ModelErrorBoundary url={url} onError={onError}>
      <Suspense fallback={null}>
        <OceanFloorModel url={url} caustics={caustics} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
