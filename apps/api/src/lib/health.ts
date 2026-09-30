import type { HealthResponse } from '@qa3elhamor/shared-api-interfaces';

/**
 * Handlers are written against the Fetch API (`Request` -> `Response`) rather than any
 * vendor's signature. Vercel Functions, Netlify Functions, Cloudflare Workers, and Deno all
 * accept this shape, so the deployment target stays an open decision until the
 * `deploy-static` roadmap item rather than being baked in here.
 */
export const health = (): Response => {
  const body: HealthResponse = {
    status: 'ok',
    checkedAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
