import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { selectPrivacyLedgerPredecessor } from '../../scripts/operations/select-privacy-ledger-predecessor.mjs';

const RUN_ID = 42381192945;
const HEAD = 'a'.repeat(40);
const run = (overrides = {}) => ({
  id: RUN_ID, path: '.github/workflows/production-postgres-privacy-recovery-ledger.yml',
  head_branch: 'main', head_sha: HEAD, status: 'completed',
  conclusion: 'success', event: 'workflow_dispatch', run_attempt: 2,
  ...overrides,
});
const job = (overrides = {}) => ({
  run_id: RUN_ID, run_attempt: 2, head_sha: HEAD,
  name: 'encrypted-off-db-privacy-recovery-ledger',
  status: 'completed', conclusion: 'success',
  started_at: '2026-11-07T17:00:36Z', completed_at: '2026-11-07T17:01:01Z',
  steps: [{
    name: 'Upload encrypted privacy recovery ledger', status: 'completed', conclusion: 'success',
    started_at: '2026-11-07T17:00:59Z', completed_at: '2026-11-07T17:00:59Z',
  }],
  ...overrides,
});
const artifact = (id, name, created, overrides = {}) => ({
  id, workflow_run: { id: RUN_ID }, name,
  expired: false, created_at: created, ...overrides,
});
const newer = artifact(13582736761, 'myeongha-privacy-ledger-20261107T170058Z',
  '2026-11-07T17:00:59Z');
const older = artifact(13577209175, 'myeongha-privacy-ledger-20261107T142134Z',
  '2026-11-07T14:21:35Z');
const select = (runs = run(), jobs = [job()], artifacts = [newer, older]) =>
  selectPrivacyLedgerPredecessor({
    run: runs, jobsReply: { total_count: jobs.length, jobs },
    artifactsReply: { total_count: artifacts.length, artifacts },
  });

test('real rerun shape: choose only latest successful attempt upload, not earlier artifact', () => {
  assert.deepEqual(select(), { artifactId: 13582736761, runId: RUN_ID, attempt: 2 });
  assert.equal(select(run({ run_attempt: 1 }), [job({ run_attempt: 1,
    started_at: '2026-11-07T14:21:10Z', completed_at: '2026-11-07T14:21:38Z',
    steps: [{ name: 'Upload encrypted privacy recovery ledger', status: 'completed',
      conclusion: 'success', started_at: '2026-11-07T14:21:35Z',
      completed_at: '2026-11-07T14:21:35Z' }],
  })], [older]).artifactId, older.id);
});

test('multiple valid artifacts in the same upload attempt remain fail-closed', () => {
  assert.throws(() => select(run(), [job()], [newer, { ...newer, id: 999999 }]),
    /ambiguous encrypted artifact/u);
});

test('missing or expired current attempt evidence does not fall back to older attempt', () => {
  assert.throws(() => select(run(), [job()], [older]), /missing, expired or ambiguous/u);
  assert.throws(() => select(run(), [job()], [{ ...newer, expired: true }, older]),
    /missing, expired or ambiguous/u);
  assert.throws(() => select(run(), [job()], [{ ...newer, workflow_run: { id: 11 } }, older]),
    /missing, expired or ambiguous/u);
});

test('job attempt/head identity, successful upload step and exact timestamps are mandatory', () => {
  assert.throws(() => select(run(), [job({ run_attempt: 1 })]), /successful capture job/u);
  assert.throws(() => select(run(), [job({ head_sha: 'b'.repeat(40) })]), /successful capture job/u);
  assert.throws(() => select(run(), [job({ steps: [] })]), /successful upload step/u);
  assert.throws(() => select(run(), [job({
    steps: [{ name: 'Upload encrypted privacy recovery ledger', status: 'completed',
      conclusion: 'success', started_at: '2026-11-07T17:02:00Z',
      completed_at: '2026-11-07T17:02:10Z' }],
  })]), /completion window/u);
});

test('wrong workflows, non-main or incomplete API pages never pass', () => {
  assert.throws(() => select(run({ head_branch: 'feature' })), /scope is invalid/u);
  assert.throws(() => select(run({ conclusion: 'failure' })), /scope is invalid/u);
  assert.throws(() => selectPrivacyLedgerPredecessor({
    run: run(), jobsReply: { total_count: 2, jobs: [job()] },
    artifactsReply: { total_count: 2, artifacts: [newer, older] },
  }), /metadata is incomplete/u);
});

test('production workflow uses attempt-scoped selection and retains encrypted overlap guard', () => {
  const workflow = readFileSync('.github/workflows/production-postgres-privacy-recovery-ledger.yml', 'utf8');
  assert.match(workflow, /attempts\/\$previous_attempt\/jobs\?per_page=100/u);
  assert.match(workflow, /node scripts\/operations\/select-privacy-ledger-predecessor\.mjs/u);
  assert.match(workflow, /bash scripts\/operations\/export-production-postgres-privacy-recovery-ledger\.sh/u);
  const exporter = readFileSync('scripts/operations/export-production-postgres-privacy-recovery-ledger.sh', 'utf8');
  assert.match(exporter, /verify-previous-privacy-ledger-snapshot-overlap\.sh/u);
  assert.match(exporter, /PREVIOUS_LEDGER_ARTIFACT_DIR/u);
  assert.match(workflow, /github-token: \$\{\{ github\.token \}\}/u);
  assert.doesNotMatch(workflow, /continue-on-error: true/u);
});
