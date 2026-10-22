import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { PostgresSubjectPoolV1, PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type { ProductReaderEligibilityAuthorityPortV1 } from './product-reader-eligibility-policy-v1.js';
import {
  resolvePostgresCommerceReaderRecordContinuityV1,
} from './postgres-commerce-reader-product-continuity-v1.js';

/**
 * S2/S6/S7 private product handoff: existing owned Official Reading (not an
 * additional Saju report) and a fresh, independently authorized Reader
 * thread candidate. A previous Reader purchase / historical record is NOT
 * current permission to view, generate, inject Memory, or send Chat.
 *
 * The shipping adapter is explicitly OFF pending Product/Privacy/Saju/DB
 * owners. No browser flag, env option, request receipt or client timestamp
 * can enable it. This handler returns neither the Saju report body nor an
 * active entitlement credential.
 */
export const COMMERCE_READER_RECORD_CONTINUITY_HTTP_V1 = Object.freeze({
  route: '/api/readings/:readingId/reader-continuity',
  method: 'GET',
  releaseActive: false,
  contractVersion: 'commerce-reader-record-continuity-v1',
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const READER = /^[a-z][a-z0-9_-]{0,63}$/u;
const PATH = /^\/api\/readings\/([^/]+)\/reader-continuity$/u;
const NO_STORE = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  Vary: 'Cookie, Authorization',
} as const);

function fail(status: number, code: string, requestId: string): Response {
  return Response.json({
    ok: false,
    error: { code, messageKey: 'reader.continuity_unavailable', retryable: false },
    meta: { apiContractVersion: 'v0.9', requestId },
  }, { status, headers: NO_STORE });
}

function selectors(request: Request): Readonly<{
  readingId: string;
  readerCharacterId: string;
}> | null {
  const url = new URL(request.url);
  const path = PATH.exec(url.pathname);
  if (!path || !UUID.test(path[1] ?? '') || url.hash !== ''
      || url.searchParams.getAll('readerCharacterId').length !== 1
      || [...url.searchParams.keys()].some(key => key !== 'readerCharacterId')) return null;
  const readerCharacterId = url.searchParams.get('readerCharacterId');
  if (!readerCharacterId || !READER.test(readerCharacterId)) return null;
  return Object.freeze({
    readingId: path[1]!.toLowerCase(),
    readerCharacterId,
  });
}

export interface HandleCommerceReaderRecordContinuityHttpV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  /** Injected solely by trusted server composition; not from HTTP input. */
  readonly productReleaseEnabled?: boolean;
  readonly identityEvidenceVerifier?: IdentityEvidenceVerificationPortV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly createProductReaderPolicyAuthorityPort?: (
    client: PostgresTransactionQueryV1,
  ) => ProductReaderEligibilityAuthorityPortV1;
}

export async function handleCommerceReaderRecordContinuityHttpV1(
  input: HandleCommerceReaderRecordContinuityHttpV1,
): Promise<Response> {
  const target = selectors(input.request);
  if (target === null) return fail(404, 'NOT_FOUND', input.requestId);
  if (input.request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { ...NO_STORE, Allow: 'GET' } });
  }
  if (input.productReleaseEnabled !== true
      || !input.identityEvidenceVerifier
      || !input.pool
      || !input.createProductReaderPolicyAuthorityPort) {
    return fail(503, 'CAPABILITY_UNAVAILABLE', input.requestId);
  }

  try {
    const evidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
    if (!evidence) return fail(401, 'AUTH_REQUIRED', input.requestId);
    const result = await resolvePostgresCommerceReaderRecordContinuityV1({
      pool: input.pool,
      verifiedEvidence: evidence,
      readingId: target.readingId,
      readerCharacterId: target.readerCharacterId,
      createProductReaderPolicyAuthorityPort:
        input.createProductReaderPolicyAuthorityPort,
    });
    const candidate = result.readerFollowup;
    // The current Right was checked on the server, but this candidate is
    // navigation only and EXPIRES at the transaction boundary.
    // Never claim a legally confirmed refund from a denied Reader lookup.
    return Response.json({
      ok: true,
      data: {
        contractVersion: COMMERCE_READER_RECORD_CONTINUITY_HTTP_V1.contractVersion,
        readingId: result.officialReadingId,
        readerCharacterId: result.readerCharacterId,
        record: {
          state: 'owned_official_reading',
          completedAt: result.officialRecord.completedAt,
        },
        readerFollowup: candidate.state === 'existing_thread_candidate'
          ? {
              state: 'existing_thread_candidate',
              threadId: candidate.threadId,
              requiresFreshGateAtUse: true,
            }
          : {
              state: 'not_available',
              requiresFreshGateAtUse: true,
            },
        protectedAnswer: 'requires_separate_current_entitlement_and_saju_source',
        summary: 'not_confirmed_delivered',
        saleActivated: false,
      },
      meta: {
        apiContractVersion: 'v0.9',
        requestId: input.requestId,
        serverTime: input.serverTime,
      },
    }, { headers: NO_STORE });
  } catch {
    // Do not disclose missing purchase, refund, session, Reader, archive,
    // active Bundle or original official Saju source details to a caller.
    return fail(404, 'NOT_FOUND', input.requestId);
  }
}
