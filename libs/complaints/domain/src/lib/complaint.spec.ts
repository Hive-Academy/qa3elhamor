import { describe, expect, it } from 'vitest';
import {
  approveComplaint,
  awaitsModeration,
  canTransition,
  deleteComplaint,
  isListedOnWall,
  markDelivered,
  markDeliveryFailed,
  rejectComplaint,
  retryDelivery,
  submitComplaint,
  transitionComplaint,
  type Complaint,
  type ComplaintSubmission,
} from './complaint.js';
import {
  PRIVATE_ACTIONS,
  PRIVATE_STATUSES,
  PUBLIC_ACTIONS,
  PUBLIC_STATUSES,
  type ComplaintAction,
  type ComplaintStatus,
} from './complaint-lifecycle.js';
import { destinationOf, type Visibility } from './visibility.js';

const T0 = new Date('2026-10-01T10:00:00.000Z');
const T1 = new Date('2026-10-01T11:00:00.000Z');

const submission = (
  visibility: Visibility,
  overrides: Partial<ComplaintSubmission> = {}
): ComplaintSubmission => ({
  id: 'c-1',
  visibility,
  subject: 'We reached the bottom',
  body: 'And then someone knocked from below.',
  senderName: 'Hamour',
  senderSpecies: 'grouper',
  ...overrides,
});

const submitted = (visibility: Visibility, overrides?: Partial<ComplaintSubmission>): Complaint => {
  const result = submitComplaint(submission(visibility, overrides), T0);
  if (!result.ok) throw new Error(`fixture failed: ${JSON.stringify(result.error)}`);
  return result.value.complaint;
};

/** Drives a fresh complaint into `status` through valid transitions only. */
const inStatus = (visibility: Visibility, status: ComplaintStatus): Complaint => {
  const paths: Record<ComplaintStatus, ComplaintAction[]> = {
    submitted: [],
    delivered: ['markDelivered'],
    failed: ['markDeliveryFailed'],
    pending: [],
    approved: ['approve'],
    rejected: ['reject'],
    deleted: ['delete'],
  };
  return paths[status].reduce<Complaint>((complaint, action) => {
    const result = transitionComplaint(complaint, action, T0);
    if (!result.ok) throw new Error(`path failed at ${action}`);
    return result.value.complaint;
  }, submitted(visibility));
};

