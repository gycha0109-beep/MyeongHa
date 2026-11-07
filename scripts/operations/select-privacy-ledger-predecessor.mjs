import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKFLOW = '.github/workflows/production-postgres-privacy-recovery-ledger.yml';
const CAPTURE_JOB = 'encrypted-off-db-privacy-recovery-ledger';
const UPLOAD_STEP = 'Upload encrypted privacy recovery ledger';
const ARTIFACT = /^myeongha-privacy-ledger-[0-9]{8}T[0-9]{6}Z$/u;

const timestamp = (s) => typeof s === 'string' ? Date.parse(s) : NaN;
const fail = (reason) => {
  throw new Error('PRIVACY_LEDGER_PREDECESSOR_UNVERIFIED: ' + reason);
};

// A rerun retains old artifacts on the same workflow run. Only the artifact
// uploaded by the *latest successful attempt* is a valid predecessor.
// Ambiguity within that attempt is still a hard failure.
export function selectPrivacyLedgerPredecessor({ run, jobsReply, artifactsReply }) {
  if (!Number.isSafeInteger(run?.id) || run.id <= 0 ||
      run?.path !== WORKFLOW || run?.head_branch !== 'main' ||
      !['schedule', 'workflow_dispatch'].includes(run?.event) ||
      run?.status !== 'completed' || run?.conclusion !== 'success' ||
      !Number.isSafeInteger(run?.run_attempt) || run.run_attempt < 1 ||
      !/^[a-f0-9]{40}$/u.test(run?.head_sha ?? '')) {
    fail('latest successful run identity or scope is invalid');
  }
  const jobs = jobsReply?.jobs;
  const artifacts = artifactsReply?.artifacts;
  if (!Array.isArray(jobs) || jobsReply.total_count !== jobs.length ||
      !Array.isArray(artifacts) || artifactsReply.total_count !== artifacts.length ||
      jobs.length > 100 || artifacts.length > 100) {
    fail('job or artifact metadata is incomplete');
  }
  const matchingJobs = jobs.filter((job) =>
    job?.run_id === run.id && job?.run_attempt === run.run_attempt &&
    job?.head_sha === run.head_sha && job?.name === CAPTURE_JOB &&
    job?.status === 'completed' && job?.conclusion === 'success');
  if (matchingJobs.length !== 1) fail('latest attempt has no unique successful capture job');
  const [job] = matchingJobs;
  const steps = Array.isArray(job.steps) ? job.steps : [];
  const uploads = steps.filter((step) =>
    step?.name === UPLOAD_STEP && step?.status === 'completed' && step?.conclusion === 'success');
  if (uploads.length !== 1) fail('latest attempt has no unique successful upload step');
  const [upload] = uploads;
  const started = timestamp(job.started_at);
  const completed = timestamp(job.completed_at);
  const uploadStarted = timestamp(upload.started_at);
  const uploadCompleted = timestamp(upload.completed_at);
  if (![started, completed, uploadStarted, uploadCompleted].every(Number.isFinite) ||
      !(started <= uploadStarted && uploadStarted <= uploadCompleted && uploadCompleted <= completed)) {
    fail('latest attempt upload completion window is invalid');
  }
  const matchingArtifacts = artifacts.filter((artifact) =>
    Number.isSafeInteger(artifact?.id) && artifact.id > 0 &&
    artifact?.workflow_run?.id === run.id &&
    typeof artifact?.name === 'string' && ARTIFACT.test(artifact.name) &&
    artifact?.expired === false &&
    timestamp(artifact.created_at) >= uploadStarted &&
    timestamp(artifact.created_at) <= uploadCompleted);
  if (matchingArtifacts.length !== 1) {
    fail('missing, expired or ambiguous encrypted artifact for latest successful upload step');
  }
  return Object.freeze({
    artifactId: matchingArtifacts[0].id,
    runId: run.id,
    attempt: run.run_attempt,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 5) fail('expected exact run, attempt jobs and artifacts JSON paths');
  const [run, jobsReply, artifactsReply] = process.argv.slice(2).map((path) =>
    JSON.parse(readFileSync(path, 'utf8')));
  const chosen = selectPrivacyLedgerPredecessor({ run, jobsReply, artifactsReply });
  process.stdout.write('artifact_id=' + chosen.artifactId + '\n');
  process.stdout.write('run_id=' + chosen.runId + '\n');
}
