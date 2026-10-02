import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ColorRepresentation } from 'three';
import { boundsFromTroika, sameBounds, type OceanTextBounds } from './ocean-bubble-layout.js';
import { createOceanTextMaterial } from './ocean-text-material.js';
import {
  OCEAN_GLYPH_ITEM_SIZE,
  oceanGlyphData,
  oceanTextOf,
  revealInText,
  revealTargetHead,
  stepRevealHead,
  type OceanTextReveal,
} from './ocean-text-reveal.js';

export type OceanTextAlign = 'left' | 'center' | 'right';
export type OceanTextDirection = 'auto' | 'ltr' | 'rtl';
export type OceanTextAnchorX = 'left' | 'center' | 'right';
export type OceanTextAnchorY = 'top' | 'middle' | 'bottom';

export interface OceanTextProps {
  readonly text: string;
  /**
   * A .ttf, .otf or .woff (not .woff2) font with every glyph `text` uses, resolved by the app
   * (e.g. against `import.meta.env.BASE_URL`). Leave it out only in throwaway code: troika then
   * fetches a fallback font from a CDN, which the site's Content-Security-Policy blocks.
   */
  readonly fontUrl?: string;
  /** Font size (em) in local units. */
  readonly size?: number;
  readonly color?: ColorRepresentation;
  readonly glowColor?: ColorRepresentation;
  /** Opacity of the aqua glow, 0 for none. */
  readonly glowOpacity?: number;
  readonly align?: OceanTextAlign;
  /** `auto` follows the first strong character (Arabic text lays out right-to-left). */
  readonly direction?: OceanTextDirection;
  /** Wrap width in local units; unbounded when left out. */
  readonly maxWidth?: number;
  readonly lineHeight?: number;
  /** How much is shown; everything when left out. See `OceanTextReveal`. */
  readonly reveal?: OceanTextReveal;
  /** Static look: no wobble, no shimmer animation, no pop-in (glyphs simply appear). */
  readonly reducedMotion?: boolean;
  /** Caustic shimmer strength, 0..1. */
  readonly shimmer?: number;
  /** Chromatic tint strength, 0..1. */
  readonly tint?: number;
  /** Extra space between letters, in em. Keep 0 for Arabic (it is cursive). */
  readonly letterSpacing?: number;
  /** Which point of the text block sits at `position`. Default the block's centre. */
  readonly anchorX?: OceanTextAnchorX;
  readonly anchorY?: OceanTextAnchorY;
  /** Multiplies the fill and the glow, 0..1 (fades without re-layout). */
  readonly opacity?: number;
  /** False draws over the scene (a label that must never sink into a model). Default true. */
  readonly depthTest?: boolean;
  /** False ignores the scene's fog (text that must stay readable far off). Default true. */
  readonly fog?: boolean;
  readonly position?: readonly [number, number, number];
  readonly renderOrder?: number;
  /** The laid-out text block, in local units, after every re-layout. */
  readonly onLayout?: (bounds: OceanTextBounds) => void;
  /**
   * The font could not be read or the text could not be typeset: the text renders nothing, and
   * the caller can show its HTML instead. Without it the error is swallowed the same way.
   */
  readonly onError?: (error: unknown) => void;
}

/** The parts of troika's Text mesh this component reads after a sync. */
interface SyncedTroikaText {
  readonly textRenderInfo: {
    readonly glyphBounds: ArrayLike<number>;
    readonly blockBounds: ArrayLike<number>;
  };
  readonly geometry: {
    updateAttributeData(name: string, data: Float32Array, itemSize: number): void;
  };
}

function isSyncedTroikaText(value: unknown): value is SyncedTroikaText {
  if (typeof value !== 'object' || value === null) return false;
  const { textRenderInfo, geometry } = value as Record<string, unknown>;
  if (typeof textRenderInfo !== 'object' || textRenderInfo === null) return false;
  if (typeof geometry !== 'object' || geometry === null) return false;
  const info = textRenderInfo as Record<string, unknown>;
  const blockBounds = info['blockBounds'] as { length?: unknown } | null | undefined;
  return (
    info['glyphBounds'] instanceof Float32Array &&
    typeof blockBounds?.length === 'number' &&
    typeof (geometry as Record<string, unknown>)['updateAttributeData'] === 'function'
  );
}

const GLYPH_ATTRIBUTE = 'aOceanGlyph';

