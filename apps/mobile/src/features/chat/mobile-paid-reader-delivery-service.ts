import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { createMobileChatTurnIdV1 } from '@/features/chat/mobile-chat-turn-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const READ_VERSION = 'official-reader-paid-chat-message-v1';
const DELIVERY_VERSION = 'official-reader-s7-private-delivery-v1';
const MAX_BODY_LENGTH = 262144;

/**
 * The S6/S7 mobile contract has no durable local cache. Paid answer text
 * and its one-use client acknowledgment bearer live only in the mounted
 * Reader card. No Chat state, navigation params, Analytics, SecureStore,
 * MMKV, AsyncStorage, or pending-send queue may receive these values.
 *
 * Server public release is still OFF; 503 is not bypassed by this client.
 */
export interface MobilePaidReaderDeliveryReceiptV1 {
  readonly deliveryRequestId: string;
  readonly deliveryAttemptId: string;
  readonly responsePreparedAt: string;
  readonly acknowledgementToken: string;
  readonly replayed: boolean;
}

export interface MobilePaidReaderProtectedAnswerV1 {
  readonly officialReadingId: string;
  readonly readerCharacterId: string;
  readonly committedAt: string;
  readonly body: string;
  readonly delivery: MobilePaidReaderDeliveryReceiptV1;
}

export type MobilePaidReaderReadOutcomeV1 =
  | Readonly<{ kind: 'ready'; answer: MobilePaidReaderProtectedAnswerV1 }>
  | Readonly<{ kind: 'unavailable'; status: number }>
  | Readonly<{ kind: 'malformed' }>;

export type MobilePaidReaderAckOutcomeV1 =
  | Readonly<{ kind: 'acknowledged'; acknowledgedAt: string; replayed: boolean }>
  | Readonly<{ kind: 'unavailable' }>;

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function origin(): string {
  const url = new URL(nativeMobileRuntimeV1.config.apiOrigin);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost'
      && url.hostname !== '127.0.0.1') {
    throw new Error('Paid Reader transport requires HTTPS.');
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error('Paid Reader API origin is invalid.');
  }
  return url.origin;
}
function route(originUrl: string, threadId: string, safeMessageId: string): string {
  if (!UUID.test(threadId) || !UUID.test(safeMessageId)) {
    throw new Error('Paid Reader marker is invalid.');
  }
  return originUrl + '/api/chat/' + encodeURIComponent(threadId)
    + '/paid-readings/' + encodeURIComponent(safeMessageId);
}

async function retryNetworkOnce(
  operation: () => Promise<Response>,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    if (signal.aborted) throw error;
    // A lost GET or ACK response may already have been recorded by S7.
    // Repeat only transport failures with the exact same request/token.
    return operation();
  }
}

function parseProtectedAnswer(
  value: unknown,
  threadId: string,
  safeMessageId: string,
  deliveryRequestId: string,
): MobilePaidReaderProtectedAnswerV1 | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) return null;
  const data = value.data;
  if (data.schemaVersion !== READ_VERSION || data.threadId !== threadId
      || data.safeMessageId !== safeMessageId
      || typeof data.officialReadingId !== 'string'
      || !UUID.test(data.officialReadingId)
      || typeof data.readerCharacterId !== 'string'
      || data.readerCharacterId.length === 0
      || data.readerCharacterId.length > 128
      || !validDate(data.committedAt)
      || typeof data.body !== 'string' || data.body.length === 0
      || data.body.length > MAX_BODY_LENGTH || !isRecord(data.delivery)) return null;

  const receipt = data.delivery;
  if (receipt.deliveryRequestId !== deliveryRequestId
      || typeof receipt.deliveryAttemptId !== 'string'
      || !UUID.test(receipt.deliveryAttemptId)
      || !validDate(receipt.responsePreparedAt)
      || typeof receipt.acknowledgementToken !== 'string'
      || !TOKEN.test(receipt.acknowledgementToken)
      || typeof receipt.replayed !== 'boolean') return null;
  return Object.freeze({
    officialReadingId: data.officialReadingId,
    readerCharacterId: data.readerCharacterId,
    committedAt: data.committedAt,
    body: data.body,
    delivery: Object.freeze({
      deliveryRequestId,
      deliveryAttemptId: receipt.deliveryAttemptId,
      responsePreparedAt: receipt.responsePreparedAt,
      acknowledgementToken: receipt.acknowledgementToken,
      replayed: receipt.replayed,
    }),
  });
}

