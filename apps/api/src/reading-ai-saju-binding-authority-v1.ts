import type { SajuReadingProviderBindingAuthorityV1 } from './reading-ai-saju-provider-bridge-v1.js';

/**
 * A4: correlate a PRIVATE Saju provider-call receipt with the canonical DB
 * Reading attempt. Neither source's requestId nor an external Reading ID is
 * intrinsically equal to a MyeongHa UUID or transport external_request_ref.
 *
 * These two ports are independently trusted SERVER authorities. The source
 * authority must prove that this actual provider call was issued within the
 * pre-allocated DB attempt and supply its exact immutable transport ref.
 * The DB authority must return a unique, governed attempt bound to that same
 * transport ref. Returning caller metadata or a guessed mapping is forbidden.
 * No Production ports are installed by this module; missing proof stays HOLD.
 */
export interface VerifiedSajuProviderCallLinkV1 {
  readonly sajuRequestId: string;
  readonly callId: string;
  readonly modelKey: string;
  readonly observedAt: string;
  readonly externalRequestRef: string;
  readonly executionAttemptId: string;
}
export interface VerifiedDbReadingAttemptLinkV1 {
  readonly externalRequestRef: string;
  readonly subjectId: string;
  readonly readingId: string;
  readonly executionAttemptId: string;
}
export interface SajuProviderCallSourceAuthorityV1 {
  verifyProviderCall(
    input: Parameters<SajuReadingProviderBindingAuthorityV1['resolve']>[0],
  ): Promise<VerifiedSajuProviderCallLinkV1 | null>;
}
export interface DbReadingAttemptBindingAuthorityV1 {
  /**
   * Return null unless exactly ONE canonical allocated Reading attempt
   * matches this transport ref AND execution attempt ID. The caller MUST
   * not implement this as an unscoped external_ref lookup.
   */
  verifyDbAttempt(input: Readonly<{
    externalRequestRef: string;
    executionAttemptId: string;
  }>): Promise<VerifiedDbReadingAttemptLinkV1 | null>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function validUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID.test(id);
}
function exactInput(
  a: Parameters<SajuReadingProviderBindingAuthorityV1['resolve']>[0],
  b: VerifiedSajuProviderCallLinkV1,
): boolean {
  return b.sajuRequestId === a.sajuRequestId
    && b.callId === a.callId
    && b.modelKey === a.modelKey
    && b.observedAt === a.observedAt
    && typeof b.externalRequestRef === 'string'
    && b.externalRequestRef.trim() !== ''
    && b.externalRequestRef.length <= 256
    && validUuid(b.executionAttemptId);
}

/** Never activates collection or supplies a permissive fallback. */
export function createVerifiedSajuReadingProviderBindingAuthorityV1(
  input: Readonly<{
    source: SajuProviderCallSourceAuthorityV1;
    db: DbReadingAttemptBindingAuthorityV1;
  }>,
): SajuReadingProviderBindingAuthorityV1 {
  return Object.freeze({
    async resolve(request: Parameters<SajuReadingProviderBindingAuthorityV1['resolve']>[0]) {
      if (!validUuid(request.callId)
        || !request.sajuRequestId || request.sajuRequestId.length > 256
        || !request.modelKey || request.modelKey.length > 128
        || !Number.isFinite(Date.parse(request.observedAt))
        || request.observation?.callId !== request.callId
        || request.observation?.requestId !== request.sajuRequestId
        || request.observation?.modelKey !== request.modelKey
        || request.observation?.observedAt !== request.observedAt) return null;
      const source = await input.source.verifyProviderCall(request);
      if (source === null || !exactInput(request, source)) return null;
      const attempt = await input.db.verifyDbAttempt({
        externalRequestRef: source.externalRequestRef,
        executionAttemptId: source.executionAttemptId,
      });
      if (attempt === null
        || attempt.externalRequestRef !== source.externalRequestRef
        || attempt.executionAttemptId !== source.executionAttemptId
        || !validUuid(attempt.subjectId)
        || !validUuid(attempt.readingId)
        || !validUuid(attempt.executionAttemptId)) return null;
      return Object.freeze({
        subjectId: attempt.subjectId.toLowerCase(),
        readingId: attempt.readingId.toLowerCase(),
        executionAttemptId: attempt.executionAttemptId.toLowerCase(),
      });
    },
  });
}
