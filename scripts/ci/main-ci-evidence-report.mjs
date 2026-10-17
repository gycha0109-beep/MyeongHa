import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}$/u;
const FINISHED = new Set(['success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required', 'neutral', 'stale']);
const ACTIVE = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);
const MAIN_WORKFLOWS = [
  'CI', 'Governance', 'Supabase Production',
  'DB Runtime Authority Suite', 'DB Content Reading Suite',
  'DB Commerce Payment Suite', 'DB Commerce Entitlement Suite',
  'DB PostgreSQL 17 Authority Suite',
];

function outcome(item) {
  if (item.status === 'completed') {
    if (!FINISHED.has(item.conclusion)) throw new Error('Completed item has missing/unrecognized conclusion');
    return item.conclusion;
  }
  if (!ACTIVE.has(item.status) || item.conclusion !== null && item.conclusion !== undefined) {
    throw new Error('Unrecognized or inconsistent active status');
  }
  return 'in_progress';
}
function requireDate(value) {
  const t = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(t)) throw new Error('Missing or invalid workflow timestamp');
  return t;
}
function isMainPush(run) {
  return run.event === 'push' && run.head_branch === 'main';
}

export function summarizeMainCiEvidence(runs, jobsByRun, { latestMainSha, observedAt } = {}) {
  if (!SHA.test(latestMainSha ?? '') || !Array.isArray(runs) || jobsByRun === null
    || typeof jobsByRun !== 'object' || Array.isArray(jobsByRun)) {
    throw new Error('Provide a current main SHA, workflow runs and exact run-job map');
  }
  const now = requireDate(observedAt);
  const chosen = runs.filter(isMainPush);
  const ids = new Set();
  const parsed = chosen.map(run => {
    if (!Number.isSafeInteger(run.id) || run.id < 1 || !SHA.test(run.head_sha ?? '')) {
      throw new Error('Invalid main workflow run identity');
    }
    if (ids.has(run.id)) throw new Error('Duplicate workflow run ID');
    ids.add(run.id);
    const createdAtMs = requireDate(run.created_at);
    if (createdAtMs > now) throw new Error('Workflow run created after observedAt');
    if (typeof run.name !== 'string' || !run.name.trim()) throw new Error('Missing workflow name');
    const jobs = jobsByRun[String(run.id)];
    if (!Array.isArray(jobs) || jobs.length === 0) {
      throw new Error('Missing job evidence for main run ' + run.id);
    }
    const jobNames = new Set();
    const observedJobs = jobs.map(job => {
      if (typeof job.name !== 'string' || !job.name.trim() || jobNames.has(job.name)) {
        throw new Error('Missing or duplicate job name for run ' + run.id);
      }
      jobNames.add(job.name);
      return { name: job.name, outcome: outcome(job) };
    });
    return {
      run_id: run.id, name: run.name, head_sha: run.head_sha,
      created_at: run.created_at, outcome: outcome(run),
      jobs: observedJobs, _created_at: createdAtMs,
    };
  }).sort((a, b) => b._created_at - a._created_at || b.run_id - a.run_id);
  const latest = parsed.filter(run => run.head_sha === latestMainSha);
  const previous = parsed.filter(run => run.head_sha !== latestMainSha);
  const workflows = MAIN_WORKFLOWS.map(name => {
    const match = latest.find(run => run.name === name) ?? null;
    if (match === null) return { name, outcome: 'missing', run_id: null, jobs: [] };
    return { name, outcome: match.outcome, run_id: match.run_id, jobs: match.jobs };
  });
  const ci = workflows.find(w => w.name === 'CI');
  const jobOutcome = (wf, name) => wf.jobs.find(j => j.name === name)?.outcome ?? 'missing';
  const ciProof = ci.outcome === 'success'
    && jobOutcome(ci, 'CI Verify') === 'success'
    && jobOutcome(ci, 'db-authority-core') === 'success';
  const prod = workflows.find(w => w.name === 'Supabase Production');
  const deploy = prod.outcome === 'missing'
    ? 'missing' : jobOutcome(prod, 'deploy-migrations');
  return {
    observed_at: new Date(now).toISOString(),
    latest_main_sha: latestMainSha,
    latest_main_full_ci_proven: ciProof,
    latest_main_workflows: workflows,
    latest_main_unlisted_workflows: latest.filter(run => !MAIN_WORKFLOWS.includes(run.name))
      .map(({ run_id, name, outcome, jobs }) => ({ run_id, name, outcome, jobs })),
    production_migration_job_outcome: deploy,
    production_migration_execution_proven: deploy === 'success',
    previous_main_runs: previous.map(({ run_id, head_sha, name, outcome }) =>
      ({ run_id, head_sha, name, outcome })),
    previous_main_cancelled: previous.filter(run => run.outcome === 'cancelled').length,
    limitations: [
      'A cancelled earlier main SHA is not a passing current-main check.',
      'Missing or skipped independent jobs are not evidence of an executed test.',
      'A successful Supabase Production workflow does not prove migrations ran when deploy-migrations was skipped.',
      'The reported latest main SHA is from the supplied branch observation; re-fetch it before relying on the report.',
      'This report reads existing GitHub evidence only and never changes CI concurrency or deploy policy.',
    ],
  };
}

function gh(repo, endpoint) {
  return JSON.parse(execFileSync('gh', ['api', 'repos/' + repo + '/' + endpoint], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 10 * 1024 * 1024,
  }));
}
function main() {
  const repo = process.argv[2];
  const count = Number(process.argv[3] ?? '30');
  if (typeof repo !== 'string' || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/u.test(repo)
    || !Number.isSafeInteger(count) || count < 1 || count > 100) {
    throw new Error('Usage: node scripts/ci/main-ci-evidence-report.mjs owner/repo [1..100]');
  }
  const firstBranch = gh(repo, 'branches/main').commit.sha;
  const payload = gh(repo, 'actions/runs?event=push&branch=main&per_page=' + count);
  if (!Array.isArray(payload.workflow_runs)) throw new Error('Workflow inventory missing');
  const runs = payload.workflow_runs;
  const jobsByRun = Object.fromEntries(runs.filter(isMainPush).map(run => {
    const jobs = gh(repo, 'actions/runs/' + run.id + '/jobs?per_page=100');
    if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length) {
      throw new Error('Incomplete job pagination for run ' + run.id);
    }
    return [String(run.id), jobs.jobs];
  }));
  const secondBranch = gh(repo, 'branches/main').commit.sha;
  if (firstBranch !== secondBranch) throw new Error('main moved during evidence collection; retry a fresh read');
  const result = summarizeMainCiEvidence(runs, jobsByRun, {
    latestMainSha: secondBranch, observedAt: new Date().toISOString(),
  });
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
