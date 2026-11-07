// Watchtower-Track: ops
// Pick exactly one encrypted privacy ledger artifact from the LAST successful
// attempt's verified upload step. Older rerun artifacts must never be mistaken
// for missing or continuous source authority.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const WORKFLOW_PATH = '.github/workflows/production-postgres-privacy-recovery-ledger.yml';
const CAPTURE_JOB = 'encrypted-off-db-privacy-recovery-ledger';
const UPLOAD_STEP = 'Upload encrypted privacy recovery ledger';
const ARTIFACT_NAME = /^myeongha-privacy-ledger-[0-9]{8}T[0-9]{6}Z$/u;

function fail() {
  throw new Error('HOLD_PRIVACY_LEDGER_PREDECESSOR: latest successful attempt has no single verifiable encrypted upload artifact.');
}
function validId(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function timestamp(value) {
  return typeof value === 'string' ? Date.parse(value) : NaN;
}

/** Metadata-only determination. The next job step separately verifies
 * encrypted artifact bytes and the previous/current source overlap.
 * No old attempt can satisfy a newer attempt's upload proof.
 */
export function selectPreviousPrivacyLedgerArtifact({ run, jobReply, artifactReply }) {
  if (!run || !validId(run.id) ||
      !validId(run.run_attempt) ||
      run.path !== WORKFLOW_PATH ||
      run.head_branch !== 'main' ||
      !['schedule', 'workflow_dispatch'].includes(run.event) ||
      run.status !== 'completed' || run.conclusion !== 'success' ||
      !/^[0-9a-f]{40}$/u.test(run.head_sha ?? '') ||
      !Array.isArray(jobReply?.jobs) ||
      !Number.isSafeInteger(jobReply.total_count) ||
      jobReply.total_count !== jobReply.jobs.length ||
      !Array.isArray(artifactReply?.artifacts) ||
      !Number.isSafeInteger(artifactReply.total_count) ||
      artifactReply.total_count !== artifactReply.artifacts.length) fail();

  const matchedJobs = jobReply.jobs.filter(job =>
    job?.run_id === run.id &&
    job?.run_attempt === run.run_attempt &&
    job?.head_sha === run.head_sha &&
    job?.name === CAPTURE_JOB &&
    job?.status === 'completed' && job?.conclusion === 'success');
  if (matchedJobs.length !== 1) fail();

  const job = matchedJobs[0];
  const uploadSteps = (Array.isArray(job.steps) ? job.steps : []).filter(step =>
    step?.name === UPLOAD_STEP &&
    step?.status === 'completed' && step?.conclusion === 'success');
  if (uploadSteps.length !== 1) fail();
  const upload = uploadSteps[0];
  const jobStart = timestamp(job.started_at);
  const jobEnd = timestamp(job.completed_at);
  const startedAt = timestamp(upload.started_at);
  const endedAt = timestamp(upload.completed_at);
  if (!Number.isFinite(jobStart) || !Number.isFinite(jobEnd) ||
      !Number.isFinite(startedAt) || !Number.isFinite(endedAt) ||
      !(jobStart <= startedAt && startedAt <= endedAt && endedAt <= jobEnd)) fail();

  const candidates = artifactReply.artifacts.filter(artifact =>
    validId(artifact?.id) &&
    artifact?.workflow_run?.id === run.id &&
    artifact?.expired === false &&
    ARTIFACT_NAME.test(artifact?.name ?? '') &&
    Number.isFinite(timestamp(artifact.created_at)) &&
    timestamp(artifact.created_at) >= startedAt &&
    timestamp(artifact.created_at) <= endedAt);
  if (candidates.length !== 1) fail();

  return Object.freeze({ runId: run.id, artifactId: candidates[0].id });
}

async function main() {
  const [runPath, jobsPath, artifactsPath, ...extra] = process.argv.slice(2);
  if (!runPath || !jobsPath || !artifactsPath || extra.length > 0) fail();
  const [run, jobReply, artifactReply] = await Promise.all(
    [runPath, jobsPath, artifactsPath].map(async path =>
      JSON.parse(await readFile(path, 'utf8'))),
  );
  const { runId, artifactId } = selectPreviousPrivacyLedgerArtifact({
    run, jobReply, artifactReply,
  });
  // One atomic stdout write: safe for redirect into GITHUB_OUTPUT.
  process.stdout.write('artifact_id=' + artifactId + '\nrun_id=' + runId + '\n');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(() => {
    console.error('::error title=Privacy ledger predecessor attempt unverified::' +
      'Latest successful capture attempt has no unique verified encrypted upload artifact. No fallback to older attempts.');
    process.exitCode = 1;
  });
}
