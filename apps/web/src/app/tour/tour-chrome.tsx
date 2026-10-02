import './tour.css';
import { resolveText, textDirection } from '@qa3elhamor/landmarks-domain';
import { useFocusedLandmark } from '@qa3elhamor/landmarks-feature';
import { useId } from 'react';
import { formatNumber } from '../i18n/locale';
import { useLocale } from '../i18n/locale-context';
import { fillCopy, toContentLocale } from '../overlays/overlay-copy';
import { SITE, placeName } from '../../site.config';
import { useTour, useTourState } from './tour-context';
import { TOUR_COPY } from './tour-copy';
import type { IntroStyle } from './tour-entry';
import { tourActive } from './tour-machine';

/*
 * The tour's DOM: the intro's buttons (with the whole title as a flat card where the 3D one is
 * not shown), the journey's control bar, and the "Replay the journey" button. Everything here is
 * real, keyboard-reachable HTML in the site's language; the 3D title is decorative.
 */

const useWords = () => {
  const { locale } = useLocale();
  const lang = toContentLocale(locale);
  return { locale, lang, dir: textDirection(locale), words: TOUR_COPY[lang] };
};

/**
 * The intro's words and its two choices. It takes no focus (a first visit to the dive never
 * does, `app-fallback.spec.tsx`): it comes first in the dive's DOM, so Tab reaches "Begin the
 * journey" straight after the page's own way out and the language switch.
 *
 * `cinematic`: the title is the 3D one over the water, so here it is for assistive technology only and the buttons sit under it. `card`: a flat card
 * with the title, its Arabic name and the tagline (reduced motion, the low tier).
 */
export function TourIntro({ style }: { readonly style: IntroStyle }) {
  const { store } = useTour();
  const intro = useTourState((s) => s.phase === 'intro');
  const { lang, dir, words } = useWords();
  const heading = useId();
  if (!intro) return null;
  return (
    <section
      className="tour-intro"
      data-style={style}
      aria-labelledby={heading}
      dir={dir}
      lang={lang}
    >
      <div className="tour-intro__card">
        <h2 id={heading} className="tour-intro__title">
          <span lang="en" dir="ltr">
            {placeName('en')}
          </span>
          {SITE.locales.includes('ar') && (
            <span className="tour-intro__title-ar" lang="ar" dir="rtl">
              {placeName('ar')}
            </span>
          )}
        </h2>
        <p className="tour-intro__tagline">{words.tagline}</p>
        <div className="tour-intro__actions">
          <button
            type="button"
            className="tour-button tour-button--primary"
            onClick={() => store.dispatch({ type: 'begin' })}
          >
            <span className="tour-button__glyph" aria-hidden="true" />
            {words.begin}
          </button>
          <button
            type="button"
            className="tour-button tour-button--quiet"
            onClick={() => store.dispatch({ type: 'explore' })}
          >
            {words.explore}
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * The journey's controls, fixed at the top of the screen while it runs: where it is (stop i of
 * n, each stop named), Pause / "Resume the journey", "Next stop" and "Skip tour"; at the finale,
 * the closing line and "Explore freely".
 */
export function TourControls() {
  const { store } = useTour();
  const active = useTourState(tourActive);
  const phase = useTourState((s) => s.phase);
  const index = useTourState((s) => s.stop);
  const resume = useTourState((s) => s.resume);
  const { locale, lang, dir, words } = useWords();
  if (!active) return null;

  const stops = store.stops;
  const stop = stops[index];
  const name = stop ? resolveText(stop.label, locale) : '';
  const finale = phase === 'finale';
  const paused = phase === 'paused';
  const status = finale
    ? words.finale
    : phase === 'flying' || (paused && resume === 'fly')
      ? fillCopy(paused ? words.pausedAt : words.headingTo, { stop: name })
      : fillCopy(words.nowAt, { stop: name });
  const canNext = !finale && !(phase === 'flying' && index >= stops.length - 1);

  return (
    <section
      className="tour-bar"
      data-phase={phase}
      aria-label={words.controlsLabel}
      dir={dir}
      lang={lang}
    >
      <div className="tour-bar__where">
        <p className="tour-bar__count">
          {fillCopy(words.progress, {
            current: formatNumber(index + 1, locale),
            total: formatNumber(stops.length, locale),
          })}
        </p>
        <ol className="tour-bar__stops" aria-label={words.stopsLabel}>
          {stops.map((s, i) => (
            <li
              key={s.id}
              className="tour-bar__stop"
              data-done={i < index || undefined}
              aria-current={i === index ? 'step' : undefined}
              title={resolveText(s.label, locale)}
            >
              <span className="tour-bar__stop-name">
                {resolveText(s.label, locale)}
              </span>
            </li>
          ))}
        </ol>
        <p className="tour-bar__status" role="status">
          {status}
        </p>
      </div>
      <div className="tour-bar__actions">
        {finale ? (
          <button
            type="button"
            className="tour-button tour-button--primary"
            onClick={() => store.dispatch({ type: 'explore' })}
          >
            {words.exploreFreely}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={`tour-button ${paused ? 'tour-button--primary' : ''}`}
              data-icon={paused ? 'play' : 'pause'}
              onClick={() =>
                store.dispatch(
                  paused
                    ? { type: 'resume' }
                    : { type: 'pause', reason: 'user' },
                )
              }
            >
              {paused ? words.resume : words.pause}
            </button>
            <button
              type="button"
              className="tour-button"
              data-icon="next"
              disabled={!canNext}
              onClick={() => store.dispatch({ type: 'next' })}
            >
              {words.next}
            </button>
            <button
              type="button"
              className="tour-button tour-button--quiet"
              onClick={() => store.dispatch({ type: 'explore' })}
            >
              {words.skip}
            </button>
          </>
        )}
      </div>
      {!finale && <p className="tour-bar__keys">{words.keys}</p>}
    </section>
  );
}

/** "Replay the journey": the free dive's small way back into the tour, out of the way of visits. */
export function TourReplay() {
  const { store, entry } = useTour();
  const free = useTourState((s) => s.phase === 'free');
  const visiting = useFocusedLandmark() !== null;
  const { lang, dir, words } = useWords();
  if (entry === 'off' || !free || visiting || store.stops.length === 0)
    return null;
  return (
    <button
      type="button"
      className="tour-replay"
      dir={dir}
      lang={lang}
      onClick={() => store.dispatch({ type: 'begin' })}
    >
      <span className="tour-button__glyph" aria-hidden="true" />
      {words.replay}
    </button>
  );
}

/**
 * The destination as a film's location card, low in the frame while the camera travels: the
 * landmark's name and its caption, fading in on the way and out on arrival. Decorative (the
 * bar's status line already says where the journey is heading, politely).
 */
export function TourCaption() {
  const { store } = useTour();
  const flying = useTourState((s) => s.phase === 'flying');
  const index = useTourState((s) => s.stop);
  const leg = useTourState((s) => s.leg);
  const { locale, lang, dir } = useWords();
  const stop = store.stops[index];
  if (!flying || !stop) return null;
  return (
    <p
      key={leg}
      className="tour-caption"
      dir={dir}
      lang={lang}
      aria-hidden="true"
    >
      <span className="tour-caption__name">
        {resolveText(stop.label, locale)}
      </span>
      {stop.caption && (
        <span className="tour-caption__what">
          {resolveText(stop.caption, locale)}
        </span>
      )}
    </p>
  );
}
