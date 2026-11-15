import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePrivateYeoulForResearch } from '../character-optimization/yeoul-private-source-intake-v1.mjs';
import {
  MODELS, VARIANTS, diagnose, validateEvaluationExport, transformForOffline,
  retrieveReviewedExamples, buildResearchPromptPlan, runOffline,
} from './yeoul-quality-offline-v1.mjs';

function fixture() {
  const responses = [];
  for (let question = 1; question <= 12; question++) for (const model of MODELS) for (const variant of VARIANTS) for (const repeat of [1, 2]) {
    responses.push({
      id: 'Y' + String(question).padStart(2, '0'), input: '테스트 질문 ' + question,
      repeat, variant, model, reply: '가상 응답입니다.', elapsedMs: 10,
      inputTokens: 10, outputTokens: 10, reasoningTokens: 0, providerReportedCostUsd: 0,
      returnedModel: model, evaluation: { rating: 'good', source: 'synthetic-test' },
      questionDiscrimination: null, groupNote: '',
    });
  }
  return {
    schemaVersion: 'yeoul-evaluation-export-v1', experimentRunId: 42572722295,
    exportedAt: '2026-11-10T00:00:00Z', scope: 'all-288',
    sourceExperiment: { models: [...MODELS], variants: [...VARIANTS], attemptedCalls: 288, successfulCalls: 288, providerReportedCostUsd: 0 },
    responses, surveyState: { answers: {}, groups: { 'Y01': { discrimination: '' } } },
  };
}

test('288 independent matrix combinations and original user ratings are validated', () => {
  const data = fixture();
  data.responses[0].evaluation = { rating: 'good', note: '괜찮은데 반말', details: ['register'], source: 'synthetic-test' };
  data.responses[1].evaluation = { rating: 'fiction', note: '없는 기억', source: 'synthetic-test' };
  const original = JSON.stringify(data);
  const result = transformForOffline(data);
  assert.equal(result.summary.count, 288);
  assert.equal(result.summary.cleanPositives, 286);
  assert.equal(result.summary.positiveCaveats, 1);
  assert.equal(result.records[0].diagnostic.classification, 'positive_with_caveat');
  assert.equal(result.records[0].diagnostic.evidence.find(x => x.tag === 'politeness_register').origin, 'user_detail');
  assert.equal(result.records[1].diagnostic.classification, 'negative_user_rating');
  assert.equal(result.records[1].source.evaluation.note, '없는 기억');
  assert.equal(JSON.stringify(data), original, 'never mutate source evaluation');
  assert.equal(result.examples.length, 286);
  assert.ok(result.pairs.length > 0);
  assert.equal(result.teacherInputs.length, 2);
  assert.ok(result.teacherInputs.every(x => x.review_status.startsWith('pending')));
});

test('source-level and per-row reported costs remain separate when they disagree', () => {
  const data = fixture();
  data.sourceExperiment.providerReportedCostUsd = 0.04236847;
  const result = validateEvaluationExport(data);
  assert.equal(result.providerReportedCostUsd, 0.04236847);
  assert.equal(result.responseRowsReportedCostUsd, 0);
  assert.equal(result.costGapRunMinusRowsUsd, 0.04236847);
  assert.equal(result.costReconciled, false);
  assert.equal(result.costGapCause, 'unverified_do_not_infer');
});

test('duplicate source key and incomplete matrix are rejected', () => {
  const data = fixture();
  data.responses[1] = structuredClone(data.responses[0]);
  assert.throws(() => validateEvaluationExport(data), /duplicate/);
  const incomplete = fixture();
  incomplete.responses.pop();
  assert.throws(() => validateEvaluationExport(incomplete), /response_count/);
});

test('unrated question discrimination is not fabricated', () => {
  const data = fixture();
  data.responses[2].questionDiscrimination = 'low';
  assert.throws(() => validateEvaluationExport(data), /unevaluated_discrimination/);
  const group = fixture();
  group.surveyState.groups.Y01.discrimination = 'hold';
  assert.throws(() => validateEvaluationExport(group), /group_discrimination/);
});

test('only explicitly approved, relationship-matched examples are retrieved', () => {
  const reviewEvidence = { reviewedBy: 'character_owner', sourceRefs: ['docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md', 'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'] };
  const base = { candidateId: '1', candidateReply: '괜찮으세요?', sourcePrompt: '식사는 하셨어요?', situation: { userMove: '식사하셨어요?' }, reviewEvidence, preconditions: { relationshipStage: 'no_history', historyAvailable: false, approvedFacts: [] } };
  assert.equal(retrieveReviewedExamples({ examples: [{ ...base, reviewStatus: 'pending_canon_and_language_review' }], userMove: '식사했어요?', relationshipStage: 'no_history', historyAvailable: false }).length, 0);
  assert.equal(retrieveReviewedExamples({ examples: [{ ...base, reviewStatus: 'approved' }], userMove: '식사했어요?', relationshipStage: 'partner', historyAvailable: true }).length, 0);
  assert.equal(retrieveReviewedExamples({ examples: [{ ...base, reviewStatus: 'approved' }], userMove: '식사했어요?', relationshipStage: 'no_history', historyAvailable: false }).length, 1);
  assert.equal(retrieveReviewedExamples({ examples: [{ ...base, reviewStatus: 'approved', reviewEvidence: null }], userMove: '식사했어요?', relationshipStage: 'no_history', historyAvailable: false }).length, 0);
  assert.equal(retrieveReviewedExamples({ examples: [{ ...base, reviewStatus: 'approved' }], userMove: '자동차 보험료', relationshipStage: 'no_history', historyAvailable: false }).length, 0);
  const needingMemory = { ...base, reviewStatus: 'approved', preconditions: { relationshipStage: 'partner', historyAvailable: true, approvedFacts: ['ledger:known-event'] } };
  assert.equal(retrieveReviewedExamples({ examples: [needingMemory], userMove: '식사했어요?', relationshipStage: 'partner', historyAvailable: true }).length, 0);
});

