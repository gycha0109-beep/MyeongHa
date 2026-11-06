import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'gycha0109-beep/MyeongHa';
const WORKFLOW = 'production-postgres-privacy-recovery-ledger.yml';
const NOMINAL_INTERVAL_SECONDS = 3600;
const MAX_INTERVAL_SECONDS = 2 * NOMINAL_INTERVAL_SECONDS;
const ARTIFACT_NAME = /^myeongha-privacy-ledger-[0-9]{8}T[0-9]{6}Z$/u;
const CAPTURE_JOB = 'encrypted-off-db-privacy-recovery-ledger';
const UPLOAD_STEP = 'Upload encrypted privacy recovery ledger';
const timestamp = (value) => typeof value === 'string' ? Date.parse(value) : NaN;

function fail(reason) {
  throw new Error('HOLD_PRIVACY_LEDGER_FRESHNESS: ' + reason);
}

function latestSuccessfulRun(runs) {
  const successes = runs.filter((run) =>
    run?.status === 'completed' && run?.conclusion === 'success' &&
    run?.head_branch === 'main' &&
    ['schedule', 'workflow_dispatch'].includes(run?.event) &&
    Number.isSafeInteger(run?.id) && run.id > 0 &&
    Number.isSafeInteger(run?.run_attempt) && run.run_attempt > 0 &&
    /^[a-f0-9]{40}$/u.test(run?.head_sha ?? '') && Number.isFinite(timestamp(run.updated_at)));
  successes.sort((a, b) => timestamp(b.updated_at) - timestamp(a.updated_at) || b.id - a.id);
  return successes[0];
}

function verifiedCaptureCompletion(run, jobs) {
  const matches = jobs.filter((job) =>
    job?.run_id === run.id && job?.run_attempt === run.run_attempt && job?.head_sha === run.head_sha &&
    job?.name === CAPTURE_JOB && job?.status === 'completed' && job?.conclusion === 'success');
  if (matches.length !== 1) return null;
  const job = matches[0];
  const uploads = (Array.isArray(job.steps) ? job.steps : []).filter((step) =>
    step?.name === UPLOAD_STEP && step?.status === 'completed' && step?.conclusion === 'success');
  if (uploads.length !== 1) return null;
  const [upload] = uploads;
  const started = timestamp(job.started_at);
  const completed = timestamp(job.completed_at);
  const uploadStarted = timestamp(upload.started_at);
  const uploadCompleted = timestamp(upload.completed_at);
  if (!(started <= uploadStarted && uploadStarted <= uploadCompleted && uploadCompleted <= completed)) return null;
  return { completed, completedAt: job.completed_at, uploadStarted, uploadCompleted };
}

export function assessPrivacyLedgerFreshness({ runs, jobs, artifacts, nowMs }) {
  if (!Array.isArray(runs) || !Array.isArray(jobs) || !Array.isArray(artifacts) ||
      !Number.isFinite(nowMs) || nowMs < 0) fail('invalid metadata input');
  const latest = latestSuccessfulRun(runs);
  let status = latest ? 'CAPTURE_COMPLETION_METADATA_UNAVAILABLE' : 'NO_SUCCESSFUL_CAPTURE';
  let elapsedSeconds = null;
  let encryptedArtifactObserved = false;
  const completion = latest ? verifiedCaptureCompletion(latest, jobs) : null;
  if (completion) {
    elapsedSeconds = Math.floor((nowMs - completion.completed) / 1000);
    encryptedArtifactObserved = artifacts.some((artifact) =>
      artifact?.workflow_run?.id === latest.id &&
      typeof artifact?.name === 'string' &&
      ARTIFACT_NAME.test(artifact.name) &&
      artifact?.expired === false &&
      timestamp(artifact.created_at) >= completion.uploadStarted &&
      timestamp(artifact.created_at) <= completion.uploadCompleted);
    if (elapsedSeconds < -60) status = 'INVALID_FUTURE_COMPLETION';
    else if (!encryptedArtifactObserved) status = 'ENCRYPTED_ARTIFACT_UNAVAILABLE';
    else if (elapsedSeconds >= MAX_INTERVAL_SECONDS) status = 'CAPTURE_COMPLETION_STALE';
    else status = 'RECENT_CAPTURE_COMPLETION_OBSERVED';
  }
  return Object.freeze({
    schema: 'myeongha-privacy-ledger-completion-freshness-v1',
    monitoredWorkflow: WORKFLOW,
    nominalScheduledIntervalSeconds: NOMINAL_INTERVAL_SECONDS,
    maximumObservedCompletionAgeSeconds: MAX_INTERVAL_SECONDS,
    latestSuccessfulRunId: latest?.id ?? null,
    latestSuccessfulRunAttempt: latest?.run_attempt ?? null,
    latestSuccessfulUpdatedAt: latest?.updated_at ?? null,
    latestSuccessfulCompletedAt: completion?.completedAt ?? null,
    elapsedSinceRunCompletionSeconds: elapsedSeconds,
    encryptedArtifactObserved,
    status,
    checkPassed: status === 'RECENT_CAPTURE_COMPLETION_OBSERVED',
    sourceContinuityProven: false,
    futureSafePrivacyReconciliation: false,
    approvedRpoProven: false,
    drReady: false,
    serviceResumptionAllowed: false,
    outputContainsIdentifiers: false,
  });
}

