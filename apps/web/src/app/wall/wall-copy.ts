import { bilingual } from '../i18n/ui-strings';

/**
 * The public complaints wall's interface words outside the board (`i18n/ui-strings.ts`): the
 * Bureau form's choice between a private complaint and a public one, its outcomes, and the page
 * view's wall section. Only rendered when the wall is on. The board's own words load with it
 * (`notice-board-copy.ts`). Complaint text is visitor-authored and never comes from here.
 */
// Pure: with the wall off nothing reads it, and the bundler drops it from the build.
export const WALL_COPY = /* @__PURE__ */ bilingual({
  en: {
    visibilityLegend: 'Where should it go?',
    visibilityPrivate: 'Send privately to Abdallah',
    visibilityPrivateHint: 'Only he reads it. Leave a reply address if you want an answer.',
    visibilityPublic: 'Pin it on the public wall',
    visibilityPublicHint:
      'Every visitor can read it once a moderator approves it. The wall shows your name and species, never a reply address, so keep contact details out of it.',
    publicPending:
      'Pinned for moderation. It goes up on the public wall once a moderator approves it.',
    rateLimited: 'Too many complaints from this reef for now. Try again later.',
    wallUnavailable:
      'The public wall is closed right now. Send it privately instead, or try again later.',
    wallIntro: 'Approved complaints from fellow citizens, newest first.',
    loading: 'Reading the wall…',
  },
  ar: {
    visibilityLegend: 'تروح فين؟',
    visibilityPrivate: 'ابعتها لعبدالله على انفراد',
    visibilityPrivateHint: 'هو بس اللي هيقراها. سيب عنوان للرد لو عايز إجابة.',
    visibilityPublic: 'علّقها على لوحة الشكاوى العامة',
    visibilityPublicHint:
      'أي زائر يقدر يقراها بعد ما المشرف يوافق عليها. اللوحة بتعرض اسمك ونوعك، عمرها ما بتعرض عنوان للرد، فما تكتبش بيانات تواصل فيها.',
    publicPending:
      'اتعلّقت ومستنية المراجعة. هتظهر على اللوحة العامة أول ما المشرف يوافق عليها.',
    rateLimited: 'شكاوى كتير أوي من الشِّعب ده دلوقتي. جرّب تاني بعدين.',
    wallUnavailable:
      'اللوحة العامة مقفولة دلوقتي. ابعتها على انفراد، أو جرّب تاني بعدين.',
    wallIntro: 'شكاوى المواطنين اللي اتوافق عليها، الأحدث الأول.',
    loading: 'بنقرا اللوحة…',
  },
});

/** The table itself, as the form and the page receive it from `WallPort.words`. */
export type WallCopy = typeof WALL_COPY;

