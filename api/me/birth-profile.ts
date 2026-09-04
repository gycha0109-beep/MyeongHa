import { randomUUID } from 'node:crypto';
import { createProductionCurrentSubjectBirthProfileRuntimeV1 } from '../../apps/api/src/production-current-subject-birth-profile-runtime.js';

const ROUTE_PATH = '/api/me/birth-profile' as const;
const CANONICAL_ROUTE_URL = `https://myeongha.internal${ROUTE_PATH}` as const;
const VERCEL_SHARE_PARAM = '_vercel_share' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

type BirthProfileRouteRuntimeV1 = Readonly<{
  handleRequest(input: {
    readonly request: Request;
    readonly requestId: string;
    readonly serverTime: string;
  }): Promise<Response>;
}>;

export interface CreateCurrentSubjectBirthProfileVercelHandlerInputV1 {
  readonly getRuntime: () => BirthProfileRouteRuntimeV1;
  readonly requestIdFactory?: () => string;
  readonly serverTimeFactory?: () => string;
}

let runtime: ReturnType<typeof createProductionCurrentSubjectBirthProfileRuntimeV1> | undefined;

function getRuntime(): ReturnType<typeof createProductionCurrentSubjectBirthProfileRuntimeV1> {
  runtime ??= createProductionCurrentSubjectBirthProfileRuntimeV1({ env: process.env });
  return runtime;
}

function withNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', NO_STORE_CACHE_CONTROL);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function routeNotFoundNoStore(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
  });
}

function internalServerErrorNoStore(): Response {
  return new Response('Internal Server Error', {
    status: 500,
    headers: {
      'Cache-Control': NO_STORE_CACHE_CONTROL,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

function toCanonicalRuntimeRequest(request: Request): Request | null {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }

  if (url.pathname !== ROUTE_PATH || url.hash !== '') return null;

  const keys = [...new Set(url.searchParams.keys())];
  if (keys.some((key) => key !== VERCEL_SHARE_PARAM)) return null;

  const shareValues = url.searchParams.getAll(VERCEL_SHARE_PARAM);
  if (
    shareValues.length > 1 ||
    (shareValues.length === 1 && (shareValues[0] ?? '').length === 0)
  ) {
    return null;
  }

  return new Request(CANONICAL_ROUTE_URL, {
    method: request.method,
    headers: request.headers,
  });
}

export function createCurrentSubjectBirthProfileVercelHandlerV1(
  input: CreateCurrentSubjectBirthProfileVercelHandlerInputV1,
): Readonly<{ fetch(request: Request): Promise<Response> }> {
  const requestIdFactory = input.requestIdFactory ?? randomUUID;
  const serverTimeFactory = input.serverTimeFactory ?? (() => new Date().toISOString());

  return Object.freeze({
    async fetch(request: Request): Promise<Response> {
      const canonicalRequest = toCanonicalRuntimeRequest(request);
      if (canonicalRequest === null) return routeNotFoundNoStore();

      try {
        const response = await input.getRuntime().handleRequest({
          request: canonicalRequest,
          requestId: requestIdFactory(),
          serverTime: serverTimeFactory(),
        });
        return withNoStore(response);
      } catch {
        console.error('MyeongHa current Birth Profile route failed.');
        return internalServerErrorNoStore();
      }
    },
  });
}

export const CURRENT_SUBJECT_BIRTH_PROFILE_VERCEL_BINDINGS_V1 = Object.freeze({
  route: ROUTE_PATH,
  allowedPlatformQueryParam: VERCEL_SHARE_PARAM,
} as const);

export default createCurrentSubjectBirthProfileVercelHandlerV1({ getRuntime });
