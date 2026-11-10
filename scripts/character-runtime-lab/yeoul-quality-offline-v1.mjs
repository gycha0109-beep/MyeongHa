import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MODELS = Object.freeze([
  'z-ai/glm-5.3-flash',
  'deepseek/deepseek-v4.1-flash-1017',
  'minimax/minimax-m3.1-flash',
  'qwen/qwen3.8-27b',
]);
export const VARIANTS = Object.freeze(['baseline', 'language_rules', 'conversation_examples']);
export const RATINGS = Object.freeze(['good', 'awkward', 'fiction', 'harsh', 'flat', 'persona', 'soft', 'other']);
const VALID_TAGS = Object.freeze({
  grammar: 'korean_naturalness', language: 'korean_naturalness', register: 'politeness_register',
  selfreference: 'speaker_context', context: 'speaker_context', hallucination: 'unverified_fact_or_memory',
  persona: 'character_behavior', flirting: 'relationship_boundary', ordinary: 'low_distinctiveness',
  other: 'other_user_flag',
});
const RATING_TAGS = Object.freeze({
  awkward: 'korean_naturalness', fiction: 'unverified_fact_or_memory', harsh: 'excessive_aggression',
  flat: 'low_distinctiveness', persona: 'character_behavior', soft: 'excessive_softness',
  other: 'other_user_rating',
});
const HEURISTICS = Object.freeze([
  ['politeness_register', /반말|존댓말|존칭|경어|말투.*왔다.?갔다/],
  ['korean_naturalness', /어색|비문|문법|부자연|뭔 말|무슨 말|중국어|외국어/],
  ['speaker_context', /화자|유체이탈|혼동|문맥|맥락/],
  ['unverified_fact_or_memory', /없는 기억|없는 과거|허구|지어내|갑자기.*기억|할 리가 없/],
  ['excessive_aggression', /공격적|너무 세게|무례|비난/],
  ['excessive_softness', /너무 다정|상담사|지나치게 부드럽/],
  ['relationship_boundary', /플러팅|너무 친근|처음 대화.*치곤|급발진|질투.*없는/],
  ['low_distinctiveness', /무난|평범|개성 없|밋밋/],
  ['verbosity_repetition', /장황|반복|같은 말|길게 늘/],
]);
const fail = (reason) => { throw new Error('YEOUL_EVALUATION_INVALID: ' + reason); };
const nonempty = (x) => typeof x === 'string' && x.trim().length > 0;
const object = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const keyOf = (row) => [row.id, row.variant, row.repeat, row.model].join('|');

export function validateEvaluationExport(data) {
  if (!object(data)) fail('root');
  if (data.schemaVersion !== 'yeoul-evaluation-export-v1' || data.experimentRunId !== 42572722295 || data.scope !== 'all-288') fail('identity');
  const source = data.sourceExperiment;
  if (!object(source) || JSON.stringify(source.models) !== JSON.stringify(MODELS) || JSON.stringify(source.variants) !== JSON.stringify(VARIANTS)) fail('source_matrix');
  if (source.attemptedCalls !== 288 || source.successfulCalls !== 288 || !Number.isFinite(source.providerReportedCostUsd)) fail('source_counts');
  if (!Array.isArray(data.responses) || data.responses.length !== 288) fail('response_count');
  if (!object(data.surveyState) || !object(data.surveyState.answers) || !object(data.surveyState.groups)) fail('survey_state');
  const seen = new Set();
  const counts = Object.fromEntries(MODELS.map(m => [m, Object.fromEntries(VARIANTS.map(v => [v, 0]))]));
  const ratingCounts = Object.fromEntries(RATINGS.map(r => [r, 0]));
  let commented = 0;
  let positiveCaveats = 0;
  let totalCost = 0;
  for (const row of data.responses) {
    if (!object(row) || !/^Y(0[1-9]|1[0-2])$/.test(row.id) || !MODELS.includes(row.model) || !VARIANTS.includes(row.variant)) fail('row_identity');
    if (![1, 2].includes(row.repeat) || !nonempty(row.input) || !nonempty(row.reply)) fail('row_content');
    for (const field of ['elapsedMs', 'inputTokens', 'outputTokens', 'reasoningTokens', 'providerReportedCostUsd']) {
      if (!Number.isFinite(row[field]) || row[field] < 0) fail('metric_' + field);
    }
    if (!object(row.evaluation) || !RATINGS.includes(row.evaluation.rating) || !nonempty(row.evaluation.source)) fail('rating');
    if (row.evaluation.note !== undefined && typeof row.evaluation.note !== 'string') fail('note');
    if (row.evaluation.details !== undefined && (!Array.isArray(row.evaluation.details) || row.evaluation.details.some(d => typeof d !== 'string'))) fail('details');
    if (row.questionDiscrimination !== null) fail('unevaluated_discrimination');
    const key = keyOf(row);
    if (seen.has(key)) fail('duplicate_' + key);
    seen.add(key);
    counts[row.model][row.variant]++;
    ratingCounts[row.evaluation.rating]++;
    totalCost += row.providerReportedCostUsd;
    if (nonempty(row.evaluation.note)) commented++;
    if (row.evaluation.rating === 'good' && (nonempty(row.evaluation.note) || (row.evaluation.details ?? []).length > 0)) positiveCaveats++;
  }
  for (const m of MODELS) for (const v of VARIANTS) if (counts[m][v] !== 24) fail('matrix_' + m + '_' + v);
  for (let i = 1; i <= 12; i++) {
    const id = 'Y' + String(i).padStart(2, '0');
    for (const m of MODELS) for (const v of VARIANTS) for (const repeat of [1, 2]) {
      if (!seen.has([id, v, repeat, m].join('|'))) fail('missing_' + id);
    }
  }
  if (Object.values(data.surveyState.groups).some(g => object(g) && g.discrimination !== '' && g.discrimination !== null && g.discrimination !== undefined)) fail('group_discrimination');
  if (Math.abs(totalCost - source.providerReportedCostUsd) > 0.00000001) fail('cost_sum');
  return Object.freeze({
    experimentRunId: data.experimentRunId, count: 288, uniqueKeys: seen.size,
    ratingCounts, modelVariantCounts: counts, commented, positiveCaveats,
    cleanPositives: ratingCounts.good - positiveCaveats,
    providerReportedCostUsd: source.providerReportedCostUsd,
    discriminationEvaluated: false,
  });
}

