import {
  approveComplaint,
  submitComplaint,
  type ComplaintId,
  type PublicComplaint,
} from '@qa3elhamor/complaints-domain';
import { describe, expect, it } from 'vitest';
import { InMemoryComplaintRepository } from './in-memory.js';

const publicComplaint = (id: string, submittedAt: string): PublicComplaint => {
  const result = submitComplaint(
    { id, visibility: 'public', subject: `Subject ${id}`, body: 'Too many jellyfish.', senderName: 'Sandy' },
    new Date(submittedAt)
  );
  if (!result.ok || result.value.complaint.visibility !== 'public') throw new Error('fixture');
  return result.value.complaint;
};

const approve = (complaint: PublicComplaint, now: string): PublicComplaint => {
  const result = approveComplaint(complaint, new Date(now));
  if (!result.ok || result.value.complaint.visibility !== 'public') throw new Error('fixture');
  return result.value.complaint;
};

/** Files a fixture with a limit it can never hit. */
const insert = (repo: InMemoryComplaintRepository, complaint: PublicComplaint) =>
  repo.submitRateLimited(complaint, complaint.id, [{ max: 1000, windowSeconds: 1 }]);

describe('InMemoryComplaintRepository', () => {
  it('round-trips a complaint through its snapshot', async () => {
    const repo = new InMemoryComplaintRepository();
    const complaint = publicComplaint('c1', '2026-10-01T10:00:00.000Z');
    await insert(repo, complaint);
    await expect(repo.findById(complaint.id)).resolves.toEqual(complaint);
    await expect(repo.findById('missing' as ComplaintId)).resolves.toBeNull();
  });

  it('refuses a duplicate id', async () => {
    const repo = new InMemoryComplaintRepository();
    const complaint = publicComplaint('c1', '2026-10-01T10:00:00.000Z');
    await insert(repo, complaint);
    await expect(insert(repo, complaint)).rejects.toThrow();
  });

  it('applies a transition only against the state it was computed from', async () => {
    const repo = new InMemoryComplaintRepository();
    const pending = publicComplaint('c1', '2026-10-01T10:00:00.000Z');
    await insert(repo, pending);
    const approved = approve(pending, '2026-10-01T11:00:00.000Z');
    await expect(repo.saveTransition(pending, approved)).resolves.toBe(true);
    // A second moderator acting on the stale pending copy loses.
    await expect(repo.saveTransition(pending, approved)).resolves.toBe(false);
    expect((await repo.findById(pending.id))?.status).toBe('approved');
  });

  it('lists one status newest first with a stable cursor', async () => {
    const repo = new InMemoryComplaintRepository();
    const times = ['2026-10-01T10:00:00.000Z', '2026-10-01T11:00:00.000Z', '2026-10-01T11:00:00.000Z'];
    const ids = ['a', 'b', 'c'];
    for (const [i, id] of ids.entries()) {
      const pending = publicComplaint(id, times[i] ?? '');
      await insert(repo, pending);
      await repo.saveTransition(pending, approve(pending, '2026-10-01T12:00:00.000Z'));
    }
    await insert(repo, publicComplaint('p', '2026-10-01T13:00:00.000Z'));

    const first = await repo.listByStatus({ status: 'approved', limit: 2, after: null });
    expect(first.items.map((c) => c.id)).toEqual(['c', 'b']);
    expect(first.nextCursor).toEqual({ submittedAt: times[2], id: 'b' });

    const second = await repo.listByStatus({ status: 'approved', limit: 2, after: first.nextCursor });
    expect(second.items.map((c) => c.id)).toEqual(['a']);
    expect(second.nextCursor).toBeNull();

    const pending = await repo.listByStatus({ status: 'pending', limit: 10, after: null });
    expect(pending.items.map((c) => c.id)).toEqual(['p']);
  });
});
