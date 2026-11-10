import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prepareBenchmarkPreflight, createBlankHumanReviewRows } from './yeoul-benchmark-preflight-v1.mjs';
import { summarizeReviewedComparisons } from './yeoul-offline-optimizer-v1.mjs';
const originalBytes = readFileSync(fileURLToPath(new URL('../docs/yeoul-holdout-scenarios-v1.json', import.meta.url)));
const original = JSON.parse(originalBytes.toString('utf8'));
const altered = edit => { const clone = structuredClone(original); edit(clone); return JSON.stringify(clone); };

test('planned evaluation means 80 scenario runs but 104 actual turn-level model calls', () => {
  const plan = prepareBenchmarkPreflight(originalBytes);
  assert.equal(plan.scenarioCount, 10);
  assert.equal(plan.scenarioRuns, 80);
  assert.equal(plan.studentModelCallsPlanned, 104);
  assert.equal(plan.historicalCostOnly.reliableCostCeilingUsd, null);
  assert.equal(plan.experimentExecution.externalCalls, 0);
  assert.equal(plan.status, 'approval_required_not_executable');
  assert.equal(plan.holdoutSha256.length, 64);
  assert.equal(plan.scenarioTurnCounts.H02, 2);
  assert.equal(plan.scenarioTurnCounts.H05, 2);
  assert.equal(plan.scenarioTurnCounts.H09, 2);
  assert.ok(!JSON.stringify(plan).includes(original.scenarios[0].turns[0]));
});

test('holdout integrity checks reject changed scope, rubric, and fake memory', () => {
  assert.throws(() => prepareBenchmarkPreflight(altered(d => { d.scenarios.pop(); })), /scenario_matrix/);
  assert.throws(() => prepareBenchmarkPreflight(altered(d => { d.evaluationDimensions[2] = 'initiative_flow'; })), /rubric_mismatch/);
  assert.throws(() => prepareBenchmarkPreflight(altered(d => { d.scenarios[0].historyAvailable = true; })), /history_event_scope/);
  assert.throws(() => prepareBenchmarkPreflight(altered(d => { d.scenarios[5].syntheticApprovedEvent.authority = 'user_memory'; })), /synthetic_event_authority/);
  assert.throws(() => prepareBenchmarkPreflight(altered(d => { d.visibility = 'teacher_input'; })), /source_authority/);
});

test('unfilled template creates 80 non-scored slots and cannot be misreported as reviewed', () => {
  const plan = prepareBenchmarkPreflight(originalBytes);
  const blanks = createBlankHumanReviewRows(plan);
  assert.equal(blanks.length, 80);
  assert.ok(blanks.every(r => r.reviewStatus === 'not_collected' && r.evaluationSource === null && r.quality.korean_naturalness === null));
  assert.throws(() => summarizeReviewedComparisons(blanks, {
    datasetRole: 'sealed_holdout_results', expectedScenarioIds: plan.scenarioIds,
    expectedRepeatCount: plan.repeatsPerScenario, expectedCandidateIds: plan.candidateIds,
    expectedHoldoutSha256: plan.holdoutSha256,
  }), /unverified_review_source/);
  assert.notEqual(prepareBenchmarkPreflight(altered(d => { d.scenarios[0].turns[0] += ' '; })).holdoutSha256, plan.holdoutSha256);
});

test('holdout result hash must match the frozen, separately reviewed evaluation plan', () => {
  const plan = prepareBenchmarkPreflight(originalBytes);
  const rows = createBlankHumanReviewRows(plan);
  assert.throws(() => summarizeReviewedComparisons(rows.map((r, i) => ({
    ...r, holdoutSha256: i === 0 ? '0'.repeat(64) : r.holdoutSha256,
  })), {
    datasetRole: 'sealed_holdout_results', expectedScenarioIds: plan.scenarioIds,
    expectedRepeatCount: plan.repeatsPerScenario, expectedCandidateIds: plan.candidateIds,
    expectedHoldoutSha256: plan.holdoutSha256,
  }), /holdout_manifest_mismatch/);
});
