import { describe, expect, it } from 'vitest';
import { health } from './health.js';

describe('health handler', () => {
  it('returns ok with a JSON content type', async () => {
    const response = health();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    await expect(response.json()).resolves.toMatchObject({ status: 'ok' });
  });

  it('stamps a parseable timestamp', async () => {
    const body = (await health().json()) as { checkedAt: string };
    expect(Number.isNaN(Date.parse(body.checkedAt))).toBe(false);
  });
});
