import { randomUUID } from 'node:crypto';
import { createProductionBirthProfileReadRuntimeV1 } from '../apps/api/src/production-birth-profile-read-runtime.js';

const INTERNAL_BIRTH_PROFILE_ID_PARAM = '__myeongha_birth_profile_id' as const;
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

function toCanonicalBirthProfileRequest(request: Request): Request | null {
  const incomingUrl = new URL(request.url);
  const ids = incomingUrl.searchParams.getAll(INTERNAL_BIRTH_PROFILE_ID_PARAM);
  const birthProfileId = ids[0];
  if (ids.length !== 1 || birthProfileId === undefined || birthProfileId.length === 0) {
    return null;
  }

  for (const key of incomingUrl.searchParams.keys()) {
    if (key !== INTERNAL_BIRTH_PROFILE_ID_PARAM) return null;
  }

  const canonicalUrl = new URL(
    `/api/birth-profiles/${encodeURIComponent(birthProfileId)}`,
    incomingUrl.origin,
  );

  return new Request(canonicalUrl, {
    method: request.method,
    headers: request.headers,
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const canonicalRequest = toCanonicalBirthProfileRequest(request);
    if (canonicalRequest === null) return routeNotFound();

    return getRuntime().handleRequest({
      request: canonicalRequest,
      requestId: randomUUID(),
      serverTime: new Date().toISOString(),
    });
  },
};
