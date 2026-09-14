import type { CommercePaymentVerificationAdapterV1 } from './commerce-payment-verification-execution.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1,
  PortOneV2WebhookPaymentCompletionErrorV1,
  executePortOneV2WebhookPaymentCompletionV1,
  type PortOneV2WebhookPaymentCompletionConfigV1,
} from './portone-v2-webhook-payment-completion.js';

const POST_METHOD = 'POST' as const;
const ROUTE = '/api/commerce/webhooks/portone-v2' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;
const CANONICAL_CONTENT_LENGTH = /^(?:0|[1-9][0-9]*)$/u;

export const PORTONE_V2_WEBHOOK_HTTP_BINDINGS_V1 = Object.freeze({
  method: POST_METHOD,
  route: ROUTE,
  apiContractVersion: API_CONTRACT_VERSION,
  maxBodyBytes: PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1,
} as const);

export interface HandlePortOneV2WebhookRequestInputV1 {
  readonly request: Request;
  readonly pool: PostgresSubjectPoolV1;
  readonly config: PortOneV2WebhookPaymentCompletionConfigV1;
  readonly verificationAdapter: CommercePaymentVerificationAdapterV1;
}

function matchesRoute(request: Request): boolean {
  const url = new URL(request.url);
  return url.pathname === ROUTE && url.search === '' && url.hash === '';
}

function noStoreResponse(status: number, headers?: Readonly<Record<string, string>>): Response {
  return new Response(null, {
    status,
    headers: {
      'Cache-Control': NO_STORE_CACHE_CONTROL,
      ...headers,
    },
  });
}

function jsonError(input: {
  readonly status: 400 | 503;
  readonly code: 'INVALID_WEBHOOK' | 'TEMPORARILY_UNAVAILABLE';
  readonly retryable: boolean;
}): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code: input.code,
        retryable: input.retryable,
      },
      meta: {
        apiContractVersion: API_CONTRACT_VERSION,
      },
    },
    {
      status: input.status,
      headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
    },
  );
}

function invalidWebhookResponse(): Response {
  return jsonError({
    status: 400,
    code: 'INVALID_WEBHOOK',
    retryable: false,
  });
}

function temporarilyUnavailableResponse(): Response {
  return jsonError({
    status: 503,
    code: 'TEMPORARILY_UNAVAILABLE',
    retryable: true,
  });
}

function hasAcceptableContentLength(request: Request): boolean {
  const value = request.headers.get('content-length');
  if (value === null) return true;
  if (!CANONICAL_CONTENT_LENGTH.test(value)) return false;
  const length = Number(value);
  return (
    Number.isSafeInteger(length) &&
    length > 0 &&
    length <= PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1
  );
}

async function readBoundedRawBody(request: Request): Promise<Uint8Array | null> {
  if (!hasAcceptableContentLength(request)) return null;

  const body = request.body;
  if (body === null) return null;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;

      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1) return null;
      chunks.push(chunk.value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  if (receivedBytes === 0) return null;
  return Buffer.concat(chunks, receivedBytes);
}

function requestHeaders(request: Request): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return Object.freeze(headers);
}

export async function handlePortOneV2WebhookRequestV1(
  input: HandlePortOneV2WebhookRequestInputV1,
): Promise<Response> {
  if (!matchesRoute(input.request)) return noStoreResponse(404);
  if (input.request.method !== POST_METHOD) {
    return noStoreResponse(405, { Allow: POST_METHOD });
  }

  const rawBody = await readBoundedRawBody(input.request);
  if (rawBody === null) return invalidWebhookResponse();

  try {
    await executePortOneV2WebhookPaymentCompletionV1({
      pool: input.pool,
      request: {
        rawBody,
        headers: requestHeaders(input.request),
      },
      config: input.config,
      verificationAdapter: input.verificationAdapter,
    });
    return noStoreResponse(204);
  } catch (error) {
    if (error instanceof PortOneV2WebhookPaymentCompletionErrorV1) {
      if (error.code === 'INVALID_CONFIGURATION') {
        return temporarilyUnavailableResponse();
      }
      return invalidWebhookResponse();
    }
    return temporarilyUnavailableResponse();
  }
}
