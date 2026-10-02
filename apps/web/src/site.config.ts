import type { Locale, LocalizedText } from '@qa3elhamor/content-domain';
import type { LandmarkDefinition } from '@qa3elhamor/landmarks-domain';
import type { OceanEnvironmentOverrides } from '@qa3elhamor/world-feature';
import type { DiveConfig } from './app/dive.config';
import type { NarratorCastConfig } from './app/narrators.config';

/*
 * The template's config: everything about this deployment that is not content (words a CMS
 * editor changes live in `content/*.json`) and not a secret or a deploy target (those are
 * environment variables, `.env.example`). A fork makes the site its own by editing this file,
 * the content files and the assets. Walkthrough: docs/template.md.
 *
 * Data only. This module imports types and nothing else, because three places read it:
 * the first download (brand, locales, landmark labels), the dive's 3D chunk (placements, route,
 * cast) and the build itself (`vite.config.mts` turns `SITE.meta` and `SITE.theme` into the
 * page's <head> and its CSS custom properties, `site-build.ts`). A value import here would drag
 * its module into all three.
 */

/** Brand, page metadata, theme and languages. */
export interface SiteConfig {
  readonly brand: {
    /**
     * The place the dive is set in, in running text ("You are reading {place} as a page").
     * `{ en, ar }`; a missing translation falls back to English.
     */
    readonly place: LocalizedText;
    /**
     * The masthead over the dive and the page view: the place's name as a sign, in one fixed
     * language whatever the visitor reads (`lang` sets its script, font and direction).
     */
    readonly mark: { readonly text: string; readonly lang: Locale };
    /** Sender name on contact-form deliveries in your inbox (Web3Forms `from_name`). */
    readonly contactFromName: string;
  };
  /**
   * The page's <head>, written at build time (`site-build.ts`). The title and description are
   * content (`content/site.json` → `copy.siteTitle`, `copy.siteDescription`) so the CMS edits
   * them; these are the rest.
   */
  readonly meta: {
    /** Favicon, a path inside `apps/web/public` (`favicon.ico`, `icon.svg`, ...). */
    readonly favicon: string;
    /**
     * Social preview image (Open Graph / Twitter card), a path inside `apps/web/public`, about
     * 1200x630. Written only when the build knows the site's address (`SITE_URL`), because
     * crawlers need an absolute URL. Omit it for no preview image.
     */
    readonly ogImage?: string;
    /** `og:site_name`. */
    readonly siteName: string;
  };
  /**
   * Colours and type, written as CSS custom properties (`--theme-*`, `--font-*`) on `:root` at
   * build time and used by every surface's stylesheet; `sea` is also the browser's
   * `theme-color`. Any CSS colour or font-family list.
   */
  readonly theme: {
    /** The page behind the dive and the 2D page's night sky. */
    readonly sea: string;
    /** The lighter water at the top of the loading screen. */
    readonly seaLight: string;
    /** Text on the sea. */
    readonly foam: string;
    /** Gauges and highlights on the sea. */
    readonly accent: string;
    /** The brighter water of mastheads and card bands (the 2D page, the Citizenship Card). */
    readonly lagoon: string;
    readonly lagoonDeep: string;
    /** Links on paper. */
    readonly link: string;
    /** The paper of every card, menu and form. */
    readonly paper: string;
    readonly paperEdge: string;
    /** Text on paper. */
    readonly ink: string;
    readonly inkSoft: string;
    /** Rules, stamps and headings on paper. */
    readonly rule: string;
    /** Keyboard focus rings on paper. */
    readonly focus: string;
    readonly fontUi: string;
    /** The paper overlays' face. */
    readonly fontPaper: string;
  };
  /**
   * The 3D water: fog colour and density, caustics, particles, lights. Only what you set
   * changes; everything else keeps `OCEAN_ENVIRONMENT_DEFAULTS` (`libs/world/feature`).
   */
  readonly ocean: OceanEnvironmentOverrides;
  /**
   * The languages the site speaks, the first being the default. English is required (it is
   * the content's fallback). `['en']` turns Arabic off: no language switch, no `?lang=ar`,
   * and content needs no Arabic.
   */
  readonly locales: readonly [Locale, ...Locale[]];
}

