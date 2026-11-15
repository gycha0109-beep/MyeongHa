import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, VARIANTS, transformForOffline } from './yeoul-quality-offline-v1.mjs';
import { proposeFeedbackRevisions, createOptimizationPreflight, summarizeReviewedComparisons, makeApprovalEstimate, stageTeacherSuggestion, REVIEW_DIMENSIONS, HARD_FAILURES } from './yeoul-offline-optimizer-v1.mjs';
function fixture() {
  const responses = [];
  for (let question = 1; question <= 12; question++) for (const model of MODELS) for (const variant of VARIANTS) for (const repeat of [1, 2]) {
    responses.push({ id: 'Y' + String(question).padStart(2, '0'), input: '가상 테스트 ' + question, repeat, variant, model,
      reply: '가상 응답', elapsedMs: 10, inputTokens: 1, outputTokens: 2, reasoningTokens: 0, providerReportedCostUsd: 0,
      returnedModel: model, evaluation: { rating: 'good', source: 'synthetic-fixture' }, questionDiscrimination: null, groupNote: '' });
  }
  responses[0].evaluation = { rating: 'fiction', source: 'synthetic-fixture', note: '없는 기억' };
  responses[1].evaluation = { rating: 'good', source: 'synthetic-fixture', details: ['register'] };
  return {schemaVersion: 'yeoul-evaluation-export-v1', experimentRunId: 42572722295, scope: 'all-288',
    sourceExperiment: { models: [...MODELS], variants: [...VARIANTS], attemptedCalls: 288, successfulCalls: 288, providerReportedCostUsd: 0 },
    responses, surveyState: { answers: {}, groups: {} } };
}
test('historical 288 ratings suggest only offline unreviewed corrections without relabeling', () => {
  const data = fixture();
  const original = JSON.stringify(data);
  const transformed = transformForOffline(data);
  const suggestions = proposeFeedbackRevisions(transformed.records);
  assert.equal(JSON.stringify(data), original);
  assert.equal(suggestions.sourceScope.responses, 288);
  assert.equal(suggestions.qualityGainEstablished, false);
  const history = suggestions.proposals.find(p => p.diagnosticTag === 'unverified_fact_or_memory');
  assert.equal(history.evidenceCounts.userRating, 1);
  assert.equal(history.evidenceCounts.noteHeuristicUnconfirmed, 1);
  assert.ok(suggestions.proposals.every(p => p.reviewStatus.startsWith('pending')));
  assert.throws(() => proposeFeedbackRevisions(transformed.records.slice(1)), /legacy_development_matrix_required/);
});
test('preflight enumerates plans without authorizing calls or model changes', () => {
  const suggestions = proposeFeedbackRevisions(transformForOffline(fixture()).records);
  const pack = createOptimizationPreflight({ proposalPack: suggestions, selectedRuleIds: [suggestions.proposals[0].ruleId] });
  assert.equal(pack.externalCalls, 0);
  assert.equal(pack.candidateVariants.length, 4);
  assert.equal(pack.userApprovalRequiredBeforePaidCalls, true);
  assert.equal(pack.runtime.deepSeekRoutingChange, false);
  assert.throws(() => createOptimizationPreflight({ proposalPack: suggestions, selectedRuleIds: ['not-from-proposals'] }), /unknown_rule/);
});
function review(candidateId, scenarioId, overrides = {}) {
  return {
    candidateId, scenarioId, datasetRole: 'sealed_holdout_results',
    evaluationSource: 'human_review', reviewRef: 'synthetic-manual-review-id',
    quality: Object.fromEntries(REVIEW_DIMENSIONS.map(k => [k, 'pass'])),
    hardFailures: Object.fromEntries(HARD_FAILURES.map(k => [k, false])),
    elapsedMs: 1200, providerReportedCostUsd: 0.0002,
    ...overrides,
  };
}
test('independent holdout aggregates explicit human judgments; never selects a winner', () => {
  const rows = [review('baseline','H01'), review('baseline','H02'), review('hybrid','H01', { hardFailures: { ...review('hybrid','H01').hardFailures, fabricated_shared_memory: true } }), review('hybrid','H02')];
  const result = summarizeReviewedComparisons(rows, { datasetRole: 'sealed_holdout_results', expectedScenarioIds: ['H01','H02'] });
  assert.equal(result.automaticWinner, null);
  assert.equal(result.candidateOptimizationAllowed, false);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[1].hardGatePassed, false);
  assert.equal(result.candidates[1].hardFailures.fabricated_shared_memory, 1);
});
test('reject unreviewed, duplicate or incomplete evaluations and split leaks', () => {
  const a = review('baseline','H01');
  const opts = {datasetRole:'sealed_holdout_results', expectedScenarioIds:['H01']};
  assert.throws(() => summarizeReviewedComparisons([{...a, evaluationSource:'automatic'}], opts), /unverified_review_source/);
  assert.throws(() => summarizeReviewedComparisons([a,a], opts), /duplicate_case/);
  assert.throws(() => summarizeReviewedComparisons([a], {...opts, expectedScenarioIds:['H01','H02']}), /incomplete_case_matrix/);
  assert.throws(() => summarizeReviewedComparisons([a], {...opts, datasetRole:'development_review_results'}), /holdout_leak_into_development/);
  assert.throws(() => summarizeReviewedComparisons([{...a, quality:{}}],opts), /quality_axes/);
  assert.throws(() => summarizeReviewedComparisons([{...a, hardFailures:{}}],opts), /hard_gate_unrated/);
  assert.throws(() => summarizeReviewedComparisons([a], {...opts, expectedScenarioIds:['Y12']}), /holdout_scenario_scope/);
});
test('planning estimate is an observation-based reference, not a spending authorization', () => {
  const estimate = makeApprovalEstimate({newScenarios:10,candidateVariants:4,repeatCount:2});
  assert.equal(estimate.proposedCalls,80);
  assert.equal(estimate.reliableCostCeilingUsd,null);
  assert.equal(estimate.role,'planning_only_no_authorization');
});