/** Always a new attempt ID for a new reveal; ONE ID for its network retries. */
export async function readMobilePaidReaderChatMessageV1(input: Readonly<{
  threadId: string;
  safeMessageId: string;
  signal: AbortSignal;
}>): Promise<MobilePaidReaderReadOutcomeV1> {
  const endpoint = route(origin(), input.threadId, input.safeMessageId);
  const deliveryRequestId = createMobileChatTurnIdV1();
  if (!UUID.test(deliveryRequestId)) throw new Error('Delivery identity unavailable.');
  return nativeMobileRuntimeV1.memberSession.withMemberBearer(async (bearer) => {
    const response = await retryNetworkOnce(() => fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + bearer,
        'Cache-Control': 'no-store',
        'X-Reader-Delivery-Request-Id': deliveryRequestId,
      },
      signal: input.signal,
    }), input.signal);
    if (!response.ok) {
      return Object.freeze({ kind: 'unavailable' as const, status: response.status });
    }
    let envelope: unknown;
    try { envelope = await response.json(); } catch { return Object.freeze({ kind: 'malformed' as const }); }
    const answer = parseProtectedAnswer(
      envelope, input.threadId, input.safeMessageId, deliveryRequestId,
    );
    return answer === null
      ? Object.freeze({ kind: 'malformed' as const })
      : Object.freeze({ kind: 'ready' as const, answer });
  });
}

/** Only call AFTER native protected Text has been laid out on a focused screen. */
export async function acknowledgeMobilePaidReaderChatDeliveryV1(input: Readonly<{
  threadId: string;
  safeMessageId: string;
  receipt: MobilePaidReaderDeliveryReceiptV1;
  signal: AbortSignal;
}>): Promise<MobilePaidReaderAckOutcomeV1> {
  const apiOrigin = origin();
  const endpoint = route(apiOrigin, input.threadId, input.safeMessageId) + '/ack';
  const receipt = input.receipt;
  if (!UUID.test(receipt.deliveryRequestId) || !UUID.test(receipt.deliveryAttemptId)
      || !TOKEN.test(receipt.acknowledgementToken)) {
    return Object.freeze({ kind: 'unavailable' as const });
  }
  const payload = JSON.stringify({
    schemaVersion: DELIVERY_VERSION,
    deliveryRequestId: receipt.deliveryRequestId,
    deliveryAttemptId: receipt.deliveryAttemptId,
    acknowledgementToken: receipt.acknowledgementToken,
  });

  return nativeMobileRuntimeV1.memberSession.withMemberBearer(async (bearer) => {
    const response = await retryNetworkOnce(() => fetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + bearer,
        Origin: apiOrigin,
        'X-Reader-Delivery-Ack': '1',
        'Cache-Control': 'no-store',
      },
      body: payload,
      signal: input.signal,
    }), input.signal);
    if (!response.ok) return Object.freeze({ kind: 'unavailable' as const });
    let envelope: unknown;
    try { envelope = await response.json(); } catch { return Object.freeze({ kind: 'unavailable' as const }); }
    if (!isRecord(envelope) || envelope.ok !== true || !isRecord(envelope.data)
        || envelope.data.schemaVersion !== DELIVERY_VERSION
        || envelope.data.deliveryAttemptId !== receipt.deliveryAttemptId
        || !validDate(envelope.data.clientAcknowledgedAt)
        || typeof envelope.data.replayed !== 'boolean') {
      return Object.freeze({ kind: 'unavailable' as const });
    }
    return Object.freeze({
      kind: 'acknowledged' as const,
      acknowledgedAt: envelope.data.clientAcknowledgedAt,
      replayed: envelope.data.replayed,
    });
  });
}
