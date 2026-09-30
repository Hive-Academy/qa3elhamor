import { describe, expect, it } from 'vitest';
import { approveComplaint, submitComplaint, type Complaint } from './complaint.js';
import { restoreComplaint, toSnapshot } from './complaint-snapshot.js';

const T0 = new Date('2026-10-01T10:00:00.000Z');

const privateComplaint = (): Complaint => {
  const result = submitComplaint(
    {
      id: 'p-1',
      visibility: 'private',
      subject: 'Leak',
      body: 'Line one\n\nLine two',
      senderName: 'Hamour',
      senderSpecies: null,
      replyEmail: 'me@Sea.org',
    },
    T0
  );
  if (!result.ok) throw new Error('fixture');
  return result.value.complaint;
};

const approvedPublic = (): Complaint => {
  const submitted = submitComplaint(
    { id: 'w-1', visibility: 'public', subject: 'Noise', body: 'Too loud', senderName: 'Clam', senderSpecies: 'clam' },
    T0
  );
  if (!submitted.ok) throw new Error('fixture');
  const approved = approveComplaint(submitted.value.complaint, new Date('2026-10-02T00:00:00.000Z'));
  if (!approved.ok) throw new Error('fixture');
  return approved.value.complaint;
};

describe('toSnapshot / restoreComplaint', () => {
  it.each([
    ['private', privateComplaint],
    ['approved public', approvedPublic],
  ])('round-trips a %s complaint', (_label, make) => {
    const complaint = make();
    const snapshot = toSnapshot(complaint);
    const restored = restoreComplaint(snapshot);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(toSnapshot(restored.value)).toEqual(snapshot);
  });

  it('serialises a private reply email and a public complaint without one', () => {
    expect(toSnapshot(privateComplaint()).replyEmail).toBe('me@sea.org');
    expect(toSnapshot(approvedPublic()).replyEmail).toBeNull();
  });

  const tamper = (patch: Record<string, unknown>): Record<string, unknown> => ({
    ...toSnapshot(approvedPublic()),
    ...patch,
  });

  it('refuses a stored private complaint claiming to be approved', () => {
    expect(restoreComplaint({ ...toSnapshot(privateComplaint()), status: 'approved' })).toEqual({
      ok: false,
      error: { type: 'invalid-complaint', issues: [{ field: 'status', reason: 'malformed' }] },
    });
  });

  it('refuses a stored public complaint with a private status', () => {
    expect(restoreComplaint(tamper({ status: 'delivered' })).ok).toBe(false);
  });

  it('refuses an unknown visibility', () => {
    expect(restoreComplaint(tamper({ visibility: 'secret' }))).toEqual({
      ok: false,
      error: { type: 'invalid-complaint', issues: [{ field: 'visibility', reason: 'malformed' }] },
    });
  });

  it('refuses malformed timestamps', () => {
    expect(restoreComplaint(tamper({ submittedAt: 'yesterday', updatedAt: '2026-13-45T00:00:00Z' }))).toEqual({
      ok: false,
      error: {
        type: 'invalid-complaint',
        issues: [
          { field: 'submittedAt', reason: 'malformed' },
          { field: 'updatedAt', reason: 'malformed' },
        ],
      },
    });
  });

  it('re-applies field rules to stored text', () => {
    expect(restoreComplaint(tamper({ body: `x${String.fromCodePoint(0x202e)}y`, replyEmail: 'leak@sea.org' }))).toEqual({
      ok: false,
      error: {
        type: 'invalid-complaint',
        issues: [
          { field: 'body', reason: 'control-character' },
          { field: 'replyEmail', reason: 'not-allowed' },
        ],
      },
    });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'row'],
    ['an array', []],
  ])('returns an error, not a throw, for %s', (_label, stored) => {
    expect(restoreComplaint(stored)).toEqual({
      ok: false,
      error: { type: 'invalid-complaint', issues: [{ field: 'record', reason: 'malformed' }] },
    });
  });

  it('reports non-string fields as malformed instead of throwing', () => {
    expect(
      restoreComplaint(tamper({ subject: 42, body: null, senderSpecies: {}, replyEmail: 7, submittedAt: 0 }))
    ).toEqual({
      ok: false,
      error: {
        type: 'invalid-complaint',
        issues: [
          { field: 'submittedAt', reason: 'malformed' },
          { field: 'subject', reason: 'malformed' },
          { field: 'body', reason: 'malformed' },
          { field: 'senderSpecies', reason: 'malformed' },
          { field: 'replyEmail', reason: 'malformed' },
        ],
      },
    });
  });

  it('refuses updatedAt earlier than submittedAt', () => {
    expect(
      restoreComplaint(
        tamper({ submittedAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-01T23:59:59.999Z' })
      )
    ).toEqual({
      ok: false,
      error: { type: 'invalid-complaint', issues: [{ field: 'updatedAt', reason: 'out-of-order' }] },
    });
  });

  it('accepts updatedAt equal to submittedAt', () => {
    const at = '2026-10-01T10:00:00.000Z';
    expect(restoreComplaint(tamper({ submittedAt: at, updatedAt: at })).ok).toBe(true);
  });
});
