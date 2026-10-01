import { shippedCredits, type ShippedCredit } from '@qa3elhamor/world-domain';
import {
  CreditsDialog,
  CreditsPlaque,
  CreditsUnavailable,
  type CreditsPlaqueProps,
} from '@qa3elhamor/world-ui';
import { useEffect, useMemo } from 'react';

/** Where the credits come from. Tests inject a failing source; the site uses the manifest. */
export type CreditsSource = () => readonly ShippedCredit[];

type CreditsResult =
  | { readonly ok: true; readonly credits: readonly ShippedCredit[] }
  | { readonly ok: false; readonly error: unknown };

/**
 * Resolves the CC-BY-4.0 credits for every bundled model from the asset manifest, containing
 * a failure (a shipped asset with no attribution record) to the credit surfaces: the rest of
 * the site keeps working, the surface says the credits are unavailable, and the error is
 * logged. CI still fails loudly on it through the world-domain credits spec.
 */
function useCredits(source: CreditsSource): CreditsResult {
  const result = useMemo<CreditsResult>(() => {
    try {
      return { ok: true, credits: source() };
    } catch (error) {
      return { ok: false, error };
    }
  }, [source]);

  useEffect(() => {
    if (!result.ok) console.error('Asset credits unavailable: licence error.', result.error);
  }, [result]);

  return result;
}

export interface SiteCreditsProps {
  readonly source?: CreditsSource;
}

/**
 * Page chrome: the always-visible "Credits" button and its dialog listing every credit with
 * working links. Mount outside the canvas; it needs no WebGL, so it is what guarantees the
 * credits are reachable on every device.
 */
export function SiteCredits({ source = shippedCredits }: SiteCreditsProps) {
  const result = useCredits(source);
  return result.ok ? <CreditsDialog credits={result.credits} /> : <CreditsUnavailable />;
}

export type SceneCreditsProps = Omit<CreditsPlaqueProps, 'credits'> & {
  readonly source?: CreditsSource;
};

/**
 * The in-world municipal notice board carrying the same credits. Mount as a child of
 * `<OceanWorld>` (scene-world units); the default spot is at the end of the dive. On a licence
 * error it renders nothing in the scene; `<SiteCredits>` reports the error in the page.
 */
export function SceneCredits({ source = shippedCredits, ...props }: SceneCreditsProps) {
  const result = useCredits(source);
  return result.ok ? <CreditsPlaque credits={result.credits} {...props} /> : null;
}
