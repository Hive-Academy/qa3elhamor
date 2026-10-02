import { bilingual } from '../i18n/ui-strings';

/**
 * The Municipal Notice Wall's own words (`i18n/ui-strings.ts`), in the board's lazy chunk.
 * `wallIntro` and `loading` repeat `WALL_COPY`'s on purpose: the board importing that table
 * would make it a shared module and pull it into the entry chunk of a build without the wall.
 * Complaint text is visitor-authored and never comes from here.
 */
export const NOTICE_BOARD_COPY = bilingual({
  en: {
    wallTitle: 'Public complaints wall',
    wallIntro: 'Approved complaints from fellow citizens, newest first.',
    loading: 'Reading the wall…',
    empty: 'Nothing is pinned yet. Be the first: file a complaint and pin it on the wall.',
    failed: 'The wall could not be read just now.',
    retry: 'Try again',
    newer: 'Newer',
    older: 'Older',
    pageLabel: 'Page {n}',
    pagesLabel: 'Wall pages',
    notesLabel: 'Complaints on this page',
    readMore: 'Read more',
    from: 'From {name}',
    fromSpecies: 'From {name}, {species}',
    closeNote: 'Close the note',
  },
  ar: {
    wallTitle: 'لوحة الشكاوى العامة',
    wallIntro: 'شكاوى المواطنين اللي اتوافق عليها، الأحدث الأول.',
    loading: 'بنقرا اللوحة…',
    empty: 'لسه مفيش حاجة متعلّقة. خليك الأول: قدّم شكوى وعلّقها على اللوحة.',
    failed: 'ماقدرناش نقرا اللوحة دلوقتي.',
    retry: 'جرّب تاني',
    newer: 'الأحدث',
    older: 'الأقدم',
    pageLabel: 'صفحة {n}',
    pagesLabel: 'صفحات اللوحة',
    notesLabel: 'الشكاوى في الصفحة دي',
    readMore: 'اقرا الباقي',
    from: 'من {name}',
    fromSpecies: 'من {name}، {species}',
    closeNote: 'اقفل الورقة',
  },
});

export type NoticeBoardWords = {
  readonly [K in keyof (typeof NOTICE_BOARD_COPY)['en']]: string;
};
