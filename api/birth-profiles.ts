import { randomUUID } from 'node:crypto';
import { createProductionBirthProfileReadRuntimeV1 } from '../apps/api/src/production-birth-profile-read-runtime.js';

const ROUTE_PATH = '/api/birth-profiles' as const;
const ROUTE_PREFIX = '/api/birth-profiles/' as const;
const INTERNAL_ROUTE_PARAM = '__myeongha_birth_profile_id' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;
const ROUTE_SHAPE_DIAGNOSTIC_EVENT = 'myeongha.birth-profile-route-shape-v1' as const;

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

function locatorFromQueryRecord(
  query: VercelNodeRequestLike['query'],
): LocatorEvidence {
  if (query === undefined) return { state: 'absent' };

  const keys = Object.keys(query);
  if (keys.length === 0) return { state: 'absent' };
  if (keys.length !== 1 || keys[0] !== INTERNAL_ROUTE_PARAM) {
    return { state: 'invalid' };
  }

  const value = query[INTERNAL_ROUTE_PARAM];
  if (typeof value !== 'string') return { state: 'invalid' };

  const locator = validateLocator(value);
  return locator === null
    ? { state: 'invalid' }
    : { state: 'valid', value: locator };
}

function locatorFromRequestUrl(url: string | undefined): LocatorEvidence {
  if (url === undefined) return { state: 'absent' };

  let parsed: URL;
  try {
    parsed = new URL(url, 'https://myeongha.internal');
  } catch {
    return { state: 'invalid' };
  }

  const entries = [...parsed.searchParams.entries()];
  if (entries.length === 0) return { state: 'absent' };
  if (entries.length !== 1) return { state: 'invalid' };

  const entry = entries[0];
  if (entry === undefined) return { state: 'invalid' };
  const [key, value] = entry;
  if (key !== INTERNAL_ROUTE_PARAM) return { state: 'invalid' };

  const locator = validateLocator(value);
  return locator === null
    ? { state: 'invalid' }
    : { state: 'valid', value: locator };
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

function classifyQueryValue(value: QueryValue): 'string' | 'array' | 'undefined' {
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return 'string';
  return 'undefined';
}

function classifyPathname(pathname: string): string {
  if (pathname === ROUTE_PATH) return 'static-dispatcher';
  if (!pathname.startsWith(ROUTE_PREFIX)) return 'other';

  const segment = pathname.slice(ROUTE_PREFIX.length);
  return segment.length > 0 && !segment.includes('/')
    ? 'dynamic-single-segment'
    : 'dynamic-empty-or-multi-segment';
}

function logRejectedRouteShape(request: VercelNodeRequestLike): void {
  const queryKeys = Object.keys(request.query ?? {}).sort();
  const queryValueKinds = Object.fromEntries(
    queryKeys.map((key) => [key, classifyQueryValue(request.query?.[key])]),
  );

  let urlParseState: 'absent' | 'valid' | 'invalid' = 'absent';
  let pathnameShape: string | null = null;
  let urlSearchKeys: string[] = [];

  if (request.url !== undefined) {
    try {
      const parsed = new URL(request.url, 'https://myeongha.internal');
      urlParseState = 'valid';
      pathnameShape = classifyPathname(parsed.pathname);
      urlSearchKeys = [...new Set(parsed.searchParams.keys())].sort();
    } catch {
      urlParseState = 'invalid';
    }
  }

  console.info(ROUTE_SHAPE_DIAGNOSTIC_EVENT, {
    method: request.method ?? null,
    queryKeys,
    queryValueKinds,
    urlPresent: request.url !== undefined,
    urlParseState,
    pathnameShape,
    urlSearchKeys,
  });
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
    logRejectedRouteShape(request);
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