/**
 * SDF text (troika via drei `<Text>`) with the underwater shader: caustic shimmer, a gentle
 * per-glyph wave, an aqua glow and a per-letter "surfacing" reveal a typewriter can drive.
 * Arabic is shaped and laid out right-to-left by troika when the font has Arabic glyphs.
 *
 * WebGL-only and decorative: the words must also exist in the page's accessible HTML layer.
 * Renders nothing until its font has loaded (it suspends inside its own boundary).
 */
export function OceanText(props: OceanTextProps) {
  return (
    <OceanTextBoundary onError={props.onError}>
      <Suspense fallback={null}>
        <OceanTextMesh {...props} />
      </Suspense>
    </OceanTextBoundary>
  );
}

/**
 * Keeps a font or typesetting failure local: decorative text disappears instead of taking the
 * whole canvas down with it, and the caller hears about it (to show its HTML layer).
 */
class OceanTextBoundary extends Component<
  { readonly onError?: (error: unknown) => void; readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError?.(error);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function OceanTextMesh({
  text,
  fontUrl,
  size = 0.22,
  color = '#fffaf0',
  glowColor = '#4fe3ff',
  glowOpacity = 0.55,
  align = 'center',
  direction = 'auto',
  maxWidth,
  lineHeight = 1.35,
  reveal,
  reducedMotion = false,
  shimmer = 0.6,
  tint = 0.35,
  letterSpacing = 0,
  anchorX = 'center',
  anchorY = 'middle',
  opacity = 1,
  depthTest = true,
  fog = true,
  position,
  renderOrder,
  onLayout,
}: OceanTextProps) {
  const ocean = useMemo(() => createOceanTextMaterial(), []);
  useEffect(() => () => ocean.material.dispose(), [ocean]);
  useEffect(() => {
    // troika's derived material inherits these from the base one.
    ocean.material.depthTest = depthTest;
    ocean.material.fog = fog;
    ocean.material.needsUpdate = true;
  }, [ocean, depthTest, fog]);
  const fade = Math.min(1, Math.max(0, opacity));

  const [glyphCount, setGlyphCount] = useState(0);
  // What troika sets: no bidi controls (it has its own bidi, and the font has no glyphs for them).
  const shown = useMemo(() => oceanTextOf(text), [text]);
  const target = useMemo(
    () => revealTargetHead(revealInText(reveal, text), glyphCount, shown),
    [reveal, glyphCount, text, shown],
  );
  const lastBounds = useRef<OceanTextBounds | null>(null);
  const onLayoutRef = useRef(onLayout);
  useEffect(() => {
    onLayoutRef.current = onLayout;
  }, [onLayout]);

  const handleSync = useCallback((mesh: unknown) => {
    if (!isSyncedTroikaText(mesh)) return;
    const { glyphBounds, blockBounds } = mesh.textRenderInfo;
    mesh.geometry.updateAttributeData(
      GLYPH_ATTRIBUTE,
      oceanGlyphData(glyphBounds),
      OCEAN_GLYPH_ITEM_SIZE,
    );
    setGlyphCount(Math.floor(glyphBounds.length / 4));
    const bounds = boundsFromTroika(blockBounds);
    if (bounds && !sameBounds(bounds, lastBounds.current)) {
      lastBounds.current = bounds;
      onLayoutRef.current?.(bounds);
    }
  }, []);

  useFrame((state, delta) => {
    const u = ocean.uniforms;
    u.uOceanMotion.value = reducedMotion ? 0 : 1;
    u.uOceanTime.value = reducedMotion ? 0 : state.clock.elapsedTime;
    u.uOceanEm.value = size;
    u.uOceanShimmer.value = shimmer;
    u.uOceanTint.value = tint;
    u.uOceanRevealHead.value = stepRevealHead(
      u.uOceanRevealHead.value,
      target,
      delta,
      reducedMotion,
    );
  });

  return (
    <Text
      font={fontUrl}
      fontSize={size}
      color={color}
      textAlign={align}
      direction={direction}
      maxWidth={maxWidth}
      lineHeight={lineHeight}
      letterSpacing={letterSpacing}
      anchorX={anchorX}
      anchorY={anchorY}
      outlineWidth={glowOpacity > 0 ? '2.5%' : 0}
      outlineBlur={glowOpacity > 0 ? '30%' : 0}
      outlineColor={glowColor}
      outlineOpacity={glowOpacity * fade}
      fillOpacity={fade}
      visible={fade > 0}
      material={ocean.material}
      position={position ? [...position] : undefined}
      renderOrder={renderOrder}
      onSync={handleSync}
    >
      {shown}
    </Text>
  );
}