export function diagnose(row) {
  const evidence = [];
  const add = (tag, origin, evidenceText) => {
    if (!evidence.some(e => e.tag === tag && e.origin === origin)) evidence.push({ tag, origin, evidence: evidenceText });
  };
  if (RATING_TAGS[row.evaluation.rating]) add(RATING_TAGS[row.evaluation.rating], 'user_rating', row.evaluation.rating);
  for (const flag of row.evaluation.details ?? []) {
    add(VALID_TAGS[flag] ?? 'unmapped_user_flag', 'user_detail', flag);
  }
  const note = row.evaluation.note ?? '';
  for (const [tag, regex] of HEURISTICS) if (regex.test(note)) add(tag, 'note_heuristic_unconfirmed', note);
  return {
    originalKey: keyOf(row), originalRating: row.evaluation.rating,
    classification: row.evaluation.rating !== 'good' ? 'negative_user_rating' :
      (nonempty(note) || (row.evaluation.details ?? []).length > 0 ? 'positive_with_caveat' : 'clean_positive_candidate'),
    evidence,
    sourceAuthority: ['docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md', 'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'],
    reviewStatus: 'unreviewed',
  };
}

export function transformForOffline(data) {
  const summary = validateEvaluationExport(data);
  const records = data.responses.map(row => ({ source: structuredClone(row), diagnostic: diagnose(row) }));
  const examples = records.filter(r => r.diagnostic.classification === 'clean_positive_candidate').map(r => ({
    candidateId: r.diagnostic.originalKey,
    sourcePrompt: r.source.input, candidateReply: r.source.reply,
    sourceEvaluation: structuredClone(r.source.evaluation),
    preconditions: { relationshipStage: 'no_history', historyAvailable: false, approvedFacts: [] },
    situation: { referenceQuestionId: r.source.id, userMove: r.source.input },
    characterAction: null, prohibitedPatterns: [],
    reviewStatus: 'pending_canon_and_language_review',
    provenance: { experimentRunId: data.experimentRunId, sourceKey: r.diagnostic.originalKey },
  }));
  const pairs = [];
  for (const v of VARIANTS) for (let i = 1; i <= 12; i++) {
    const id = 'Y' + String(i).padStart(2, '0');
    const group = records.filter(r => r.source.id === id && r.source.variant === v);
    const good = group.filter(r => r.diagnostic.classification === 'clean_positive_candidate');
    const bad = group.filter(r => r.source.evaluation.rating !== 'good');
    for (const a of good) for (const b of bad) pairs.push({
      preferredSourceKey: a.diagnostic.originalKey, dispreferredSourceKey: b.diagnostic.originalKey,
      pairType: 'observational_candidate_not_causal_or_dpo', userQuestionId: id, variant: v,
      reviewStatus: 'unreviewed',
    });
  }
  const teacherInputs = records.filter(r => r.diagnostic.classification !== 'clean_positive_candidate').map(r => ({
    source_authority: { bible: 'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md', runtime: 'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md', publicationAuthority: 'not_inferred_from_draft' },
    scenario: { userMove: r.source.input, legacyQuestionId: r.source.id, split: 'legacy_development_only' },
    relationship_state: 'no_history', history_available: false, approved_facts: [],
    expected_character_action: null, candidate_reply: r.source.reply,
    diagnostic_labels: r.diagnostic.evidence,
    original_user_evaluation: structuredClone(r.source.evaluation),
    teacher_output_schema: { action: 'string', corrections: 'string[]', violations: 'string[]', suggested_reply: 'string', source_refs: 'string[]' },
    review_status: 'pending_teacher_and_human_review',
    provenance: { experimentRunId: data.experimentRunId, sourceKey: r.diagnostic.originalKey },
  }));
  return { summary, records, examples, pairs, teacherInputs };
}

