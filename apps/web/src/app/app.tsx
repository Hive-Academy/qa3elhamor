import { Suspense, useEffect } from 'react';
import { siteCopy } from '@qa3elhamor/content-data-access';
import { localize } from '@qa3elhamor/content-domain';
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
import { SITE } from '../site.config';

/** The page view's content, from the same content module; built on first use, once. */
let cachedPageContent: ReturnType<typeof buildPageContent> | undefined;
const pageContent = () => (cachedPageContent ??= buildPageContent());

/**
 * Composition root. `apps/web` is the only place allowed to wire content into scene
 * libraries, which keeps a fork's changes confined to data.
 *
 * This module and what it imports are the first download: the language, the dive-or-page
 * decision, the page view and the dive's chrome (scene note, skip link, language switch). The
 * 3D dive itself (`dive-shell.tsx`) is a separate chunk, loaded only when the visitor dives.
 */
export function App() {
  return (
    <LocaleProvider>
      <Views />
    </LocaleProvider>
  );
}

/** Dive or page (`page-view/presentation.ts`), both in the site's language. */
function Views() {
  const view = usePresentation(hasWebgl);
  const { locale } = useLocale();

  // The build writes the title in the default language (`site-build.ts`); this keeps it in the
  // visitor's.
  useEffect(() => {
    document.title = localize(siteCopy.siteTitle, locale);
  }, [locale]);

  // No WebGL, `?view=page`, the "read it as a page" link, or a dive that broke: the same
  // content as a readable 2D page (`page-view/`).
  if (view.presentation.kind === 'page') {
    return (
      <PageView
        content={pageContent()}
        reason={view.presentation.reason}
        diveHref={hrefFor(window.location, 'dive')}
        onReturnToDive={view.returnToDive}
        focusOnMount={view.switched}
        locale={locale}
      />
    );
  }

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
