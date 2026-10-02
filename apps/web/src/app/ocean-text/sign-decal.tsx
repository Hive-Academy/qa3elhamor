import {
  createSignTexture,
  redrawSignTexture,
  signFont,
  type SignSpec,
} from '@qa3elhamor/world-ui';
import { useEffect, useMemo, useState, type Ref } from 'react';
import {
  Color,
  MeshStandardMaterial,
  type CanvasTexture,
  type Plane,
} from 'three';
import { SITE } from '../../site.config';

/** The page's faces, for painted signs: the UI face, and the paper (serif) one. */
export const SIGN_FONTS = {
  ui: SITE.theme.fontUi,
  paper: SITE.theme.fontPaper,
} as const;

/** Waits (briefly) for the web fonts a sign uses, so Arabic is painted in the site's face. */
async function fontsFor(spec: SignSpec): Promise<void> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts?.load) return;
  await Promise.race([
    Promise.all(
      spec.lines.map((line) =>
        fonts.load(signFont(line), line.text).catch(() => []),
      ),
    ),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
}

/**
 * A texture painted from `spec`, repainted when the spec changes (a new locale, a new pixel
 * ratio) and once the page's fonts for its words have arrived. Disposed with the component.
 */
export function useSignTexture(
  spec: SignSpec | null,
  anisotropy: number,
): CanvasTexture | null {
  const key = spec ? JSON.stringify(spec) : null;
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    if (key === null) {
      setTexture(null);
      return undefined;
    }
    const painted = JSON.parse(key) as SignSpec;
    const next = createSignTexture(painted, { anisotropy });
    setTexture(next);
    let live = true;
    void fontsFor(painted).then(() => {
      if (live && next) redrawSignTexture(next, painted);
    });
    return () => {
      live = false;
      next?.dispose();
    };
  }, [key, anisotropy]);
  return texture;
}

export interface SignDecalProps {
  readonly spec: SignSpec | null;
  readonly anisotropy: number;
  /** The decal's size and place in its parent's units. */
  readonly width: number;
  readonly height: number;
  readonly position: readonly [number, number, number];
  readonly clippingPlanes?: readonly Plane[];
  /** Light of its own (chalk on a dark slate), 0 for none. */
  readonly glow?: number;
  /** For the parent to dim it with the object it is painted on. */
  readonly materialRef?: Ref<MeshStandardMaterial>;
  readonly renderOrder?: number;
}

/**
 * Painted words on a surface: a plane just in front of it, lit by the scene like the surface
 * (so a carving sits in the stone's light), transparent where nothing is painted.
 */
export function SignDecal({
  spec,
  anisotropy,
  width,
  height,
  position,
  clippingPlanes,
  glow = 0,
  materialRef,
  renderOrder,
}: SignDecalProps) {
  const texture = useSignTexture(spec, anisotropy);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        transparent: true,
        depthWrite: false,
        roughness: 0.95,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.map = texture;
    material.emissiveMap = glow > 0 ? texture : null;
    material.emissive = new Color(glow > 0 ? '#ffffff' : '#000000');
    material.emissiveIntensity = glow;
    material.clippingPlanes = clippingPlanes ? [...clippingPlanes] : null;
    material.visible = texture !== null;
    material.needsUpdate = true;
  }, [material, texture, glow, clippingPlanes]);
  useEffect(() => {
    if (!materialRef) return;
    if (typeof materialRef === 'function') materialRef(material);
    else materialRef.current = material;
  }, [material, materialRef]);

  return (
    <mesh
      position={[...position]}
      material={material}
      renderOrder={renderOrder}
    >
      <planeGeometry args={[width, height]} />
    </mesh>
  );
}
