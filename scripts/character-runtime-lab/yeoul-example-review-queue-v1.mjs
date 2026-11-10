/** Arrange already user-rated legacy development replies for human authoring review. No approval or model inference. */
const TARGET = 'deepseek/deepseek-v4.1-flash-1017';
const QUESTIONS = Object.freeze(Array.from({ length: 12 }, (_, i) => `Y${String(i + 1).padStart(2, '0')}`));
const VALID_MODELS = new Set(['z-ai/glm-5.3-flash', TARGET, 'minimax/minimax-m3.1-flash', 'qwen/qwen3.8-27b']);
const VALID_VARIANTS = new Set(['baseline', 'language_rules', 'conversation_examples']);
const nonempty = x => typeof x === 'string' && x.trim().length > 0;
const invalid = reason => { throw new Error('YEOUL_REVIEW_QUEUE_INVALID: ' + reason); };

const parseCandidate = candidate => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || !nonempty(candidate.candidateId)) invalid('candidate_identity');
  const [id, variant, repeat, ...modelSegments] = candidate.candidateId.split('|');
  const model = modelSegments.join('|');
  if (!QUESTIONS.includes(id) || !VALID_VARIANTS.has(variant) || !['1', '2'].includes(repeat) || !VALID_MODELS.has(model)) invalid('candidate_key');
  if (candidate.situation?.referenceQuestionId !== id || !nonempty(candidate.sourcePrompt) || !nonempty(candidate.candidateReply) ||
    candidate.sourceEvaluation?.rating !== 'good' || nonempty(candidate.sourceEvaluation?.note) ||
    (Array.isArray(candidate.sourceEvaluation?.details) && candidate.sourceEvaluation.details.length !== 0) ||
    (candidate.sourceEvaluation?.details !== undefined && !Array.isArray(candidate.sourceEvaluation.details)) ||
    candidate.reviewStatus !== 'pending_canon_and_language_review' ||
    candidate.provenance?.experimentRunId !== 42572722295 || candidate.provenance?.sourceKey !== candidate.candidateId ||
    candidate.preconditions?.relationshipStage !== 'no_history' || candidate.preconditions?.historyAvailable !== false ||
    !Array.isArray(candidate.preconditions.approvedFacts) || candidate.preconditions.approvedFacts.length > 0
  ) invalid('unreviewed_clean_legacy_source_required');
  return { id, variant, repeat: Number(repeat), model };
};

export function buildExampleReviewQueue(examples, { perQuestion = 2, preferredModel = TARGET } = {}) {
  if (!Array.isArray(examples) || !Number.isInteger(perQuestion) || perQuestion < 1 || perQuestion > 3 ||
    preferredModel !== TARGET) invalid('selection_parameters');
  const groups = new Map(QUESTIONS.map(id => [id, []]));
  const seen = new Set();
  for (const candidate of examples) {
    const key = candidate?.candidateId;
    if (seen.has(key)) invalid('duplicate_candidate');
    seen.add(key);
    const identity = parseCandidate(candidate);
    groups.get(identity.id).push({ ...identity, candidate });
  }
  const queue = [];
  const coverage = [];
  for (const id of QUESTIONS) {
    const group = groups.get(id).sort((a, b) => a.candidate.candidateId.localeCompare(b.candidate.candidateId));
    const selected = [];
    const preferred = group.find(item => item.model === preferredModel);
    if (preferred) selected.push(preferred);
    if (!selected.length && group.length) selected.push(group[0]);
    while (selected.length < perQuestion) {
      const remaining = group.filter(item => !selected.includes(item));
      if (!remaining.length) break;
      const otherModel = remaining.find(item => item.model !== selected[0]?.model);
      selected.push(otherModel ?? remaining[0]);
    }
    coverage.push({
      questionId: id, cleanCandidateCount: group.length, preferredModelCandidateCount: group.filter(item => item.model === preferredModel).length,
      queuedCount: selected.length, missingPreferredModelCandidate: !preferred,
      needsAdditionalCandidates: selected.length < perQuestion,
    });
    for (const [index, item] of selected.entries()) {
      queue.push({
        sourceKey: item.candidate.candidateId, sourceQuestionId: id, model: item.model,
        variant: item.variant, repeat: item.repeat,
        userRating: item.candidate.sourceEvaluation.rating,
        sourcePrompt: item.candidate.sourcePrompt, candidateReply: item.candidate.candidateReply,
        datasetRole: 'legacy_development_only',
        reviewStatus: 'pending_canon_and_language_review',
        priority: index + 1, selectionReason: item.model === preferredModel ? 'target_model_candidate_not_quality_judgment' : 'coverage_candidate_not_quality_judgment',
        preconditions: { relationshipStage: 'no_history', historyAvailable: false, approvedFacts: [] },
        requiredReview: [
          'verify_korean_naturalness_and_register', 'verify_yeoul_action_and_source_authority',
          'reject_invented_memory_or_unsupported_relationship', 'review_original_user_evaluation_without_relabeling',
          'record_character_owner_decision_and_source_refs',
        ],
        reviewEvidence: null,
      });
    }
  }
  return {
    schemaVersion: 'yeoul-example-review-queue-v1', datasetRole: 'legacy_development_only',
    sourceExperimentRunId: 42572722295, status: 'pending_character_owner_review',
    selectionMethod: 'deterministic_question_coverage_not_model_quality_ranking',
    preferredModel, perQuestion, totalCleanCandidates: examples.length,
    queuedCount: queue.length, humanApprovedCount: 0,
    modelQualityGainEstablished: false, productionEligible: false, externalCalls: 0,
    coverage, queue,
  };
}
