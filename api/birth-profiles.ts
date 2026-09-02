import { randomUUID } from 'node:crypto';
import { createProductionBirthProfileReadRuntimeV1 } from '../apps/api/src/production-birth-profile-read-runtime.js';

const ROUTE_ROOT = '/api/birth-profiles' as const;
const ROUTE_PREFIX = `${ROUTE_ROOT}/` as const;
const VERCEL_DYNAMIC_ID_PARAM = 'id' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

let runtime:
  | ReturnType<typeof createProductionBirthProfileReadRuntimeV1>
  | undefined;

function getRuntime(): ReturnType<typeof createProductionBirthProfileReadRuntimeV1> {
  runtime ??= createProductionBirthProfileReadRuntimeV1({ env: process.env });
  return runtime;
}

function routeNotFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
  });
}

function normalizeStaticDispatchRequest(request: Request): Request | null {
  const incomingUrl = new URL(request.url);
  const entries = [...incomingUrl.searchParams.entries()];
  if (entries.length !== 1) return null;

  const entry = entries[0];
  if (entry === undefined) return null;
  const [key, injectedId] = entry;
  if (key !== VERCEL_DYNAMIC_ID_PARAM) return null;
  if (injectedId.length === 0 || injectedId.includes('/')) return null;

  if (incomingUrl.pathname !== ROUTE_ROOT) {
    if (!incomingUrl.pathname.startsWith(ROUTE_PREFIX)) return null;

    const rawSegment = incomingUrl.pathname.slice(ROUTE_PREFIX.length);
    if (rawSegment.length === 0 || rawSegment.includes('/')) return null;

    let decodedSegment: string;
    try {
      decodedSegment = decodeURIComponent(rawSegment);
    } catch {
      return null;
    }

    if (decodedSegment !== injectedId) return null;
  }

  const canonicalUrl = new URL(
    `${ROUTE_PREFIX}${encodeURIComponent(injectedId)}`,
    incomingUrl.origin,
  );

  return new Request(canonicalUrl, {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const canonicalRequest = normalizeStaticDispatchRequest(request);
    if (canonicalRequest === null) return routeNotFound();

    return getRuntime().handleRequest({
      request: canonicalRequest,
      requestId: randomUUID(),
      serverTime: new Date().toISOString(),
    });
  },
};
