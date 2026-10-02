import { Suspense, useEffect } from 'react';
import { siteCopy } from '@qa3elhamor/content-data-access';
import { localize } from '@qa3elhamor/content-domain';
import { AudioProvider, SoundToggle } from '@qa3elhamor/world-audio';
import { WEB_ASSETS, initialLoadBudgetBytes } from '@qa3elhamor/world-domain';
import {
  DiveLoadBoundary,
  DiveLoading,
  LazyDiveShell,
  hasWebgl,
} from './dive-shell-loader';
// Direct module paths, not the `./page-view` barrel: the barrel also exports the canvas guard,
// which imports three, and this module is in every visitor's first download.
import { buildPageContent } from './page-view/page-content';
import { PageView } from './page-view/page-view';
import { hrefFor, usePresentation } from './page-view/presentation';
import { ReadAsPageLink } from './page-view/read-as-page-link';
import { LanguageToggle } from './i18n/language-toggle';
import { directionOf, formatNumber } from './i18n/locale';
import { LocaleProvider, useLocale } from './i18n/locale-context';
import { CHROME_COPY } from './i18n/ui-strings';
import { fillCopy } from './overlays/overlay-copy';
import { musicSources, soundConfigured } from './audio/audio-config';
import { AUDIO, SITE } from '../site.config';

/** Resolved once: the config owns the paths, Vite owns the deploy base. */
const MUSIC = musicSources(AUDIO, import.meta.env.BASE_URL);

/** The page view's content, from the same content module; built on first use, once. */
let cachedPageContent: ReturnType<typeof buildPageContent> | undefined;
const pageContent = () => (cachedPageContent ??= buildPageContent());

/**
 * Composition root. `apps/web` is the only place allowed to wire content into scene
 * libraries, which keeps a fork's changes confined to data.
 *
 * This module and what it imports are the first download: the language, the dive-or-page
 * decision, the page view, the sound switch and the dive's chrome (scene note, skip link,
 * language switch). The 3D dive itself (`dive-shell.tsx`) is a separate chunk, loaded only when
 * the visitor dives. The music bed downloads only once the visitor wants sound (docs/audio.md).
 */
export function App() {
  return (
    <LocaleProvider>
      <Views />
    </LocaleProvider>
  );
}

/**
 * Dive or page (`page-view/presentation.ts`), both in the site's language, under one sound
 * provider so switching between them keeps the sound. The dive may start sound at the first
 * click, tap or key press; the page view only from its sound button.
 */
function Views() {
  const view = usePresentation(hasWebgl);
  const { locale } = useLocale();
  const presentation = view.presentation.kind;

  // The build writes the title in the default language (`site-build.ts`); this keeps it in the
  // visitor's.
  useEffect(() => {
    document.title = localize(siteCopy.siteTitle, locale);
  }, [locale]);

  return (
    <AudioProvider music={MUSIC} ambience={AUDIO.ambience} presentation={presentation}>
      {/* No WebGL, `?view=page`, the "read it as a page" link, or a dive that broke: the same
          content as a readable 2D page (`page-view/`). */}
      {view.presentation.kind === 'page' ? (
        <PageView
          content={pageContent()}
          reason={view.presentation.reason}
          diveHref={hrefFor(window.location, 'dive')}
          onReturnToDive={view.returnToDive}
          focusOnMount={view.switched}
          locale={locale}
        />
      ) : (
        <Dive view={view} />
      )}
      {soundConfigured(AUDIO) && <SiteSoundToggle placement={presentation} />}
    </AudioProvider>
  );
}

/** The sound switch, in the site's language. */
function SiteSoundToggle({ placement }: { readonly placement: 'dive' | 'page' }) {
  const { locale } = useLocale();
  const words = CHROME_COPY[locale];
  return <SoundToggle label={words.sound} promptLabel={words.soundPrompt} placement={placement} />;
}

/** The dive's chrome and the lazy 3D chunk. */
function Dive({ view }: { readonly view: ReturnType<typeof usePresentation> }) {
  return (
    <>
      {/* Before the 3D chunk arrives the visitor already has the site's name, the way out to
          the page and the language switch; they stay mounted when the dive replaces the
          loading state, so focus on them survives it. */}
      <SceneNote
        onReadAsPage={view.readAsPage}
        returnedFromPage={view.switched}
      />
      <LanguageToggle />
      <DiveLoadBoundary onFailure={view.diveFailed}>
        <Suspense fallback={<DiveLoading />}>
          <LazyDiveShell onDiveFailure={view.diveFailed} />
        </Suspense>
      </DiveLoadBoundary>
    </>
  );
}

/** The dive's caption: the district's name, how to dive, and the way out to the page. */
function SceneNote({
  onReadAsPage,
  returnedFromPage,
}: {
  /** The visitor chose the page over the dive. */
  readonly onReadAsPage: () => void;
  /** The dive was just switched back to from the page: focus its "read it as a page" link. */
  readonly returnedFromPage: boolean;
}) {
  const { locale } = useLocale();
  const words = CHROME_COPY[locale];
  const budgetMb = initialLoadBudgetBytes() / (1024 * 1024);

  return (
    <aside className="scene-note">
      {/* The place's own name as a sign, in one language whatever the site's (`SITE.brand.mark`). */}
      <h1 lang={SITE.brand.mark.lang} dir={directionOf(SITE.brand.mark.lang)}>
        {SITE.brand.mark.text}
      </h1>
      <p>{words.sceneNoteLead}</p>
      <ReadAsPageLink
        onActivate={onReadAsPage}
        focusOnMount={returnedFromPage}
        locale={locale}
      />
      <p className="scene-note__meta">
        {fillCopy(words.sceneNoteMeta, {
          count: formatNumber(WEB_ASSETS.length, locale),
          budget: formatNumber(budgetMb, locale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
        })}
      </p>
    </aside>
  );
}

export default App;
