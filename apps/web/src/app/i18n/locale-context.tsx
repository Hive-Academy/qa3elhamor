import type { Locale } from '@qa3elhamor/content-domain';
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applyDocumentLocale,
  directionOf,
  resolveDocumentLocale,
  searchWithLocale,
  storeLocale,
  type TextDirection,
} from './locale';

export interface LocaleControl {
  readonly locale: Locale;
  readonly dir: TextDirection;
  /**
   * Switches the whole site: `<html lang dir>`, the stored choice, `?lang=` in the URL, every
   * rendered string.
   */
  readonly setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleControl | null>(null);

export interface LocaleProviderProps {
  /** Start in this locale instead of resolving it (tests, previews). */
  readonly initialLocale?: Locale;
  readonly children?: ReactNode;
}

/**
 * Owns the site's language. Mount once at the composition root, above both the dive and the
 * page view, so a switch re-renders everything visible at once, and both views share it.
 *
 * Nothing about the visitor leaves the browser: the choice is kept in `localStorage` only.
 */
export function LocaleProvider({ initialLocale, children }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(
    () => initialLocale ?? resolveDocumentLocale().locale,
  );

  // Before paint, so the first frame already has the right direction.
  useLayoutEffect(() => applyDocumentLocale(locale), [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    storeLocale(next);
    const search = searchWithLocale(window.location.search, next);
    if (search !== window.location.search) {
      // Same entry, same history state: switching language is not a navigation.
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${search}${window.location.hash}`,
      );
    }
  }, []);

  const value = useMemo<LocaleControl>(
    () => ({ locale, dir: directionOf(locale), setLocale }),
    [locale, setLocale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** The site's language. Outside a `<LocaleProvider>` it is English and cannot change. */
export function useLocale(): LocaleControl {
  return useContext(LocaleContext) ?? FIXED_ENGLISH;
}

const FIXED_ENGLISH: LocaleControl = {
  locale: 'en',
  dir: 'ltr',
  setLocale: () => undefined,
};
