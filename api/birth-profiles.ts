import { randomUUID } from 'node:crypto';
import { createProductionBirthProfileReadRuntimeV1 } from '../apps/api/src/production-birth-profile-read-runtime.js';

const ROUTE_PREFIX = '/api/birth-profiles/' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

type HeaderValue = string | string[] | undefined;
type QueryValue = string | string[] | undefined;

interface VercelNodeRequestLike {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, HeaderValue>>;
  readonly query?: Readonly<Record<string, QueryValue>>;
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

function resolveInjectedBirthProfileId(
  query: VercelNodeRequestLike['query'],
): string | null {
  if (query === undefined) return null;

  const keys = Object.keys(query);
  if (keys.length !== 1 || keys[0] !== 'id') return null;

  const value = query.id;
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.includes('/')) return null;
  return value;
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
  const birthProfileId = resolveInjectedBirthProfileId(request.query);
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
