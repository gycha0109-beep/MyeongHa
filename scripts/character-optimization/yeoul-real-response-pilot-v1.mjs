/** Offline Yeoul expression pilot: real-response pairing, never an API dispatcher. */
import { digest, validateCandidate } from './contracts-v1.mjs';
import { sanitizeGepaFeedback, DIMENSIONS, HARD_GATES } from './evaluation-v1.mjs';
import { intakeFrozenGepaResult } from './gepa-result-intake-v1.mjs';
import { buildResearchPromptPlan } from '../character-runtime-lab/yeoul-quality-offline-v1.mjs';

export const YEOUL_MANUAL_EXPRESSION_DRAFT_V1 = [
  '여울은 빠르게 반응하고 약간 새침하지만, 상대를 일부러 냉담하게 밀어내는 사람이 아닙니다. 먼저 상대가 실제로 한 말의 핵심에 반응하세요.',
  '외로움이나 무기력을 말하면 무조건 밥·물·휴식부터 권하지 마세요. 무엇이 허전하거나 힘들었는지 듣고, 필요한 경우에만 짧고 구체적으로 물으세요. 감정 상담사의 정형화된 위로나 일괄적인 생활 지시도 피하세요.',
  '호감·질투를 물으면 질문 자체를 시비로 받지 마세요. 여울 자신의 태도에 먼저 답하고, 민망함이나 건조한 태클은 실제 맥락이 있을 때만 드러내세요. 과장된 무관심도 자동 고백도 피하세요.',
  '관계 이력 없이 연인처럼 굴거나 연락을 강요하지 마세요. 화면·얼굴·표정·최근 행동·공유 기억을 확인하지 않았다면 본 사실처럼 말하지 마세요.',
  '말보다 행동에서 관심이 먼저 샐 수 있지만 매번 챙김이나 부정을 반복하지 마세요. 자연스러운 존댓말로 한 번에 한 반응을 선명히 전달하고, 후속 질문은 실제로 이어갈 내용이 있을 때만 쓰세요.',
].join('\n');

export const YEOUL_MANUAL_DRAFT_EVIDENCE = Object.freeze({
  role: 'legacy_development_failure_analysis_not_gepa_result',
  legacyQuestionIds: Object.freeze(['Y03', 'Y07', 'Y08', 'Y11']),
  sourceAuthority: Object.freeze([
    'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md',
    'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md',
  ]),
  approval: 'pending_owner_review',
  legacyRepliesIncluded: false,
});

const MODEL = 'deepseek/deepseek-v4.1-flash-1017';
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const fail = code => { throw new Error('YEOUL_REAL_PILOT_INVALID:' + code); };
const exact = (obj, keys) => plain(obj) && Object.keys(obj).sort().join('|') === [...keys].sort().join('|');
const finiteNonnegative = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;

function checkInputs({ manifest, baselineCore, context, settings }) {
  if (!plain(manifest) || manifest.schemaVersion !== 'character-optimization-run-v1' ||
      manifest.target?.track !== 'character' || manifest.target?.characterId !== 'yeoul' ||
      manifest.externalCallsAuthorized !== false || manifest.ownerReviewVerified !== false ||
      manifest.productionEligible !== false || manifest.qualityGainEstablished !== false ||
      !sha(manifest.manifestSha256) || !sha(manifest.immutableSourcesSha256) ||
      !sha(manifest.baselinePromptSha256)) fail('unapproved_yeoul_manifest');
  const {manifestSha256, ...body} = manifest;
  if (digest(body) !== manifestSha256 || !nonempty(baselineCore) ||
      digest(baselineCore) !== manifest.baselinePromptSha256) fail('baseline_not_pinned');
  if (!exact(context, ['questionId', 'userMove', 'relationshipStage', 'historyAvailable', 'approvedFacts']) ||
      !/^Y(0[1-9]|1[0-2])$/.test(context.questionId) ||
      !nonempty(context.userMove) || context.userMove.length > 1000 ||
      context.relationshipStage !== 'no_history' || context.historyAvailable !== false ||
      !Array.isArray(context.approvedFacts) || context.approvedFacts.length) fail('legacy_development_context_only');
  if (!exact(settings, ['modelId', 'provider', 'subprovider', 'temperature', 'maxTokens', 'reasoningEffort',
                        'allowFallbacks', 'requireParameters', 'dataCollection', 'zdr']) ||
      settings.modelId !== MODEL || settings.provider !== 'openrouter' || !nonempty(settings.subprovider) ||
      !finiteNonnegative(settings.temperature) || settings.temperature > 2 ||
      !Number.isSafeInteger(settings.maxTokens) || settings.maxTokens < 1 || settings.maxTokens > 4096 ||
      !['low', 'medium', 'high'].includes(settings.reasoningEffort) ||
      settings.allowFallbacks !== false || settings.requireParameters !== true ||
      settings.dataCollection !== 'deny' || settings.zdr !== true) fail('provider_settings_not_frozen');
}

