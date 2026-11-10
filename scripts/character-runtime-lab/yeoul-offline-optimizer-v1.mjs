/** Research-only, deterministic preflight. No inference provider, API key or remote I/O. */

const BIBLE = 'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md';
const RUNTIME = 'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md';
export const REVIEW_DIMENSIONS = Object.freeze([
  'korean_naturalness', 'character_action', 'initiative_and_flow',
  'brevity_and_repetition', 'relationship_fit',
]);
export const HARD_FAILURES = Object.freeze([
  'fabricated_shared_memory', 'canon_or_privacy_violation',
  'unsupported_relationship_escalation',
]);
export const RULE_CATALOG = Object.freeze([
  {
    tag: 'korean_naturalness', id: 'ko-natural',
    draft: '한국어 문장 성분과 화자 지시를 자연스럽게 유지하세요. 답이 어색하면 짧고 일상적인 한국어로 다시 구성하세요.',
  },
  {
    tag: 'politeness_register', id: 'ko-register',
    draft: '여울의 기본 화법은 자연스러운 존댓말입니다. 친밀해 보이기 위해 갑자기 반말로 바꾸지 마세요.',
  },
  {
    tag: 'speaker_context', id: 'context-speaker',
    draft: '사용자와 여울의 발화 주체를 구분하고, 실제로 제시된 말에만 답하세요. 사용자에게 없는 발언을 덧붙이지 마세요.',
  },
  {
    tag: 'unverified_fact_or_memory', id: 'history-truth',
    draft: '승인된 사건과 관계 이력에 없는 만남·질투·고백·과거 약속을 공동 기억처럼 말하지 마세요. 사용자 주장도 검증 전에는 과거 사실이 아닙니다.',
  },
  {
    tag: 'excessive_aggression', id: 'conflict-boundary',
    draft: '새침함은 무례함이 아닙니다. 갈등에는 짧게 입장을 밝히되 상대를 공격하거나 불필요하게 쏘아붙이지 마세요.',
  },
  {
    tag: 'excessive_softness', id: 'no-counselor',
    draft: '모든 대화를 감성 상담처럼 포장하지 마세요. 상황에 먼저 구체적으로 반응하고, 관심은 설명보다 필요한 행동으로 표현하세요.',
  },
  {
    tag: 'character_behavior', id: 'action-before-confession',
    draft: '여울은 반응이 빠르고 행동에서 관심이 먼저 새어 나올 수 있습니다. 민망함은 상황이 성립할 때만 드러내며 상투적 부정을 반복하지 마세요.',
  },
  {
    tag: 'relationship_boundary', id: 'relationship-grounded',
    draft: '관계 단계·실제 사건이 확인되지 않으면 애착·질투·고백·스킨십·특별 대우를 사실처럼 끌어올리지 마세요.',
  },
  {
    tag: 'low_distinctiveness', id: 'concrete-personality',
    draft: '질문을 그대로 돌려주거나 무난한 동의로 끝내지 마세요. 질문에 먼저 답하고 여울의 관심·판단·행동 중 상황에 맞는 하나를 드러내세요.',
  },
  {
    tag: 'verbosity_repetition', id: 'concise-variety',
    draft: '매번 같은 츤데레 감탄사·해명·미사여구를 반복하지 말고, 필요한 길이와 질문 수를 상황에 맞게 줄이세요.',
  },
]);
const nonempty = x => typeof x === 'string' && x.trim().length > 0;
const isObject = x => !!x && typeof x === 'object' && !Array.isArray(x);
const asNumber = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const invalid = reason => { throw new Error('YEOUL_OFFLINE_OPTIMIZATION_INVALID: ' + reason); };