export function retrieveReviewedExamples({ examples, userMove, relationshipStage, historyAvailable, approvedFacts = [], limit = 3 }) {
  if (!Array.isArray(examples) || !nonempty(userMove) || !nonempty(relationshipStage)) throw new Error('INVALID_RETRIEVAL_CONTEXT');
  if (!Number.isInteger(limit) || limit < 1 || limit > 3) throw new Error('INVALID_EXAMPLE_LIMIT');
  const allowedFacts = new Set(approvedFacts);
  const words = new Set((userMove.match(/[가-힣a-zA-Z0-9]{2,}/g) ?? []).map(s => s.toLowerCase()));
  return examples.filter(e => e.reviewStatus === 'approved' && e.preconditions?.relationshipStage === relationshipStage &&
    e.preconditions?.historyAvailable === historyAvailable &&
    (e.preconditions?.approvedFacts ?? []).every(f => allowedFacts.has(f)) && nonempty(e.candidateReply))
    .map(e => ({ e, score: (e.situation?.userMove?.match(/[가-힣a-zA-Z0-9]{2,}/g) ?? []).reduce((n, word) => n + Number(words.has(word.toLowerCase())), 0) }))
    .sort((a, b) => b.score - a.score || a.e.candidateId.localeCompare(b.e.candidateId))
    .slice(0, limit).map(x => x.e);
}

export function buildResearchPromptPlan({ variant, pinnedCoreAnchor, languageRules, relationshipState = 'no_history', reviewedExamples = [] }) {
  if (!['baseline', 'language_rules', 'conversation_examples', 'hybrid'].includes(variant) || !nonempty(pinnedCoreAnchor)) throw new Error('UNPINNED_CORE_ANCHOR');
  if (reviewedExamples.some(e => e.reviewStatus !== 'approved')) throw new Error('UNREVIEWED_EXAMPLE_BLOCKED');
  const useLanguage = variant === 'language_rules' || variant === 'hybrid';
  const useExamples = variant === 'conversation_examples' || variant === 'hybrid';
  if (useLanguage && !nonempty(languageRules)) throw new Error('MISSING_LANGUAGE_RULES');
  const content = [pinnedCoreAnchor];
  if (useLanguage) content.push(languageRules);
  content.push('관계 상태: ' + relationshipState + '. 이 정보만으로 과거 사건이나 기억을 추정하지 마세요.');
  if (useExamples && reviewedExamples.length) {
    content.push('다음은 검토된 가상 예시입니다. 실제 공유 기억이 아니며 대사를 복사하거나 과거 사실로 취급하지 마세요.');
    for (const e of reviewedExamples.slice(0, 3)) content.push('사용자: ' + e.sourcePrompt + '\n여울: ' + e.candidateReply);
  }
  return { variant, modelSelection: 'unchanged_no_routing', status: 'offline_candidate_only', system: content.join('\n'),
    responseFormat: { type: 'object', required: ['reply'], additionalProperties: false },
    providerRules: { allowFallbacks: false, requireParameters: true, zdr: true, dataCollection: 'deny' } };
}

const jsonl = (items) => items.map(item => JSON.stringify(item)).join('\n') + '\n';
export async function runOffline({ inputPath, outputDir }) {
  if (!nonempty(inputPath) || !nonempty(outputDir)) throw new Error('INPUT_AND_OUTPUT_REQUIRED');
  const input = resolve(inputPath);
  const out = resolve(outputDir);
  if (input === out || out.startsWith(input + '/')) throw new Error('OUTPUT_PATH_INVALID');
  if (/holdout/i.test(basename(input))) throw new Error('HOLDOUT_NOT_TRAINING_DATA');
  const bytes = await readFile(input);
  const data = JSON.parse(bytes.toString('utf8'));
  const result = transformForOffline(data);
  await mkdir(out, { recursive: true });
  const originSha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(out, 'summary.json'), JSON.stringify({ ...result.summary, sourceSha256: originSha256, inputFile: basename(input), datasetRole: 'legacy_development_only', operationalImpact: 'none' }, null, 2) + '\n');
  await writeFile(join(out, 'records.jsonl'), jsonl(result.records));
  await writeFile(join(out, 'example-candidates.jsonl'), jsonl(result.examples));
  await writeFile(join(out, 'pairwise-candidates.jsonl'), jsonl(result.pairs));
  await writeFile(join(out, 'teacher-inputs.jsonl'), jsonl(result.teacherInputs));
  return { summary: result.summary, sourceSha256: originSha256, outputDir: out, exampleCandidates: result.examples.length, teacherInputs: result.teacherInputs.length, pairwiseCandidates: result.pairs.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const flags = process.argv.slice(2);
  const inputPath = flags[flags.indexOf('--input') + 1];
  const outputDir = flags[flags.indexOf('--out') + 1];
  if (!flags.includes('--input') || !flags.includes('--out') || !inputPath || !outputDir) {
    console.error('Usage: node scripts/character-runtime-lab/yeoul-quality-offline-v1.mjs --input <private-clean.json> --out <private-output-dir>');
    process.exitCode = 2;
  } else {
    runOffline({ inputPath, outputDir }).then(value => console.log(JSON.stringify(value, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