function assemble({manifest, baselineCore, context, settings, candidate, origin}) {
  const baseline = buildResearchPromptPlan({
    variant: 'baseline', pinnedCoreAnchor: baselineCore, languageRules: '',
    relationshipState: context.relationshipStage, historyAvailable: false, approvedFacts: [],
  });
  const modified = buildResearchPromptPlan({
    variant: 'language_rules', pinnedCoreAnchor: baselineCore, languageRules: candidate.text,
    relationshipState: context.relationshipStage, historyAvailable: false, approvedFacts: [],
  });
  const common = {modelId:settings.modelId, provider:settings.provider, subprovider:settings.subprovider,
    settingsSha256:digest(settings), questionId:context.questionId, userMove:context.userMove,
    datasetRole:'legacy_development_only'};
  const requests = [
    {variant:'baseline', promptSha256:digest(baseline.system), system:baseline.system, ...common},
    {variant:'candidate', promptSha256:digest(modified.system), system:modified.system, ...common},
  ];
  if (requests[0].promptSha256 === requests[1].promptSha256) fail('candidate_not_distinct');
  return Object.freeze({
    schemaVersion:'yeoul-real-response-pilot-v1',
    source:'offline_comparison_plan_only', candidateOrigin:origin,
    candidate, candidateTextSha256:candidate.textSha256,
    runManifestSha256:manifest.manifestSha256, settingsSha256:digest(settings),
    baselineCoreSha256:manifest.baselinePromptSha256,
    requests, promptOnly:true, providerCalls:0, expenseUsd:0,
    qualityGainEstablished:false, humanReviewVerified:false, productionEligible:false,
  });
}

/** Unapproved manual proposal, not a GEPA result or an accepted few-shot example. */
export function prepareManualYeoulPilot({manifest, baselineCore, context, settings}) {
  checkInputs({manifest, baselineCore, context, settings});
  const candidate = validateCandidate({character_expression:YEOUL_MANUAL_EXPRESSION_DRAFT_V1}, {
    slot:'character_expression', pinnedContextSha256:manifest.immutableSourcesSha256,
  });
  return assemble({manifest, baselineCore, context, settings, candidate, origin:'manual_research'});
}

/** A real GEPA candidate can enter the SAME pair protocol, but synthetic scores do not prove improvement. */
export function prepareFrozenGepaYeoulPilot({manifest, packet, baselineCore, context, settings}) {
  checkInputs({manifest, baselineCore, context, settings});
  const admitted = intakeFrozenGepaResult({manifest, packet});
  if (admitted.characterIds.length !== 1 || admitted.characterIds[0] !== 'yeoul') fail('gepa_character');
  return assemble({manifest, baselineCore, context, settings,
    candidate:admitted.candidate, origin:'gepa_frozen_synthetic_unverified'});
}

/** Admit a locally selected, behavior-first GEPA v2 research candidate to the
 * existing real-response prompt path; this NEVER means quality or approval.
 * No artifact can self-authenticate its optimizer provenance.
 */
export function prepareBehaviorGepaYeoulPilot({manifest, packet, baselineCore, context, settings}) {
  checkInputs({manifest, baselineCore, context, settings});
  if (!plain(packet) ||
      packet.schemaVersion !== 'yeoul-gepa-behavior-expression-v2' ||
      packet.optimizer !== 'real_pinned_gepa_offline' ||
      packet.candidateOrigin !== 'gepa_in_process_behavior_reflector' ||
      packet.mutableSlot !== 'character_expression' ||
      packet.status !== 'research_candidate_not_released' ||
      packet.optimizerExecuted !== true ||
      packet.actualStudentRepliesGenerated !== 0 ||
      packet.realResponseQualityMeasured !== false ||
      packet.independentHoldoutPassed !== false ||
      packet.qualityGainEstablished !== false ||
      packet.externalModelCalls !== 0 ||
      packet.actualSpendKrw !== 0 ||
      packet.productionEligible !== false ||
      !Array.isArray(packet.coveredBehaviors) ||
      !packet.coveredBehaviors.includes('signal') ||
      !nonempty(packet.candidateText) ||
      !packet.candidateText.includes('[첫 반응]') ||
      !sha(packet.candidateSha256) ||
      digest(packet.candidateText) !== packet.candidateSha256) fail('untrusted_behavior_gepa_candidate');
  const candidate = validateCandidate(
    {character_expression:packet.candidateText},
    {slot:'character_expression',pinnedContextSha256:manifest.immutableSourcesSha256},
  );
  return assemble({manifest, baselineCore, context, settings, candidate,
    origin:'gepa_behavior_proxy_unverified'});
}