export function proposeFeedbackRevisions(records, { limit = 6 } = {}) {
  if (!Array.isArray(records) || records.length !== 288) invalid('legacy_development_matrix_required');
  if (!Number.isInteger(limit) || limit < 1 || limit > RULE_CATALOG.length) invalid('limit');
  const evidence = Object.fromEntries(RULE_CATALOG.map(r => [r.tag, { userRating: 0, userDetail: 0, noteHeuristicUnconfirmed: 0 }]));
  for (const record of records) {
    if (!isObject(record) || !isObject(record.source) || !isObject(record.diagnostic) || !Array.isArray(record.diagnostic.evidence)) invalid('record_shape');
    if (!['negative_user_rating', 'positive_with_caveat', 'clean_positive_candidate'].includes(record.diagnostic.classification)) invalid('record_classification');
    for (const item of record.diagnostic.evidence) {
      if (!isObject(item) || !nonempty(item.tag) || !nonempty(item.origin)) invalid('diagnostic_shape');
      const counts = evidence[item.tag];
      if (!counts) continue;
      if (item.origin === 'user_rating') counts.userRating++;
      else if (item.origin === 'user_detail') counts.userDetail++;
      else if (item.origin === 'note_heuristic_unconfirmed') counts.noteHeuristicUnconfirmed++;
      else invalid('untrusted_evidence_origin');
    }
  }
  const candidates = RULE_CATALOG.map(rule => {
    const counts = evidence[rule.tag];
    const confirmedSignals = counts.userRating + counts.userDetail;
    return {
      ruleId: rule.id, diagnosticTag: rule.tag,
      instructionDraft: rule.draft,
      evidenceCounts: counts, reviewStatus: 'pending_character_owner_review',
      sourceAuthorityRefs: [BIBLE, RUNTIME],
      sourceRole: 'historical_observation_not_causal_prompt_effect',
      confirmedSignals,
    };
  }).filter(candidate => candidate.confirmedSignals > 0 || candidate.evidenceCounts.noteHeuristicUnconfirmed > 0)
    .sort((a, b) => b.confirmedSignals - a.confirmedSignals || b.evidenceCounts.noteHeuristicUnconfirmed - a.evidenceCounts.noteHeuristicUnconfirmed || a.ruleId.localeCompare(b.ruleId))
    .slice(0, limit);
  return {
    schemaVersion: 'yeoul-feedback-revision-proposals-v1',
    datasetRole: 'legacy_development_only',
    qualityGainEstablished: false,
    sourceScope: { experimentRunId: 42572722295, responses: 288 },
    proposals: candidates,
  };
}

export function createOptimizationPreflight({ proposalPack, pinnedAnchorRef = null, selectedRuleIds = [] }) {
  if (!isObject(proposalPack) || proposalPack.schemaVersion !== 'yeoul-feedback-revision-proposals-v1') invalid('proposals');
  if (!Array.isArray(selectedRuleIds) || new Set(selectedRuleIds).size !== selectedRuleIds.length) invalid('selected_rules');
  const matched = selectedRuleIds.map(id => proposalPack.proposals.find(p => p.ruleId === id));
  if (matched.some(p => !p)) invalid('unknown_rule');
  return {
    schemaVersion: 'yeoul-optimization-preflight-v1',
    role: 'candidate_material_only',
    teacher: { status: 'not_called', outputAdmitted: false },
    externalCalls: 0, userApprovalRequiredBeforePaidCalls: true,
    runtime: { modelChange: false, deepSeekRoutingChange: false, dbChange: false, canonChange: false },
    pinnedAnchorRef,
    candidateVariants: ['baseline', 'language_rules', 'conversation_examples', 'hybrid'].map(id => ({
      id, status: 'unevaluated', sourceScope: 'legacy_development_only',
      selectedPendingRuleIds: id === 'language_rules' || id === 'hybrid' ? [...selectedRuleIds] : [],
      exampleApprovalRequired: id === 'conversation_examples' || id === 'hybrid',
    })),
    mandatoryBeforeEvaluation: [
      'pin_reviewed_character_anchor', 'review_selected_rule_text',
      'review_example_source_and_relation', 'seal_independent_holdout',
      'approve_actual_provider_call_budget',
    ],
  };
}

