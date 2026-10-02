import type { Locale } from '@qa3elhamor/content-domain';
import type { WallComplaint } from '@qa3elhamor/shared-api-interfaces';
import {
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { objectKeyStep } from '../narrators/object-selection';
import { fillCopy } from '../overlays/overlay-copy';
import { excerptOf, noteDate } from './note-text';
import { createWallClient, type WallClient } from './wall-client';
import { NOTICE_BOARD_COPY, type NoticeBoardWords } from './notice-board-copy';
import {
  INITIAL_WALL_PAGING,
  currentPage,
  hasNewer,
  hasOlder,
  pendingCursor,
  wallPagingReducer,
} from './wall-paging';
import './notice-board.css';

export interface NoticeBoardProps {
  /** The wall API root (`WallPort.apiUrl`). */
  readonly apiUrl: string;
  /** Injected in tests; otherwise one is made for `apiUrl`. */
  readonly client?: WallClient;
  readonly lang: Locale;
  readonly dir: 'ltr' | 'rtl';
  /**
   * `in-world`: the board floats out of the Bureau; `sheet`: the same over the scene on a phone;
   * `page`: inside the page view's own titled section (no heading of its own).
   */
  readonly presentation: 'in-world' | 'sheet' | 'page';
  /** In the Bureau: the way back to the President (with `closeLabel`). */
  readonly onClose?: () => void;
  readonly closeLabel?: string;
  /** Take focus on arrival (its heading): the visitor just asked to read the wall. */
  readonly autoFocus?: boolean;
}

/**
 * The Municipal Notice Wall: approved public complaints pinned as paper notes on a cork board
 * in a stone frame, newest first, a page at a time. Each note is a button (tap, click, or arrow
 * keys between them, then Enter) that opens the whole complaint on a sheet over the board.
 *
 * Every complaint field is visitor-authored: it is rendered only as React text children, with
 * `dir="auto"` so an Arabic complaint reads right in an English page and the reverse. Never as
 * HTML, never into an attribute that loads or links anything (docs/security.md, "Stored XSS").
 */
export function NoticeBoard({
  apiUrl,
  client: injected,
  lang,
  dir,
  presentation,
  onClose,
  closeLabel,
  autoFocus = false,
}: NoticeBoardProps) {
  const words = NOTICE_BOARD_COPY[lang];
  const ids = useId();
  const client = useMemo(
    () => injected ?? createWallClient({ baseUrl: apiUrl }),
    [injected, apiUrl],
  );

  const [paging, dispatch] = useReducer(wallPagingReducer, INITIAL_WALL_PAGING);
  const cursor = pendingCursor(paging);
  useEffect(() => {
    if (cursor === undefined) return undefined;
    const controller = new AbortController();
    void client.list({ cursor, signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      dispatch(
        result.ok
          ? { type: 'loaded', items: result.value.items, nextCursor: result.value.nextCursor }
          : { type: 'failed', kind: result.failure.kind },
      );
    });
    return () => controller.abort();
  }, [client, cursor, paging.request]);

  const notes = currentPage(paging);
  const [selected, setSelected] = useState<string | null>(null);
  const open = notes.find((note) => note.id === selected) ?? null;

  const noteRefs = useRef(new Map<string, HTMLButtonElement>());
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (autoFocus) titleRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  const reopenFocus = useRef<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const rovingId = notes.some((note) => note.id === focusId) ? focusId : (notes[0]?.id ?? null);

  useEffect(() => {
    if (open) detailHeading.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (open || reopenFocus.current === null) return;
    noteRefs.current.get(reopenFocus.current)?.focus({ preventScroll: true });
    reopenFocus.current = null;
  }, [open]);

  // A new page closes the note that was open on the last one.
  // The pager's buttons stay focusable when there is nowhere to go (`aria-disabled`, so focus
  // never drops), so a press on one must do nothing at all, least of all close the open note.
  const turn = (type: 'newer' | 'older') => {
    const possible = type === 'older' ? hasOlder(paging) : hasNewer(paging);
    if (paging.status === 'loading' || !possible) return;
    setSelected(null);
    dispatch({ type });
  };

  const closeNote = () => {
    reopenFocus.current = selected;
    setSelected(null);
  };

  const onNoteKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = objectKeyStep(index, event.key, notes.length, dir);
    if (next === null) return;
    event.preventDefault();
    const id = notes[next]?.id;
    if (!id) return;
    setFocusId(id);
    noteRefs.current.get(id)?.focus({ preventScroll: true });
  };

  const detailId = `${ids}-detail`;
  const titleId = `${ids}-title`;
  const loading = paging.status === 'loading';
  const empty = paging.status === 'ready' && paging.pages.length === 1 && notes.length === 0;
  const onward = (forward: boolean) => (
    <span aria-hidden="true">{forward === (dir === 'rtl') ? '‹' : '›'}</span>
  );

  return (
    <section
      className="notice-board"
      data-presentation={presentation}
      dir={dir}
      lang={lang}
      aria-labelledby={presentation === 'page' ? undefined : titleId}
      aria-label={presentation === 'page' ? words.wallTitle : undefined}
      aria-busy={loading || undefined}
    >
      <div className="notice-board__frame">
        {presentation !== 'page' && (
          <header className="notice-board__header">
            <h2 id={titleId} ref={titleRef} tabIndex={-1} className="notice-board__title">
              {words.wallTitle}
            </h2>
            <p className="notice-board__intro">{words.wallIntro}</p>
          </header>
        )}

        <div className="notice-board__cork">
          <p role="status" className="notice-board__status">
            {loading ? words.loading : empty ? words.empty : ''}
          </p>
          {paging.status === 'failed' && (
            <div className="notice-board__failed" role="alert">
              <p>{words.failed}</p>
              <button
                type="button"
                className="notice-board__button"
                onClick={() => dispatch({ type: 'retry' })}
              >
                {words.retry}
              </button>
            </div>
          )}

          {notes.length > 0 && (
            <ul
              className="notice-board__notes"
              aria-label={words.notesLabel}
              inert={open !== null}
            >
              {notes.map((note, index) => (
                <li key={note.id} className="notice-board__slot">
                  <PinnedNote
                    note={note}
                    words={words}
                    lang={lang}
                    detailId={detailId}
                    selected={note.id === selected}
                    tabbable={note.id === rovingId}
                    buttonRef={(element) => {
                      if (element) noteRefs.current.set(note.id, element);
                      else noteRefs.current.delete(note.id);
                    }}
                    onFocus={() => setFocusId(note.id)}
                    onSelect={() =>
                      setSelected((current) => (current === note.id ? null : note.id))
                    }
                    onKeyDown={(event) => onNoteKey(event, index)}
                  />
                </li>
              ))}
            </ul>
          )}

          {open && (
            <article
              id={detailId}
              className="notice-detail"
              aria-labelledby={`${detailId}-subject`}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                closeNote();
              }}
            >
              <span className="notice-note__pin" aria-hidden="true" />
              <h3
                id={`${detailId}-subject`}
                ref={detailHeading}
                tabIndex={-1}
                className="notice-detail__subject"
                dir="auto"
              >
                {open.subject}
              </h3>
              <p className="notice-detail__body" dir="auto">
                {open.body}
              </p>
              <p className="notice-note__meta">
                <SenderLine note={open} words={words} lang={lang} />
              </p>
              <button type="button" className="notice-board__button" onClick={closeNote}>
                {words.closeNote}
              </button>
            </article>
          )}
        </div>

        {/* While a note is open the rest of the board is out of reach: Tab stays on the note. */}
        <nav className="notice-board__pager" aria-label={words.pagesLabel} inert={open !== null}>
          <button
            type="button"
            className="notice-board__button"
            aria-disabled={!hasNewer(paging) || loading || undefined}
            onClick={() => turn('newer')}
          >
            {onward(false)} {words.newer}
          </button>
          <span className="notice-board__page">
            {fillCopy(words.pageLabel, { n: paging.index + 1 })}
          </span>
          <button
            type="button"
            className="notice-board__button"
            aria-disabled={!hasOlder(paging) || loading || undefined}
            onClick={() => turn('older')}
          >
            {words.older} {onward(true)}
          </button>
        </nav>
      </div>

      {onClose && closeLabel && (
        <button
          type="button"
          className="visit-full-back notice-board__back"
          inert={open !== null}
          onClick={onClose}
        >
          <span aria-hidden="true">{dir === 'rtl' ? '›' : '‹'}</span>
          {closeLabel}
        </button>
      )}
    </section>
  );
}