describe('submitComplaint', () => {
  it('starts a private complaint as submitted, routed to the owner inbox', () => {
    const result = submitComplaint(submission('private', { replyEmail: 'me@sea.org' }), T0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { complaint, event } = result.value;
    expect(complaint.visibility).toBe('private');
    expect(complaint.status).toBe('submitted');
    expect(complaint.visibility === 'private' && complaint.replyEmail?.value).toBe('me@sea.org');
    expect(complaint.submittedAt).toBe('2026-10-01T10:00:00.000Z');
    expect(complaint.updatedAt).toBe(complaint.submittedAt);
    expect(destinationOf(complaint.visibility)).toBe('owner-inbox');
    expect(event).toEqual({
      type: 'ComplaintSubmitted',
      complaintId: 'c-1',
      visibility: 'private',
      status: 'submitted',
      occurredAt: '2026-10-01T10:00:00.000Z',
    });
  });

  it('starts a public complaint as pending, routed to the wall', () => {
    const complaint = submitted('public');
    expect(complaint.status).toBe('pending');
    expect(destinationOf(complaint.visibility)).toBe('public-wall');
    expect(awaitsModeration(complaint)).toBe(true);
    expect(isListedOnWall(complaint)).toBe(false);
  });

  it('treats blank optional fields as absent', () => {
    const complaint = submitted('private', { senderSpecies: '   ', replyEmail: '' });
    expect(complaint.sender.species).toBeNull();
    expect(complaint.visibility === 'private' && complaint.replyEmail).toBeNull();
    expect(submitted('public', { senderSpecies: null }).sender.species).toBeNull();
  });

  it('refuses a reply email on a public complaint so it can never reach the wall', () => {
    expect(submitComplaint(submission('public', { replyEmail: 'me@sea.org' }), T0)).toEqual({
      ok: false,
      error: { type: 'invalid-complaint', issues: [{ field: 'replyEmail', reason: 'not-allowed' }] },
    });
  });

  it('reports every invalid field at once', () => {
    const result = submitComplaint(
      submission('private', {
        id: '',
        subject: ' ',
        body: 'x'.repeat(2001),
        senderName: `bad${String.fromCodePoint(0)}`,
        senderSpecies: 'y'.repeat(41),
        replyEmail: 'nope',
      }),
      T0
    );
    expect(result).toEqual({
      ok: false,
      error: {
        type: 'invalid-complaint',
        issues: [
          { field: 'id', reason: 'empty' },
          { field: 'subject', reason: 'empty' },
          { field: 'body', reason: 'too-long', limit: 2000 },
          { field: 'senderName', reason: 'control-character' },
          { field: 'senderSpecies', reason: 'too-long', limit: 40 },
          { field: 'replyEmail', reason: 'malformed' },
        ],
      },
    });
  });

  it('refuses an Invalid Date clock instead of throwing', () => {
    expect(submitComplaint(submission('public'), new Date(Number.NaN))).toEqual({
      ok: false,
      error: { type: 'invalid-clock', reason: 'not-a-date' },
    });
  });

  it('returns a frozen aggregate', () => {
    const complaint = submitted('public');
    expect(Object.isFrozen(complaint)).toBe(true);
    expect(Object.isFrozen(complaint.sender)).toBe(true);
  });
});

/** The full expected state machine; anything absent must be refused. */
const EXPECTED: Record<Visibility, Partial<Record<ComplaintStatus, Partial<Record<ComplaintAction, ComplaintStatus>>>>> = {
  private: {
    submitted: { markDelivered: 'delivered', markDeliveryFailed: 'failed' },
    failed: { retryDelivery: 'submitted' },
    delivered: {},
  },
  public: {
    pending: { approve: 'approved', reject: 'rejected', delete: 'deleted' },
    approved: { delete: 'deleted' },
    rejected: { delete: 'deleted' },
    deleted: {},
  },
};

const ALL_ACTIONS: readonly ComplaintAction[] = [...PRIVATE_ACTIONS, ...PUBLIC_ACTIONS];
const CASES = (['private', 'public'] as const).flatMap((visibility) =>
  (visibility === 'private' ? PRIVATE_STATUSES : PUBLIC_STATUSES).flatMap((from) =>
    ALL_ACTIONS.map((action) => ({
      visibility,
      from,
      action,
      to: EXPECTED[visibility][from]?.[action],
    }))
  )
);

describe('lifecycle transitions', () => {
  it.each(CASES.filter((c) => c.to !== undefined))(
    '$visibility: $from --$action--> $to',
    ({ visibility, from, action, to }) => {
      const before = inStatus(visibility, from);
      const result = transitionComplaint(before, action, T1);
      expect(canTransition(before, action)).toBe(true);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.complaint.status).toBe(to);
      expect(result.value.complaint.visibility).toBe(visibility);
      expect(result.value.complaint.updatedAt).toBe(T1.toISOString());
      expect(result.value.complaint.submittedAt).toBe(T0.toISOString());
      expect(result.value.event.status).toBe(to);
      expect(result.value.event.occurredAt).toBe(T1.toISOString());
      // The input is untouched.
      expect(before.status).toBe(from);
    }
  );

  it.each(CASES.filter((c) => c.to === undefined))(
    '$visibility: $from --$action--> refused',
    ({ visibility, from, action }) => {
      const before = inStatus(visibility, from);
      expect(canTransition(before, action)).toBe(false);
      expect(transitionComplaint(before, action, T1)).toEqual({
        ok: false,
        error: { type: 'invalid-transition', complaintId: 'c-1', visibility, from, action },
      });
    }
  );

  it('emits the event matching each action', () => {
    const priv = submitted('private');
    const pub = submitted('public');
    const eventOf = (r: ReturnType<typeof transitionComplaint>) => (r.ok ? r.value.event.type : r.error.type);
    expect(eventOf(markDelivered(priv, T1))).toBe('ComplaintDelivered');
    expect(eventOf(markDeliveryFailed(priv, T1))).toBe('ComplaintDeliveryFailed');
    expect(eventOf(retryDelivery(inStatus('private', 'failed'), T1))).toBe('ComplaintDeliveryRetried');
    expect(eventOf(approveComplaint(pub, T1))).toBe('ComplaintApproved');
    expect(eventOf(rejectComplaint(pub, T1))).toBe('ComplaintRejected');
    expect(eventOf(deleteComplaint(pub, T1))).toBe('ComplaintDeleted');
  });

  it('refuses an Invalid Date clock on a transition', () => {
    expect(approveComplaint(submitted('public'), new Date('nope'))).toEqual({
      ok: false,
      error: { type: 'invalid-clock', reason: 'not-a-date' },
    });
  });
});

