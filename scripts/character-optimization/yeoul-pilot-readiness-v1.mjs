/** Offline Yeoul GEPA preregistration. No provider transport, private text export, or approval authority. */
import { YEOUL_NEW_FAMILY_DRAFTS, makeNewYeoulScenarioPlan } from './yeoul-new-scenario-families-v1.mjs';
import { inspectYeoulPilotPreregistrationDraft } from './yeoul-pilot-preregistration-v1.mjs';

const MODEL = 'deepseek/deepseek-v4.1-flash-1017';
const ROLES = Object.freeze(['student', 'reflection', 'judge', 'holdout']);
const PRICE_FIELDS = Object.freeze(['input', 'output', 'reasoning', 'cacheRead', 'cacheWrite']);
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const validText = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 256;
const nonNegativeSafe = x => Number.isSafeInteger(x) && x >= 0;
const fail = reason => { throw new Error('YEOUL_PILOT_PREFLIGHT_INVALID:' + reason); };
const normalize = text => text.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/gu, '').trim();
const bigrams = text => new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_, i) => text.slice(i, i + 2)));
const similarity = (left, right) => {
  if (left === right || left.includes(right) || right.includes(left)) return 1;
  const a = bigrams(left), b = bigrams(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(s => b.has(s)).length;
  return intersection / (a.size + b.size - intersection);
};

/**
 * This only screens potential lexical overlap against a private, caller-provided Y01-Y12 source.
 * The return value never includes original legacy prompts or their hashes. It never grants
 * semantic independence: a separate human comparison and source-authentication are mandatory.
 */
export function screenPrivateYeoulOverlap(legacyFamilies) {
  if (!Array.isArray(legacyFamilies) || legacyFamilies.length !== 12) fail('private_legacy_twelve_required');
  const legacy = new Map();
  for (const item of legacyFamilies) {
    if (!isObject(item) || !/^Y(?:0[1-9]|1[0-2])$/u.test(item.id)
        || legacy.has(item.id) || !Array.isArray(item.turns) || item.turns.length < 1
        || item.turns.length > 10 || item.turns.some(x => typeof x !== 'string' || !x.trim() || x.length > 5000)) fail('private_legacy_shape');
    legacy.set(item.id, item.turns.map(normalize));
  }
  if (legacy.size !== 12) fail('private_legacy_identity');
  const all = [...legacy.values()].flat();
  const candidates = YEOUL_NEW_FAMILY_DRAFTS.map(item => {
    const near = item.turns.some(turn => all.some(previous => similarity(normalize(turn), previous) >= 0.5));
    return Object.freeze({ familyId: item.familyId, split: item.split,
      possibleLexicalOverlap: near, manualSemanticReviewRequired: true });
  });
  return Object.freeze({ schemaVersion: 'yeoul-private-overlap-screen-v1', legacyFamiliesScreened: 12,
    candidateFamiliesScreened: candidates.length,
    possibleLexicalOverlapCount: candidates.filter(c => c.possibleLexicalOverlap).length,
    possibleOverlaps: Object.freeze(candidates),
    privateSourceBytesAuthenticated: false, independentSemanticReviewVerified: false,
    optimizerAdmissionAuthorized: false, rawPrivateTextIncluded: false });
}

const quoteAttempt = (role) => {
  if (!isObject(role) || !validText(role.modelId) || !validText(role.providerId)
      || !isObject(role.pricing) || !isObject(role.tokens)
      || Object.keys(role.pricing).sort().join('|') !== [...PRICE_FIELDS, 'fixedMaximumMicroUsd'].sort().join('|')
      || Object.keys(role.tokens).sort().join('|') !== [...PRICE_FIELDS].sort().join('|')) fail('role_pricing_shape');
  for (const name of PRICE_FIELDS) {
    if (!nonNegativeSafe(role.pricing[name]) || !nonNegativeSafe(role.tokens[name])) fail('role_pricing_values');
  }
  if (!nonNegativeSafe(role.pricing.fixedMaximumMicroUsd)
      || role.tokens.input < 1 || role.tokens.output < 1) fail('role_token_ceiling');
  let result = BigInt(role.pricing.fixedMaximumMicroUsd);
  for (const name of PRICE_FIELDS) {
    const tokenCount = BigInt(role.tokens[name]);
    const pricePerMillion = BigInt(role.pricing[name]);
    result += (tokenCount * pricePerMillion + 999999n) / 1000000n;
  }
  return result;
};

/** Offline quoted worst-case budget; all numbers are untrusted planning claims, not tariffs. */
export function quoteYeoulPilotEnvelope({ priceEvidence, roles, proposedUsdCapMicro = null }) {
  if (!isObject(priceEvidence) || priceEvidence.kind !== 'unverified_planning_snapshot'
      || !validText(priceEvidence.sourceUrl) || !/^https:\/\//u.test(priceEvidence.sourceUrl)
      || !/^\d{4}-\d{2}-\d{2}T/u.test(priceEvidence.observedAt)
      || !isObject(roles) || Object.keys(roles).sort().join('|') !== [...ROLES].sort().join('|')) fail('model_price_snapshot_required');
  if (proposedUsdCapMicro !== null && !nonNegativeSafe(proposedUsdCapMicro)) fail('budget_cap_invalid');
  const summaries = {};
  let total = 0n;
  for (const name of ROLES) {
    const r = roles[name];
    if (!isObject(r) || !nonNegativeSafe(r.attemptsIncludingRetries)) fail('role_attempts');
    if (name === 'student' && r.modelId !== MODEL) fail('student_model_changed');
    const perAttempt = quoteAttempt(r);
    const worst = perAttempt * BigInt(r.attemptsIncludingRetries);
    total += worst;
    summaries[name] = Object.freeze({ modelId: r.modelId, providerId: r.providerId,
      attemptsIncludingRetries: r.attemptsIncludingRetries,
      worstPerAttemptMicroUsd: perAttempt.toString(), worstRoleMicroUsd: worst.toString() });
  }
  const proposed = proposedUsdCapMicro === null ? null : BigInt(proposedUsdCapMicro);
  return Object.freeze({ schemaVersion: 'yeoul-gepa-cost-quote-v1', roles: Object.freeze(summaries),
    worstTotalMicroUsd: total.toString(), proposedCapMicroUsd: proposed?.toString() ?? null,
    quoteFitsProposedCap: proposed !== null && total <= proposed,
    priceSourceUrl: priceEvidence.sourceUrl, priceObservedAt: priceEvidence.observedAt,
    rateSourceProviderVerified: false, priceComponentsAuthenticated: false,
    userBudgetCapAuthorityVerified: false, reflectionJudgeModelsApproved: false,
    externalCallsAuthorized: false, noActualSpend: true });
}

/** Do not conflate publicly exposed H01-H10 with a new confidential sealed holdout. */
export function makeYeoulPilotReadiness({ privateScreen = null, costQuote = null, reviewIntake = null,
  criteriaDraft = null } = {}) {
  const plan = makeNewYeoulScenarioPlan();
  const criteria = criteriaDraft === null ? null : inspectYeoulPilotPreregistrationDraft(criteriaDraft);
  if (privateScreen !== null && (privateScreen.schemaVersion !== 'yeoul-private-overlap-screen-v1'
      || privateScreen.candidateFamiliesScreened !== 8 || privateScreen.legacyFamiliesScreened !== 12
      || privateScreen.optimizerAdmissionAuthorized !== false)) fail('untrusted_overlap_claim');
  if (costQuote !== null && (costQuote.schemaVersion !== 'yeoul-gepa-cost-quote-v1'
      || costQuote.externalCallsAuthorized !== false || costQuote.priceComponentsAuthenticated !== false)) fail('untrusted_cost_claim');
  if (reviewIntake !== null && (!isObject(reviewIntake) || reviewIntake.schemaVersion !== 'yeoul-offline-review-intake-v1'
      || reviewIntake.count?.rules !== 6 || reviewIntake.count?.examples !== 24
      || reviewIntake.ownerApprovalVerified !== false || reviewIntake.readyForPaidExperiment !== false)) fail('untrusted_review_claim');
  const pending = [
    ...(!privateScreen ? ['private_legacy_overlap_screen'] : []),
    'legacy_source_bytes_authentication', 'independent_human_semantic_review',
    'owner_review_of_30_rule_example_candidates',
    'new_confidential_final_holdout',
    ...(!criteria ? ['pilot_success_stop_nonregression_rules_draft'] : []),
    'owner_review_and_immutable_preregistration_before_trial',
    ...(!costQuote ? ['role_model_provider_price_snapshot_and_attempt_caps'] : []),
    'live_model_endpoint_and_provider_support_verification',
    'independently_authenticated_provider_tariffs',
    'owner_approved_usd_cap_and_authoritative_approval_ledger',
    'paid_gateway_network_isolation_and_receipt_reconciliation',
  ];
  return Object.freeze({ schemaVersion: 'yeoul-gepa-pilot-readiness-v1', characterId: 'yeoul',
    draftFamilyManifestSha256: plan.familyManifestSha256, draftFamilyCounts: plan.splitCounts,
    verifiedHistoricalRatings: false, historicDevelopmentMatrix: { ratings: 288, deepseekRows: 72 },
    legacyRuleReviewRequests: 6, legacyExampleReviewRequests: 24,
    reviewerAuthorityVerified: false, reviewIntakeReceived: reviewIntake !== null,
    lexicalScreenReceived: privateScreen !== null, semanticIndependenceVerified: false,
    costQuoteReceived: costQuote !== null,
    criteriaDraftReceived: criteria !== null,
    criteriaDraftSha256: criteria?.criteriaDraftSha256 ?? null,
    criteriaOwnerApproved: false, criteriaImmutablyPreregistered: false,
    publicPreviouslyExposedBenchmark: { scenarioRuns: 80, studentCalls: 104, confidentialHoldout: false },
    independentFinalEvaluationReady: false, optimizerDatasetReady: false,
    modelIdCandidate: MODEL, roleModelApprovalsVerified: false,
    status: 'blocked_pending_private_review_pricing_and_owner_cap',
    outstanding: pending, paidExecutionReady: false, externalCalls: 0, productionEligible: false });
}