test('teacher output remains a proposal; no invented facts, memory, or relationship escalation', () => {
  const input = transformForOffline(fixture()).teacherInputs[0];
  const output = {
    action: 'state_boundary', suggested_reply: '그건 좀 싫어요. 말은 할 수 있잖아요.',
    corrections: ['단호하고 짧은 경계 표현'], violations: [],
    source_refs: ['docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'],
    facts_claimed: [], uses_shared_history: false, implies_romantic_relationship: false,
  };
  const candidate = stageTeacherSuggestion({ teacherInput: input, teacherOutput: output });
  assert.equal(candidate.status, 'pending_character_owner_review');
  assert.equal(candidate.productionEligible, false);
  assert.throws(() => stageTeacherSuggestion({ teacherInput: input, teacherOutput: {...output, uses_shared_history: true} }), /teacher_unverified_history/);
  assert.throws(() => stageTeacherSuggestion({ teacherInput: input, teacherOutput: {...output, facts_claimed: ['memory:forged']} }), /teacher_unapproved_fact/);
  assert.throws(() => stageTeacherSuggestion({ teacherInput: input, teacherOutput: {...output, action: 'invent_new_canon'} }), /teacher_action/);
  assert.throws(() => stageTeacherSuggestion({ teacherInput: {...input, scenario: {...input.scenario, split: 'sealed_holdout_results'} }, teacherOutput: output }), /teacher_training_split/);
});

test('planned 10-scenario, four-candidate, two-repeat holdout produces all 80 matched reviews', () => {
  const ids = Array.from({length: 10}, (_, i) => 'H' + String(i + 1).padStart(2, '0'));
  const variants = ['baseline', 'language_rules', 'conversation_examples', 'hybrid'];
  const rows = variants.flatMap(candidateId => ids.flatMap(scenarioId => [1, 2].map(repeat =>
    review(candidateId, scenarioId, {repeat, reviewRef: `${candidateId}-${scenarioId}-${repeat}`}))));
  const candidateFailure = rows.find(x => x.candidateId === 'hybrid' && x.scenarioId === 'H03' && x.repeat === 2);
  candidateFailure.hardFailures.fabricated_shared_memory = true;
  const candidateNaturalness = rows.find(x => x.candidateId === 'hybrid' && x.scenarioId === 'H02' && x.repeat === 1);
  candidateNaturalness.quality.korean_naturalness = 'fail';
  const result = summarizeReviewedComparisons(rows, {
    datasetRole: 'sealed_holdout_results', expectedScenarioIds: ids, expectedRepeatCount: 2,
    expectedCandidateIds: variants,
  });
  assert.equal(rows.length, 80);
  assert.equal(result.expectedCasesPerCandidate, 20);
  assert.equal(result.candidates.length, 4);
  assert.ok(result.candidates.every(c => c.cases === 20 && c.repeatsPerScenario === 2));
  assert.equal(result.candidates.find(c => c.id === 'hybrid').hardGatePassed, false);
  const paired = result.pairedAgainstBaseline.find(c => c.candidateId === 'hybrid');
  assert.equal(paired.matchedCases, 20);
  assert.equal(paired.hardGateRegressions, 1);
  assert.equal(paired.quality.korean_naturalness.baselineOnlyPass, 1);
  assert.equal(result.qualityGainEstablished, false);
  assert.equal(result.automaticWinner, null);
});

test('holdout comparison rejects missing or duplicate repeats and cherry-picked candidate sets', () => {
  const opts = {datasetRole: 'sealed_holdout_results', expectedScenarioIds:['H01'],
    expectedRepeatCount: 2, expectedCandidateIds: ['baseline', 'hybrid']};
  const valid = [review('baseline', 'H01', { repeat: 1 }), review('baseline', 'H01', { repeat: 2 }),
    review('hybrid', 'H01', { repeat: 1 }), review('hybrid', 'H01', { repeat: 2 })];
  assert.equal(summarizeReviewedComparisons(valid, opts).expectedCasesPerCandidate, 2);
  assert.throws(() => summarizeReviewedComparisons(valid.slice(0, 3), opts), /incomplete_case_matrix/);
  assert.throws(() => summarizeReviewedComparisons([...valid, valid[0]], opts), /duplicate_case/);
  assert.throws(() => summarizeReviewedComparisons(valid.filter(r => r.candidateId === 'baseline'), opts), /missing_candidate/);
  assert.throws(() => summarizeReviewedComparisons([{...valid[0], repeat: 3}, ...valid.slice(1)], opts), /repeat_scope/);
  assert.throws(() => summarizeReviewedComparisons([{...valid[0], repeat: undefined}, ...valid.slice(1)], opts), /repeat_required/);
  assert.throws(() => summarizeReviewedComparisons([...valid, review('unplanned', 'H01', { repeat: 1 })], opts), /unexpected_candidate/);
});
