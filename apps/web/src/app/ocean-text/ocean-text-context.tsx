import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { OCEAN_FONT, OCEAN_FONT_URL, type OceanFontStore } from './ocean-font';
import { oceanTextShown } from './ocean-text-mode';

/**
 * Whether the dive draws its words as underwater SDF text (`OceanText`) and canvas signage, and
 * the font to set them in. `on` false: every surface shows its HTML text, as it always has.
 */
export interface OceanTextMode {
  readonly on: boolean;
  readonly fontUrl: string;
  /** Texture filtering for painted signage, from the quality profile. */
  readonly anisotropy: number;
  /** For `OceanText onError`: the font is unusable, so every surface goes back to its HTML. */
  readonly reportError: (error: unknown) => void;
}

const noop = () => undefined;

/** Outside the dive (and in unit tests): HTML text. */
export const OCEAN_TEXT_OFF: OceanTextMode = {
  on: false,
  fontUrl: OCEAN_FONT_URL,
  anisotropy: 4,
  reportError: noop,
};

const OceanTextContext = createContext<OceanTextMode>(OCEAN_TEXT_OFF);

/** `?oceanText=off` keeps every surface on its HTML text (a check, a comparison, a test). */
export function oceanTextForcedOff(search: string): boolean {
  return new URLSearchParams(search).get('oceanText') === 'off';
}

/**
 * Turns the SDF text on for the dive under it when the visitor's settings allow it (`allowed`:
 * no reduced motion, not the low tier), once the font has arrived. R3F bridges the context into
 * the canvas; drei `<Html>` roots do not get it, so HUDs receive `on` as a prop.
 */
export function OceanTextProvider({
  allowed,
  anisotropy = 4,
  store = OCEAN_FONT,
  children,
}: {
  readonly allowed: boolean;
  readonly anisotropy?: number;
  readonly store?: OceanFontStore;
  readonly children: ReactNode;
}) {
  const forcedOff = useMemo(
    () =>
      typeof window !== 'undefined' &&
      oceanTextForcedOff(window.location.search),
    [],
  );
  const wanted = allowed && !forcedOff;
  const font = useSyncExternalStore(store.subscribe, store.get, store.get);
  useEffect(() => {
    if (wanted) store.load();
  }, [wanted, store]);
  const on = oceanTextShown({ allowed: wanted, font });
  useEffect(() => {
    document.documentElement.dataset['oceanText'] = on ? 'on' : 'off';
    return () => {
      delete document.documentElement.dataset['oceanText'];
    };
  }, [on]);
  const value = useMemo<OceanTextMode>(
    () => ({
      on,
      fontUrl: OCEAN_FONT_URL,
      anisotropy,
      reportError: (error: unknown) => {
        if (import.meta.env.DEV)
          console.warn('ocean-text: falling back to HTML text', error);
        store.fail();
      },
    }),
    [on, anisotropy, store],
  );
  return (
    <OceanTextContext.Provider value={value}>
      {children}
    </OceanTextContext.Provider>
  );
}

export const useOceanText = (): OceanTextMode => useContext(OceanTextContext);
