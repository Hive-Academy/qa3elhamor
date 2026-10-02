import { useFrame, useThree } from '@react-three/fiber';
import { OceanText, isRtlText } from '@qa3elhamor/world-ui';
import { useEffect, useRef, type RefObject } from 'react';
import type { Group } from 'three';
import { SIGN_FONTS, SignDecal } from '../ocean-text/sign-decal';
import { setVeilHole } from './in-world-atmosphere';
import { IN_WORLD_DISTANCE_FACTOR } from './in-world-pose';

/** A card's title over it, in the water: underwater SDF text, or a painted board. */
export interface InWorldCardTitle {
  readonly text: string;
  /** A smaller line over the title (the landmark's name over the form's). */
  readonly caption?: string;
  /** `sdf`: underwater text that surfaces as the card settles. `sign`: a painted wooden board. */
  readonly look: 'sdf' | 'sign';
  /** The page's direction: a board that cannot stand over the card hangs at its reading end. */
  readonly dir: 'ltr' | 'rtl';
  readonly fontUrl: string;
  readonly anisotropy: number;
  readonly onError: (error: unknown) => void;
}

/** The card's own units: drei `<Html transform>` lays one CSS pixel out at this many. */
const PX = IN_WORLD_DISTANCE_FACTOR / 400;
/** Gap between the card's top edge and the title's foot, in CSS pixels. */
const GAP_PX = 14;
/** The painted board's size, in CSS pixels. */
const BOARD = { width: 260, height: 132 } as const;
/** How tall each look stands over the card, in CSS pixels. */
const TITLE_PX = { sign: BOARD.height, sdf: 70 } as const;
/** Kept clear of the screen's edge, in CSS pixels. */
const EDGE_PX = 12;

/** Where the title goes: over the card, hanging beside its top (a board only), or nowhere. */
export type CardTitlePlace = 'above' | 'side' | 'none';

/**
 * Over the settled card if the screen has room above it (one CSS pixel is one screen pixel
 * there), else beside its top for a board if there is room at the side, else nowhere.
 */
export function cardTitlePlace(
  look: InWorldCardTitle['look'],
  card: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  liftPx: number,
): CardTitlePlace {
  if (!(card.height > 0)) return 'none';
  const top = viewport.height / 2 - liftPx - card.height / 2;
  if (top - GAP_PX - TITLE_PX[look] >= EDGE_PX) return 'above';
  const side = (viewport.width - card.width) / 2;
  if (look === 'sign' && side - GAP_PX - BOARD.width >= EDGE_PX) return 'side';
  return 'none';
}

/**
 * The title, floating just over the card's top edge (whatever the card's height: it is measured
 * as it changes). Rendered inside the card's posed group, so it flies, tumbles and bobs with it.
 * Decorative: the card's DOM carries its own heading for assistive technology.
 */
