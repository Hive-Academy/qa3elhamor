import { shippedCredits } from '@qa3elhamor/world-domain';
import { CreditsPlaque, type CreditsPlaqueProps } from '@qa3elhamor/world-ui';
import { useCredits, type CreditsSource } from './credits';

export type SceneCreditsProps = Omit<CreditsPlaqueProps, 'credits'> & {
  readonly source?: CreditsSource;
};

/**
 * The in-world municipal notice board carrying the same credits as `<SiteCredits>`. Mount as a
 * child of `<OceanWorld>` (scene-world units); the default spot is at the end of the dive. On a
 * licence error it renders nothing in the scene; `<SiteCredits>` reports the error in the page.
 *
 * Separate from `credits.tsx` because it is 3D: only the dive's lazy chunk may import it.
 */
export function SceneCredits({
  source = shippedCredits,
  ...props
}: SceneCreditsProps) {
  const result = useCredits(source);
  return result.ok ? (
    <CreditsPlaque credits={result.credits} {...props} />
  ) : null;
}
