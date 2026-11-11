import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, lstatSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePrivateYeoul288, inspectPrivateYeoulEvaluation, runPrivateYeoulIntake } from './yeoul-private-source-intake-v1.mjs';
import { YEOUL_NEW_FAMILY_DRAFTS } from './yeoul-new-scenario-families-v1.mjs';

const MODELS = ['z-ai/glm-5.3-flash', 'deepseek/deepseek-v4.1-flash-1017',
  'minimax/minimax-m3.1-flash', 'qwen/qwen3.8-27b'];
const VARIANTS = ['baseline', 'language_rules', 'conversation_examples'];
const SENTINEL = 'PRIVATE_SOURCE_SHOULD_NEVER_LEAVE_LOCAL_RESEARCH';
const source = () => {
  const rows = [];
  for (let question = 1; question <= 12; question++) {
    const id = 'Y' + String(question).padStart(2, '0');
    for (const model of MODELS) for (const variant of VARIANTS) for (const repeat of [1, 2])
      rows.push({ id, model, variant, repeat, input: '민감한 질문 ' + id + ' ' + SENTINEL,
        reply: '민감한 대답 ' + SENTINEL, evaluation: {
          rating: model === MODELS[1] ? 'awkward' : 'good', note: '',
          details: [], source: 'prior-chat-survey' },
        questionDiscrimination: null, groupNote: '' });
  }
  return { schemaVersion: 'yeoul-evaluation-export-v1', experimentRunId: 42572722295,
    scope: 'all-288', sourceExperiment: { attemptedCalls: 288, successfulCalls: 288 },
    responses: rows };
};

test('valid private 288 matrix reports only counts; ratings stay untouched', () => {
  const s = source();
  const audit = validatePrivateYeoul288(s);
  assert.equal(audit.originalRowsChecked, 288);
  assert.equal(audit.questionFamiliesChecked, 12);
  assert.equal(audit.deepseekRowsChecked, 72);
  assert.equal(audit.ratingCounts.awkward, 72);
  assert.equal(audit.ratingCounts.good, 216);
  assert.equal(audit.sourceRawBytesAuthenticatedByExternalAuthority, false);
  assert.equal(audit.ownerReviewVerified, false);
  assert.equal(JSON.stringify(audit).includes(SENTINEL), false);
  assert.equal(s.responses[0].evaluation.rating, 'good');
});

test('missing, duplicate, and altered model/variant/repeat cells are rejected', () => {
  const s = source(); s.responses.pop();
  assert.throws(() => validatePrivateYeoul288(s), /original_288_source_required/);
  const duplicate = source(); duplicate.responses[1] = duplicate.responses[0];
  assert.throws(() => validatePrivateYeoul288(duplicate), /duplicate_row_key/);
  const model = source(); model.responses[0].model = 'unapproved/other';
  assert.throws(() => validatePrivateYeoul288(model), /private_row_contract/);
});

test('question text drift, auto question-discrimination values and forged source identity block', () => {
  const drift = source(); drift.responses[1].input = 'different private prompt';
  assert.throws(() => validatePrivateYeoul288(drift), /question_input_drift/);
  const auto = source(); auto.responses[0].questionDiscrimination = 'good';
  assert.throws(() => validatePrivateYeoul288(auto), /private_row_contract/);
  const fake = source(); fake.experimentRunId = 9;
  assert.throws(() => validatePrivateYeoul288(fake), /original_288_source_required/);
});

test('user caveats are counted, never treated as an approved quote', () => {
  const s = source();
  s.responses[0].evaluation.note = 'USER_PRIVATE_COMMENT:' + SENTINEL;
  s.responses[1].evaluation.details = ['grammar'];
  const audit = validatePrivateYeoul288(s);
  assert.equal(audit.goodWithCaveat, 2);
  assert.equal(audit.rowsWithUserNote, 1);
  assert.equal(audit.ownerReviewVerified, false);
  assert.equal(JSON.stringify(audit).includes('USER_PRIVATE_COMMENT'), false);
});

test('exact legacy/new development overlap gets flagged but never admitted', () => {
  const s = source();
  for (const row of s.responses) if (row.id === 'Y01')
    row.input = YEOUL_NEW_FAMILY_DRAFTS[0].turns[0];
  const report = inspectPrivateYeoulEvaluation(s);
  assert.ok(report.lexical.possibleLexicalOverlapCount >= 1);
  assert.equal(report.lexical.possibleOverlaps[0].possibleLexicalOverlap, true);
  assert.equal(report.readyForPaidExperiment, false);
  assert.equal(report.externalCalls, 0);
  assert.equal(report.semanticIndependenceVerified, false);
  assert.equal(JSON.stringify(report).includes(YEOUL_NEW_FAMILY_DRAFTS[0].turns[0]), false);
});

test('no lexical matches do not certify independent semantic validation', () => {
  const report = inspectPrivateYeoulEvaluation(source());
  assert.equal(report.lexical.possibleLexicalOverlapCount, 0);
  assert.equal(report.lexical.independentSemanticReviewVerified, false);
  assert.equal(report.userReviewerApproved, false);
  assert.equal(report.independentFinalHoldoutReady, false);
  assert.equal(report.productionEligible, false);
});

test('private local CLI writes metadata only, mode 0600, fails if report already exists', () => {
  const folder = mkdtempSync(join(tmpdir(), 'myeongha-private-288-'));
  try {
    const input = join(folder, 'source.json'), output = join(folder, 'audit.json');
    writeFileSync(input, JSON.stringify(source()), { mode: 0o600 });
    const script = fileURLToPath(new URL('./yeoul-private-source-intake-v1.mjs', import.meta.url));
    const stdout = execFileSync(process.execPath, [script, '--input', input, '--out', output], { encoding: 'utf8' });
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(report.legacy.originalRowsChecked, 288);
    assert.equal(report.privateOriginalNotPublished, true);
    assert.equal(report.originalByteHashMatchedToTrustedIndependentCopy, false);
    assert.equal(lstatSync(output).mode & 0o777, 0o600);
    assert.equal(JSON.stringify(report).includes(SENTINEL), false);
    assert.equal(stdout.includes(SENTINEL), false);
    assert.throws(() => execFileSync(process.execPath,
      [script, '--input', input, '--out', output], { stdio: 'pipe' }));
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).legacy.originalRowsChecked, 288);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('private path requirement forbids source symlinks and repository output', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'myeongha-private-288-'));
  try {
    const input = join(folder, 'source.json'), link = join(folder, 'indirect.json');
    writeFileSync(input, JSON.stringify(source()), { mode: 0o600 });
    symlinkSync(input, link);
    await assert.rejects(runPrivateYeoulIntake({ input: link, output: join(folder, 'audit.json') }),
      /unsafe_source_file/);
    const badTarget = fileURLToPath(new URL('./_intake-must-not-write.json', import.meta.url));
    await assert.rejects(runPrivateYeoulIntake({ input, output: badTarget }), /private_paths_required/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
