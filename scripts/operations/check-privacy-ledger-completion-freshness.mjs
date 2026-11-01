import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'gycha0109-beep/MyeongHa';
const WORKFLOW = 'production-postgres-privacy-recovery-ledger.yml';
const NOMINAL_INTERVAL_SECONDS = 3600;
const MAX_INTERVAL_SECONDS = 2 * NOMINAL_INTERVAL_SECONDS;
const ARTIFACT_NAME = /^myeongha-privacy-ledger-[0-9]{8}T[0-9]{6}Z$/u;

function fail(reason) {
  throw new Error('HOLD_PRIVACY_LEDGER_FRESHNESS: ' + reason);
}

export function assessPrivacyLedgerFreshness({ runs, artifacts, nowMs }) {
  if (!Array.isArray(runs) || !Array.isArray(artifacts) ||
      !Number.isFinite(nowMs) || nowMs < 0) fail('invalid metadata input');
  const successes = runs.filter((run) =>
    run?.status === 'completed' && run?.conclusion === 'success' &&
    run?.head_branch === 'main' &&
    ['schedule', 'workflow_dispatch'].includes(run?.event) &&
    Number.isSafeInteger(run?.id) && run.id > 0 &&
    typeof run.updated_at === 'string' &&
    Number.isFinite(Date.parse(run.updated_at)));
  successes.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const latest = successes[0];
  let status = 'NO_SUCCESSFUL_CAPTURE';
  let elapsedSeconds = null;
  let latestSuccessfulRunId = null;
  let latestSuccessfulUpdatedAt = null;
  let encryptedArtifactObserved = false;
  if (latest) {
    latestSuccessfulRunId = latest.id;
    latestSuccessfulUpdatedAt = latest.updated_at;
    elapsedSeconds = Math.floor((nowMs - Date.parse(latest.updated_at)) / 1000);
    encryptedArtifactObserved = artifacts.some((artifact) =>
      artifact?.workflow_run?.id === latest.id &&
      typeof artifact?.name === 'string' &&
      ARTIFACT_NAME.test(artifact.name) &&
      artifact?.expired === false);
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
    latestSuccessfulRunId,
    latestSuccessfulUpdatedAt,
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
  const successes = runsReply.workflow_runs.filter((run) =>
    run?.head_branch === 'main' && run?.conclusion === 'success' &&
    ['schedule', 'workflow_dispatch'].includes(run?.event));
  successes.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const run = successes[0];
  let artifacts = [];
  if (run) {
    if (!Number.isSafeInteger(run.id) || run.id <= 0) fail('source run ID invalid');
    const artifactReply = await getGithubJson(
      prefix + '/runs/' + run.id + '/artifacts?per_page=100',
      token,
    );
    if (!Array.isArray(artifactReply?.artifacts)) fail('source artifact list malformed');
    artifacts = artifactReply.artifacts;
  }
  return assessPrivacyLedgerFreshness({ runs: runsReply.workflow_runs, artifacts, nowMs });
}

async function main() {
  const report = await inspectPrivacyLedgerCompletion(process.env);
  const summary = [
    '### Production privacy recovery ledger — independent completion freshness',
    '',
    '- Status: ' + report.status,
    '- Latest successful run ID: ' + (report.latestSuccessfulRunId ?? 'unavailable'),
    '- Seconds since GitHub-reported completion: ' + (report.elapsedSinceRunCompletionSeconds ?? 'unavailable'),
    '- Exact non-expired encrypted artifact listed: ' + report.encryptedArtifactObserved,
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
