import { randomUUID } from 'node:crypto';
import { createProductionBirthProfileReadRuntimeV1 } from '../apps/api/src/production-birth-profile-read-runtime.js';

const ROUTE_PATH = '/api/birth-profiles' as const;
const ROUTE_PREFIX = '/api/birth-profiles/' as const;
const INTERNAL_ROUTE_PARAM = '__myeongha_birth_profile_id' as const;
const VERCEL_DYNAMIC_ROUTE_PARAM = 'id' as const;
const VERCEL_SHARE_PARAM = '_vercel_share' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;
const ALLOWED_ROUTE_METADATA_KEYS = new Set([
  INTERNAL_ROUTE_PARAM,
  VERCEL_DYNAMIC_ROUTE_PARAM,
  VERCEL_SHARE_PARAM,
]);

type HeaderValue = string | string[] | undefined;
type QueryValue = string | string[] | undefined;

type LocatorEvidence =
  | { readonly state: 'absent' }
  | { readonly state: 'invalid' }
  | { readonly state: 'valid'; readonly value: string };

interface VercelNodeRequestLike {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, HeaderValue>>;
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly url?: string;
}

interface VercelNodeResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: Uint8Array): void;
}

let runtime:
  | ReturnType<typeof createProductionBirthProfileReadRuntimeV1>
  | undefined;

function getRuntime(): ReturnType<typeof createProductionBirthProfileReadRuntimeV1> {
  runtime ??= createProductionBirthProfileReadRuntimeV1({ env: process.env });
  return runtime;
}

function validateLocator(value: string): string | null {
  if (value.length === 0 || value.includes('/')) return null;
  return value;
}

function isSingleNonEmptyString(value: QueryValue): value is string {
  return typeof value === 'string' && value.length > 0;
}

function locatorFromQueryRecord(
  query: VercelNodeRequestLike['query'],
): LocatorEvidence {
  if (query === undefined) return { state: 'absent' };

  const keys = Object.keys(query);
  if (keys.length === 0) return { state: 'absent' };
  if (keys.some((key) => !ALLOWED_ROUTE_METADATA_KEYS.has(key))) {
    return { state: 'invalid' };
  }

  const internalValue = query[INTERNAL_ROUTE_PARAM];
  if (typeof internalValue !== 'string') return { state: 'invalid' };

  const locator = validateLocator(internalValue);
  if (locator === null) return { state: 'invalid' };

  const dynamicValue = query[VERCEL_DYNAMIC_ROUTE_PARAM];
  if (
    dynamicValue !== undefined &&
    (typeof dynamicValue !== 'string' || dynamicValue !== locator)
  ) {
    return { state: 'invalid' };
  }

  const shareValue = query[VERCEL_SHARE_PARAM];
  if (shareValue !== undefined && !isSingleNonEmptyString(shareValue)) {
    return { state: 'invalid' };
  }

  return { state: 'valid', value: locator };
}

function pathnameMatchesLocator(pathname: string, locator: string): boolean {
  if (pathname === ROUTE_PATH) return true;
  if (!pathname.startsWith(ROUTE_PREFIX)) return false;

  const rawSegment = pathname.slice(ROUTE_PREFIX.length);
  if (rawSegment.length === 0 || rawSegment.includes('/')) return false;

  try {
    return decodeURIComponent(rawSegment) === locator;
  } catch {
    return false;
  }
}

function getSingleUrlParam(
  searchParams: URLSearchParams,
  key: string,
): string | null | undefined {
  const values = searchParams.getAll(key);
  if (values.length === 0) return undefined;
  if (values.length !== 1) return null;
  const value = values[0];
  return value === undefined || value.length === 0 ? null : value;
}

function locatorFromRequestUrl(url: string | undefined): LocatorEvidence {
  if (url === undefined) return { state: 'absent' };

  let parsed: URL;
  try {
    parsed = new URL(url, 'https://myeongha.internal');
  } catch {
    return { state: 'invalid' };
  }

  if (parsed.hash !== '') return { state: 'invalid' };

  const keys = [...new Set(parsed.searchParams.keys())];
  if (keys.length === 0) return { state: 'absent' };
  if (keys.some((key) => !ALLOWED_ROUTE_METADATA_KEYS.has(key))) {
    return { state: 'invalid' };
  }

  const internalValue = getSingleUrlParam(parsed.searchParams, INTERNAL_ROUTE_PARAM);
  if (typeof internalValue !== 'string') return { state: 'invalid' };

  const locator = validateLocator(internalValue);
  if (locator === null) return { state: 'invalid' };
  if (!pathnameMatchesLocator(parsed.pathname, locator)) {
    return { state: 'invalid' };
  }

  const dynamicValue = getSingleUrlParam(
    parsed.searchParams,
    VERCEL_DYNAMIC_ROUTE_PARAM,
  );
  if (
    dynamicValue === null ||
    (dynamicValue !== undefined && dynamicValue !== locator)
  ) {
    return { state: 'invalid' };
  }

  const shareValue = getSingleUrlParam(parsed.searchParams, VERCEL_SHARE_PARAM);
  if (shareValue === null) return { state: 'invalid' };

  return { state: 'valid', value: locator };
}

function resolveInjectedBirthProfileId(
  request: VercelNodeRequestLike,
): string | null {
  const queryEvidence = locatorFromQueryRecord(request.query);
  const urlEvidence = locatorFromRequestUrl(request.url);

  if (queryEvidence.state === 'invalid' || urlEvidence.state === 'invalid') {
    return null;
  }

  if (queryEvidence.state === 'valid' && urlEvidence.state === 'valid') {
    return queryEvidence.value === urlEvidence.value
      ? queryEvidence.value
      : null;
  }

  if (queryEvidence.state === 'valid') return queryEvidence.value;
  if (urlEvidence.state === 'valid') return urlEvidence.value;
  return null;
}

function toWebHeaders(
  source: VercelNodeRequestLike['headers'],
): Headers {
  const headers = new Headers();
  if (source === undefined) return headers;

  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
      continue;
    }
    headers.set(name, value);
  }

  return headers;
}

function toCanonicalRequest(
  request: VercelNodeRequestLike,
  birthProfileId: string,
): Request {
  return new Request(
    `https://myeongha.internal${ROUTE_PREFIX}${encodeURIComponent(birthProfileId)}`,
    {
      method: request.method ?? 'GET',
      headers: toWebHeaders(request.headers),
    },
  );
}

async function writeWebResponse(
  source: Response,
  target: VercelNodeResponseLike,
): Promise<void> {
  target.statusCode = source.status;
  for (const [name, value] of source.headers.entries()) {
    target.setHeader(name, value);
  }

  const body = new Uint8Array(await source.arrayBuffer());
  target.end(body.length === 0 ? undefined : body);
}

async function writeRouteNotFound(
  response: VercelNodeResponseLike,
): Promise<void> {
  await writeWebResponse(
    new Response(null, {
      status: 404,
      headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
    }),
    response,
  );
}

export default async function handler(
  request: VercelNodeRequestLike,
  response: VercelNodeResponseLike,
): Promise<void> {
  const birthProfileId = resolveInjectedBirthProfileId(request);
  if (birthProfileId === null) {
    await writeRouteNotFound(response);
    return;
  }

  const runtimeResponse = await getRuntime().handleRequest({
    request: toCanonicalRequest(request, birthProfileId),
    requestId: randomUUID(),
    serverTime: new Date().toISOString(),
  });

  await writeWebResponse(runtimeResponse, response);
}
