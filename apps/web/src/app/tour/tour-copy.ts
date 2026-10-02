import { bilingual } from '../i18n/ui-strings';

/**
 * The cinematic tour's interface words: the intro, the journey's controls and the finale. The
 * landmark names come from `LANDMARKS` and the place's name from `SITE.brand.place`. English
 * accessible names are kept stable for the end-to-end suite.
 */
export const TOUR_COPY = bilingual({
  en: {
    introLabel: 'Welcome',
    tagline: 'An underwater republic of complaints. Come and see it.',
    begin: 'Begin the journey',
    explore: 'Explore on my own',
    replay: 'Replay the journey',
    controlsLabel: 'The journey',
    stopsLabel: 'Stops',
    progress: 'Stop {current} of {total}',
    headingTo: 'Heading to {stop}',
    nowAt: 'Now at {stop}',
    pausedAt: 'Paused before {stop}',
    pause: 'Pause',
    resume: 'Resume the journey',
    next: 'Next stop',
    skip: 'Skip tour',
    finale:
      'That was the whole journey. File a complaint here, or explore on your own.',
    exploreFreely: 'Explore freely',
    keys: 'Space pauses. Esc steps out of a visit.',
  },
  ar: {
    introLabel: 'أهلاً بك',
    tagline: 'جمهورية الشكاوى تحت الماء. تعالَ وشوفها.',
    begin: 'ابدأ الرحلة',
    explore: 'أستكشف بنفسي',
    replay: 'أعد الرحلة',
    controlsLabel: 'الرحلة',
    stopsLabel: 'المحطات',
    progress: 'المحطة {current} من {total}',
    headingTo: 'في الطريق إلى {stop}',
    nowAt: 'الآن في {stop}',
    pausedAt: 'متوقفة قبل {stop}',
    pause: 'إيقاف مؤقت',
    resume: 'تابع الرحلة',
    next: 'المحطة التالية',
    skip: 'تخطَّ الجولة',
    finale: 'دي كانت الرحلة كلها. قدّم شكوتك هنا، أو استكشف بنفسك.',
    exploreFreely: 'استكشف بحرية',
    keys: 'المسافة توقف الرحلة، وEsc يخرجك من الزيارة.',
  },
});
