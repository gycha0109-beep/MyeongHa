import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  readPrivateOfficialReaderPaidChatMessageV1,
  type PrivateOfficialReaderPaidAnswerKeyResolverV1,
} from './official-reader-private-paid-answer-reread-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { OfficialReaderPrivatePrivacyLedgerPortV1 } from './official-reader-private-privacy-ledger-v1.js';

export const OFFICIAL_READER_PAID_CHAT_MESSAGE_HTTP_V1 = Object.freeze({
  method: 'GET',
  route: '/api/chat/:threadId/paid-readings/:safeMessageId',
  schemaVersion: 'official-reader-paid-chat-message-v1',
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PATH = /^\/api\/chat\/([^/]+)\/paid-readings\/([^/]+)$/u;
const LOCKED_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Pragma': 'no-cache',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  Vary: 'Cookie, Authorization',
} as const;

function failure(
  status: number,
  code: string,
  messageKey: string,
  requestId: string,
): Response {
  return Response.json({
    ok: false,
    error: { code, messageKey, retryable: false },
    meta: { apiContractVersion: 'v0.9', requestId },
  }, { status, headers: LOCKED_HEADERS });
}

function parseRoute(request: Request):
  Readonly<{ threadId: string; safeMessageId: string }> | null {
  const url = new URL(request.url);
  if (url.hash !== '' || [...url.searchParams.keys()].length !== 0) return null;
  const match = PATH.exec(url.pathname);
  if (!match || !UUID.test(match[1] ?? '') || !UUID.test(match[2] ?? '')) return null;
  return Object.freeze({
    threadId: match[1]!.toLowerCase(),
    safeMessageId: match[2]!.toLowerCase(),
  });
}

export interface HandleOfficialReaderPaidChatMessageHttpInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  /**
   * S7 public release remains OFF until Production Saju source attestation,
   * Privacy deletion+restore fence, current-R2 permission, and DB function
   * grants have all been accepted. No caller-controlled request flag.
   */
  readonly paidReadReleaseEnabled?: boolean;
  readonly identityEvidenceVerifier?: IdentityEvidenceVerificationPortV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly keyResolver?: PrivateOfficialReaderPaidAnswerKeyResolverV1;
  readonly privacyLedgerPort?: OfficialReaderPrivatePrivacyLedgerPortV1;
  /** Server-only S7 HMAC secret; never submitted by the caller. */
  readonly deliveryTokenSecret?: Uint8Array;
}

/**
 * Dedicated owner-scoped paid Reader read endpoint. Unlike GET /api/chat,
 * this response is NEVER added to ordinary Chat messages or Memory.
 *
 * The Production Vercel adapter is currently hardcoded OFF. This handler's
 * success path is for future owner-approved wiring and does not mint rights.
 */
export async function handleOfficialReaderPaidChatMessageHttpV1(
  input: HandleOfficialReaderPaidChatMessageHttpInputV1,
): Promise<Response> {
  const parsed = parseRoute(input.request);
  if (parsed === null) return failure(404, 'NOT_FOUND', 'reader.paid_not_found', input.requestId);
  if (input.request.method !== 'GET') {
    return new Response(null, {
      status: 405, headers: { ...LOCKED_HEADERS, Allow: 'GET' },
    });
  }

  if (input.paidReadReleaseEnabled !== true) {
    return failure(503, 'CAPABILITY_UNAVAILABLE', 'reader.paid_unavailable', input.requestId);
  }
  if (!input.identityEvidenceVerifier || !input.pool || !input.keyResolver
      || !input.privacyLedgerPort
      || !(input.deliveryTokenSecret instanceof Uint8Array)
      || input.deliveryTokenSecret.byteLength !== 32) {
    return failure(503, 'CAPABILITY_UNAVAILABLE', 'reader.paid_unavailable', input.requestId);
  }
  // A client-generated UUID persists across GET retries. S7 HMAC binding
  // prevents another Subject/Reading/marker from replaying the receipt.
  const deliveryRequestId=input.request.headers.get('X-Reader-Delivery-Request-Id');
  if (deliveryRequestId === null || !UUID.test(deliveryRequestId)) {
    return failure(400, 'INVALID_REQUEST', 'reader.paid_unavailable', input.requestId);
  }

  try {
    const evidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
    if (!evidence) return failure(401, 'AUTH_REQUIRED', 'auth.required', input.requestId);
    if (evidence.kind !== 'member') {
      return failure(403, 'ACCESS_DENIED', 'reader.paid_unavailable', input.requestId);
    }
    const read = await readPrivateOfficialReaderPaidChatMessageV1({
      pool: input.pool,
      verifiedEvidence: evidence,
      threadId: parsed.threadId,
      safeMessageId: parsed.safeMessageId,
      keyResolver: input.keyResolver,
      privacyLedgerPort: input.privacyLedgerPort,
      deliveryReservation: {
        deliveryRequestId: deliveryRequestId.toLowerCase(),
        secret: input.deliveryTokenSecret,
      },
    });
    if (read.delivery === undefined) {
      return failure(503, 'CAPABILITY_UNAVAILABLE', 'reader.paid_unavailable', input.requestId);
    }
    return Response.json({
      ok: true,
      data: {
        schemaVersion: OFFICIAL_READER_PAID_CHAT_MESSAGE_HTTP_V1.schemaVersion,
        threadId: parsed.threadId,
        safeMessageId: parsed.safeMessageId,
        officialReadingId: read.officialReadingId,
        readerCharacterId: read.readerCharacterId,
        committedAt: read.committedAt,
        // S7 prepared != committed != client-acknowledged. The frontend
        // POSTs the token only AFTER receiving/rendering this response.
        delivery: {
          deliveryRequestId: read.delivery.deliveryRequestId,
          deliveryAttemptId: read.delivery.deliveryAttemptId,
          responsePreparedAt: read.delivery.responsePreparedAt,
          acknowledgementToken: read.delivery.acknowledgementToken,
          replayed: read.delivery.replayed,
        },
        body: read.body,
      },
      meta: { apiContractVersion: 'v0.9', requestId: input.requestId, serverTime: input.serverTime },
    }, { headers: LOCKED_HEADERS });
  } catch {
    // Never reveal whether the marker, purchase, source or key existed.
    return failure(404, 'NOT_FOUND', 'reader.paid_not_found', input.requestId);
  }
}