export const SITE: SiteConfig = {
  brand: {
    place: { en: 'Qaa El-Hamour', ar: 'قاع الهامور' },
    mark: { text: 'قاع الهامور', lang: 'ar' },
    contactFromName: 'Qaa El-Hamour Complaints Bureau',
  },
  meta: {
    favicon: 'favicon.ico',
    siteName: 'Qaa El-Hamour',
  },
  theme: {
    sea: '#0a1e3f',
    seaLight: '#12406e',
    foam: '#e6f2ff',
    accent: '#7fd3f0',
    lagoon: '#0f5e6e',
    lagoonDeep: '#0a3d4a',
    link: '#0b5874',
    paper: '#f3ead3',
    paperEdge: '#dccb9f',
    ink: '#2a2118',
    inkSoft: '#5b4a36',
    rule: '#8c3b2a',
    focus: '#0b6fa4',
    // Arabic glyphs from Plex (it only covers Arabic here: styles.css), everything else from
    // the system.
    fontUi: "'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', sans-serif",
    // Plex carries the Arabic, Georgia the Latin.
    fontPaper: "Georgia, 'IBM Plex Sans Arabic', 'Times New Roman', serif",
  },
  ocean: {},
  locales: ['en', 'ar'],
};

/**
 * Named spots on the seabed, in scene-world units (`WorldSpace`): where landmarks stand and
 * where the dive stops. The four below are where the asset pipeline cut the town's buildings
 * out of the map (`apps/web/public/models/placements.json`, written by `npm run
 * assets:compress`); `dive.config.spec.ts` fails if one of those drifts. A spot of your own
 * (for a model you placed yourself) is any name and any position.
 */
export const LANDMARK_PLACEMENTS = {
  'landmark-pineapple': [0.7891174902964195, 0.06950939887368529, -0.09919549481878809],
  'landmark-tiki': [0.6515264937685465, 0.07000999830640853, -0.19213949727700275],
  'landmark-krusty-krab': [-0.592705484493699, 0.0724034984617643, -0.3194804883119353],
  'landmark-bureau': [-0.6057479723003212, 0.171782495712135, -0.008706998630456653],
} as const satisfies Record<string, readonly [number, number, number]>;

/**
 * The landmarks, in the order the dive meets them. Each is a model at a spot, a camera stop
 * (`waypoint`, a `stop` in `DIVE_CONFIG` below), what opening it shows (an in-world `scene`
 * and/or a dialog `overlay`, keys registered in `app/landmarks.config.ts`) and its name.
 *
 * `model` is a `WEB_ASSETS` id (`libs/world/domain`). A model cut from the map sits at the spot
 * it was cut from; a whole model of your own takes any spot, `scale` and `rotation`. Adding a
 * landmark with new content also needs a scene or overlay component: `libs/landmarks/README.md`.
 */
export const LANDMARKS: readonly LandmarkDefinition[] = [
  {
    id: 'pineapple',
    model: 'landmark-pineapple',
    position: LANDMARK_PLACEMENTS['landmark-pineapple'],
    waypoint: 'landmark-pineapple',
    // A narrator and the skills as bubbles; the dialog card is the fallback where in-world is off.
    presentation: 'in-world',
    scene: 'pineapple',
    overlay: 'pineapple',
    label: { en: 'The Pineapple', ar: 'بيت الأناناس' },
    caption: { en: 'About', ar: 'نبذة' },
  },
  {
    id: 'tiki',
    model: 'landmark-tiki',
    position: LANDMARK_PLACEMENTS['landmark-tiki'],
    waypoint: 'landmark-tiki',
    // A narrator and the jobs as stone tablets; the full record dialog is the fallback.
    presentation: 'in-world',
    scene: 'tiki',
    overlay: 'tiki',
    label: { en: 'Tiki Head', ar: 'رأس التيكي' },
    caption: { en: 'Performance reviews', ar: 'تقييمات الأداء' },
  },
  {
    id: 'krusty-krab',
    model: 'landmark-krusty-krab',
    position: LANDMARK_PLACEMENTS['landmark-krusty-krab'],
    waypoint: 'landmark-krusty-krab',
    // A narrator and the services as a flipping menu board; the full menu dialog is the fallback.
    presentation: 'in-world',
    scene: 'krusty-krab',
    overlay: 'krusty-krab',
    label: { en: 'The Krusty Krab', ar: 'مطعم كراستي كراب' },
    caption: { en: 'Services menu', ar: 'قائمة الخدمات' },
  },
  {
    id: 'bureau',
    model: 'landmark-bureau',
    position: LANDMARK_PLACEMENTS['landmark-bureau'],
    waypoint: 'landmark-bureau',
    // The Sardine President and the complaint scroll out of the tube; the form dialog is the fallback.
    presentation: 'in-world',
    scene: 'bureau',
    overlay: 'bureau',
    label: { en: 'Complaints Bureau', ar: 'مكتب الشكاوى' },
    caption: { en: 'File a complaint', ar: 'قدّم شكوى' },
  },
];

