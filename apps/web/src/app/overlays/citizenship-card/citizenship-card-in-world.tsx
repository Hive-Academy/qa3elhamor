import { localize } from '@qa3elhamor/content-domain';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { bilingual } from '../../i18n/ui-strings';
import { copyReader, toContentLocale } from '../overlay-copy';
import {
  CitizenBio,
  CitizenCardBand,
  CitizenIdentity,
  CitizenLinks,
  CitizenStamps,
  type CitizenshipCardContent,
} from './citizenship-card';
import './citizenship-card-in-world.css';

/**
 * Words only the in-world card needs (the flip control and the back of the card). Interface
 * words, not content: see `i18n/ui-strings.ts`.
 */
export const IN_WORLD_CARD_COPY = bilingual({
  en: {
    flipToBack: 'Turn over: visa stamps',
    flipToFront: 'Turn back: identity',
    backIssuer: 'Border control of Qaa El-Hamour · Entry stamps',
    backTitle: 'Visa stamps',
    showingBack: 'Showing the back of the card: visa stamps.',
    showingFront: 'Showing the front of the card: identity.',
    frontRegion: 'Front of the card: identity and statement',
    backRegion: 'Back of the card: visa stamps',
  },
  ar: {
    flipToBack: 'اقلب البطاقة: أختام التأشيرة',
    flipToFront: 'ارجع للوجه: الهوية',
    backIssuer: 'حرس حدود قاع الهامور · أختام الدخول',
    backTitle: 'أختام التأشيرة',
    showingBack: 'ظهر البطاقة: أختام التأشيرة.',
    showingFront: 'وجه البطاقة: الهوية.',
    frontRegion: 'وجه البطاقة: الهوية والإفادة',
    backRegion: 'ظهر البطاقة: أختام التأشيرة',
  },
});

export type CardSide = 'front' | 'back';

const MRZ_WIDTH = 36;

/**
 * The two lines of a passport's machine-readable zone, as decoration for the card's foot:
 * `IDQEHSURNAME<<GIVEN<NAMES<<<…`. Latin capitals only (accents are stripped, other characters
 * dropped), padded with `<` or cut to a fixed width. Hidden from assistive technology; the name is on the card in words.
 */
export function machineReadableZone(name: string): string {
  const parts = name
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z ]+/gu, '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  const surname = parts.length > 1 ? parts[parts.length - 1] : (parts[0] ?? '');
  const given = parts.length > 1 ? parts.slice(0, -1).join('<') : '';
  const fit = (line: string) => line.padEnd(MRZ_WIDTH, '<').slice(0, MRZ_WIDTH);
  return [
    fit(`IDQEH${surname}<<${given}`),
    fit('QAA<EL<HAMOUR<<SETTLED<AT<THE<BOTTOM'),
  ].join('\n');
}

export interface CitizenshipCardInWorldProps extends CitizenshipCardContent {
  readonly locale: string;
  readonly dir: 'ltr' | 'rtl';
  /** Which side faces the visitor first. Default the front. */
  readonly initialSide?: CardSide;
}

/**
 * The Citizenship Card as an object in the water: the same content as the dialog card, on two
 * sides. The front is the identity (portrait, fields, links, statement); the back is the
 * skills, as visa stamps. The flip control (or ←/→ while the card has focus) turns it over.
 *
 * Accessibility: an `article` named by the card title, focusable (`tabIndex=-1`) and marked
 * for the landmark stage's autofocus, so opening the landmark moves focus onto it. The face
 * turned away is `inert`, so Tab and screen readers reach only what is visible; turning it
 * over is announced politely.
 */