describe('a private complaint can never become public or approved', () => {
  it.each(PRIVATE_STATUSES)('from %s, no action yields approved or public', (status) => {
    const start = inStatus('private', status);
    // Explore every state reachable by any sequence of actions.
    const seen = new Set<ComplaintStatus>();
    const queue: Complaint[] = [start];
    while (queue.length > 0) {
      const current = queue.shift() as Complaint;
      if (seen.has(current.status)) continue;
      seen.add(current.status);
      expect(current.visibility).toBe('private');
      expect(isListedOnWall(current)).toBe(false);
      expect(awaitsModeration(current)).toBe(false);
      for (const action of ALL_ACTIONS) {
        const result = transitionComplaint(current, action, T1);
        if (result.ok) queue.push(result.value.complaint);
      }
    }
    for (const publicStatus of PUBLIC_STATUSES) expect(seen.has(publicStatus)).toBe(false);
  });

  it('refuses approve on a private complaint', () => {
    const result = approveComplaint(submitted('private'), T1);
    expect(result.ok || result.error.type).toBe('invalid-transition');
  });
});

describe('wall listing', () => {
  it.each(PUBLIC_STATUSES)('lists a public %s complaint only when approved', (status) => {
    expect(isListedOnWall(inStatus('public', status))).toBe(status === 'approved');
  });
});

describe('clock guards', () => {
  const NOT_A_DATE = { ok: false, error: { type: 'invalid-clock', reason: 'not-a-date' } };

  // Untyped callers (plain JS, a deserialised payload) can hand in anything.
  it.each([
    ['an ISO string', '2026-10-01T10:00:00.000Z'],
    ['an epoch number', 1_790_000_000_000],
    ['null', null],
    ['undefined', undefined],
    ['a plain object', {}],
    ['a Date-like object', { getTime: () => 0, toISOString: () => 'x' }],
  ])('refuses %s as `now` on submit and on transition', (_label, now) => {
    const fakeNow = now as unknown as Date;
    expect(submitComplaint(submission('public'), fakeNow)).toEqual(NOT_A_DATE);
    expect(approveComplaint(submitted('public'), fakeNow)).toEqual(NOT_A_DATE);
  });

  it('refuses a transition whose `now` is earlier than the last change, without clamping', () => {
    const before = new Date(T0.getTime() - 1);
    const result = approveComplaint(submitted('public'), before);
    expect(result).toEqual({
      ok: false,
      error: { type: 'invalid-clock', reason: 'before-last-update' },
    });
  });

  it('measures against updatedAt, not submittedAt', () => {
    const approved = approveComplaint(submitted('public'), T1);
    if (!approved.ok) throw new Error('fixture');
    const between = new Date('2026-10-01T10:30:00.000Z');
    expect(deleteComplaint(approved.value.complaint, between)).toEqual({
      ok: false,
      error: { type: 'invalid-clock', reason: 'before-last-update' },
    });
    expect(deleteComplaint(approved.value.complaint, T1).ok).toBe(true);
  });

  it('allows a transition at exactly the last-change instant', () => {
    const result = markDelivered(submitted('private'), T0);
    expect(result.ok && result.value.complaint.updatedAt).toBe(T0.toISOString());
  });

  it('checks the clock before the transition rule', () => {
    const delivered = inStatus('private', 'delivered');
    expect(approveComplaint(delivered, new Date(0))).toEqual({
      ok: false,
      error: { type: 'invalid-clock', reason: 'before-last-update' },
    });
  });
});
