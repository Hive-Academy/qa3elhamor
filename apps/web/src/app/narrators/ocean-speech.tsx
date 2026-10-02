import { useFrame, useThree } from '@react-three/fiber';
import {
  OceanBubble,
  OceanText,
  type OceanTextBounds,
} from '@qa3elhamor/world-ui';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Group } from 'three';
import {
  OCEAN_SPEECH_PAD_PX,
  OCEAN_SPEECH_TAG_ROOM_PX,
  OCEAN_SPEECH_UNIT_PX,
  departingOpacity,
  oceanSpeechBoxPx,
  oceanSpeechFontPx,
  oceanSpeechWrapPx,
  oceanTailSide,
  popScale,
  type OceanSpeechLink,
} from './ocean-speech-link';

const K = OCEAN_SPEECH_UNIT_PX;
const PAD = OCEAN_SPEECH_PAD_PX / K;
/** The glass starts this far under the box's top: the name tag's room on its rim. */
const ROOM = OCEAN_SPEECH_TAG_ROOM_PX / K;
/** Over everything else in the water, as the DOM bubble is over the canvas. */
const RENDER_ORDER = 40;

export interface OceanSpeechProps {
  readonly link: OceanSpeechLink;
  readonly fontUrl: string;
  readonly reducedMotion?: boolean;
  readonly onError: (error: unknown) => void;
}

interface BoxSize {
  readonly width: number;
  readonly height: number;
  readonly tail: 'left' | 'right';
  /** Where the narrator is along the bottom edge, in CSS pixels from the box's left. */
  readonly tailX: number;
}

/** The tail follows the narrator along the bottom edge in steps this big (fewer re-renders). */
const TAIL_STEP_PX = 6;

/**
 * A narrator's line as underwater text in a glass bubble: the twin of the HUD's DOM bubble
 * (`SpeechBubble` in ocean mode), drawn exactly where the screen placement keeps that box beside
 * the narrator. The letters surface with the typewriter (and so with the voice), the speaker's
 * name sits on the rim as a small amber tag, and the DOM box (transparent, with its buttons as
 * glass pills along the bottom) takes the clicks and the focus. Decorative: the words are in the
 * DOM bubble for assistive technology.
 */
