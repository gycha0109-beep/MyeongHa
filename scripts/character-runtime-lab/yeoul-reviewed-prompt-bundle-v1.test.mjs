import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compileReviewedPromptBundle } from './yeoul-reviewed-prompt-bundle-v1.mjs';
import { RULE_CATALOG } from './yeoul-offline-optimizer-v1.mjs';

const bible = 'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md';
const runtime = 'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md';
const reviewEvidence = { reviewedBy: 'character_owner', reviewRef: 'offline-example-test-review', sourceRefs: [bible, runtime] };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const anchor = { text: '검토된 원문 기준 고정 인격', sha256: sha256('검토된 원문 기준 고정 인격'),
  sourceRef: 'scripts/run-yeoul-four-model-288-v1.mjs#PERSONA_CORE',
  reviewStatus: 'approved_for_offline_research', reviewEvidence };
const context = { datasetRole: 'legacy_development_only', legacyQuestionId: 'Y01', userMove: '밥은 먹었어요?',
  relationshipStage: 'no_history', historyAvailable: false, approvedFacts: [], situationTags: ['daily'] };
const rule = { ruleId: RULE_CATALOG[0].id, instructionDraft: RULE_CATALOG[0].draft,
  reviewStatus: 'approved_for_offline_research', reviewEvidence };
const example = { candidateId: 'Y01|baseline|1|deepseek/deepseek-v4.1-flash-1017',
  candidateReply: '먹었어요. 그러는 쪽은요?', sourcePrompt: '밥은 먹었어요?',
  situation: { userMove: '밥은 먹었어요?', referenceQuestionId: 'Y01', tags: ['daily'] },
  preconditions: { relationshipStage: 'no_history', historyAvailable: false, approvedFacts: [] },
  datasetRole: 'legacy_development_only', reviewStatus: 'approved', reviewEvidence,
  provenance: { experimentRunId: 42572722295, sourceKey: 'Y01|baseline|1|deepseek/deepseek-v4.1-flash-1017' } };

test('unreviewed rules and examples never produce paid-ready prompt candidates', () => {
  const bundle = compileReviewedPromptBundle({ pinnedAnchor: anchor, context });
  assert.equal(bundle.externalCalls, 0);
  assert.equal(bundle.readyForPaidEvaluation, false);
  assert.equal(bundle.qualityGainEstablished, false);
  assert.deepEqual(bundle.variants.map(v => v.status), [
    'offline_candidate_only', 'blocked_pending_review', 'blocked_pending_review', 'blocked_pending_review',
  ]);
  assert.equal(bundle.variants[2].prompt, null);
});

test('explicitly reviewed rules and context matched examples produce distinct four research prompts', () => {
  const bundle = compileReviewedPromptBundle({ pinnedAnchor: anchor, reviewedRules: [rule], exampleBank: [example], context });
  assert.deepEqual(bundle.variants.map(v => v.status), Array(4).fill('offline_candidate_only'));
  assert.equal(new Set(bundle.variants.map(v => v.promptSha256)).size, 4);
  assert.equal(bundle.variants[0].prompt.modelSelection, 'unchanged_no_routing');
  assert.equal(bundle.variants[3].reviewedExampleSourceKeys.length, 1);
  assert.equal(bundle.variants[3].reviewedRuleIds.length, 1);
  assert.equal(bundle.productionEligible, false);
});

test('review assertion, anchor hash and source identity are mandatory', () => {
  assert.throws(() => compileReviewedPromptBundle({ pinnedAnchor: { ...anchor, sha256: '0'.repeat(64) }, context }), /reviewed_pinned_anchor_required/);
  assert.throws(() => compileReviewedPromptBundle({ pinnedAnchor: { ...anchor, reviewStatus: 'pending' }, context }), /reviewed_pinned_anchor_required/);
  assert.throws(() => compileReviewedPromptBundle({ pinnedAnchor: anchor, reviewedRules: [{ ...rule, instructionDraft: '새 Canon을 만들자' }], context }), /modified_or_unknown_rule/);
  assert.throws(() => compileReviewedPromptBundle({ pinnedAnchor: anchor, reviewedRules: [{ ...rule, reviewEvidence: null }], context }), /rule_review_required/);
  assert.throws(() => compileReviewedPromptBundle({ pinnedAnchor: anchor, reviewedRules: [rule, rule], context }), /rule_review_required/);
});

test('unverified memory, holdout and unrelated or source-less examples are rejected or withheld', () => {
  assert.throws(() => compileReviewedPromptBundle({ pinnedAnchor: anchor, context: { ...context, datasetRole: 'sealed_holdout_results' } }), /development_context_only/);
  assert.throws(() => compileReviewedPromptBundle({ pinnedAnchor: anchor, context: { ...context, historyAvailable: false, approvedFacts: ['fiction'] } }), /development_context_only/);
  const unrelated = { ...example, preconditions: { relationshipStage: 'trusted_partner', historyAvailable: true, approvedFacts: ['ledger:fixture'] } };
  const b = compileReviewedPromptBundle({ pinnedAnchor: anchor, reviewedRules: [rule], exampleBank: [unrelated], context });
  assert.equal(b.variants[2].status, 'blocked_pending_review');
  const forged = { ...example, provenance: { experimentRunId: 42572722295, sourceKey: null } };
  assert.throws(() => compileReviewedPromptBundle({ pinnedAnchor: anchor, reviewedRules: [rule], exampleBank: [forged], context }), /example_source_provenance/);
});