async function getGithubJson(path, token) {
  const url = new URL('https://api.github.com' + path);
  if (url.protocol !== 'https:' || url.host !== 'api.github.com') fail('unexpected API destination');
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'MyeongHa-ops-privacy-freshness',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    fail('GitHub Actions metadata request unavailable');
  }
  if (!response.ok) fail('GitHub Actions metadata request rejected (status ' + response.status + ')');
  try {
    return await response.json();
  } catch {
    fail('GitHub Actions metadata response malformed');
  }
}

export async function inspectPrivacyLedgerCompletion(env, nowMs = Date.now()) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== REPOSITORY ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      !['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)) {
    fail('main-only GitHub Actions scope required');
  }
  const token = env.GH_TOKEN;
  if (typeof token !== 'string' || token.length < 10) fail('read-only Actions token unavailable');
  const prefix = '/repos/' + REPOSITORY + '/actions';
  const runsReply = await getGithubJson(
    prefix + '/workflows/' + WORKFLOW + '/runs?branch=main&status=success&per_page=20',
    token,
  );
  if (!Array.isArray(runsReply?.workflow_runs)) fail('successful runs response malformed');
  const run = latestSuccessfulRun(runsReply.workflow_runs);
  let jobs = [];
  let artifacts = [];
  if (run) {
    const runPath = prefix + '/runs/' + run.id;
    const [jobReply, artifactReply] = await Promise.all([
      getGithubJson(runPath + '/attempts/' + run.run_attempt + '/jobs?per_page=100', token),
      getGithubJson(runPath + '/artifacts?per_page=100', token),
    ]);
    if (!Array.isArray(jobReply?.jobs) || jobReply.total_count !== jobReply.jobs.length) fail('source attempt job list malformed');
    if (!Array.isArray(artifactReply?.artifacts)) fail('source artifact list malformed');
    jobs = jobReply.jobs;
    artifacts = artifactReply.artifacts;
  }
  return assessPrivacyLedgerFreshness({ runs: runsReply.workflow_runs, jobs, artifacts, nowMs });
}

async function main() {
  const report = await inspectPrivacyLedgerCompletion(process.env);
  const summary = [
    '### Production privacy recovery ledger — independent completion freshness',
    '',
    '- Status: ' + report.status,
    '- Latest successful run ID: ' + (report.latestSuccessfulRunId ?? 'unavailable'),
    '- Seconds since successful capture job completion: ' + (report.elapsedSinceRunCompletionSeconds ?? 'unavailable'),
    '- Non-expired encrypted artifact created during the verified upload step: ' + report.encryptedArtifactObserved,
    '- Alert boundary: ' + report.maximumObservedCompletionAgeSeconds + ' seconds (twice nominal hourly cadence; NOT RPO)',
    '- Independently continuous event source: NOT PROVEN',
    '- DR/serving: BLOCKED',
    '',
  ].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');
  console.log(JSON.stringify(report));
  if (!report.checkPassed) {
    console.error('::error title=Privacy ledger capture completion stale or unavailable::' +
      'No recent completed encrypted snapshot verified; status=' + report.status +
      '; last run=' + (report.latestSuccessfulRunId ?? 'none') +
      '; inspect the protected privacy-ledger workflow. This signal is not continuous CDC or RPO evidence.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'HOLD_PRIVACY_LEDGER_FRESHNESS');
    process.exitCode = 1;
  });
}
