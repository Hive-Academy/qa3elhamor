import { describe, expect, it, vi } from 'vitest';
import {
  singleFlight,
  type ComplaintDelivery,
  type ComplaintDraft,
} from './complaint-submitter';

const draft: ComplaintDraft = {
  subject: 'The pineapple leaks',
  body: 'Please send a developer.',
  senderName: 'Sardine Sam',
  senderSpecies: null,
  replyEmail: null,
};

function deferred() {
  let resolve: (value: ComplaintDelivery) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<ComplaintDelivery>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('singleFlight', () => {
  it('sends once however often it is asked while a submission travels', async () => {
    const travel = deferred();
    const submit = vi.fn(() => travel.promise);
    const watcher = {
      onSending: vi.fn(),
      onDelivered: vi.fn(),
      onFailed: vi.fn(),
    };
    const shared = singleFlight({ submit }, watcher);
    const first = shared.submit(draft);
    const second = shared.submit(draft);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(watcher.onSending).toHaveBeenCalledTimes(1);
    travel.resolve({ status: 'delivered' });
    await expect(first).resolves.toEqual({ status: 'delivered' });
    await expect(second).resolves.toEqual({ status: 'delivered' });
    expect(watcher.onDelivered).toHaveBeenCalledWith({ status: 'delivered' });
    // Settled: the next complaint is a new submission.
    submit.mockResolvedValueOnce({ status: 'delivered' });
    await shared.submit(draft);
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('tells its watcher of a failure, and still rejects for the form', async () => {
    const watcher = { onFailed: vi.fn() };
    const error = new Error('Network error.');
    const shared = singleFlight(
      { submit: () => Promise.reject(error) },
      watcher,
    );
    await expect(shared.submit(draft)).rejects.toBe(error);
    expect(watcher.onFailed).toHaveBeenCalledWith(error);
  });
});
