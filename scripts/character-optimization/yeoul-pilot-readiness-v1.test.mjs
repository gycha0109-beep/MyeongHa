import test from 'node:test';
import assert from 'node:assert/strict';
import { screenPrivateYeoulOverlap, quoteYeoulPilotEnvelope, makeYeoulPilotReadiness } from './yeoul-pilot-readiness-v1.mjs';

const legacy = () => Array.from({ length: 12 }, (_, i) => ({
  id: 'Y' + String(i + 1).padStart(2, '0'), turns: ['기존 전용 질문 ' + (i + 1) + ' 원본 대사 개인 자료'],
}));
const role = (modelId = 'synthetic/teacher', providerId = 'fake-provider', attemptsIncludingRetries = 2) => ({
  modelId, providerId, attemptsIncludingRetries,
  pricing: { input: 1000000, output: 2000000, reasoning: 3000000, cacheRead: 0, cacheWrite: 0, fixedMaximumMicroUsd: 10 },
  tokens: { input: 500, output: 100, reasoning: 20, cacheRead: 0, cacheWrite: 0 },
});
const quote = options => quoteYeoulPilotEnvelope({
  priceEvidence: { kind: 'unverified_planning_snapshot', sourceUrl: 'https://example.invalid/synthetic-only', observedAt: '2026-11-11T09:00:00+09:00' },
  roles: { student: role('deepseek/deepseek-v4.1-flash-1017', 'synthetic-student', 10),
    reflection: role('synthetic/reflection', 'synthetic-reflection', 2),
    judge: role('synthetic/judge', 'synthetic-judge', 0),
    holdout: role('deepseek/deepseek-v4.1-flash-1017', 'synthetic-student', 104) },
  ...options,
});

test('draft plan blocks every paid and optimizer admission even with available metadata', () => {
  const x = makeYeoulPilotReadiness();
  assert.equal(x.draftFamilyCounts.development, 4);
  assert.equal(x.draftFamilyCounts.optimizer_validation, 4);
  assert.equal(x.historicDevelopmentMatrix.ratings, 288);
  assert.equal(x.publicPreviouslyExposedBenchmark.studentCalls, 104);
  assert.equal(x.publicPreviouslyExposedBenchmark.confidentialHoldout, false);
  assert.equal(x.paidExecutionReady, false);
  assert.equal(x.externalCalls, 0);
  assert.ok(x.outstanding.includes('owner_approved_usd_cap_and_authoritative_approval_ledger'));
});

test('private legacy lexical screening flags copies and excludes all private raw strings from output', () => {
  const original = legacy();
  original[0].turns = ['제가 잘못 말씀드렸어요. 수현이가 저에게 부탁한 게 아니라 제가 수현이에게 부탁했어요.'];
  const screen = screenPrivateYeoulOverlap(original);
  assert.equal(screen.candidateFamiliesScreened, 8);
  assert.ok(screen.possibleLexicalOverlapCount >= 1);
  assert.equal(screen.possibleOverlaps[0].possibleLexicalOverlap, true);
  assert.equal(screen.optimizerAdmissionAuthorized, false);
  assert.equal(screen.independentSemanticReviewVerified, false);
  assert.equal(JSON.stringify(screen).includes(original[0].turns[0]), false);
  assert.ok(screen.possibleOverlaps.every(x => x.manualSemanticReviewRequired));
});

test('no lexical hits never turns into evidence of semantic independence', () => {
  const screen = screenPrivateYeoulOverlap(legacy());
  assert.equal(screen.possibleLexicalOverlapCount, 0);
  const readiness = makeYeoulPilotReadiness({ privateScreen: screen });
  assert.equal(readiness.lexicalScreenReceived, true);
  assert.equal(readiness.semanticIndependenceVerified, false);
  assert.equal(readiness.paidExecutionReady, false);
});

test('private input must contain twelve unique valid family IDs', () => {
  assert.throws(() => screenPrivateYeoulOverlap(legacy().slice(1)), /private_legacy_twelve_required/);
  const data = legacy(); data[1].id = 'Y01';
  assert.throws(() => screenPrivateYeoulOverlap(data), /private_legacy_shape/);
  const missing = legacy(); missing[0].turns = [];
  assert.throws(() => screenPrivateYeoulOverlap(missing), /private_legacy_shape/);
});

test('all four roles are priced, retries count, and micro-USD ceiling uses conservative integer rounding', () => {
  const cost = quote({ proposedUsdCapMicro: 100000 });
  assert.equal(cost.roles.student.worstPerAttemptMicroUsd, '770');
  assert.equal(cost.roles.holdout.attemptsIncludingRetries, 104);
  assert.equal(cost.worstTotalMicroUsd, String(770 * (10 + 2 + 104)));
  assert.equal(cost.quoteFitsProposedCap, true);
  assert.equal(cost.rateSourceProviderVerified, false);
  assert.equal(cost.externalCallsAuthorized, false);
  const failCap = quote({ proposedUsdCapMicro: 10 });
  assert.equal(failCap.quoteFitsProposedCap, false);
  assert.equal(failCap.userBudgetCapAuthorityVerified, false);
});

test('unknown role model, incomplete prices and wrong student identity cannot be silently accepted', () => {
  const roles = { student: role('deepseek/deepseek-v4.1-flash-1017'), reflection: role(), judge: role(), holdout: role() };
  delete roles.judge;
  assert.throws(() => quote({ roles }), /model_price_snapshot_required/);
  roles.judge = role(); roles.student.modelId = 'mismatched-model';
  assert.throws(() => quote({ roles }), /student_model_changed/);
  roles.student.modelId = 'deepseek/deepseek-v4.1-flash-1017';
  delete roles.reflection.pricing.reasoning;
  assert.throws(() => quote({ roles }), /role_pricing_shape/);
});

test('review intake checkbox or forged paid authority can never grant approval', () => {
  const cost = quote({ proposedUsdCapMicro: 100000 });
  const screen = screenPrivateYeoulOverlap(legacy());
  const claimedReview = { schemaVersion: 'yeoul-offline-review-intake-v1', count: { rules: 6, examples: 24 },
    ownerApprovalVerified: false, readyForPaidExperiment: false };
  const readiness = makeYeoulPilotReadiness({ privateScreen: screen, costQuote: cost, reviewIntake: claimedReview });
  assert.equal(readiness.reviewIntakeReceived, true);
  assert.equal(readiness.costQuoteReceived, true);
  assert.equal(readiness.paidExecutionReady, false);
  assert.throws(() => makeYeoulPilotReadiness({ reviewIntake: { ...claimedReview, ownerApprovalVerified: true } }), /untrusted_review_claim/);
  assert.throws(() => makeYeoulPilotReadiness({ costQuote: { ...cost, externalCallsAuthorized: true } }), /untrusted_cost_claim/);
  assert.throws(() => makeYeoulPilotReadiness({ privateScreen: { ...screen, optimizerAdmissionAuthorized: true } }), /untrusted_overlap_claim/);
});
