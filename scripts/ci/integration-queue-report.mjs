import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const integrationTitle = /^Integration PR #([1-9][0-9]*) at ([a-f0-9]{40})$/u;

function milliseconds(iso) {
  if (typeof iso !== 'string') return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

function seconds(start, end) {
  if (start === null || end === null || end < start) return null;
  return Math.round((end - start) / 1000);
}

export function summarizeIntegrationQueue(runs, jobsByRun, { observedAt } = {}) {
  if (!Array.isArray(runs) || !jobsByRun || typeof jobsByRun !== 'object') {
    throw new Error('Expected workflow run array and job map');
  }
  const now = milliseconds(observedAt);
  if (now === null) throw new Error('An explicit valid observedAt is required for reproducible measurement');

  const rows = [];
  for (const run of runs) {
    if (run.event !== 'pull_request') continue;
    const title = run.display_title ?? run.name ?? '';
    const match = integrationTitle.exec(title);
    if (!match) continue;
    if (!Number.isSafeInteger(run.id) || run.id <= 0) throw new Error('Invalid integration run ID');
    if (run.head_sha !== match[2]) throw new Error('PR/HEAD title does not match the actual integration run');
    const created = milliseconds(run.created_at);
    if (created === null || created > now) throw new Error('Invalid workflow creation timestamp');
    const jobs = jobsByRun[String(run.id)];
    if (!Array.isArray(jobs)) throw new Error('Missing job inventory for run ' + run.id);
    const firstCreated = Math.min(...jobs.map(job => milliseconds(job.created_at)).filter(t => t !== null));
    const first = Number.isFinite(firstCreated) ? firstCreated : null;
    const finished = jobs.filter(job => job.status === 'completed').map(job => milliseconds(job.completed_at));
    const hasFullCompletion = run.status === 'completed'
      && jobs.length > 0 && jobs.every(job => job.status === 'completed' && milliseconds(job.completed_at) !== null);
    const last = hasFullCompletion ? Math.max(...finished) : null;
    const end = last ?? now;
    const durations = jobs.map(job => ({
      name: job.name,
      conclusion: job.conclusion ?? null,
      seconds: seconds(milliseconds(job.started_at), milliseconds(job.completed_at)),
    }));
    const measured = durations.filter(item => item.seconds !== null);
    const longest = measured.sort((a, b) => b.seconds - a.seconds)[0] ?? null;
    rows.push({
      run_id: run.id,
      pr: Number(match[1]),
      head_sha: match[2],
      workflow_created_at: run.created_at,
      first_job_created_at: first === null ? null : new Date(first).toISOString(),
      completed_at: last === null ? null : new Date(last).toISOString(),
      status: run.status,
      conclusion: run.conclusion ?? null,
      first_job_wait_seconds: seconds(created, first),
      completed_wall_seconds: seconds(created, last),
      runner_job_seconds: measured.reduce((sum, job) => sum + job.seconds, 0),
      job_count: jobs.length,
      passed_jobs: jobs.filter(job => job.conclusion === 'success').length,
      skipped_jobs: jobs.filter(job => job.conclusion === 'skipped').length,
      failed_jobs: jobs.filter(job => ['failure', 'timed_out', 'action_required'].includes(job.conclusion)).map(job => job.name),
      all_11_passed: jobs.length === 11 && jobs.every(job => job.conclusion === 'success') && run.conclusion === 'success',
      longest_job: longest === null ? null : { name: longest.name, seconds: longest.seconds },
      _created: created,
      _end: end,
    });
  }
  rows.sort((a, b) => a._created - b._created || a.run_id - b.run_id);
  let peak = 0;
  for (const row of rows) {
    const count = rows.filter(other => other._created <= row._created && other._end > row._created).length;
    peak = Math.max(peak, count);
    row.candidates_open_at_submission = count;
  }
  const pairs = new Map();
  for (const row of rows) {
    const key = String(row.pr) + ':' + row.head_sha;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  return {
    observed_at: new Date(now).toISOString(),
    candidate_count: rows.length,
    max_observed_overlapping_candidates: peak,
    duplicate_pr_head_pairs: [...pairs.entries()].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count })),
    limitations: [
      'Workflow-created to first-job-created time includes Actions scheduler and concurrency delay; it is not isolated runner queue time.',
      'Overlap is inferred from sampled workflow/job timestamps and is incomplete when older runs are outside the sample.',
      'A completed workflow with missing job completion timestamps has unknown wall duration; never treat it as verified.',
      'This is read-only observation, not an active 1/3/6 stress test, GitHub capacity guarantee, or production deployment proof.',
    ],
    runs: rows.map(({ _created, _end, ...data }) => data),
  };
}

function ghJson(path) {
  const raw = execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(raw);
}

function main() {
  const repo = process.argv[2];
  const limit = Number(process.argv[3] ?? '30');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo ?? '')) {
    throw new Error('Usage: node scripts/ci/integration-queue-report.mjs OWNER/REPO [1..100]');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Limit must be 1..100');
  }
  const response = ghJson('repos/' + repo + '/actions/workflows/ci-integration.yml/runs?event=pull_request&per_page=100');
  if (!Array.isArray(response.workflow_runs)) throw new Error('Cannot read integration workflow runs');
  const runs = response.workflow_runs
    .filter(run => integrationTitle.test(run.display_title ?? run.name ?? ''))
    .slice(0, limit);
  const jobs = {};
  for (const run of runs) {
    const result = ghJson('repos/' + repo + '/actions/runs/' + run.id + '/jobs?per_page=100');
    if (!Array.isArray(result.jobs) || result.total_count > 100) {
      throw new Error('Incomplete job inventory for run ' + run.id);
    }
    jobs[String(run.id)] = result.jobs;
  }
  const summary = summarizeIntegrationQueue(runs, jobs, { observedAt: new Date().toISOString() });
  summary.sample_truncated = response.total_count > response.workflow_runs.length || runs.length === limit;
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
