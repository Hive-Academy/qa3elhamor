import type {
  ModerationAction,
  ModerationComplaint,
  ModerationStatus,
} from '@qa3elhamor/shared-api-interfaces';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ModerationClient } from './api';
import { ComplaintCard } from './complaint-card';

const TABS: readonly { readonly status: ModerationStatus; readonly label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'approved', label: 'Approved' },
  { status: 'rejected', label: 'Rejected' },
  { status: 'deleted', label: 'Deleted' },
];

const PAST_TENSE: Readonly<Record<ModerationAction, string>> = {
  approve: 'approved',
  reject: 'rejected',
  delete: 'deleted',
};

/** Key for a complaint hidden from the tab of the status it left. */
const hiddenKey = (status: ModerationStatus, id: string) => `${status}:${id}`;

type Notice = { readonly tone: 'info' | 'error'; readonly text: string };

export interface ModerationQueueProps {
  readonly client: ModerationClient;
  /** The server refused the token: the caller clears it and returns to sign-in. */
  readonly onUnauthorized: () => void;
  /** Injected for tests; defaults to `window.confirm`. */
  readonly confirm?: (message: string) => boolean;
}

export function ModerationQueue({
  client,
  onUnauthorized,
  confirm = (message) => window.confirm(message),
}: ModerationQueueProps) {
  const [status, setStatus] = useState<ModerationStatus>('pending');
  const [items, setItems] = useState<readonly ModerationComplaint[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  // Responses for a tab the moderator already left, or for a superseded reload, are dropped.
  const generation = useRef(0);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef(new Map<ModerationStatus, HTMLButtonElement>());
  // `${status}:${id}` of complaints whose action is in flight or already succeeded. A list of
  // that status (a 409 refresh, a Refresh click, the next page) may have been read before the
  // server committed the action, so it must not bring the card back there. Keyed by the status
  // the complaint LEFT: the tab it moved to lists it normally. Moderation never returns a
  // complaint to a status it left, so a key can stay for the life of the view.
  const hiddenIds = useRef(new Set<string>());
  const loadingMoreRef = useRef(false);

  const load = useCallback(
    async (forStatus: ModerationStatus) => {
      const current = ++generation.current;
      setPhase('loading');
      setLoadError(null);
      const result = await client.list(forStatus);
      if (current !== generation.current) return;
      if (!result.ok) {
        if (result.failure.kind === 'unauthorized') return onUnauthorized();
        setLoadError(result.failure.message);
        setPhase('error');
        return;
      }
      setItems(result.value.items.filter((item) => !hiddenIds.current.has(hiddenKey(forStatus, item.id))));
      setNextCursor(result.value.nextCursor);
      setPhase('ready');
    },
    [client, onUnauthorized]
  );

  useEffect(() => {
    void load(status);
  }, [load, status]);

  useEffect(() => {
    if (focusIndex === null) return;
    const cards = listRef.current?.querySelectorAll<HTMLElement>('.mod-card') ?? [];
    const target = cards[Math.min(focusIndex, cards.length - 1)] ?? headingRef.current;
    target?.focus();
    setFocusIndex(null);
  }, [focusIndex, items]);

  const loadMore = async () => {
    // A ref, not the disabled state: two activations can land before React re-renders.
    if (nextCursor === null || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const current = generation.current;
    setLoadingMore(true);
    const result = await client.list(status, nextCursor);
    loadingMoreRef.current = false;
    setLoadingMore(false);
    if (current !== generation.current) return;
    if (!result.ok) {
      if (result.failure.kind === 'unauthorized') return onUnauthorized();
      setNotice({ tone: 'error', text: result.failure.message });
      // A cursor the server no longer accepts can never succeed: start again from page one.
      if (result.failure.kind === 'invalid-cursor') void load(status);
      return;
    }
    setItems((previous) => {
      const known = new Set(previous.map((item) => item.id));
      return [...previous, ...result.value.items.filter((item) => !known.has(item.id) && !hiddenIds.current.has(hiddenKey(status, item.id)))];
    });
    setNextCursor(result.value.nextCursor);
  };

  const moderate = async (complaint: ModerationComplaint, action: ModerationAction) => {
    if (action === 'delete' && !confirm(`Delete "${complaint.subject}"? This cannot be undone.`)) return;

    const index = items.findIndex((item) => item.id === complaint.id);
    setItems((previous) => previous.filter((item) => item.id !== complaint.id));
    setFocusIndex(Math.max(index, 0));
    setNotice(null);
    hiddenIds.current.add(hiddenKey(complaint.status, complaint.id));

    const result = await client.act(complaint.id, action);
    const stillHere = statusRef.current === complaint.status;
    if (result.ok) {
      // A refresh that raced the request may have listed it again; the decision is final.
      setItems((previous) => previous.filter((item) => item.id !== complaint.id));
      // Announce only on the tab it happened on; after a tab switch the message would mislead.
      if (stillHere) setNotice({ tone: 'info', text: `"${complaint.subject}" ${PAST_TENSE[action]}.` });
      return;
    }
    hiddenIds.current.delete(hiddenKey(complaint.status, complaint.id));
    const { failure } = result;
    if (failure.kind === 'unauthorized') return onUnauthorized();
    setNotice({ tone: 'error', text: failure.message });
    if (failure.kind === 'conflict' || failure.kind === 'not-found') {
      // Someone else decided first, or the state moved on: show what the server has now.
      if (stillHere) void load(complaint.status);
      return;
    }
    // Roll back, unless the moderator has since moved to another tab.
    if (!stillHere) return;
    setItems((previous) => {
      if (previous.some((item) => item.id === complaint.id)) return previous;
      const at = Math.min(Math.max(index, 0), previous.length);
      return [...previous.slice(0, at), complaint, ...previous.slice(at)];
    });
  };

  const selectTab = (next: ModerationStatus, focus: boolean) => {
    if (next !== status) {
      setItems([]);
      setNextCursor(null);
      setNotice(null);
      setStatus(next);
    }
    if (focus) tabRefs.current.get(next)?.focus();
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const at = TABS.findIndex((tab) => tab.status === status);
    const moves: Record<string, number> = {
      ArrowRight: (at + 1) % TABS.length,
      ArrowLeft: (at - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    selectTab(TABS[target].status, true);
  };

  const activeLabel = TABS.find((tab) => tab.status === status)?.label ?? status;

  return (
    <section className="mod-queue">
      <div role="tablist" aria-label="Complaint status" className="mod-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.status}
            ref={(node) => {
              if (node) tabRefs.current.set(tab.status, node);
              else tabRefs.current.delete(tab.status);
            }}
            type="button"
            role="tab"
            id={`tab-${tab.status}`}
            aria-selected={tab.status === status}
            aria-controls="mod-panel"
            tabIndex={tab.status === status ? 0 : -1}
            className="mod-tab"
            onClick={() => selectTab(tab.status, false)}
            onKeyDown={onTabKeyDown}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id="mod-panel" role="tabpanel" aria-labelledby={`tab-${status}`} className="mod-panel">
        <div className="mod-panel__head">
          <h2 ref={headingRef} tabIndex={-1}>
            {activeLabel} complaints
          </h2>
          <button
            type="button"
            className="mod-button"
            onClick={() => void load(status)}
            disabled={phase === 'loading'}
          >
            Refresh
          </button>
        </div>

        <div aria-live="polite" className="mod-live">
          {notice !== null && (
            <p className={`mod-alert mod-alert--${notice.tone}`}>{notice.text}</p>
          )}
        </div>

        {phase === 'loading' && (
          <p className="mod-muted" role="status">
            Loading…
          </p>
        )}
        {phase === 'error' && (
          <div className="mod-alert mod-alert--error" role="alert">
            <p>{loadError}</p>
            <button type="button" className="mod-button" onClick={() => void load(status)}>
              Try again
            </button>
          </div>
        )}
        {phase === 'ready' && items.length === 0 && (
          <p className="mod-muted">No {activeLabel.toLowerCase()} complaints.</p>
        )}

        <div ref={listRef} className="mod-list">
          {phase === 'ready' &&
            items.map((complaint) => (
              <ComplaintCard key={complaint.id} complaint={complaint} onAction={moderate} />
            ))}
        </div>

        {phase === 'ready' && nextCursor !== null && (
          <button
            type="button"
            className="mod-button mod-button--more"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </section>
  );
}
