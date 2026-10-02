import {
  API_SECURITY_HEADERS,
  errorResponse,
  handleListModeration,
  handleListWall,
  handleModerateComplaint,
  handleSubmitComplaint,
  type ComplaintsApiDeps,
} from '@qa3elhamor/complaints-feature-api';
import type { ApiConfig } from './api-config.js';
import { health } from './health.js';

type Params = Readonly<Record<string, string>>;
type RouteHandler = (request: Request, params: Params) => Response | Promise<Response>;

interface Route {
  readonly pattern: RegExp;
  /** Names for the pattern's capture groups, in order. */
  readonly params?: readonly string[];
  readonly methods: Readonly<Partial<Record<string, RouteHandler>>>;
}

/** Fetch-native entry point: what the Netlify adapter and the dev server both call. */
export type ApiHandler = (request: Request) => Promise<Response>;

const SEGMENT = '([^/]+)';

const buildRoutes = (deps: ComplaintsApiDeps): readonly Route[] => [
  { pattern: /^\/health$/, methods: { GET: () => health() } },
  {
    pattern: /^\/complaints$/,
    methods: {
      GET: (request) => handleListWall(request, deps),
      POST: (request) => handleSubmitComplaint(request, deps),
    },
  },
  {
    pattern: /^\/moderation\/complaints$/,
    methods: { GET: (request) => handleListModeration(request, deps) },
  },
  {
    pattern: new RegExp(`^/moderation/complaints/${SEGMENT}/${SEGMENT}$`),
    params: ['id', 'action'],
    methods: {
      POST: (request, params) =>
        handleModerateComplaint(request, deps, {
          id: params['id'] ?? '',
          action: params['action'] ?? '',
        }),
    },
  },
];

const matchParams = (route: Route, match: RegExpExecArray): Params => {
  const params: Record<string, string> = {};
  (route.params ?? []).forEach((name, index) => {
    const raw = match[index + 1] ?? '';
    try {
      params[name] = decodeURIComponent(raw);
    } catch {
      // Malformed percent-encoding: keep it raw; the handler's id validation refuses it.
      params[name] = raw;
    }
  });
  return params;
};

const CORS_METHODS = 'GET, POST, OPTIONS';
const CORS_HEADERS = 'authorization, content-type';

/**
 * Same-origin by default. A cross-origin caller is served CORS headers only when its origin
 * is on `CORS_ALLOWED_ORIGINS`; a cross-origin state-changing request from anywhere else is
 * refused outright (403) rather than executed with the response merely hidden.
 */
const corsFor = (
  request: Request,
  config: ApiConfig
): { readonly allowed: boolean; readonly headers: Readonly<Record<string, string>> } => {
  const origin = request.headers.get('origin');
  const vary: Record<string, string> = config.corsAllowedOrigins.size > 0 ? { vary: 'Origin' } : {};
  if (origin === null || origin === new URL(request.url).origin) {
    return { allowed: true, headers: vary };
  }
  if (!config.corsAllowedOrigins.has(origin)) return { allowed: false, headers: vary };
  return { allowed: true, headers: { ...vary, 'access-control-allow-origin': origin } };
};

const withHeaders = (response: Response, headers: Readonly<Record<string, string>>): Response => {
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
};

export const createRouter = (deps: ComplaintsApiDeps, config: ApiConfig): ApiHandler => {
  const routes = buildRoutes(deps);

  const dispatch = async (request: Request, path: string): Promise<Response> => {
    for (const route of routes) {
      const match = route.pattern.exec(path);
      if (match === null) continue;
      const handler = route.methods[request.method];
      if (handler === undefined) {
        return errorResponse(405, 'method-not-allowed', {
          headers: { allow: Object.keys(route.methods).join(', ') },
        });
      }
      return handler(request, matchParams(route, match));
    }
    return errorResponse(404, 'not-found');
  };

  const respond = async (request: Request, cors: ReturnType<typeof corsFor>): Promise<Response> => {
    const pathname = new URL(request.url).pathname;
    if (config.basePath !== '' && !pathname.startsWith(`${config.basePath}/`)) {
      return errorResponse(404, 'not-found');
    }
    const path = pathname.slice(config.basePath.length);
    if (request.method === 'OPTIONS') {
      if (!cors.allowed) return errorResponse(403, 'forbidden-origin');
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-methods': CORS_METHODS,
          'access-control-allow-headers': CORS_HEADERS,
          'access-control-max-age': '600',
        },
      });
    }
    if (!cors.allowed && request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse(403, 'forbidden-origin');
    }
    try {
      return await dispatch(request, path);
    } catch (error) {
      deps.reportError(error);
      return errorResponse(500, 'internal-error');
    }
  };

  // Every response leaves through here, so the security headers cover the ones handlers do
  // not build (health, 204 preflights) as well as theirs.
  return async (request) => {
    const cors = corsFor(request, config);
    const response = await respond(request, cors);
    return withHeaders(withHeaders(response, API_SECURITY_HEADERS), cors.headers);
  };
};
