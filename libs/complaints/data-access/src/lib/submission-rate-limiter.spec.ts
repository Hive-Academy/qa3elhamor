import {
  submitComplaint,
  type ComplaintId,
  type PublicComplaint,
} from '@qa3elhamor/complaints-domain';
import { describe, expect, it } from 'vitest';
import { InMemoryComplaintRepository } from './in-memory.js';
import { evaluateRateLimit, longestWindowMs } from './submission-rate-limiter.js';

const T0 = Date.parse('2026-10-01T12:00:00.000Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000);
const RULES = [
  { max: 3, windowSeconds: 600 },
  { max: 20, windowSeconds: 86_400 },
];

describe('evaluateRateLimit', () => {
  it('allows while every rule has room', () => {
    expect(evaluateRateLimit([at(0), at(10)], at(20), RULES)).toEqual({ allowed: true });
  });

  it('refuses at the limit and reports when the oldest blocking entry expires', () => {
    const decision = evaluateRateLimit([at(0), at(100), at(200)], at(300), RULES);
    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 300 });
  });

  it('ignores history outside the window', () => {
    expect(evaluateRateLimit([at(0), at(1), at(2)], at(602), RULES)).toEqual({ allowed: true });
  });

  it('takes the longest wait across violated rules', () => {
    const day = Array.from({ length: 20 }, (_, i) => at(i * 1000));
    const decision = evaluateRateLimit(day, at(20_000), RULES);
    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 86_400 - 20_000 });
  });

  it('never reports less than one second', () => {
    const decision = evaluateRateLimit([at(0), at(0), at(0)], at(599.9), RULES);
    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('computes the longest window', () => {
    expect(longestWindowMs(RULES)).toBe(86_400_000);
  });
});

const complaintAt = (id: string, time: Date): PublicComplaint => {
  const result = submitComplaint(
    { id, visibility: 'public', subject: 'Noise', body: 'Clarinet.', senderName: 'Patrick' },
    time
  );
  if (!result.ok || result.value.complaint.visibility !== 'public') throw new Error('fixture');
  return result.value.complaint;
};

describe('InMemoryComplaintRepository.submitRateLimited', () => {
  it('records only accepted submissions and isolates clients', async () => {
    const repo = new InMemoryComplaintRepository();
    const submit = (id: string, key: string, t: number) =>
      repo.submitRateLimited(complaintAt(id, at(t)), key, RULES);
    for (let i = 0; i < 3; i++) {
      await expect(submit(`a${i}`, 'a', i)).resolves.toEqual({ allowed: true });
    }
    await expect(submit('a3', 'a', 5)).resolves.toMatchObject({ allowed: false });
    await expect(repo.findById('a3' as ComplaintId)).resolves.toBeNull();
    await expect(submit('b0', 'b', 5)).resolves.toEqual({ allowed: true });
    // The refused attempt at t=5 was not recorded, so the window reopens at t=600.
    await expect(submit('a4', 'a', 600)).resolves.toEqual({ allowed: true });
  });

  it('does not spend quota when the insert fails', async () => {
    const repo = new InMemoryComplaintRepository();
    await repo.submitRateLimited(complaintAt('dup', at(0)), 'k', RULES);
    for (let i = 1; i <= 3; i++) {
      await expect(repo.submitRateLimited(complaintAt('dup', at(i)), 'k', RULES)).rejects.toThrow();
    }
    await expect(repo.submitRateLimited(complaintAt('x1', at(5)), 'k', RULES)).resolves.toEqual({ allowed: true });
    await expect(repo.submitRateLimited(complaintAt('x2', at(6)), 'k', RULES)).resolves.toEqual({ allowed: true });
    await expect(repo.submitRateLimited(complaintAt('x3', at(7)), 'k', RULES)).resolves.toMatchObject({ allowed: false });
  });
});
