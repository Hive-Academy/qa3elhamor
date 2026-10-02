import type { Locale } from '@qa3elhamor/content-domain';

/**
 * The site's interface words (buttons, labels, notices: everything around the content), in
 * both languages.
 *
 * Content (narration, the résumé, the menu, the form's copy) lives in `content/*.json` and is
 * edited in the CMS. Interface words live in typed tables instead, one per feature next to the
 * code that uses them (`narrators/narrator-copy.ts`, `page-view/page-copy.ts`, …), each built
 * with `bilingual()`, so:
 * - the compiler rejects an Arabic table missing a key the English one has (or carrying an
 *   extra one), and
 * - `ui-strings.spec.ts` checks every table at run time: no empty string, and the same
 *   `{placeholders}` in both languages.
 *
 * A new table must be registered in `ui-strings.spec.ts`'s list.
 */
export interface Bilingual<T extends Readonly<Record<string, string>>> {
  readonly en: T;
  readonly ar: { readonly [K in keyof T]: string };
}

/** Declares one feature's interface words: `ar` must carry exactly the keys `en` does. */
export const bilingual = <const T extends Readonly<Record<string, string>>>(table: {
  readonly en: T;
  readonly ar: { readonly [K in keyof NoInfer<T>]: string };
}): Bilingual<T> => table;

/**
 * The page chrome around the dive: the language switch, the scene note, the depth gauge, the
 * credits, the sound button and the landmark list. English accessible names are kept stable
 * for the e2e suite.
 */
export const CHROME_COPY = bilingual({
  en: {
    languageGroup: 'Language',
    sceneNoteLead: 'Scroll to dive.',
    sceneNoteMeta: '{count} assets manifested, {budget} MB initial-load budget.',
    depth: 'Depth',
    depthUnit: 'm',
    landmarksNav: 'Landmarks',
    dialogClose: 'Close',
    returnToDive: 'Back to the dive',
    creditsTrigger: 'Credits',
    creditsTitle: 'Credits',
    creditsIntro:
      'The 3D models in this site are used under the Creative Commons Attribution 4.0 licence. Their authors are credited below, as the licence requires.',
    creditsClose: 'Close',
    creditsUnavailable: 'Credits unavailable — licence error',
    creditsMusic: 'Music',
    sound: 'Sound',
    soundPrompt: 'Sound on?',
  },
  ar: {
    languageGroup: 'اللغة',
    sceneNoteLead: 'مرّر لتغوص.',
    sceneNoteMeta: 'ملفات في البيان: {count}، وميزانية التحميل الأول: {budget} ميجابايت.',
    depth: 'العمق',
    depthUnit: 'م',
    landmarksNav: 'المعالم',
    dialogClose: 'إغلاق',
    returnToDive: 'رجوع للغطسة',
    creditsTrigger: 'شكر وتقدير',
    creditsTitle: 'شكر وتقدير',
    creditsIntro:
      'النماذج ثلاثية الأبعاد في هذا الموقع مستخدمة بموجب رخصة المشاع الإبداعي، نسب المصنَّف 4.0. أصحابها مذكورون أدناه كما تشترط الرخصة.',
    creditsClose: 'إغلاق',
    creditsUnavailable: 'الحقوق غير متاحة — خطأ في الترخيص',
    creditsMusic: 'الموسيقى',
    sound: 'الصوت',
    soundPrompt: 'تشغيل الصوت؟',
  },
});

/** How each language names itself on the switch: always in its own script. */
export const LOCALE_NAMES = {
  en: { short: 'EN', name: 'English', label: 'EN, English' },
  ar: { short: 'عربي', name: 'العربية', label: 'عربي، العربية' },
} as const satisfies Record<Locale, { short: string; name: string; label: string }>;