/** Post-run, local-only intake. Does not authenticate a provider receipt or human reviewer. */
export function inspectActualYeoulPair({plan, responses, reviews}) {
  if (!plain(plan) || plan.schemaVersion !== 'yeoul-real-response-pilot-v1' ||
      !Array.isArray(plan.requests) || plan.requests.length !== 2 ||
      !['manual_research','gepa_frozen_synthetic_unverified','gepa_behavior_proxy_unverified'].includes(plan.candidateOrigin) ||
      !Array.isArray(responses) || responses.length !== 2 ||
      !Array.isArray(reviews) || reviews.length !== 2) fail('pair_shape');
  const expected = new Map(plan.requests.map(x => [x.variant, x]));
  if (expected.size !== 2 || !expected.has('baseline') || !expected.has('candidate')) fail('pair_identity');
  const observed = new Map();
  let totalReportedUsd = 0;
  for (const r of responses) {
    if (!plain(r) || !expected.has(r.variant) || observed.has(r.variant)) fail('duplicate_or_unknown_arm');
    const request = expected.get(r.variant);
    if (r.generationSource !== 'actual_student_api' ||
        r.datasetRole !== 'legacy_development_only' || r.promptSha256 !== request.promptSha256 ||
        r.modelId !== request.modelId || r.provider !== request.provider ||
        r.subprovider !== request.subprovider || r.settingsSha256 !== request.settingsSha256 ||
        r.questionId !== request.questionId || r.userMove !== request.userMove ||
        r.providerFallbackUsed !== false || !nonempty(r.providerRequestId) ||
        !nonempty(r.reply) || r.reply.length > 1500 ||
        !plain(r.tokens) || !Number.isSafeInteger(r.tokens.input) || r.tokens.input < 1 ||
        !Number.isSafeInteger(r.tokens.output) || r.tokens.output < 1 ||
        !Number.isSafeInteger(r.tokens.reasoning) || r.tokens.reasoning < 0 ||
        !Number.isSafeInteger(r.tokens.cached) || r.tokens.cached < 0 ||
        !finiteNonnegative(r.providerReportedCostUsd) || !finiteNonnegative(r.elapsedMs))
      fail('unverified_or_mismatched_actual_response');
    observed.set(r.variant, r);
    totalReportedUsd += r.providerReportedCostUsd;
  }
  if (new Set([...observed.values()].map(r => r.providerRequestId)).size !== 2) fail('duplicate_provider_request');
  const reviewer = new Map();
  for (const r of reviews) {
    if (!plain(r) || !expected.has(r.variant) || reviewer.has(r.variant) ||
        r.source !== 'human_review' || !nonempty(r.reviewRef) ||
        !exact(r.scores, DIMENSIONS) ||
        !Array.isArray(r.hardFailures) || r.hardFailures.some(x => !HARD_GATES.includes(x)) ||
        typeof r.uncertainty !== 'boolean') fail('review_scope');
    reviewer.set(r.variant, sanitizeGepaFeedback({
      characterId:'yeoul', scores:r.scores, hardFailures:r.hardFailures, uncertainty:r.uncertainty,
    }));
  }
  const a = reviewer.get('baseline'), b = reviewer.get('candidate');
  return Object.freeze({
    schemaVersion:'yeoul-real-response-pair-inspection-v1',
    candidateOrigin:plan.candidateOrigin, developmentOnly:true,
    actualStudentResponsesStructurallyChecked:2,
    baselineScoreUnverified:a.score, candidateScoreUnverified:b.score,
    deltaUnverified:b.score - a.score,
    hardGatePassReported:a.hardGatePass && b.hardGatePass,
    totalProviderReportedCostUsd:totalReportedUsd,
    providerReceiptAuthenticityVerified:false, reviewerAuthorityVerified:false,
    independentHoldoutUsed:false, gepaQualityGainEstablished:false,
    productionEligible:false, recommendation:'hold_pending_authenticated_evidence_and_independent_blind_review',
    optimizerFeedbackCandidateOnly:b.side_info,
  });
}
