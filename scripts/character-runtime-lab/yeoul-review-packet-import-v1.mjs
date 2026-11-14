/** Offline review intake for the human-edited Yeoul packet. No approvals are conferred by checkboxes. */
import { createHash } from 'node:crypto';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePrivateYeoulForResearch } from '../character-optimization/yeoul-private-source-intake-v1.mjs';

const REVIEWER_SOURCE_REFS = Object.freeze([
  'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md',
  'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md',
]);
const SCRIPT_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const EXPECTED_QUESTIONS = Array.from({ length: 12 }, (_, n) => `Y${String(n + 1).padStart(2, '0')}`);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const normalize = value => typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const hash = value => createHash('sha256').update(value).digest('hex');
const invalid = code => { throw new Error(`YEOUL_REVIEW_PACKET_INVALID: ${code}`); };

const selected = (line, labels) => {
  if (typeof line !== 'string') invalid('missing_decision_line');
  const parts = line.match(/- \[([ xX])\] [^-\n]*(?=\s+- \[|$)/gu);
  if (!parts || parts.length !== labels.length) invalid('decision_line_shape');
  const flags = parts.map((part, i) => {
    if (!part.includes(labels[i])) invalid('decision_label_changed');
    const m = part.match(/^- \[([ xX])\]/u);
    return m[1].toLowerCase() === 'x';
  });
  if (flags.filter(Boolean).length > 1) invalid('conflicting_decisions');
  return flags.indexOf(true);
};

const between = (block, start, end) => {
  const a = block.indexOf(start);
  const b = block.indexOf(end, a + start.length);
  if (a < 0 || b < 0 || b <= a) invalid('review_block_missing_fields');
  return block.slice(a + start.length, b);
};
const quoted = text => text.split(/\r?\n/u).filter(line => /^\s*>/u.test(line)).map(line => line.replace(/^\s*> ?/u, '')).join(' ').trim();
const extractNote = block => {
  const m = block.match(/\*\*수정·제외 사유:\*\*([^]*?)$/u);
  if (!m) invalid('missing_review_note_slot');
  return m[1].trim();
};
const REVIEW_OPTIONS = Object.freeze(['approve_requested', 'revision_requested', 'excluded']);
const VALID_MODELS = Object.freeze(['z-ai/glm-5.3-flash', 'deepseek/deepseek-v4.1-flash-1017', 'minimax/minimax-m3.1-flash', 'qwen/qwen3.8-27b']);
const VALID_VARIANTS = Object.freeze(['baseline', 'language_rules', 'conversation_examples']);
const VALID_RATINGS = new Set(['good','awkward','fiction','harsh','flat','persona','soft','other']);

const verifyLegacyEvaluation = (source, queue) => {
  if (!isObject(source) || source.schemaVersion !== 'yeoul-evaluation-export-v1' ||
    source.experimentRunId !== 42572722295 || source.scope !== 'all-288' ||
    !Array.isArray(source.responses) || source.responses.length !== 288) invalid('evaluation_288_source_required');
  const actual = new Map();
  for (const row of source.responses) {
    const key = `${row.id}|${row.variant}|${row.repeat}|${row.model}`;
    if (!EXPECTED_QUESTIONS.includes(row.id) || !VALID_VARIANTS.includes(row.variant) ||
       !VALID_MODELS.includes(row.model) || ![1,2].includes(row.repeat) || actual.has(key) ||
       !hasText(row.input) || !hasText(row.reply) || !isObject(row.evaluation) ||
       !VALID_RATINGS.has(row.evaluation.rating) || row.questionDiscrimination !== null) invalid('evaluation_matrix_or_rating');
    actual.set(key, row);
  }
  if (actual.size !== 288) invalid('evaluation_matrix_or_rating');
  for (const item of queue) {
    const original = actual.get(item.sourceKey);
    if (!original || original.evaluation.rating !== 'good' ||
      hasText(original.evaluation.note) || original.evaluation.details?.length ||
      normalize(original.input) !== normalize(item.sourcePrompt) ||
      normalize(original.reply) !== normalize(item.candidateReply)) invalid('queue_not_supported_by_user_evaluation');
  }
};

/**
 * Return only review *requests*. Even checked approval boxes need an independent
 * user/character-owner confirmation before any downstream prompt example is accepted.
 */
export function ingestYeoulReviewPacket({ markdown, exampleQueue, proposalPack, evaluationExport }) {
  if (!hasText(markdown) || !isObject(exampleQueue) || !isObject(proposalPack)) invalid('inputs');
  if (exampleQueue.schemaVersion !== 'yeoul-example-review-queue-v1' ||
      exampleQueue.datasetRole !== 'legacy_development_only' ||
      exampleQueue.sourceExperimentRunId !== 42572722295 ||
      exampleQueue.queuedCount !== 24 || !Array.isArray(exampleQueue.queue) || exampleQueue.queue.length !== 24 ||
      proposalPack.schemaVersion !== 'yeoul-feedback-revision-proposals-v1' ||
      proposalPack.datasetRole !== 'legacy_development_only' ||
      !Array.isArray(proposalPack.proposals) || proposalPack.proposals.length !== 6 ||
      proposalPack.proposals.some(p => p.reviewStatus !== 'pending_character_owner_review')) invalid('legacy_unreviewed_sources_required');
  if (!markdown.startsWith('# 여울 AI — 대사 24건·행동 규칙 6건 검토표')) invalid('packet_identity');
  if (!markdown.includes('## A. 규칙 후보 6건') || !markdown.includes('## B. 대사 24건 검토') ||
      !markdown.includes('## C. 완료 확인')) invalid('packet_sections');
  const ruleText = between(markdown, '## A. 규칙 후보 6건', '## B. 대사 24건 검토');
  const exampleText = between(markdown, '## B. 대사 24건 검토', '## C. 완료 확인');
  const ruleBlocks = [...ruleText.matchAll(/^### ([1-6])\. `([^`]+)`[^\n]*$/gmu)];
  if (ruleBlocks.length !== 6) invalid('rule_count');
  const rules = [];
  const knownRules = new Map(proposalPack.proposals.map(p => [p.ruleId, p]));
  if (knownRules.size !== 6) invalid('duplicate_source_rule');
  for (const [i, match] of ruleBlocks.entries()) {
    if (Number(match[1]) !== i + 1 || knownRules.has(match[2]) === false) invalid('unknown_or_duplicate_rule');
    const end = i + 1 < ruleBlocks.length ? ruleBlocks[i + 1].index : ruleText.length;
    const section = ruleText.slice(match.index + match[0].length, end);
    const draft = section.match(/^\*\*초안:\*\* (.+)$/mu)?.[1];
    const source = knownRules.get(match[2]);
    if (draft !== source.instructionDraft) invalid('modified_rule_text');
    if (rules.some(x => x.ruleId === match[2])) invalid('duplicate_rule');
    const line = section.split(/\r?\n/u).find(x => x.startsWith('- ['));
    const choice = selected(line, ['연구용 규칙 승인', '문구 수정 필요', '제외']);
    const note = extractNote(section);
    if (choice >= 1 && !note) invalid('revision_or_exclusion_note_required');
    rules.push({ ruleId: match[2], choice: choice < 0 ? 'pending' : REVIEW_OPTIONS[choice], note,
      sourceStatus: source.reviewStatus });
  }
  const headings = [...exampleText.matchAll(/^### (Y\d{2})[^\n]*$/gmu)];
  if (headings.length !== 12 || headings.some((m, i) => m[1] !== EXPECTED_QUESTIONS[i])) invalid('question_coverage');
  const queue = new Map(exampleQueue.queue.map(x => [x.sourceKey, x]));
  if (queue.size !== 24 || exampleQueue.queue.some(x =>
      x.reviewStatus !== 'pending_canon_and_language_review' ||
      x.datasetRole !== 'legacy_development_only' || x.userRating !== 'good')) invalid('queue_approval_or_duplicate');
  verifyLegacyEvaluation(evaluationExport, exampleQueue.queue);
  const decisions = [];
  for (const [i, m] of headings.entries()) {
    const end = i + 1 < headings.length ? headings[i + 1].index : exampleText.length;
    const section = exampleText.slice(m.index + m[0].length, end);
    const candidates = [...section.matchAll(/^\*\*후보 ([12])\*\* · 모델: `([^`]+)` · 조건: `([^`]+)` · 반복: ([12])$/gmu)];
    if (candidates.length !== 2) invalid('candidate_count_per_question');
    for (const [n, candidate] of candidates.entries()) {
      if (Number(candidate[1]) !== n + 1) invalid('candidate_priority');
      const nextIndex = n + 1 < candidates.length ? candidates[n + 1].index : section.length;
      const body = section.slice(candidate.index + candidate[0].length, nextIndex);
      const sourceKey = body.match(/^원본 키: `([^`]+)`$/mu)?.[1];
      const expectedKey = `${m[1]}|${candidate[3]}|${candidate[4]}|${candidate[2]}`;
      if (sourceKey !== expectedKey || !queue.has(sourceKey) || decisions.some(x => x.sourceKey === sourceKey)) invalid('example_source_identity');
      const original = queue.get(sourceKey);
      if (original.sourceQuestionId !== m[1] || original.priority !== Number(candidate[1]) ||
          original.model !== candidate[2] || original.variant !== candidate[3] ||
          original.repeat !== Number(candidate[4]) ||
          original.preconditions?.relationshipStage !== 'no_history' ||
          original.preconditions?.historyAvailable !== false ||
          original.preconditions?.approvedFacts?.length !== 0) invalid('example_queue_mismatch');
      if (normalize(quoted(between(body, '**질문**', '**응답**'))) !== normalize(original.sourcePrompt) ||
          normalize(quoted(between(body, '**응답**', '- ['))) !== normalize(original.candidateReply)) invalid('example_text_changed');
      const line = body.split(/\r?\n/u).find(x => x.startsWith('- ['));
      const choice = selected(line, ['연구용 예시 승인', '수정 후 재검토', '제외']);
      const note = extractNote(body);
      if (choice >= 1 && !note) invalid('revision_or_exclusion_note_required');
      decisions.push({ sourceKey, sourceQuestionId: m[1], choice: choice < 0 ? 'pending' : REVIEW_OPTIONS[choice],
        note, sourceReviewStatus: original.reviewStatus });
    }
  }
  if (decisions.length !== 24 || queue.size !== decisions.length || decisions.some(x => !queue.has(x.sourceKey))) invalid('incomplete_source_coverage');
  const checklist = markdown.slice(markdown.indexOf('## C. 완료 확인'));
  const checks = [
    '6개 규칙 중 사용할 항목 및 수정 문구를 확정했습니다.',
    '24개 대사 후보의 승인/수정/제외를 각각 판정했습니다.',
    '검토한 원본 인격 기준과 캐릭터 Bible·Runtime의 승인 범위를 확인했습니다.',
    '유료 신규 실험을 진행할 경우 별도로 최대 호출 수·비용 상한·중단 조건을 결정합니다.',
  ];
  const checklistFlags = checks.map(label => {
    const line = checklist.split(/\r?\n/u).find(l => l.includes(label));
    if (!line || !/^\s*- \[[ xX]\]/u.test(line)) invalid('missing_completion_checklist');
    return /- \[[xX]\]/u.test(line);
  });
  const confirmedRuleDecisions = rules.every(x => x.choice !== 'pending');
  const confirmedExampleDecisions = decisions.every(x => x.choice !== 'pending');
  if (checklistFlags[0] && !confirmedRuleDecisions || checklistFlags[1] && !confirmedExampleDecisions) invalid('false_completion_marker');
  const baselineConfirmed = /- \[[xX]\] 캐릭터 기준 인격\(/u.test(markdown);
  if (checklistFlags[2] && !baselineConfirmed) invalid('unverified_persona_marker');
  const all = [...rules, ...decisions];
  const counts = Object.fromEntries(['pending', ...REVIEW_OPTIONS].map(choice => [choice, all.filter(x => x.choice === choice).length]));
  return {
    schemaVersion: 'yeoul-offline-review-intake-v1', datasetRole: 'legacy_development_only',
    sourceExperimentRunId: 42572722295,
    packetSha256: hash(markdown), sourceKeysSha256: hash(exampleQueue.queue.map(x => x.sourceKey).join('\n')),
    count: { rules: 6, examples: 24 }, decisions: counts,
    completeness: { rulesAllDecided: confirmedRuleDecisions, examplesAllDecided: confirmedExampleDecisions,
      pinnedAnchorChecked: baselineConfirmed, checklist: checklistFlags },
    rules, examples: decisions,
    ownerApprovalVerified: false, approvedRulesForPrompt: [], approvedExamplesForPrompt: [],
    readyForPaidExperiment: false, productionEligible: false, modelQualityGainEstablished: false,
    externalCalls: 0, reviewerSourceRefs: REVIEWER_SOURCE_REFS,
    warning: 'CHECKMARKS_ARE_UNVERIFIED_REVIEW_REQUESTS_NOT_CANON_OR_PRODUCTION_AUTHORITY',
  };
}

const within = (parent, target) => target === parent || target.startsWith(parent + sep);
const run = async () => {
  const args = process.argv.slice(2);
  const get = key => args[args.indexOf(key) + 1];
  const keys = ['--packet', '--queue', '--proposals', '--evaluations', '--out'];
  const archived = args.length === 11 && args[10] === '--known-original-unreviewed-auto-fields';
  if ((!archived && args.length !== 10) ||
      keys.some(key => args.filter(x => x === key).length !== 1 || !hasText(get(key)))) invalid('cli_usage');
  const [packet, queue, proposals, evaluations] = await Promise.all([
    readFile(get('--packet'), 'utf8'), readFile(get('--queue'), 'utf8'), readFile(get('--proposals'), 'utf8'), readFile(get('--evaluations'), 'utf8'),
  ]);
  const original = JSON.parse(evaluations);
  const evaluationExport = archived
    ? preparePrivateYeoulForResearch(original, { knownOriginalAutoFields: true })
    : original;
  const result = ingestYeoulReviewPacket({ markdown: packet, exampleQueue: JSON.parse(queue), proposalPack: JSON.parse(proposals), evaluationExport });
  const output = resolve(get('--out'));
  const parent = await realpath(dirname(output));
  const actualOutput = resolve(parent, output.split(sep).at(-1));
  if (within(SCRIPT_ROOT, actualOutput) || within(resolve(process.cwd()), actualOutput)) invalid('private_output_inside_repository');
  await writeFile(actualOutput, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: 'review_requests_only', total: 30, decisions: result.decisions,
    ownerApprovalVerified: false, readyForPaidExperiment: false, externalCalls: 0, output: actualOutput }));
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(e => { console.error(e instanceof Error ? e.message : 'YEOUL_REVIEW_PACKET_ERROR'); process.exitCode = 1; });
}
