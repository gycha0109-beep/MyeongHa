// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  selectPreviousPrivacyLedgerArtifact,
} from './select-previous-privacy-ledger-artifact.mjs';

const RUN_ID = 42381192945;
const SHA = '049a6a31981265025ec40b2b3f0ab3ffeb38d2be';
const latestRun = Object.freeze({
  id: RUN_ID,
  run_attempt: 2,
  path: '.github/workflows/production-postgres-privacy-recovery-ledger.yml',
  event: 'schedule',
  head_branch: 'main',
  head_sha: SHA,
  status: 'completed',
  conclusion: 'success',
});
const latestJob = Object.freeze({
  run_id: RUN_ID,
  run_attempt: 2,
  head_sha: SHA,
  name: 'encrypted-off-db-privacy-recovery-ledger',
  status: 'completed',
  conclusion: 'success',
  started_at: '2026-11-07T17:00:36Z',
  completed_at: '2026-11-07T17:01:01Z',
  steps: [{
    name: 'Upload encrypted privacy recovery ledger',
    started_at: '2026-11-07T17:00:59Z',
    completed_at: '2026-11-07T17:00:59Z',
    status: 'completed',
    conclusion: 'success',
  }],
});
const currentArtifact = Object.freeze({
  id: 13582736761, workflow_run: { id: RUN_ID },
  name: 'myeongha-privacy-ledger-20261107T170058Z',
  created_at: '2026-11-07T17:00:59Z', expired: false,
});
const olderArtifact = Object.freeze({
  id: 13577209175, workflow_run: { id: RUN_ID },
  name: 'myeongha-privacy-ledger-20261107T142134Z',
  created_at: '2026-11-07T14:21:35Z', expired: false,
});
const evidence = (changes = {}) => ({
  run: latestRun,
  jobReply: { total_count: 1, jobs: [latestJob] },
  artifactReply: {
    total_count: 2,
    artifacts: [currentArtifact, olderArtifact],
  },
  ...changes,
});
const rejected = (input) =>
  assert.throws(() => selectPreviousPrivacyLedgerArtifact(input),
    /HOLD_PRIVACY_LEDGER_PREDECESSOR/u);

test('observed successful attempt 2 chooses its uploaded artifact, not attempt 1', () => {
  assert.deepEqual(selectPreviousPrivacyLedgerArtifact(evidence()), {
    runId: RUN_ID,
    artifactId: 13582736761,
  });
});
test('previous successful run with just one artifact remains supported', () => {
  const onlyCurrent = {
    total_count: 1,
    artifacts: [currentArtifact],
  };
  assert.equal(selectPreviousPrivacyLedgerArtifact(
    evidence({ artifactReply: onlyCurrent })).artifactId, currentArtifact.id);
});
test('no silent fallback to old successful attempt when latest attempt artifact is absent', () => {
  rejected(evidence({ artifactReply: { total_count: 1, artifacts: [olderArtifact] } }));
});
test('two artifacts in the SAME verified upload window are genuinely ambiguous', () => {
  const twin = { ...currentArtifact, id: 13582736762 };
  rejected(evidence({ artifactReply: { total_count: 2, artifacts: [currentArtifact, twin] } }));
});
test('expired, renamed, foreign-run or invalid-time predecessor cannot pass', () => {
  for (const tampered of [
    { ...currentArtifact, expired: true },
    { ...currentArtifact, name: 'some-other-artifact' },
    { ...currentArtifact, workflow_run: { id: 777 } },
    { ...currentArtifact, created_at: '2026-11-07T17:03:00Z' },
    { ...currentArtifact, created_at: 'invalid' },
  ]) rejected(evidence({ artifactReply: { total_count: 1, artifacts: [tampered] } }));
});
test('latest attempt requires exact successful capture job and successful upload step', () => {
  for (const job of [
    { ...latestJob, run_attempt: 1 },
    { ...latestJob, head_sha: 'f'.repeat(40) },
    { ...latestJob, conclusion: 'failure' },
    { ...latestJob, steps: [] },
    { ...latestJob, steps: [{ ...latestJob.steps[0], conclusion: 'failure' }] },
  ]) rejected(evidence({ jobReply: { total_count: 1, jobs: [job] } }));
});
test('mismatched or paginated GitHub API lists fail rather than choosing a partial page', () => {
  rejected(evidence({ jobReply: { total_count: 2, jobs: [latestJob] } }));
  rejected(evidence({ artifactReply: {
    total_count: 3, artifacts: [currentArtifact, olderArtifact],
  } }));
});
test('foreign, failed and malformed predecessor-run provenance fails closed', () => {
  for (const changed of [
    { head_branch: 'feature' },
    { conclusion: 'failure' },
    { run_attempt: 1 },
    { path: '.github/workflows/wrong.yml' },
    { head_sha: 'not-an-exact-sha' },
    { event: 'push' },
  ]) rejected(evidence({ run: { ...latestRun, ...changed } }));
});
test('job/upload timestamp ordering must be internally consistent', () => {
  rejected(evidence({ jobReply: { total_count: 1, jobs: [{
    ...latestJob, started_at: '2026-11-07T17:01:00Z',
  }] } }));
  rejected(evidence({ jobReply: { total_count: 1, jobs: [{
    ...latestJob, steps: [{
      ...latestJob.steps[0], started_at: 'not-a-time',
    }],
  }] } }));
});
