/**
 * C08 roadmap 7.3 candidate B: restrictive OFFLINE-only local screening.
 *
 * This function is deliberately NOT a replacement for unified LLM Integrity
 * and Disclosure preflight. Its output authorizes zero model calls, zero
 * private retrieval, and zero 2-call routing. Do not import into production.
 *
 * Exact-match N06 is merely a research hypothesis. Text-only screening cannot
 * attest full-thread Census, source permissions, hidden conversation context,
 * or semantic classification equivalence on unseen user messages.
 */
export const SEYEON_C08_LOCAL_N06_TEXT_V1 =
  '오늘은 네가 먼저 이야기해 줘.';
export const SEYEON_C08_TWO_CALL_LOCAL_HYPOTHESIS_V1 =
  'seyeon-two-call-local-eligibility-offline-hypothesis-v1';

export function assessSeyeonTwoCallLocalEligibilityOfflineV1({
  text,
  fullThreadCensusFixture,
  publicFirstContactFixture,
  noMemoryOrRelationshipFixture,
  independentReviewRetained,
} = {}) {
  const exactText = typeof text === 'string' &&
    text === SEYEON_C08_LOCAL_N06_TEXT_V1;
  const fixturePreconditions = fullThreadCensusFixture === true &&
    publicFirstContactFixture === true &&
    noMemoryOrRelationshipFixture === true &&
    independentReviewRetained === true;
  const worthFurtherStudy = exactText && fixturePreconditions;
  return Object.freeze({
    version: SEYEON_C08_TWO_CALL_LOCAL_HYPOTHESIS_V1,
    scope: 'OFFLINE_TEXT_ONLY_RESEARCH_NOT_AUTHORITY',
    disposition: worthFurtherStudy
      ? 'N06_EXACT_HYPOTHESIS_ONLY'
      : 'PRECHECK_UNPROVEN_HOLD',
    worthFurtherStudy,
    c07GoldClassificationEquivalenceVerified: false,
    unseenMixedAttackRecallVerified: false,
    authoritativeCensusVerified: false,
    privacyAclVerified: false,
    unifiedPreflightMayBeSkipped: false,
    twoCallExecutionAuthorized: false,
    productionRoutingAuthorized: false,
  });
}