/** The note's sender (each visitor-authored part isolated in its own `<bdi>`) and date. */
function SenderLine({
  note,
  words,
  lang,
}: {
  readonly note: WallComplaint;
  readonly words: NoticeBoardWords;
  readonly lang: Locale;
}) {
  const date = noteDate(note.submittedAt, lang);
  return (
    <>
      {note.senderSpecies ? (
        <Filled
          template={words.fromSpecies}
          values={{ name: note.senderName, species: note.senderSpecies }}
        />
      ) : (
        <Filled template={words.from} values={{ name: note.senderName }} />
      )}
      {date && (
        <>
          {' · '}
          <time dateTime={note.submittedAt}>{date}</time>
        </>
      )}
    </>
  );
}

/**
 * A copy template with `{placeholders}` filled by visitor text, as text nodes: each value in its
 * own `<bdi dir="auto">`, so a name in the other script neither reorders the words around it nor
 * is ever parsed as anything but text.
 */
function Filled({
  template,
  values,
}: {
  readonly template: string;
  readonly values: Readonly<Record<string, string>>;
}) {
  return (
    <>
      {template.split(/(\{\w+\})/u).map((part, index) => {
        const name = /^\{(\w+)\}$/u.exec(part)?.[1];
        return name !== undefined && name in values ? (
          <bdi key={index} dir="auto">
            {values[name]}
          </bdi>
        ) : (
          part
        );
      })}
    </>
  );
}