export function OceanSpeech({
  link,
  fontUrl,
  reducedMotion = false,
  onError,
}: OceanSpeechProps) {
  const line = useSyncExternalStore(link.subscribe, link.get, link.get);
  const viewportWidth = useThree((state) => state.size.width);
  const [text, setText] = useState<OceanTextBounds | null>(null);
  const [name, setName] = useState<OceanTextBounds | null>(null);
  const [topic, setTopic] = useState<OceanTextBounds | null>(null);
  const [box, setBox] = useState<BoxSize | null>(null);
  const [fade, setFade] = useState(1);
  const pop = useRef<Group>(null);
  const shownAt = useRef<number | null>(null);
  const departedAt = useRef<number | null>(null);

  const showing = line !== null;
  const departing = line?.departing ?? false;
  useEffect(() => {
    if (!showing) {
      shownAt.current = null;
      setText(null);
      setBox(null);
    }
  }, [showing]);
  useEffect(() => {
    departedAt.current = null;
    if (!departing) setFade(1);
  }, [departing]);

  const fontPx = oceanSpeechFontPx(viewportWidth);
  const wrapPx = oceanSpeechWrapPx(viewportWidth);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    // The DOM box takes the drawn text's size: its click target, and where its buttons sit.
    const element = link.box.current;
    if (element && text) {
      const height = `${Math.ceil((text.maxY - text.minY) * K)}px`;
      const width = `${oceanSpeechBoxPx((text.maxX - text.minX) * K, viewportWidth)}px`;
      if (element.style.getPropertyValue('--ocean-text-h') !== height)
        element.style.setProperty('--ocean-text-h', height);
      if (element.style.getPropertyValue('--ocean-w') !== width)
        element.style.setProperty('--ocean-w', width);
    }
    const { placed } = link;
    if (placed.width > 0 && placed.height > 0) {
      const tail = oceanTailSide(placed.tailX, placed.width);
      const tailX = Math.round(placed.tailX / TAIL_STEP_PX) * TAIL_STEP_PX;
      if (
        !box ||
        Math.abs(box.width - placed.width) > 0.5 ||
        Math.abs(box.height - placed.height) > 0.5 ||
        box.tail !== tail ||
        box.tailX !== tailX
      )
        setBox({ width: placed.width, height: placed.height, tail, tailX });
    }

    if (!line) return;
    shownAt.current ??= now;
    if (pop.current) {
      const s = reducedMotion ? 1 : popScale(now - shownAt.current);
      pop.current.scale.setScalar(s);
    }
    if (line.departing) {
      departedAt.current ??= now;
      const next = departingOpacity(
        now - departedAt.current,
        line.lingerSeconds,
      );
      if (Math.abs(next - fade) > 0.02 || (next === 0 && fade !== 0))
        setFade(next);
    }
  });

  const w = (box?.width ?? 0) / K;
  const h = (box?.height ?? 0) / K;
  const body = useMemo(
    () => ({ minX: PAD, maxX: w - PAD, minY: -h + PAD, maxY: -ROOM - PAD }),
    [w, h],
  );
  if (!line) return null;
  const rtl = line.dir === 'rtl';
  const textHeight = text ? text.maxY - text.minY : 0;

  // The name tag on the top rim, at the reading start; the topic after it.
  const tagX = rtl ? w - PAD * 1.1 : PAD * 1.1;
  const nameWidth = name ? name.maxX - name.minX : 0;
  const topicX = rtl ? tagX - nameWidth - 0.24 : tagX + nameWidth + 0.24;

  return (
    <group
      ref={(group) => {
        link.frame.current = group;
      }}
      matrixAutoUpdate={false}
      visible={false}
      name="ocean-speech"
    >
      {/* Pops from the bubble's centre, as the DOM bubble did. */}
      <group ref={pop} position={[w / 2, -h / 2, 0]}>
        <group position={[-w / 2, h / 2, 0]}>
          {box && text && (
            <OceanBubble
              bounds={body}
              padding={PAD}
              tail={box.tail}
              tailAt={box.tailX / K}
              density={1.75}
              color="#042a40"
              // The keyboard's focus ring, drawn by the glass itself.
              rimColor={line.ringed ? '#ffd68c' : '#9ff4ff'}
              reducedMotion={reducedMotion}
              opacity={fade}
              depthTest={false}
              renderOrder={RENDER_ORDER}
            />
          )}
          <OceanText
            text={line.text}
            fontUrl={fontUrl}
            size={fontPx / K}
            maxWidth={wrapPx / K}
            lineHeight={1.42}
            align={rtl ? 'right' : 'left'}
            color="#fffaf0"
            glowColor="#2fc9ff"
            glowOpacity={0.35}
            shimmer={0.4}
            tint={0.25}
            reveal={{ characters: line.typed }}
            reducedMotion={reducedMotion}
            opacity={box ? fade : 0}
            depthTest={false}
            fog={false}
            position={[w / 2, -(ROOM + PAD + textHeight / 2), 0.002]}
            renderOrder={RENDER_ORDER + 2}
            onLayout={setText}
            onError={onError}
          />
          <NameTag
            text={line.speaker}
            x={tagX}
            anchor={rtl ? 'right' : 'left'}
            bounds={name}
            onLayout={setName}
            fontUrl={fontUrl}
            fade={box ? fade : 0}
            color="#f2b62e"
            rim="#fff1b0"
            ink="#2b1700"
            glow="#ffe28a"
            reducedMotion={reducedMotion}
            onError={onError}
          />
          {line.topic && name && (
            <NameTag
              text={line.topic}
              x={topicX}
              anchor={rtl ? 'right' : 'left'}
              bounds={topic}
              onLayout={setTopic}
              fontUrl={fontUrl}
              fade={box ? fade : 0}
              color="#7fdcf2"
              rim="#e6fdff"
              ink="#062a3a"
              glow="#bff6ff"
              reducedMotion={reducedMotion}
              onError={onError}
            />
          )}
        </group>
      </group>
    </group>
  );
}

/** A small glass capsule with a word in it, centred on the bubble's top rim. */
function NameTag({
  text,
  x,
  anchor,
  bounds,
  onLayout,
  fontUrl,
  fade,
  color,
  rim,
  ink,
  glow,
  reducedMotion,
  onError,
}: {
  readonly text: string;
  readonly x: number;
  readonly anchor: 'left' | 'right';
  readonly bounds: OceanTextBounds | null;
  readonly onLayout: (bounds: OceanTextBounds) => void;
  readonly fontUrl: string;
  readonly fade: number;
  readonly color: string;
  readonly rim: string;
  readonly ink: string;
  readonly glow: string;
  readonly reducedMotion: boolean;
  readonly onError: (error: unknown) => void;
}) {
  const pad = 0.07;
  return (
    <group position={[x + (anchor === 'left' ? pad : -pad), -ROOM, 0.004]}>
      {bounds && (
        <OceanBubble
          bounds={bounds}
          padding={pad}
          tail="none"
          density={2.4}
          color={color}
          rimColor={rim}
          reducedMotion={reducedMotion}
          rising={false}
          opacity={fade}
          depthTest={false}
          renderOrder={RENDER_ORDER + 4}
        />
      )}
      <OceanText
        text={text}
        fontUrl={fontUrl}
        size={0.16}
        anchorX={anchor}
        color={ink}
        glowColor={glow}
        // Dark ink on a bright tag: a glow would only blur it.
        glowOpacity={0}
        shimmer={0.15}
        tint={0}
        reducedMotion={reducedMotion}
        opacity={fade}
        depthTest={false}
        fog={false}
        position={[0, 0, 0.002]}
        renderOrder={RENDER_ORDER + 6}
        onLayout={onLayout}
        onError={onError}
      />
    </group>
  );
}
