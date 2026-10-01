import { assetAllowed } from '@qa3elhamor/world-domain';
import {
  NARRATOR_CAST,
  NARRATOR_SPEECH_HEADROOM,
  Narrator,
  assetUrl,
  useCompressedModel,
  useQuality,
  type NarratorCastId,
  type NarratorProps,
} from '@qa3elhamor/world-feature';
import { Component, Suspense, useEffect, useRef, type ReactNode } from 'react';
import type { NarratorChoice } from '../narrators.config';
import { addScaled, type Vec3 } from './view-layout';

/** Everything a landmark tells its narrator, whoever plays it. */
export type LandmarkNarratorProps = Omit<NarratorProps, 'cast' | 'scale'> & {
  readonly choice: NarratorChoice;
  /** How tall the narrator should look, in the parent's units (the original cast's height). */
  readonly height: number;
  /**
   * Who actually plays: `choice` itself, or its fallback cast when the tier does not allow the
   * model or it fails to load. Lets the bubble's name tag (and anything sized to the narrator)
   * follow what is on screen.
   */
  readonly onPlaying?: (playing: NarratorChoice) => void;
};

/** The original cast member standing in for a bundled model. */
export const fallbackOf = (choice: NarratorChoice): NarratorChoice =>
  choice.kind === 'cast' ? choice : { kind: 'cast', cast: choice.fallback };

/** The rendered height of `choice` when asked to look `height` tall. */
export const narratorRenderedHeight = (
  choice: NarratorChoice,
  height: number,
): number => (choice.kind === 'model' ? height * choice.heightFactor : height);

/**
 * The point a speech bubble's tail points at: just above the narrator's head, clear of its bob
 * and talk hop. Fixed (it ignores the animation), so the bubble does not jitter.
 */
export const speechAnchorOf = (
  choice: NarratorChoice,
  post: Vec3,
  height: number,
): Vec3 =>
  addScaled(
    post,
    [0, 1, 0],
    narratorRenderedHeight(choice, height) * (1 + NARRATOR_SPEECH_HEADROOM),
  );

/**
 * Where its breath bubbles rise from: in front of its face, towards `restYaw` (the visitor).
 * `height` is the rendered height (`narratorRenderedHeight`). A fish's mouth is low on its body
 * and well forward (it is twice as long as it is high); a standing character's is high and near.
 */
export function mouthOf(
  choice: NarratorChoice,
  post: Vec3,
  height: number,
  restYaw: number,
): Vec3 {
  const [up, forward] = choice.kind === 'model' ? [0.78, 0.22] : [0.55, 0.7];
  return [
    post[0] + Math.sin(restYaw) * height * forward,
    post[1] + height * up,
    post[2] + Math.cos(restYaw) * height * forward,
  ];
}

/**
 * A landmark's narrator as configured (`narrators.config.ts`): one of the original cast, or a
 * bundled character model. The model is lazy and tier-gated (`assetAllowed`): where the tier
 * does not allow it, or it fails to load, the original cast plays instead; while it loads,
 * nothing shows and it swims in once it arrives.
 */
export function LandmarkNarrator({
  choice,
  height,
  onPlaying,
  ...props
}: LandmarkNarratorProps) {
  const { tier } = useQuality();
  const report = useRef(onPlaying);
  useEffect(() => {
    report.current = onPlaying;
  });
  const gated = choice.kind === 'model' && !assetAllowed(choice.asset, tier);
  useEffect(() => {
    if (choice.kind === 'cast' || gated) report.current?.(fallbackOf(choice));
  }, [choice, gated]);

  if (choice.kind === 'cast' || gated) {
    const cast = choice.kind === 'cast' ? choice.cast : choice.fallback;
    return <CastNarrator cast={cast} height={height} {...props} />;
  }
  const fallback = (
    <CastNarrator cast={choice.fallback} height={height} {...props} />
  );
  return (
    <NarratorModelBoundary
      fallback={fallback}
      onFallback={() => report.current?.(fallbackOf(choice))}
    >
      <Suspense fallback={null}>
        <ModelNarrator
          url={assetUrl(choice.asset, import.meta.env.BASE_URL)}
          height={height * choice.heightFactor}
          onLoaded={() => report.current?.(choice)}
          {...props}
        />
      </Suspense>
    </NarratorModelBoundary>
  );
}

type PlayProps = Omit<NarratorProps, 'cast' | 'scale'> & {
  readonly height: number;
};

function CastNarrator({
  cast,
  height,
  ...props
}: PlayProps & { readonly cast: NarratorCastId }) {
  return (
    <Narrator
      cast={cast}
      scale={height / NARRATOR_CAST[cast].height}
      {...props}
    />
  );
}

function ModelNarrator({
  url,
  height,
  onLoaded,
  ...props
}: PlayProps & { readonly url: string; readonly onLoaded: () => void }) {
  // Each call gets its own clone of the cached scene (shared geometry and materials).
  const object = useCompressedModel(url);
  const loaded = useRef(onLoaded);
  useEffect(() => {
    loaded.current = onLoaded;
  });
  useEffect(() => {
    loaded.current();
  }, [object]);
  return <Narrator cast={{ object, height }} {...props} />;
}

/** A bundled model that fails to load gives way to the original cast. */
class NarratorModelBoundary extends Component<
  {
    readonly fallback: ReactNode;
    readonly onFallback: () => void;
    readonly children: ReactNode;
  },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error(
      'Narrator model failed to load; the original cast plays instead.',
      error,
    );
    this.props.onFallback();
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
