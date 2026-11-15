/** Research-only, zero-network per-turn manifest. No input prompts or outputs are emitted. */
const MODEL = 'deepseek/deepseek-v4.1-flash-1017';
const CANDIDATES = Object.freeze(['baseline', 'language_rules', 'conversation_examples', 'hybrid']);
const QUESTIONS = Object.freeze(Array.from({ length: 10 }, (_, i) => `H${String(i + 1).padStart(2, '0')}`));
const TURN_COUNTS = Object.freeze(Object.fromEntries(QUESTIONS.map(id => [id, ['H02', 'H05', 'H09'].includes(id) ? 2 : 1])));
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const validSha = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const fail = x => { throw new Error(`YEOUL_TURN_LEDGER_INVALID: ${x}`); };
const key = (candidateId, scenarioId, repeat, turn) => `${candidateId}|${scenarioId}|${repeat}|${turn}`;

const validate = manifest => {
  if (!isObject(manifest) || manifest.schemaVersion !== 'yeoul-benchmark-preflight-v1' ||
    manifest.status !== 'approval_required_not_executable' || manifest.datasetRole !== 'sealed_holdout_results' ||
    !validSha(manifest.holdoutSha256) || manifest.modelId !== MODEL ||
    !same(manifest.candidateIds, CANDIDATES) || !same(manifest.scenarioIds, QUESTIONS) ||
    !same(manifest.scenarioTurnCounts, TURN_COUNTS) || manifest.repeatsPerScenario !== 2 ||
    manifest.scenarioCount !== 10 || manifest.scenarioRuns !== 80 ||
    manifest.studentModelCallsPlanned !== 104 ||
    manifest.experimentExecution?.externalCalls !== 0 ||
    manifest.experimentExecution?.approvalRecorded !== false ||
    manifest.experimentExecution?.productionChanges !== false) fail('unapproved_or_changed_preflight');
};

export function buildYeoulTurnLedger(manifest) {
  validate(manifest);
  const steps = [];
  for (const scenarioId of QUESTIONS) for (const repeat of [1, 2]) for (const candidateId of CANDIDATES) {
    for (let turn = 1; turn <= TURN_COUNTS[scenarioId]; turn++) {
      steps.push({ candidateId, scenarioId, repeat, turn, stepKey: key(candidateId, scenarioId, repeat, turn),
        previousStepKey: turn === 1 ? null : key(candidateId, scenarioId, repeat, turn - 1),
        evaluationSplit: 'sealed_holdout_results', holdoutSha256: manifest.holdoutSha256,
        modelId: MODEL, status: 'not_executed' });
    }
  }
  if (steps.length !== 104 || new Set(steps.map(s => s.stepKey)).size !== 104) fail('incomplete_turn_matrix');
  return {
    schemaVersion: 'yeoul-turn-ledger-v1', datasetRole: 'sealed_holdout_results',
    holdoutSha256: manifest.holdoutSha256, modelId: MODEL,
    scenarioRuns: 80, turnLevelCallsPlanned: 104,
    approvalRecorded: false, paidExecutionReady: false, externalCalls: 0,
    reviewerDecisionsCounted: 0, qualityGainEstablished: false, sourceAuthenticityVerified: false,
    status: 'unexecuted_structure_only', steps,
  };
}

/** Validate future private results without importing the sealed holdout into optimization. */
export function verifyYeoulTurnEvidence(manifest, results, { reviewedPromptHashes } = {}) {
  const plan = buildYeoulTurnLedger(manifest);
  if (!Array.isArray(results) || !isObject(reviewedPromptHashes) ||
    !same(Object.keys(reviewedPromptHashes).sort(), [...CANDIDATES].sort()) ||
    Object.values(reviewedPromptHashes).some(x => !validSha(x)) ||
    new Set(Object.values(reviewedPromptHashes)).size !== CANDIDATES.length) fail('frozen_reviewed_prompts_required');
  const slots = new Map(plan.steps.map(s => [s.stepKey, s]));
  const found = new Map();
  for (const r of results) {
    if (!isObject(r) || typeof r.stepKey !== 'string' || !slots.has(r.stepKey) || found.has(r.stepKey)) fail('unknown_or_duplicate_step');
    const expected = slots.get(r.stepKey);
    if (['candidateId','scenarioId','repeat','turn','previousStepKey','modelId','holdoutSha256'].some(f => r[f] !== expected[f]) ||
      r.datasetRole !== 'sealed_holdout_results' || r.status !== 'success' ||
      r.promptSha256 !== reviewedPromptHashes[r.candidateId] || r.providerFallbackUsed !== false ||
      !Number.isFinite(r.elapsedMs) || r.elapsedMs < 0 || !Number.isFinite(r.providerReportedCostUsd) ||
      r.providerReportedCostUsd < 0 || typeof r.reply !== 'string' || !r.reply.trim() || r.reply.length > 1500) fail('unverified_turn_result');
    found.set(r.stepKey, r);
  }
  if (found.size !== plan.steps.length) fail('incomplete_turn_matrix');
  let totalCost = 0, totalLatency = 0;
  for (const step of plan.steps) {
    const r = found.get(step.stepKey);
    if (step.previousStepKey && !found.has(step.previousStepKey)) fail('missing_prior_turn');
    totalCost += r.providerReportedCostUsd;
    totalLatency += r.elapsedMs;
  }
  return {
    schemaVersion: 'yeoul-turn-evidence-check-v1',
    datasetRole: 'sealed_holdout_results', holdoutSha256: manifest.holdoutSha256,
    validatedScenarioRuns: 80, validatedTurnResponses: 104,
    observedReportedCostUsd: totalCost, observedMeanTurnLatencyMs: totalLatency / 104,
    qualityReviewed: false, qualityGainEstablished: false, productionEligible: false,
    promptReviewClaimsNotAuthenticated: true, providerReceiptsAuthenticated: false,
    multiTurnContextProvenanceVerified: false,
    candidateComparison: 'not_performed',
  };
}