/** Evaluate *future* independently reviewed responses; never train on the sealed holdout. */
export function summarizeReviewedComparisons(rows, { datasetRole, expectedScenarioIds = [] } = {}) {
  if (!['development_review_results', 'sealed_holdout_results'].includes(datasetRole)) invalid('evaluation_split');
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(expectedScenarioIds) || !expectedScenarioIds.length) invalid('comparison_input');
  if (new Set(expectedScenarioIds).size !== expectedScenarioIds.length || expectedScenarioIds.some(x => !nonempty(x))) invalid('scenario_ids');
  if (datasetRole === 'sealed_holdout_results' && expectedScenarioIds.some(id => !/^H(0[1-9]|10)$/.test(id))) invalid('holdout_scenario_scope');
  if (datasetRole === 'development_review_results' && expectedScenarioIds.some(id => /^H(0[1-9]|10)$/.test(id))) invalid('holdout_leak_into_development');
  const groups = new Map();
  for (const row of rows) {
    if (!isObject(row) || !nonempty(row.candidateId) || !expectedScenarioIds.includes(row.scenarioId) || row.datasetRole !== datasetRole) invalid('comparison_row_identity');
    if (!['human_review', 'direct_user_review'].includes(row.evaluationSource) || !nonempty(row.reviewRef)) invalid('unverified_review_source');
    if (!isObject(row.quality) || REVIEW_DIMENSIONS.some(k => !['pass', 'fail', 'not_evaluated'].includes(row.quality[k]))) invalid('quality_axes');
    if (!isObject(row.hardFailures) || HARD_FAILURES.some(k => typeof row.hardFailures[k] !== 'boolean')) invalid('hard_gate_unrated');
    if (!asNumber(row.elapsedMs) || !asNumber(row.providerReportedCostUsd)) invalid('metrics');
    const group = groups.get(row.candidateId) ?? new Map();
    if (group.has(row.scenarioId)) invalid('duplicate_case');
    group.set(row.scenarioId, row);
    groups.set(row.candidateId, group);
  }
  const candidates = [];
  for (const [id, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.size !== expectedScenarioIds.length) invalid('incomplete_case_matrix_' + id);
    const records = expectedScenarioIds.map(s => group.get(s));
    const hardFailures = Object.fromEntries(HARD_FAILURES.map(k => [k, records.filter(r => r.hardFailures[k]).length]));
    const dimensions = Object.fromEntries(REVIEW_DIMENSIONS.map(k => [k, {
      pass: records.filter(r => r.quality[k] === 'pass').length,
      fail: records.filter(r => r.quality[k] === 'fail').length,
      notEvaluated: records.filter(r => r.quality[k] === 'not_evaluated').length,
    }]));
    const times = records.map(r => r.elapsedMs).sort((a, b) => a - b);
    candidates.push({
      id, cases: records.length, dimensions, hardFailures,
      hardGatePassed: Object.values(hardFailures).every(n => n === 0),
      providerReportedCostUsd: records.reduce((sum, r) => sum + r.providerReportedCostUsd, 0),
      meanElapsedMs: records.reduce((sum, r) => sum + r.elapsedMs, 0) / records.length,
      observedP95ElapsedMs: times[Math.ceil(times.length * 0.95) - 1],
    });
  }
  return {
    schemaVersion: 'yeoul-reviewed-comparison-v1', datasetRole,
    candidateOptimizationAllowed: datasetRole === 'development_review_results',
    qualityGainEstablished: false, automaticWinner: null,
    reason: 'HUMAN_RUBRIC_AND_INDEPENDENT_COMPARISON_REQUIRED',
    candidates,
  };
}

export function makeApprovalEstimate({ newScenarios, candidateVariants, repeatCount, baselineCostUsd = 0.00691712, baselineCallCount = 72 }) {
  if (![newScenarios, candidateVariants, repeatCount, baselineCallCount].every(n => Number.isInteger(n) && n > 0) || !asNumber(baselineCostUsd)) invalid('benchmark_parameters');
  const proposedCalls = newScenarios * candidateVariants * repeatCount;
  return {
    role: 'planning_only_no_authorization',
    model: 'deepseek/deepseek-v4.1-flash-1017',
    proposedCalls,
    observedHistoricalCostPerCallUsd: baselineCostUsd / baselineCallCount,
    indicativeCostAtHistoricalRateUsd: (baselineCostUsd / baselineCallCount) * proposedCalls,
    reliableCostCeilingUsd: null,
    warnings: ['Different prompt lengths and provider charges may change cost.', 'Teacher and grader calls are excluded.', 'No API calls or spending are authorized by this estimate.'],
  };
}
