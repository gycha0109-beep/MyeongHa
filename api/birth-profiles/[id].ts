import { randomUUID } from 'node:crypto';
import { createProductionBirthProfileReadRuntimeV1 } from '../../apps/api/src/production-birth-profile-read-runtime.js';

let runtime:
  | ReturnType<typeof createProductionBirthProfileReadRuntimeV1>
  | undefined;

const ROUTE_PREFIX = '/api/birth-profiles/' as const;
const VERCEL_DYNAMIC_SEGMENT = '[id]' as const;

function getRuntime(): ReturnType<typeof createProductionBirthProfileReadRuntimeV1> {
  runtime ??= createProductionBirthProfileReadRuntimeV1({ env: process.env });
  return runtime;
}

/**
 * Vercel exposes a file-system dynamic route parameter as an `id` query entry on the
 * Web Standard Request delivered to the function. The public API contract itself does
 * not accept query parameters, so consume only the platform-generated shape when the
 * value is identical to the path resource id (or the internal `[id]` route segment).
 * Any additional, missing, or mismatched query input is left untouched and is rejected
 * by the source-safe HTTP boundary.
 */
function normalizeVercelDynamicRouteRequest(request: Request): Request {
  const url = new URL(request.url);
  const entries = [...url.searchParams.entries()];

  if (entries.length === 0) return request;
  if (entries.length !== 1) return request;

  const entry = entries[0];
  if (entry === undefined) return request;
  const [key, injectedId] = entry;
  if (key !== 'id') return request;
  if (injectedId.length === 0 || injectedId.includes('/')) return request;
  if (!url.pathname.startsWith(ROUTE_PREFIX)) return request;

  const rawSegment = url.pathname.slice(ROUTE_PREFIX.length);
  if (rawSegment.length === 0 || rawSegment.includes('/')) return request;

  let decodedSegment: string;
  try {
    decodedSegment = decodeURIComponent(rawSegment);
  } catch {
    return request;
  }

  if (decodedSegment !== injectedId && decodedSegment !== VERCEL_DYNAMIC_SEGMENT) {
    return request;
  }

  const normalizedUrl = new URL(url);
  normalizedUrl.pathname = `${ROUTE_PREFIX}${encodeURIComponent(injectedId)}`;
  normalizedUrl.search = '';

  return new Request(normalizedUrl, {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    return getRuntime().handleRequest({
      request: normalizeVercelDynamicRouteRequest(request),
      requestId: randomUUID(),
      serverTime: new Date().toISOString(),
    });
  },
};