test('research prompts cannot insert unreviewed example or replace model selection', () => {
  assert.throws(() => buildResearchPromptPlan({ variant: 'hybrid', pinnedCoreAnchor: '고정 인격', languageRules: '자연스러운 존댓말', reviewedExamples: [{ reviewStatus: 'pending' }] }), /UNREVIEWED_OR_CONTEXT/);
  const plan = buildResearchPromptPlan({ variant: 'hybrid', pinnedCoreAnchor: '고정 인격', languageRules: '자연스러운 존댓말' });
  assert.equal(plan.modelSelection, 'unchanged_no_routing');
  assert.equal(plan.status, 'offline_candidate_only');
  assert.equal(plan.providerRules.allowFallbacks, false);
  assert.ok(!plan.system.includes('사용자:'));
  const reviewEvidence = { reviewedBy: 'character_owner', sourceRefs: ['docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md', 'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'] };
  const e = { candidateId: '1', reviewStatus: 'approved', reviewEvidence, sourcePrompt: '식사했어요?', candidateReply: '네.', preconditions: { relationshipStage: 'no_history', historyAvailable: false, approvedFacts: [] } };
  assert.throws(() => buildResearchPromptPlan({ variant: 'hybrid', pinnedCoreAnchor: '고정 인격', languageRules: '존댓말', relationshipState: 'partner', historyAvailable: true, reviewedExamples: [e] }), /CONTEXT_MISMATCHED/);
});

test('offline CLI preserves source bytes, writes outputs, and rejects holdout inputs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yeoul-offline-'));
  const data = fixture();
  const input = join(dir, 'yeoul-evaluations-all-288-clean.json');
  await writeFile(input, JSON.stringify(data));
  const output = join(dir, 'output');
  const result = await runOffline({ inputPath: input, outputDir: output });
  assert.equal(result.summary.count, 288);
  assert.match(await readFile(join(output, 'summary.json'), 'utf8'), /sourceSha256/);
  const preflight = JSON.parse(await readFile(join(output, 'optimization-preflight.json'), 'utf8'));
  const feedback = JSON.parse(await readFile(join(output, 'feedback-revision-proposals.json'), 'utf8'));
  assert.equal(preflight.externalCalls, 0);
  assert.equal(feedback.qualityGainEstablished, false);
  assert.equal(JSON.parse(await readFile(input, 'utf8')).responses.length, 288);
  const holdout = join(dir, 'holdout-cases.json');
  await writeFile(holdout, JSON.stringify(data));
  await assert.rejects(() => runOffline({ inputPath: holdout, outputDir: output }), /HOLDOUT_NOT_TRAINING_DATA/);
  await assert.rejects(() => runOffline({ inputPath: input, outputDir: process.cwd() }), /PRIVATE_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY/);
});


test('private results use restrictive permissions, do not overwrite, and block symlink escapes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yeoul-private-output-'));
  const input = join(dir, 'evaluations.json');
  await writeFile(input, JSON.stringify(fixture()));
  const output = join(dir, 'private-results');
  await runOffline({ inputPath: input, outputDir: output });
  if (process.platform !== 'win32') {
    assert.equal((await stat(output)).mode & 0o077, 0);
    assert.equal((await stat(join(output, 'records.jsonl'))).mode & 0o077, 0);
  }
  await assert.rejects(() => runOffline({ inputPath: input, outputDir: output }), /PRIVATE_OUTPUT_MUST_START_EMPTY/);
  if (process.platform !== 'win32') {
    const repoDocs = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'character-runtime-lab');
    const alias = join(dir, 'hidden-repo-target');
    await symlink(repoDocs, alias, 'dir');
    await assert.rejects(() => runOffline({ inputPath: input, outputDir: alias }), /PRIVATE_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY/);
  }
});

test('known 36-row/9-group original is usable in private research only by explicit opt-in', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yeoul-original-research-'));
  const source = fixture();
  source.surveyState.groups = Object.fromEntries(Array.from({ length: 9 }, (_, i) =>
    ['group-' + i, { discrimination: 'unreviewed_auto_candidate' }]));
  source.responses.forEach((row, i) => {
    if (i % 8 === 0) row.questionDiscrimination = 'unreviewed_auto_candidate';
  });
  const untouched = JSON.stringify(source);
  assert.throws(() => validateEvaluationExport(source), /unevaluated_discrimination/);
  assert.throws(() => preparePrivateYeoulForResearch(source), /private_row_contract/);
  const prepared = preparePrivateYeoulForResearch(source, { knownOriginalAutoFields: true });
  assert.equal(prepared.responses.length, 288);
  assert.equal(prepared.responses.filter(row => row.questionDiscrimination !== null).length, 0);
  assert.equal(transformForOffline(prepared).summary.count, 288);
  assert.equal(JSON.stringify(source), untouched, 'original source unchanged');
  const input = join(dir, 'original.json');
  await writeFile(input, untouched);
  await assert.rejects(() => runOffline({ inputPath: input, outputDir: join(dir, 'strict') }), /unevaluated_discrimination/);
  const result = await runOffline({ inputPath: input, outputDir: join(dir, 'private'), knownOriginalAutoFields: true });
  assert.equal(result.queuedForHumanReview, 24);
  assert.equal(JSON.stringify(JSON.parse(await readFile(input, 'utf8'))), untouched);
  const queue = JSON.parse(await readFile(join(dir, 'private', 'example-review-queue.json'), 'utf8'));
  assert.equal(queue.humanApprovedCount, 0);
  assert.equal(queue.productionEligible, false);
});