export function CardTitle({
  title,
  surface,
  settled,
  liftPx,
  reducedMotion,
}: {
  readonly title: InWorldCardTitle;
  readonly surface: RefObject<HTMLDivElement | null>;
  readonly settled: boolean;
  /** The card's settled lift over the viewport's centre (`InWorldCard liftPx`). */
  readonly liftPx: number;
  readonly reducedMotion: boolean;
}) {
  const group = useRef<Group>(null);
  const card = useRef({ width: 0, height: 0 });
  const ratio = useThree((state) => Math.min(state.gl.getPixelRatio(), 2));

  // The card's DOM mounts in drei's own root, after this: watched once it is there.
  const watched = useRef<{
    element: HTMLElement;
    observer: ResizeObserver | null;
  } | null>(null);
  const watch = (element: HTMLElement | null) => {
    if (watched.current?.element === element) return;
    watched.current?.observer?.disconnect();
    watched.current = null;
    if (!element) return;
    const measure = () => {
      card.current = {
        width: element.offsetWidth,
        height: element.offsetHeight,
      };
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);
    watched.current = { element, observer };
  };
  useEffect(
    () => () => {
      watched.current?.observer?.disconnect();
      setVeilHole('title', null);
    },
    [],
  );

  useFrame(({ size }) => {
    const g = group.current;
    if (!g) return;
    watch(surface.current);
    // A tall card on a short screen leaves no room for a title: the card then shows its own
    // heading (`data-title-room` on its surface, for its stylesheet).
    const { width, height } = card.current;
    const place = cardTitlePlace(title.look, card.current, size, liftPx);
    const element = surface.current;
    const flag = place === 'none' ? 'none' : 'yes';
    if (element && element.dataset['titleRoom'] !== flag)
      element.dataset['titleRoom'] = flag;
    g.visible = place !== 'none';
    // The veil stays off the settled title (its window, in screen pixels).
    const centreX = size.width / 2;
    const top = size.height / 2 - liftPx - height / 2;
    const titleWidth = title.look === 'sign' ? BOARD.width : 560;
    const end = title.dir === 'rtl' ? -1 : 1;
    setVeilHole(
      'title',
      !settled || place === 'none'
        ? null
        : place === 'side'
          ? {
              x:
                centreX +
                end * (width / 2 + GAP_PX + BOARD.width / 2) -
                BOARD.width / 2,
              y: top + 18,
              width: BOARD.width,
              height: BOARD.height,
            }
          : {
              x: centreX - titleWidth / 2,
              y: top - GAP_PX - TITLE_PX[title.look],
              width: titleWidth,
              height: TITLE_PX[title.look],
            },
    );
    if (place === 'side') {
      // Hanging at the reading end of the card's top, a little askew.
      g.position.set(
        end * (width / 2 + GAP_PX + BOARD.width / 2) * PX,
        (height / 2 - BOARD.height - 18) * PX,
        0,
      );
      g.rotation.z = -end * 0.035;
    } else {
      g.position.set(0, (height / 2 + GAP_PX) * PX, 0);
      g.rotation.z = 0;
    }
  });

  if (title.look === 'sign') {
    return (
      <group ref={group} visible={false}>
        <SignDecal
          spec={{
            width: BOARD.width,
            height: BOARD.height,
            style: 'painted',
            pixelRatio: ratio,
            seed: 7,
            gap: 4,
            padding: 26,
            lines: [
              ...(title.caption
                ? [
                    {
                      text: title.caption,
                      size: 17,
                      weight: 700,
                      family: SIGN_FONTS.ui,
                      maxLines: 1,
                      color: '#ffe08a',
                      tracking: 2,
                      uppercase: true,
                    },
                  ]
                : []),
              {
                text: title.text,
                size: 30,
                weight: 700,
                family: SIGN_FONTS.paper,
                maxLines: 3,
              },
            ],
          }}
          anisotropy={title.anisotropy}
          width={BOARD.width * PX}
          height={BOARD.height * PX}
          position={[0, (BOARD.height / 2) * PX, 0]}
          glow={0.45}
        />
      </group>
    );
  }

  return (
    <group ref={group} visible={false}>
      {title.caption && (
        <OceanText
          text={title.caption}
          fontUrl={title.fontUrl}
          size={15 * PX}
          letterSpacing={isRtlText(title.caption) ? 0 : 0.18}
          anchorY="bottom"
          color="#9fe6ff"
          glowColor="#1fb8ff"
          glowOpacity={0.45}
          reveal={settled ? 1 : 0}
          reducedMotion={reducedMotion}
          position={[0, 44 * PX, 0]}
          onError={title.onError}
        />
      )}
      <OceanText
        text={title.text}
        fontUrl={title.fontUrl}
        size={32 * PX}
        maxWidth={560 * PX}
        anchorY="bottom"
        color="#fff4d6"
        glowColor="#36d6ff"
        glowOpacity={0.6}
        shimmer={0.75}
        reveal={settled ? 1 : 0}
        reducedMotion={reducedMotion}
        onError={title.onError}
      />
    </group>
  );
}
