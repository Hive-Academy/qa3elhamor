import type { Locale } from '@qa3elhamor/content-domain';
import { useDiveState } from '@qa3elhamor/dive-feature';
import { formatNumber } from './i18n/locale';
import { useLocale } from './i18n/locale-context';
import { CHROME_COPY } from './i18n/ui-strings';

/** A depth's signed number, as the locale writes digits: "−142" (true minus sign), "0" at the surface. */
const depthNumber = (metres: number, locale: Locale): string =>
  metres > 0 ? `−${formatNumber(metres, locale)}` : formatNumber(0, locale);

/** Formats a depth for display: "−142 m", "0 m" at the surface; in Arabic "−١٤٢ م". */
export const formatDepth = (metres: number, locale: Locale = 'en'): string =>
  `${depthNumber(metres, locale)} ${CHROME_COPY[locale].depthUnit}`;

/**
 * A quiet depth readout in the corner, driven by the observable dive state. It re-renders
 * only when the rounded value changes, never per frame. It is not a live region: announcing
 * every metre while scrolling would drown out everything else for a screen-reader user.
 */
export function DepthGauge() {
  const metres = useDiveState((s) => Math.round(s.depth));
  const percent = useDiveState((s) => Math.round(s.depthRatio * 100));
  const { locale, dir } = useLocale();

  return (
    <div className="depth-gauge">
      <span className="depth-gauge__label">{CHROME_COPY[locale].depth}</span>
      <span className="depth-gauge__value" data-testid="depth-value">
        {dir === 'ltr' ? (
          formatDepth(metres, locale)
        ) : (
          // The signed number in a left-to-right isolate, so the minus stays in front of it;
          // the unit follows it in the page's direction.
          <>
            <bdi dir="ltr">{depthNumber(metres, locale)}</bdi> {CHROME_COPY[locale].depthUnit}
          </>
        )}
      </span>
      <span className="depth-gauge__track" aria-hidden="true">
        <span className="depth-gauge__fill" style={{ transform: `scaleY(${percent / 100})` }} />
      </span>
    </div>
  );
}