export function CitizenshipCardInWorld({
  profile,
  copy,
  locale,
  dir,
  baseUrl = import.meta.env.BASE_URL,
  initialSide = 'front',
}: CitizenshipCardInWorldProps) {
  const lang = toContentLocale(locale);
  const t = copyReader(copy, lang);
  const words = IN_WORLD_CARD_COPY[lang];
  const ids = useId();
  const headingId = `${ids}-card`;
  const [side, setSide] = useState<CardSide>(initialSide);
  // Announced only after a turn, never on open.
  const [announcement, setAnnouncement] = useState('');
  const flip = () => {
    const next: CardSide = side === 'front' ? 'back' : 'front';
    setSide(next);
    setAnnouncement(next === 'back' ? words.showingBack : words.showingFront);
  };
  const parts = { profile, t, lang };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const own =
      event.target === event.currentTarget ||
      (event.target as HTMLElement).dataset['flip'] !== undefined;
    if (own && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      flip();
    }
  };

  return (
    <article
      className="citizen-pass"
      data-side={side}
      dir={dir}
      lang={lang}
      aria-labelledby={headingId}
      tabIndex={-1}
      data-landmark-autofocus=""
      onKeyDown={onKeyDown}
    >
      <div className="citizen-pass__flipper">
        <div
          className="citizen-card citizen-pass__face citizen-pass__face--front"
          inert={side !== 'front'}
        >
          <CitizenCardBand t={t} headingId={headingId} />
          <ScrollingFace
            label={words.frontRegion}
            className="citizen-pass__identity"
          >
            <div className="citizen-pass__column">
              <CitizenIdentity {...parts} baseUrl={baseUrl} />
              <CitizenLinks {...parts} id={ids} />
            </div>
            <div className="citizen-pass__column">
              <CitizenBio {...parts} id={ids} />
            </div>
          </ScrollingFace>
          {/* Latin by definition: keeps its tracking and direction in an Arabic card. */}
          <p className="citizen-pass__mrz" aria-hidden="true" lang="en" dir="ltr">
            {machineReadableZone(localize(profile.name, 'en'))}
          </p>
        </div>
        <div
          className="citizen-card citizen-pass__face citizen-pass__face--back"
          inert={side !== 'back'}
        >
          <header className="citizen-card__band citizen-pass__visa-band">
            <p className="citizen-card__issuer">{words.backIssuer}</p>
            <p className="citizen-card__title">{words.backTitle}</p>
          </header>
          <ScrollingFace
            label={words.backRegion}
            className="citizen-pass__visa"
          >
            <CitizenStamps {...parts} id={ids} />
          </ScrollingFace>
        </div>
      </div>

      <button
        type="button"
        className="citizen-pass__flip"
        data-flip=""
        onClick={flip}
      >
        <span className="citizen-pass__flip-icon" aria-hidden="true" />
        {side === 'front' ? words.flipToBack : words.flipToFront}
      </button>
      <p className="citizen-pass__status" role="status">
        {announcement}
      </p>
    </article>
  );
}

/** Whether a scroll box overflows, and whether there is more below what it shows. */
export interface Overflow {
  readonly scrollable: boolean;
  readonly more: boolean;
}

/** Reads `Overflow` from an element's scroll geometry (1-2 px of slack for rounding). */
export const overflowOf = (box: {
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly scrollTop: number;
}): Overflow => {
  const scrollable = box.scrollHeight - box.clientHeight > 1;
  return {
    scrollable,
    more:
      scrollable && box.scrollHeight - box.scrollTop - box.clientHeight > 2,
  };
};

/**
 * A face's content area. When it overflows (the statement on a phone, the stamps), it says so:
 * the text fades out at the bottom under a small chevron until the end is reached, and the
 * area becomes a named, keyboard-scrollable region (Tab to it, then arrows or Page Down).
 */
function ScrollingFace({
  label,
  className,
  children,
}: {
  readonly label: string;
  readonly className: string;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<Overflow>({
    scrollable: false,
    more: false,
  });

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => {
      const next = overflowOf(box);
      setOverflow((prev) =>
        prev.scrollable === next.scrollable && prev.more === next.more
          ? prev
          : next,
      );
    };
    measure();
    box.addEventListener('scroll', measure, { passive: true });
    // Content changes size too (a photo loading, a font swapping in).
    const resize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resize?.observe(box);
    for (const child of Array.from(box.children)) resize?.observe(child);
    return () => {
      box.removeEventListener('scroll', measure);
      resize?.disconnect();
    };
  }, []);

  return (
    <div className="citizen-pass__viewport" data-more={overflow.more ? '' : undefined}>
      <div
        ref={ref}
        className={`citizen-pass__scroll ${className}`}
        {...(overflow.scrollable
          ? { role: 'region', 'aria-label': label, tabIndex: 0 }
          : {})}
      >
        {children}
      </div>
      <span className="citizen-pass__more" aria-hidden="true" />
    </div>
  );
}
