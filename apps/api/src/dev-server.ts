/**
 * Local dev server: a thin `node:http` -> Fetch adapter over the same handler Netlify runs.
 *
 *   npm run api:dev            (or: npx nx run api:serve)
 *
 * Reads the root `.env` (see `.env.example`); listens on `API_PORT` (default 8787). Not
 * shipped: production goes through the Netlify adapter.
 */
import { createServer, type IncomingMessage } from 'node:http';
import { createApi } from './lib/create-api.js';

const MAX_DEV_BODY_BYTES = 1024 * 1024;
const port = Number(process.env['API_PORT'] ?? '8787');
const api = createApi(process.env);

const readBody = async (req: IncomingMessage): Promise<Uint8Array | undefined> => {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.byteLength;
    // The handler enforces the real cap; this only stops the dev process buffering forever.
    if (size > MAX_DEV_BODY_BYTES) break;
    chunks.push(buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
};

const toRequest = async (req: IncomingMessage): Promise<Request> => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  // Play the platform edge: the client IP comes from the socket, never from the client, and
  // the edge proof (when EDGE_AUTH_SECRET is set) is added here, never accepted from outside.
  headers.set(api.config.clientIpHeader, req.socket.remoteAddress ?? '');
  if (api.config.edgeAuth !== null) {
    headers.set(api.config.edgeAuth.header, api.config.edgeAuth.secret);
  }
  const body = await readBody(req);
  return new Request(`http://${req.headers.host ?? `localhost:${port}`}${req.url ?? '/'}`, {
    method: req.method ?? 'GET',
    headers,
    ...(body === undefined ? {} : { body }),
  });
};

const server = createServer((req, res) => {
  toRequest(req)
    .then((request) => api.handle(request))
    .then(async (response) => {
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    })
    .catch((error: unknown) => {
      console.error('[api:dev] adapter failure', error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
});

server.listen(port, () => {
  const wall = api.config.databaseUrl === null ? 'no DATABASE_URL: wall answers 503' : 'database configured';
  console.log(`[api:dev] http://localhost:${port}${api.config.basePath} (${wall})`);
});

const shutdown = () => {
  server.close();
  void api.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
