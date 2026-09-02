import { randomUUID } from 'node:crypto';
import { createProductionBirthProfileReadRuntimeV1 } from '../apps/api/src/production-birth-profile-read-runtime.js';

const ROUTE_PATH = '/api/birth-profiles' as const;
const ROUTE_PREFIX = `${ROUTE_PATH}/` as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

type HeaderValue = string | string[] | undefined;
type QueryValue = string | string[] | undefined;

type IdEvidence =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'value'; readonly value: string };

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

function isValidRouteId(value: string): boolean {
  return value.length > 0 && !value.includes('/');
}

function resolveQueryId(
  query: VercelNodeRequestLike['query'],
): IdEvidence {
  if (query === undefined) return { kind: 'absent' };

  const keys = Object.keys(query);
  if (keys.length === 0) return { kind: 'absent' };
  if (keys.length !== 1 || keys[0] !== 'id') return { kind: 'invalid' };

  const value = query.id;
  if (typeof value !== 'string' || !isValidRouteId(value)) {
    return { kind: 'invalid' };
  }

  return { kind: 'value', value };
}

function resolveUrlId(rawUrl: string | undefined): IdEvidence {
  if (rawUrl === undefined) return { kind: 'absent' };

  let url: URL;
  try {
    url = new URL(rawUrl, 'https://myeongha.internal');
  } catch {
    return { kind: 'invalid' };
  }

  if (url.hash !== '') return { kind: 'invalid' };

  const queryEntries = [...url.searchParams.entries()];
  if (url.pathname === ROUTE_PATH) {
    if (queryEntries.length === 0) return { kind: 'absent' };
    if (queryEntries.length !== 1) return { kind: 'invalid' };

    const [key, value] = queryEntries[0] ?? [];
    if (key !== 'id' || value === undefined || !isValidRouteId(value)) {
      return { kind: 'invalid' };
    }

    return { kind: 'value', value };
  }

  if (!url.pathname.startsWith(ROUTE_PREFIX) || queryEntries.length !== 0) {
    return { kind: 'invalid' };
  }

  const rawSegment = url.pathname.slice(ROUTE_PREFIX.length);
  if (rawSegment.length === 0 || rawSegment.includes('/')) {
    return { kind: 'invalid' };
  }

  let decodedSegment: string;
  try {
    decodedSegment = decodeURIComponent(rawSegment);
  } catch {
    return { kind: 'invalid' };
  }

  if (!isValidRouteId(decodedSegment)) return { kind: 'invalid' };
  return { kind: 'value', value: decodedSegment };
}

function resolveBirthProfileId(request: VercelNodeRequestLike): string | null {
  const queryEvidence = resolveQueryId(request.query);
  const urlEvidence = resolveUrlId(request.url);

  if (queryEvidence.kind === 'invalid' || urlEvidence.kind === 'invalid') {
    return null;
  }

  if (
    queryEvidence.kind === 'value' &&
    urlEvidence.kind === 'value' &&
    queryEvidence.value !== urlEvidence.value
  ) {
    return null;
  }

  if (urlEvidence.kind === 'value') return urlEvidence.value;
  if (queryEvidence.kind === 'value') return queryEvidence.value;
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
  const birthProfileId = resolveBirthProfileId(request);
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
