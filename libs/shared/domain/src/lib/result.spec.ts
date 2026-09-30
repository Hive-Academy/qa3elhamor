import { describe, expect, it } from 'vitest';
import { err, isErr, isOk, mapResult, ok, unwrapOr } from './result.js';

describe('Result', () => {
  it('narrows a success', () => {
    const result = ok(3);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(3);
  });

  it('narrows a failure', () => {
    const result = err('nope');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe('nope');
  });

  it('maps only the success branch', () => {
    expect(mapResult(ok(2), (n) => n * 2)).toEqual(ok(4));
    expect(mapResult(err<string>('boom'), (n: number) => n * 2)).toEqual(
      err('boom')
    );
  });

  it('falls back on failure', () => {
    expect(unwrapOr(ok(1), 9)).toBe(1);
    expect(unwrapOr(err<string>('boom'), 9)).toBe(9);
  });
});