/**
 * The dive: down from the surface towards the town, a stop at the pineapple, a short hop to the
 * tiki head beside it, over the rocks to the Krusty Krab, up to the Complaints Bureau, and down
 * to the credits notice on the seabed. Each landmark gets a similar share of the scroll whatever
 * the distance between them, and a hold where the camera only creeps. Fields: `DiveConfig`
 * (`app/dive.config.ts`); `pass` positions are world units (scene-world x 20).
 */
export const DIVE_CONFIG: DiveConfig = {
  screens: 8,
  floorMeters: 180,
  pacing: { dwell: 0.09, creep: 1.2 },
  route: [
    { kind: 'pass', position: [38, 31, 42] },
    { kind: 'pass', position: [30, 19, 28] },
    { kind: 'pass', position: [23, 9, 14] },
    { kind: 'stop', landmark: 'landmark-pineapple', viewOffset: [3.5, 2.4, 7], focusHeight: 1.3, scroll: 0.2 },
    { kind: 'stop', landmark: 'landmark-tiki', viewOffset: [-2.5, 1.8, 6.5], focusHeight: 1, scroll: 0.36 },
    { kind: 'pass', position: [0, 5.5, 8] },
    { kind: 'stop', landmark: 'landmark-krusty-krab', viewOffset: [9, 3.6, 3.75], focusHeight: 0.5, scroll: 0.6 },
    { kind: 'pass', position: [-5.5, 7.5, 9] },
    { kind: 'stop', landmark: 'landmark-bureau', viewOffset: [-3.5, 3.4, 8.5], focusHeight: 1.8, scroll: 0.82 },
  ],
  finale: { distance: 7.5, height: 3, faceHeight: 3.5 },
};

/**
 * Who narrates each landmark. `cast` is the original cast, built in code and IP-clean: the
 * default, and the fallback for a bundled model on a tier that does not load it.
 *
 * `bundled` names the decimated SpongeBob and Patrick models shipped with the template. They
 * replace the cast only on a deployment built with `VITE_BUNDLED_CHARACTERS=true`: they are
 * Nickelodeon characters, so the template keeps them off and an owner turns them on for their
 * own site, accepting that risk (`.ptah/scope-decisions.md`, asset and licensing constraints).
 */
export const NARRATOR_CAST: NarratorCastConfig = {
  cast: {
    pineapple: 'hamour',
    tiki: 'hamour',
    'krusty-krab': 'crab-clerk',
    bureau: 'sardine-president',
  },
  // The owner's mixed cast (2026-10-02): SpongeBob at home, Patrick at the Tiki; the crab clerk
  // keeps the Krusty Krab and the Sardine President the Bureau.
  bundled: {
    pineapple: { asset: 'spongebob-narrator', heightFactor: 1.9 },
    tiki: { asset: 'patrick-narrator', heightFactor: 1.9 },
  },
};

/** The place's name in `locale`, falling back to English. */
export const placeName = (locale: Locale, site: SiteConfig = SITE): string =>
  site.brand.place[locale] ?? site.brand.place.en;
