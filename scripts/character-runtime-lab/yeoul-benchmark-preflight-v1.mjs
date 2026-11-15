/** Offline, zero-call benchmark manifest. A manifest never authorizes an experiment. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeApprovalEstimate, REVIEW_DIMENSIONS, HARD_FAILURES } from './yeoul-offline-optimizer-v1.mjs';

export const BENCHMARK_CANDIDATES = Object.freeze(['baseline', 'language_rules', 'conversation_examples', 'hybrid']);
const SCENARIO_IDS = Object.freeze(Array.from({ length: 10 }, (_, i) => 'H' + String(i + 1).padStart(2, '0')));
const allowedStages = new Set(['first_contact', 'no_history', 'acquaintance', 'friend', 'trusted_partner']);
const nonempty = x => typeof x === 'string' && x.trim().length > 0;
const isObject = x => !!x && typeof x === 'object' && !Array.isArray(x);
const invalid = reason => { throw new Error('YEOUL_HOLDOUT_PREFLIGHT_INVALID: ' + reason); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function prepareBenchmarkPreflight(holdoutBytes) {
  if (typeof holdoutBytes !== 'string' && !Buffer.isBuffer(holdoutBytes)) invalid('input_required');
  const bytes = Buffer.from(holdoutBytes);
  let source;
  try { source = JSON.parse(bytes.toString('utf8')); } catch { invalid('invalid_json'); }
  if (!isObject(source) || source.schemaVersion !== 'yeoul-holdout-design-v1' ||
    source.role !== 'held_out_evaluation_only' || source.visibility !== 'excluded_from_teacher_prompts_and_optimization' ||
    source.source !== 'new_synthetic_scenarios_not_from_288_user_ratings' ||
    source.authority !== 'synthetic_only_not_relationship_or_memory_facts') invalid('source_authority');
  if (!same(source.evaluationDimensions, [...REVIEW_DIMENSIONS, 'latency_cost']) ||
      !same(source.hardFailureDimensions, HARD_FAILURES)) invalid('rubric_mismatch');
  if (!Array.isArray(source.scenarios) || !same(source.scenarios.map(s => s?.id), SCENARIO_IDS)) invalid('scenario_matrix');
  const turnCounts = [];
  for (const scenario of source.scenarios) {
    if (!isObject(scenario) || !allowedStages.has(scenario.relationshipStage) ||
      typeof scenario.historyAvailable !== 'boolean' || !Array.isArray(scenario.turns) ||
      scenario.turns.length < 1 || scenario.turns.length > 5 || scenario.turns.some(t => !nonempty(t)) ||
      !Array.isArray(scenario.focus) || !scenario.focus.length || scenario.focus.some(f => !nonempty(f))) invalid('scenario_shape');
    const event = scenario.syntheticApprovedEvent;
    if (scenario.historyAvailable !== !!event) invalid('history_event_scope');
    if (event && (!isObject(event) || event.authority !== 'test_fixture_only' || !nonempty(event.type))) invalid('synthetic_event_authority');
    turnCounts.push(scenario.turns.length);
  }
  const estimate = makeApprovalEstimate({
    newScenarios: SCENARIO_IDS.length, candidateVariants: BENCHMARK_CANDIDATES.length,
    repeatCount: 2, turnsPerScenario: turnCounts,
  });
  return {
    schemaVersion: 'yeoul-benchmark-preflight-v1',
    status: 'approval_required_not_executable',
    holdoutSha256: createHash('sha256').update(bytes).digest('hex'),
    datasetRole: 'sealed_holdout_results',
    scenarioIds: [...SCENARIO_IDS], scenarioCount: SCENARIO_IDS.length,
    candidateIds: [...BENCHMARK_CANDIDATES], repeatsPerScenario: 2,
    modelId: 'deepseek/deepseek-v4.1-flash-1017',
    scenarioTurnCounts: Object.fromEntries(SCENARIO_IDS.map((id, i) => [id, turnCounts[i]])),
    scenarioRuns: estimate.scenarioRuns, studentModelCallsPlanned: estimate.proposedCalls,
    historicalCostOnly: {
      ratePerCallUsd: estimate.observedHistoricalCostPerCallUsd,
      indicativeStudentCostUsd: estimate.indicativeCostAtHistoricalRateUsd,
      reliableCostCeilingUsd: null,
    },
    experimentExecution: { externalCalls: 0, approvalRecorded: false, productionChanges: false, retriesIncluded: false, teacherOrGraderIncluded: false },
    requiredBeforePaidExecution: ['user_approved_provider_and_model', 'user_approved_total_usd_cap',
      'user_approved_call_limit_and_abort_conditions', 'separate_teacher_grader_retry_budget',
      'validated_private_nonproduction_inputs', 'reviewed_frozen_candidate_prompts'],
    integrity: 'Only metadata and a SHA-256 of holdout bytes are emitted, never scenario text or private answers.',
  };
}

/** Empty cells are intentionally not accepted by the human-reviewed comparison aggregator. */
export function createBlankHumanReviewRows(manifest) {
  if (!isObject(manifest) || manifest.schemaVersion !== 'yeoul-benchmark-preflight-v1' ||
    manifest.status !== 'approval_required_not_executable' || manifest.datasetRole !== 'sealed_holdout_results' ||
    !Array.isArray(manifest.scenarioIds) || !same(manifest.scenarioIds, SCENARIO_IDS) ||
    !same(manifest.candidateIds, BENCHMARK_CANDIDATES) || manifest.repeatsPerScenario !== 2 ||
    !/^[a-f0-9]{64}$/.test(manifest.holdoutSha256)) invalid('manifest_identity');
  return manifest.candidateIds.flatMap(candidateId => manifest.scenarioIds.flatMap(scenarioId =>
    [1, 2].map(repeat => ({
      candidateId, scenarioId, repeat, datasetRole: 'sealed_holdout_results',
      holdoutSha256: manifest.holdoutSha256,
      evaluationSource: null, reviewRef: null, reviewStatus: 'not_collected',
      quality: Object.fromEntries(REVIEW_DIMENSIONS.map(k => [k, null])),
      hardFailures: Object.fromEntries(HARD_FAILURES.map(k => [k, null])),
      elapsedMs: null, providerReportedCostUsd: null,
    }))));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceFile = process.argv[2] ?? 'docs/character-runtime-lab/yeoul-holdout-scenarios-v1.json';
  try { console.log(JSON.stringify(prepareBenchmarkPreflight(readFileSync(sourceFile)), null, 2)); }
  catch (err) { console.error(err instanceof Error ? err.message : 'YEOUL_HOLDOUT_PREFLIGHT_FAILED'); process.exitCode = 1; }
}
