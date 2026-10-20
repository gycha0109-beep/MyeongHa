// Watchtower-Track: security
// Direct Node HTTP ONLY. This transport is NOT mounted in Vercel Fetch,
// rewrites, serverless proxy, web, or mobile routes. G3 proxy proof remains HOLD.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { ProductionSeyeonChatRuntimeV1 } from './production-seyeon-chat-runtime-v1.js';
import { preflightSeyeonChatTurnSendRequestV1 } from './chat-turn-send-http.js';
import { executeAndDeliverSeyeonFirstZeroNodeTurnV1 } from './seyeon-first-zero-node-turn-delivery-v1.js';

export const SEYEON_FIRST_ZERO_DIRECT_NODE_HTTP_INGRESS_V1 = Object.freeze({
  version: 'seyeon-first-zero-direct-node-http-ingress-v1',
  supportedTransport: 'node:http.IncomingMessage+ServerResponse',
  productionRouteMounted: false,
  vercelFetchSupported: false,
  proxyHandoffProven: false,
  positiveOrHistoricalSourceReveal: false,
  responseCache: 'no-store',
} as const);

export type SeyeonFirstZeroNodeHttpOutcomeV1 =
  | 'preflight_denied' | 'assistant_sent' | 'reveal_held';

export interface SeyeonFirstZeroNodeHttpIngressInputV1 {
  readonly incoming: IncomingMessage;
  readonly response: ServerResponse;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly runtime: Pick<ProductionSeyeonChatRuntimeV1, 'run'>;
  /** Server-generated only; never parsed from an HTTP header or JSON body. */
  readonly requestId?: string;
  readonly serverTime?: string;
}

const MAX_RAW_PATH_BYTES = 2048;
const MAX_PREFLIGHT_RESPONSE_BYTES = 2048;
const API_CONTRACT = 'v0.9' as const;
const NO_STORE = 'no-store' as const;

function safeRequestId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/u.test(value);
}

function canonicalNodeRequest(incoming: IncomingMessage): Request {
  const path = incoming.url;
  const method = incoming.method;
  if (typeof path !== 'string' || !path.startsWith('/') ||
      path.startsWith('//') || Buffer.byteLength(path, 'utf8') > MAX_RAW_PATH_BYTES ||
      typeof method !== 'string' || !/^[A-Z]{1,16}$/u.test(method)) {
    throw new Error('Invalid canonical Node HTTP request.');
  }

  // Never derive the HTTP origin or authorization scope from Host/X-Forwarded-*.
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      for (const part of value) headers.append(key, part);
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = hasBody
    ? (Readable.toWeb(incoming) as ReadableStream<Uint8Array>)
    : undefined;
  return new Request(`https://myeongha.internal${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body, duplex: 'half' as const }),
  } as RequestInit & { duplex?: 'half' });
}

function sendStaticBytes(
  response: ServerResponse,
  status: number,
  body: Buffer,
  contentType: string,
): void {
  if (response.headersSent || response.writableEnded || response.destroyed) {
    throw new Error('Node HTTP response is not writable.');
  }
  response.statusCode = status;
  response.setHeader('Cache-Control', NO_STORE);
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', String(body.byteLength));
  response.end(body);
}

async function sendPreflightDenial(response: ServerResponse, denial: Response): Promise<void> {
  // The shared preflight function only constructs static 4xx responses before
  // any Provider or DB Reveal; never use this writer for post-execution data.
  if (denial.status < 400 || denial.status > 499 ||
      denial.headers.get('cache-control') !== NO_STORE) {
    throw new Error('Only source-static preflight denials can use the Node writer.');
  }
  const bytes = Buffer.from(await denial.arrayBuffer());
  if (bytes.byteLength > MAX_PREFLIGHT_RESPONSE_BYTES) {
    throw new Error('Preflight denial exceeded its fixed response ceiling.');
  }
  sendStaticBytes(response, denial.status, bytes, 'application/json; charset=utf-8');
}

function holdResponse(response: ServerResponse, requestId: string): void {
  const bytes = Buffer.from(JSON.stringify({
    ok: false,
    error: {
      code: 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
      messageKey: 'chat.secure_reveal_unavailable',
      retryable: false,
    },
    meta: { apiContractVersion: API_CONTRACT, requestId },
  }), 'utf8');
  if (!response.headersSent && !response.writableEnded && !response.destroyed) {
    sendStaticBytes(response, 503, bytes, 'application/json; charset=utf-8');
  } else if (!response.writableEnded && !response.destroyed) {
    response.destroy();
  }
}

/**
 * Builds the first real Node-socket ingress around shared Web/Node preflight.
 * The ONLY positive response path calls the fresh Postgres-locked read and
 * direct ServerResponse.end(), retaining locks until the Node 'finish' event.
 *
 * No user text, credential, SQL data, or model output is ever logged here.
 * This adapter MUST NOT be mounted behind Vercel's proxy or return a Fetch
 * Response; socket finish cannot establish external proxy/client receipt.
 */
export async function handleSeyeonFirstZeroDirectNodeHttpV1(
  input: SeyeonFirstZeroNodeHttpIngressInputV1,
): Promise<SeyeonFirstZeroNodeHttpOutcomeV1> {
  const requestId = input.requestId ?? randomUUID();
  const serverTime = input.serverTime ?? new Date().toISOString();
  const { incoming, response } = input;
  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  // IncomingMessage 'aborted' only covers the request body. A peer may
  // disconnect after the body completes while DB readiness is pending.
  const abortOnEarlyResponseClose = () => {
    if (!response.writableFinished) abortRequest();
  };
  incoming.once('aborted', abortRequest);
  response.once('close', abortOnEarlyResponseClose);
  try {
    // A genuine Node IncomingMessage and ServerResponse must be attached to
    // the SAME live local socket. In particular no Fetch Response object can
    // satisfy this constraint or smuggle an already-buffered assistant body.
    if (!incoming.socket || !response.socket ||
        incoming.socket !== response.socket ||
        response.headersSent || response.writableEnded || response.destroyed ||
        !safeRequestId(requestId) ||
        !Number.isFinite(Date.parse(serverTime)) ||
        new Date(serverTime).toISOString() !== serverTime) {
      holdResponse(response, safeRequestId(requestId) ? requestId : 'invalid-request');
      return 'reveal_held';
    }

    const request = canonicalNodeRequest(incoming);
    const preflight = await preflightSeyeonChatTurnSendRequestV1({
      request,
      requestId,
      identityEvidenceVerifier: input.identityEvidenceVerifier,
    });
    if (controller.signal.aborted || response.destroyed) {
      response.destroy();
      return 'reveal_held';
    }
    if (preflight.kind === 'denied') {
      await sendPreflightDenial(response, preflight.response);
      return 'preflight_denied';
    }

    return await executeAndDeliverSeyeonFirstZeroNodeTurnV1({
      response,
      requestSignal: controller.signal,
      pool: input.pool,
      verifiedEvidence: preflight.verifiedEvidence,
      threadId: preflight.threadId,
      clientTurnId: preflight.clientTurnId,
      text: preflight.text,
      requestId,
      serverTime,
      runtime: input.runtime,
    });
  } catch (error) {
    // Never serialize the exception message, a stale assistant body, or a
    // failed transaction's cached bytes. A started socket is torn down.
    if (!response.headersSent) holdResponse(response, safeRequestId(requestId) ? requestId : 'invalid-request');
    else if (!response.writableEnded && !response.destroyed) response.destroy();
    return 'reveal_held';
  } finally {
    incoming.off('aborted', abortRequest);
    response.off('close', abortOnEarlyResponseClose);
  }
}
