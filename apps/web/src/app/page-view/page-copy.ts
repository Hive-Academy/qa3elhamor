import type { Locale } from '@qa3elhamor/content-domain';
import { fillCopy } from '../overlays/overlay-copy';

/**
 * Words only the page view needs: its chrome, plain section names and the notice explaining
 * why the visitor is reading a page. Kept here, like the in-world card's copy, until the owner
 * signs them off; they then move into `content/site.json` (`SITE_COPY_KEYS`), which needs a
 * content-domain change. Arabic is provided so the page is ready the day the locale switches.
 */
const EN = {
  skipToContent: 'Skip to content',
  readAsPage: 'Skip the dive: read it as a page',
  backToDive: 'Back to the dive',
  retryDive: 'Try the dive again',
  noticeRequested:
    'You are reading Qaa El-Hamour as a page: everything from the dive, no swimming required.',
  noticeNoWebgl:
    'This browser cannot run the 3D dive (WebGL is not available), so here is everything from it as a page.',
  noticeFailed:
    'The 3D dive stopped working on this device, so here is everything from it as a page.',
  sectionsLabel: 'Sections',
  about: 'About',
  experience: 'Experience',
  projects: 'Projects',
  services: 'Services',
  contact: 'Contact',
  narration: 'Overheard on the dive',
  narrationIntro:
    'What the narrators say at each landmark, for anyone who skipped the swim.',
  credits: 'Credits',
  present: 'Present',
  tech: 'Tech',
  tags: 'Tags',
  review: 'Performance review',
  role: 'Role',
  price: 'Price',
  hintOn: 'On {topic}',
  farewell: 'On the way out',
  siteCredits: 'The site',
  modelCredits: '3D models',
  modelCreditsIntro:
    'The 3D models are used under the Creative Commons Attribution 4.0 licence. Their authors are credited below, as the licence requires.',
  modelCreditsLabel: '3D model credits',
  by: 'by {author}',
  licence: 'Licence: {licence}',
  newTab: '(opens in a new tab)',
  linkRepo: 'Source code',
  linkLive: 'Live site',
  linkCaseStudy: 'Case study',
  backToTop: 'Back to top',
};

export type PageViewCopyKey = keyof typeof EN;
export type PageViewCopy = Readonly<Record<PageViewCopyKey, string>>;

const AR: PageViewCopy = {
  skipToContent: 'انتقل إلى المحتوى',
  readAsPage: 'تخطَّ الغوص: اقرأها كصفحة',
  backToDive: 'ارجع إلى الغوص',
  retryDive: 'جرّب الغوص مرة أخرى',
  noticeRequested: 'أنت تقرأ قاع الهامور كصفحة: كل ما في الغوص، بلا سباحة.',
  noticeNoWebgl:
    'هذا المتصفح لا يستطيع تشغيل الغوص ثلاثي الأبعاد (WebGL غير متاح)، فإليك كل ما فيه كصفحة.',
  noticeFailed:
    'توقف الغوص ثلاثي الأبعاد على هذا الجهاز، فإليك كل ما فيه كصفحة.',
  sectionsLabel: 'الأقسام',
  about: 'نبذة',
  experience: 'الخبرات',
  projects: 'المشاريع',
  services: 'الخدمات',
  contact: 'التواصل',
  narration: 'سُمع أثناء الغوص',
  narrationIntro: 'ما يقوله الرواة عند كل معلم، لمن تخطّى السباحة.',
  credits: 'شكر وتقدير',
  present: 'حتى الآن',
  tech: 'التقنيات',
  tags: 'الوسوم',
  review: 'تقييم الأداء',
  role: 'الدور',
  price: 'السعر',
  hintOn: 'عن {topic}',
  farewell: 'عند المغادرة',
  siteCredits: 'الموقع',
  modelCredits: 'النماذج ثلاثية الأبعاد',
  modelCreditsIntro:
    'النماذج ثلاثية الأبعاد مستخدمة بموجب رخصة المشاع الإبداعي، نسب المصنَّف 4.0. أصحابها مذكورون أدناه كما تشترط الرخصة.',
  modelCreditsLabel: 'حقوق النماذج ثلاثية الأبعاد',
  by: 'من {author}',
  licence: 'الرخصة: {licence}',
  newTab: '(يفتح في لسان جديد)',
  linkRepo: 'الشيفرة المصدرية',
  linkLive: 'الموقع المباشر',
  linkCaseStudy: 'دراسة حالة',
  backToTop: 'العودة إلى الأعلى',
};

export const PAGE_VIEW_COPY: Readonly<Record<Locale, PageViewCopy>> = {
  en: EN,
  ar: AR,
};

/** A page-copy reader bound to one locale, filling `{name}` placeholders: `t('by', { author })`. */
export type PageText = (
  key: PageViewCopyKey,
  values?: Readonly<Record<string, string | number>>,
) => string;

export const pageText =
  (locale: Locale): PageText =>
  (key, values) =>
    fillCopy(PAGE_VIEW_COPY[locale][key], values ?? {});