function PinnedNote({
  note,
  words,
  lang,
  detailId,
  selected,
  tabbable,
  buttonRef,
  onFocus,
  onSelect,
  onKeyDown,
}: {
  readonly note: WallComplaint;
  readonly words: NoticeBoardWords;
  readonly lang: Locale;
  readonly detailId: string;
  readonly selected: boolean;
  readonly tabbable: boolean;
  readonly buttonRef: (element: HTMLButtonElement | null) => void;
  readonly onFocus: () => void;
  readonly onSelect: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const ids = useId();
  const excerpt = excerptOf(note.body);
  return (
    <button
      ref={buttonRef}
      type="button"
      className="notice-note"
      data-selected={selected ? '' : undefined}
      tabIndex={tabbable ? 0 : -1}
      aria-expanded={selected}
      aria-controls={selected ? detailId : undefined}
      aria-labelledby={`${ids}-subject`}
      aria-describedby={`${ids}-excerpt ${ids}-meta`}
      onFocus={onFocus}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <span className="notice-note__pin" aria-hidden="true" />
      <span id={`${ids}-subject`} className="notice-note__subject" dir="auto">
        {note.subject}
      </span>
      <span id={`${ids}-excerpt`} className="notice-note__excerpt" dir="auto">
        {excerpt.text}
      </span>
      <span id={`${ids}-meta`} className="notice-note__footer">
        <SenderLine note={note} words={words} lang={lang} />
      </span>
      {excerpt.cut && (
        <span className="notice-note__more" aria-hidden="true">
          {words.readMore}
        </span>
      )}
    </button>
  );
}
