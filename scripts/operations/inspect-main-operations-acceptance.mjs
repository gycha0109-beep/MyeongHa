import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAIN_OPERATIONS_EVIDENCE_SCHEMA_V1 = 'myeongha-main-operations-evidence-v1';
const REPOSITORY = 'gycha0109-beep/MyeongHa';
const SHA = /^[a-f0-9]{40}$/u;
const WORKFLOWS = Object.freeze([
  'CI', 'Governance', 'Web Browser Smoke', 'Supabase Production',
]);

function error(message) {
  throw new Error('MAIN_OPERATIONS_EVIDENCE: ' + message);
}

function safeRun(run, sha) {
  return run && run.head_sha === sha &&
    run.head_branch === 'main' && run.event === 'push' &&
    Number.isSafeInteger(run.id) && run.id > 0 &&
    WORKFLOWS.includes(run.name);
}

function statusForRun(run) {
  if (!run) return 'NOT_OBSERVED';
  if (run.status !== 'completed') return 'IN_PROGRESS';
  if (run.conclusion === 'success') return 'SUCCESS';
  if (run.conclusion === 'skipped') return 'SKIPPED';
  if (run.conclusion === 'cancelled') return 'CANCELLED';
  return 'FAILURE';
}

export function summarizeMainOperationsEvidenceV1({
  requestedSha,
  confirmedCommitSha,
  currentMainSha,
  runs,
  productionJobs = [],
}) {
  if (!SHA.test(requestedSha) || !SHA.test(confirmedCommitSha) ||
      requestedSha !== confirmedCommitSha ||
      !SHA.test(currentMainSha) ||
      !Array.isArray(runs) || !Array.isArray(productionJobs)) {
    error('commit provenance or GitHub response is invalid');
  }

  const observed = {};
  for (const name of WORKFLOWS) {
    const matching = runs.filter(run => safeRun(run, requestedSha) && run.name === name);
    matching.sort((a, b) => b.id - a.id);
    const selected = matching[0];
    observed[name] = Object.freeze({
      state: statusForRun(selected),
      runId: selected?.id ?? null,
      url: selected ? 'https://github.com/' + REPOSITORY + '/actions/runs/' + selected.id : null,
    });
  }

  const prodRun = observed['Supabase Production'];
  const selectedJob = prodRun.state === 'SUCCESS'
    ? productionJobs.find(job => job?.name === 'deploy-migrations')
    : null;
  const dbDeployment = !selectedJob ? 'NOT_OBSERVED'
    : selectedJob.status !== 'completed' ? 'IN_PROGRESS'
    : selectedJob.conclusion === 'success' ? 'SUCCESS'
    : selectedJob.conclusion === 'skipped' ? 'SKIPPED' : 'FAILURE';

  const requirements = Object.freeze({
    exactSourceSha: 'OBSERVED',
    providerDeploymentState: 'NOT_OBSERVED',
    configurationPreflight: 'NOT_OBSERVED',
    liveLiveness: 'NOT_OBSERVED',
    liveReadiness: 'NOT_OBSERVED',
    negativeAuthSmoke: 'NOT_OBSERVED',
    positiveSyntheticAuthSmoke: 'NOT_OBSERVED',
    liveDependencyCheck: 'NOT_OBSERVED',
    sajuCompatibilityCheck: 'NOT_OBSERVED',
    livePrivateNoStore: 'NOT_OBSERVED',
    liveSecretNonReflection: 'NOT_OBSERVED',
    liveLogPresenceAndRedaction: 'NOT_OBSERVED',
    liveMetricsPresence: 'NOT_OBSERVED',
    identifiedRollbackCandidate: 'NOT_OBSERVED',
  });
  const workflowStates = Object.freeze(Object.fromEntries(
    WORKFLOWS.map(name => [name, observed[name]]),
  ));

  return Object.freeze({
    schema: MAIN_OPERATIONS_EVIDENCE_SCHEMA_V1,
    target: 'github-main-commit-readonly',
    sourceSha: requestedSha,
    currentMainSha,
    sourceIsCurrentMain: requestedSha === currentMainSha,
    workflows: workflowStates,
    productionDatabaseMigrationJob: dbDeployment,
    productionWorkflowSuccessIsNotDeploymentProof: true,
    minimumProductionVerification: requirements,
    observedMinimumRequirementCount: Object.values(requirements).filter(
      value => value === 'OBSERVED',
    ).length,
    acceptanceDecision: 'NOT_EVALUATED_BY_COLLECTOR',
    noRuntimeOrProductionMutations: true,
    outputContainsIdentifiers: false,
  });
}

export async function collectMainOperationsEvidenceV1({
  sha,
  token = '',
  request = fetch,
} = {}) {
  if (!SHA.test(sha ?? '') || typeof request !== 'function' ||
      typeof token !== 'string') {
    error('an exact 40-character commit SHA and request transport are required');
  }
  const base = 'https://api.github.com/repos/' + REPOSITORY;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
  };
  async function get(path) {
    const response = await request(base + path, {
      method: 'GET', redirect: 'error', headers,
      signal: AbortSignal.timeout(10000),
    });
    if (response.status !== 200) error('GitHub read-only evidence request failed');
    return response.json();
  }
  const [commit, ref, workflowResponse] = await Promise.all([
    get('/commits/' + sha),
    get('/git/ref/heads/main'),
    get('/actions/runs?head_sha=' + sha + '&per_page=100'),
  ]);
  if (!Array.isArray(workflowResponse?.workflow_runs) ||
      workflowResponse.total_count > 100 ||
      typeof commit?.sha !== 'string' ||
      typeof ref?.object?.sha !== 'string') {
    error('incomplete commit-bound workflow evidence');
  }
  const candidates = workflowResponse.workflow_runs
    .filter(run => safeRun(run, sha) && run.name === 'Supabase Production')
    .sort((a, b) => b.id - a.id);
  const selected = candidates[0];
  let productionJobs = [];
  if (selected?.status === 'completed' && selected?.conclusion === 'success') {
    const response = await get('/actions/runs/' + selected.id + '/jobs?per_page=100');
    if (!Array.isArray(response?.jobs) || response.total_count > 100) {
      error('incomplete production workflow job evidence');
    }
    productionJobs = response.jobs;
  }
  return summarizeMainOperationsEvidenceV1({
    requestedSha: sha,
    confirmedCommitSha: commit.sha,
    currentMainSha: ref.object.sha,
    runs: workflowResponse.workflow_runs,
    productionJobs,
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--sha') {
      error('usage: --sha 40-character-main-commit');
    }
    console.log(JSON.stringify(await collectMainOperationsEvidenceV1({
      sha: process.argv[3],
      token: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '',
    })));
  } catch {
    console.error('MAIN_OPERATIONS_EVIDENCE: failed to collect read-only commit evidence');
    process.exitCode = 1;
  }
}
