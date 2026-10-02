import { shippedCredits, type ShippedCredit } from '@qa3elhamor/world-domain';
import {
  CreditsDialog,
  CreditsList,
  CreditsUnavailable,
} from '@qa3elhamor/world-ui';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useLocale } from './i18n/locale-context';
import { CHROME_COPY } from './i18n/ui-strings';

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
 *
 * The in-world plaque (`scene-credits.tsx`) uses it too; it lives apart because it is 3D and
 * this module is part of the page view's first download.
 */
export function useCredits(source: CreditsSource): CreditsResult {
  const result = useMemo<CreditsResult>(() => {
    try {
      return { ok: true, credits: source() };
    } catch (error) {
      return { ok: false, error };
    }
  }, [source]);

  useEffect(() => {
    if (!result.ok)
      console.error('Asset credits unavailable: licence error.', result.error);
  }, [result]);

  return result;
}

export interface SiteCreditsProps {
  readonly source?: CreditsSource;
}

/**
 * Page chrome: the always-visible "Credits" button and its dialog listing every credit with
 * working links. Mount outside the canvas; it needs no WebGL, so it is what guarantees the
 * credits are reachable on every device. Its words follow the site's language; the licence
 * lines themselves stay in English (`lang="en"` on each), as the licences word them.
 */
export function SiteCredits({ source = shippedCredits }: SiteCreditsProps) {
  const result = useCredits(source);
  const { locale, dir } = useLocale();
  const words = CHROME_COPY[locale];
  const host = useRef<HTMLDivElement>(null);

  // `CreditsDialog` (world-ui) marks its dialog `lang="en" dir="ltr"` and takes no props for
  // them; the dialog is re-marked here so Arabic words read right to left. React leaves the
  // attributes alone afterwards, since the props it set them from never change.
  useLayoutEffect(() => {
    const dialog = host.current?.querySelector('dialog');
    dialog?.setAttribute('lang', locale);
    dialog?.setAttribute('dir', dir);
  }, [locale, dir, result.ok]);

  return (
    <div ref={host} className="site-credits">
      {result.ok ? (
        <CreditsDialog
          credits={result.credits}
          triggerLabel={words.creditsTrigger}
          title={words.creditsTitle}
          intro={words.creditsIntro}
          closeLabel={words.creditsClose}
        />
      ) : (
        <CreditsUnavailable message={words.creditsUnavailable} />
      )}
    </div>
  );
}

export interface SiteCreditsListProps extends SiteCreditsProps {
  /** Accessible name of the list. */
  readonly label?: string;
}

/**
 * The same credits as an inline list, for the page view: no button, no dialog, nothing that
 * needs WebGL. A licence error is reported in place, as `<SiteCredits>` does.
 */
export function SiteCreditsList({
  source = shippedCredits,
  label,
}: SiteCreditsListProps) {
  const result = useCredits(source);
  const { locale } = useLocale();
  return result.ok ? (
    <CreditsList credits={result.credits} label={label} />
  ) : (
    <CreditsUnavailable message={CHROME_COPY[locale].creditsUnavailable} />
  );
}
