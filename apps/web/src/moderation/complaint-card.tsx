import type {
  ModerationAction,
  ModerationComplaint,
  ModerationStatus,
} from '@qa3elhamor/shared-api-interfaces';
import { formatAbsolute, formatRelative } from './format-time';

/**
 * Actions offered per status. Mirrors the public lifecycle the API enforces (the domain library
 * is outside this app's boundary); the server stays the authority and answers 409 otherwise.
 */
export const ACTIONS_BY_STATUS: Readonly<Record<ModerationStatus, readonly ModerationAction[]>> = {
  pending: ['approve', 'reject', 'delete'],
  approved: ['delete'],
  rejected: ['delete'],
  deleted: [],
};

const ACTION_LABELS: Readonly<Record<ModerationAction, string>> = {
  approve: 'Approve',
  reject: 'Reject',
  delete: 'Delete',
};

export interface ComplaintCardProps {
  readonly complaint: ModerationComplaint;
  readonly onAction: (complaint: ModerationComplaint, action: ModerationAction) => void;
}

function Timestamp({ label, iso }: { readonly label: string; readonly iso: string }) {
  return (
    <>
      {label}{' '}
      <time dateTime={iso} title={formatAbsolute(iso)}>
        {formatRelative(iso)}
      </time>{' '}
      <span className="mod-muted">({formatAbsolute(iso)})</span>
    </>
  );
}

export function ComplaintCard({ complaint, onAction }: ComplaintCardProps) {
  const headingId = `complaint-${complaint.id}`;
  const actions = ACTIONS_BY_STATUS[complaint.status];
  return (
    // tabIndex -1: the queue moves focus to the next card after one is moderated away.
    <article className="mod-card" aria-labelledby={headingId} tabIndex={-1}>
      <h3 id={headingId} className="mod-card__subject">
        {complaint.subject}
      </h3>
      <p className="mod-card__meta">
        From <strong>{complaint.senderName}</strong>
        {complaint.senderSpecies !== null && <> ({complaint.senderSpecies})</>}
        {' · '}
        <Timestamp label="submitted" iso={complaint.submittedAt} />
      </p>
      {/* Plain text: React escapes it; `white-space: pre-wrap` keeps the sender's line breaks. */}
      <p className="mod-card__body">{complaint.body}</p>
      {complaint.status !== 'pending' && (
        <p className="mod-card__meta">
          <Timestamp label={complaint.status} iso={complaint.updatedAt} />
        </p>
      )}
      {actions.length > 0 && (
        <div className="mod-card__actions">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              className={`mod-button mod-button--${action}`}
              aria-label={`${ACTION_LABELS[action]}: ${complaint.subject}`}
              onClick={() => onAction(complaint, action)}
            >
              {ACTION_LABELS[action]}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
