import { handleOfficialReaderPaidChatMessageHttpV1 } from './official-reader-paid-chat-message-http-v1.js';
import { handleOfficialReaderPaidDeliveryAckHttpV1 } from './official-reader-paid-chat-delivery-ack-http-v1.js';
import { handleCommerceReaderRecordContinuityHttpV1 } from './commerce-reader-record-continuity-http-v1.js';

/**
 * S6/S7 and Records adapters share the existing /api/me Vercel function.
 * These three paths were previously separate, hard-OFF production functions.
 * The dispatcher is deliberately NOT a release switch and never injects
 * identity, Receipt, Privacy, key, product, or content capabilities.
 */
const KIND_PARAM = '__myeongha_held_reader_route' as const;
const THREAD_PARAM = '__myeongha_held_reader_thread_id' as const;
const MESSAGE_PARAM = '__myeongha_held_reader_message_id' as const;
const READING_PARAM = '__myeongha_held_reader_reading_id' as const;
const READER_PARAM = 'readerCharacterId' as const;
const SHARE_PARAM = '_vercel_share' as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const READER = /^[a-z][a-z0-9_-]{0,63}$/u;
const NO_STORE = 'private, no-store, max-age=0';

function notFound(request: Request): Promise<Response> {
  if (request.body !== null && !request.bodyUsed) {
    void request.body.cancel().catch(() => undefined);
  }
  return Promise.resolve(new Response(null, {
    status: 404, headers: { 'Cache-Control': NO_STORE },
  }));
}

function one(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  return values.length === 1 && values[0] !== undefined && values[0].length > 0
    ? values[0] : null;
}

export function tryDispatchHeldOfficialReaderV1(input: Readonly<{
  request: Request;
  requestId: string;
  serverTime: string;
}>): Promise<Response> | null {
  const url = new URL(input.request.url);
  if (!url.searchParams.has(KIND_PARAM)) return null;

  const kind = one(url.searchParams, KIND_PARAM);
  if (url.hash !== '' || !['message', 'ack', 'continuity'].includes(kind ?? '')) {
    return notFound(input.request);
  }
  const allowed = new Set<string>([
    KIND_PARAM, SHARE_PARAM,
    ...(kind === 'continuity'
      ? [READING_PARAM, READER_PARAM] : [THREAD_PARAM, MESSAGE_PARAM]),
  ]);
  if ([...url.searchParams.keys()].some(k => !allowed.has(k)) ||
      (url.searchParams.has(SHARE_PARAM) && one(url.searchParams, SHARE_PARAM) === null)) {
    return notFound(input.request);
  }

  let path: string;
  if (kind === 'continuity') {
    const id = one(url.searchParams, READING_PARAM);
    const reader = one(url.searchParams, READER_PARAM);
    if (id === null || !UUID.test(id) || reader === null || !READER.test(reader)) {
      return notFound(input.request);
    }
    path = `/api/readings/${id.toLowerCase()}/reader-continuity`;
  } else {
    const thread = one(url.searchParams, THREAD_PARAM);
    const message = one(url.searchParams, MESSAGE_PARAM);
    if (thread === null || !UUID.test(thread) || message === null || !UUID.test(message)) {
      return notFound(input.request);
    }
    path = `/api/chat/${thread.toLowerCase()}/paid-readings/${message.toLowerCase()}` +
      (kind === 'ack' ? '/ack' : '');
  }

  // The public-facing source path and Vercel's private rewritten path are
  // both accepted. Cross-route or cross-ID locator disagreement fails closed.
  if (url.pathname !== '/api/me' && url.pathname.toLowerCase() !== path) {
    return notFound(input.request);
  }

  // Keep the trusted incoming request origin while canonicalizing only the
  // server-validated pathname. Delivery ACK's same-origin check must compare
  // the browser's Origin to the actual site, not a synthetic .internal host.
  // This builds an in-process Request only; it performs no outbound fetch.
  const canonical = new URL(path, url);
  if (kind === 'continuity') {
    canonical.searchParams.set(READER_PARAM, one(url.searchParams, READER_PARAM)!);
  }
  const body = input.request.method === 'GET' || input.request.method === 'HEAD'
    ? undefined : input.request.body ?? undefined;
  const request = new Request(canonical, {
    method: input.request.method,
    headers: input.request.headers,
    ...(body === undefined ? {} : { body, duplex: 'half' as const }),
  } as RequestInit & { duplex?: 'half' });

  if (kind === 'message') {
    return handleOfficialReaderPaidChatMessageHttpV1({
      request, requestId: input.requestId, serverTime: input.serverTime,
      paidReadReleaseEnabled: false,
    });
  }
  if (kind === 'ack') {
    return handleOfficialReaderPaidDeliveryAckHttpV1({
      request, requestId: input.requestId, serverTime: input.serverTime,
      paidReadReleaseEnabled: false,
    });
  }
  return handleCommerceReaderRecordContinuityHttpV1({
    request, requestId: input.requestId, serverTime: input.serverTime,
    productReleaseEnabled: false,
  });
}
