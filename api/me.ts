import { randomUUID } from 'node:crypto';
import { createProductionCurrentSubjectProfileRuntimeV1 } from '../apps/api/src/production-current-subject-profile-runtime.js';
import {
  createProductionLifeRecordReadRuntimeV1,
  createProductionMemoryItemsReadRuntimeV1,
} from '../apps/api/src/production-records-read-runtime.js';

const PROFILE_ROUTE = '/api/me' as const;
const LIFE_RECORD_ROUTE = '/api/life-record' as const;
const MEMORIES_ROUTE = '/api/memories' as const;
const RECORDS_ROUTE_PARAM = '__myeongha_records_read' as const;
const VERCEL_SHARE_PARAM = '_vercel_share' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

let profileRuntime:
  | ReturnType<typeof createProductionCurrentSubjectProfileRuntimeV1>
  | undefined;
let lifeRecordRuntime:
  | ReturnType<typeof createProductionLifeRecordReadRuntimeV1>
  | undefined;
let memoriesRuntime:
  | ReturnType<typeof createProductionMemoryItemsReadRuntimeV1>
  | undefined;

function getProfileRuntime(): ReturnType<typeof createProductionCurrentSubjectProfileRuntimeV1> {
  profileRuntime ??= createProductionCurrentSubjectProfileRuntimeV1({
    env: process.env,
  });
  return profileRuntime;
}

function getLifeRecordRuntime(): ReturnType<typeof createProductionLifeRecordReadRuntimeV1> {
  lifeRecordRuntime ??= createProductionLifeRecordReadRuntimeV1({
    env: process.env,
  });
  return lifeRecordRuntime;
}

function getMemoriesRuntime(): ReturnType<typeof createProductionMemoryItemsReadRuntimeV1> {
  memoriesRuntime ??= createProductionMemoryItemsReadRuntimeV1({
    env: process.env,
  });
  return memoriesRuntime;
}

type DispatchTarget =
  | { readonly route: typeof PROFILE_ROUTE; readonly runtime: ReturnType<typeof getProfileRuntime> }
  | { readonly route: typeof LIFE_RECORD_ROUTE; readonly runtime: ReturnType<typeof getLifeRecordRuntime> }
  | { readonly route: typeof MEMORIES_ROUTE; readonly runtime: ReturnType<typeof getMemoriesRuntime> };

function getSingleNonEmptyParam(
  searchParams: URLSearchParams,
  key: string,
): string | null | undefined {
  const values = searchParams.getAll(key);
  if (values.length === 0) return undefined;
  if (values.length !== 1 || values[0] === undefined || values[0].length === 0) return null;
  return values[0];
}

function resolveDispatchTarget(request: Request): DispatchTarget | null {
  const url = new URL(request.url);
  if (url.hash !== '') return null;

  const keys = [...new Set(url.searchParams.keys())];
  if (keys.some((key) => key !== RECORDS_ROUTE_PARAM && key !== VERCEL_SHARE_PARAM)) {
    return null;
  }

  const shareValue = getSingleNonEmptyParam(url.searchParams, VERCEL_SHARE_PARAM);
  if (shareValue === null) return null;

  const recordsRoute = getSingleNonEmptyParam(url.searchParams, RECORDS_ROUTE_PARAM);
  if (recordsRoute === null) return null;

  if (recordsRoute === undefined) {
    return url.pathname === PROFILE_ROUTE
      ? { route: PROFILE_ROUTE, runtime: getProfileRuntime() }
      : null;
  }

  if (
    recordsRoute === 'life-record' &&
    (url.pathname === PROFILE_ROUTE || url.pathname === LIFE_RECORD_ROUTE)
  ) {
    return { route: LIFE_RECORD_ROUTE, runtime: getLifeRecordRuntime() };
  }

  if (
    recordsRoute === 'memories' &&
    (url.pathname === PROFILE_ROUTE || url.pathname === MEMORIES_ROUTE)
  ) {
    return { route: MEMORIES_ROUTE, runtime: getMemoriesRuntime() };
  }

  return null;
}

function toCanonicalRequest(request: Request, route: DispatchTarget['route']): Request {
  return new Request(`https://myeongha.internal${route}`, {
    method: request.method,
    headers: request.headers,
  });
}

function routeNotFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const target = resolveDispatchTarget(request);
    if (target === null) return routeNotFound();

    return target.runtime.handleRequest({
      request: toCanonicalRequest(request, target.route),
      requestId: randomUUID(),
      serverTime: new Date().toISOString(),
    });
  },
};
