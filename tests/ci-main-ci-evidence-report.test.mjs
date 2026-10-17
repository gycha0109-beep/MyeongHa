import { describe, expect, it } from 'vitest';
import { summarizeMainCiEvidence } from '../scripts/ci/main-ci-evidence-report.mjs';

const sha = n => String(n).repeat(40);
const job = (name, conclusion = 'success') => ({
  name, status: 'completed', conclusion,
});
const run = (id, name, head_sha, conclusion = 'success') => ({
  id, name, head_sha, event: 'push', head_branch: 'main',
  status: 'completed', conclusion,
  created_at: '2026-10-17T10:00:' + String(id % 60).padStart(2, '0') + 'Z',
});
const observedAt = '2026-10-17T12:00:00Z';
const fixture = () => ({
  runs: [
    run(101, 'CI', sha('b')),
    run(102, 'Governance', sha('b')),
    run(103, 'Supabase Production', sha('b')),
    run(100, 'CI', sha('a'), 'cancelled'),
  ],
  jobsByRun: {
    '100': [job('db-authority-core', 'cancelled'), job('CI Verify', 'cancelled')],
    '101': [job('db-authority-core'), job('CI Verify'), job('DB dependency · postgres17', 'skipped')],
    '102': [job('Governance Verify')],
    '103': [job('detect-production-db-relevance'), job('deploy-migrations', 'skipped')],
  },
});
const summarize = ({ runs, jobsByRun }, extra = {}) => summarizeMainCiEvidence(runs, jobsByRun,
  { latestMainSha: sha('b'), observedAt, ...extra });

describe('latest-main CI outcome evidence', () => {
  it('keeps cancelled old main separate from latest full CI success and DB skips', () => {
    const report = summarize(fixture());
    expect(report.latest_main_full_ci_proven).toBe(true);
    expect(report.previous_main_cancelled).toBe(1);
    expect(report.previous_main_runs).toEqual([{
      run_id: 100, head_sha: sha('a'), name: 'CI', outcome: 'cancelled',
    }]);
    expect(report.latest_main_workflows.find(x => x.name === 'CI').jobs)
      .toContainEqual({ name: 'DB dependency · postgres17', outcome: 'skipped' });
    expect(report.latest_main_workflows.find(x => x.name === 'DB PostgreSQL 17 Authority Suite').outcome)
      .toBe('missing');
    expect(report.production_migration_job_outcome).toBe('skipped');
    expect(report.production_migration_execution_proven).toBe(false);
  });

  it('does not promote a successful workflow into full CI proof without both critical jobs', () => {
    const missing = fixture();
    missing.jobsByRun['101'] = [job('CI Verify'), job('db-authority-core', 'skipped')];
    expect(summarize(missing).latest_main_full_ci_proven).toBe(false);
    const noVerify = fixture();
    noVerify.jobsByRun['101'] = [job('db-authority-core')];
    expect(summarize(noVerify).latest_main_full_ci_proven).toBe(false);
  });

  it('preserves latest-main in-progress, failed and cancelled outcomes without success inference', () => {
    const f = fixture();
    f.runs[0] = { ...f.runs[0], status: 'in_progress', conclusion: null };
    f.jobsByRun['101'] = [{ name: 'db-authority-core', status: 'in_progress', conclusion: null },
      job('CI Verify', 'skipped')];
    let r = summarize(f);
    expect(r.latest_main_workflows.find(x => x.name === 'CI').outcome).toBe('in_progress');
    expect(r.latest_main_full_ci_proven).toBe(false);
    f.runs[0] = run(101, 'CI', sha('b'), 'failure');
    f.jobsByRun['101'] = [job('db-authority-core', 'failure'), job('CI Verify', 'skipped')];
    r = summarize(f);
    expect(r.latest_main_workflows.find(x => x.name === 'CI').outcome).toBe('failure');
  });

  it('distinguishes actual migration job success from a skipped deploy', () => {
    const f = fixture();
    f.jobsByRun['103'] = [job('detect-production-db-relevance'), job('deploy-migrations')];
    expect(summarize(f).production_migration_execution_proven).toBe(true);
    f.jobsByRun['103'] = [job('detect-production-db-relevance')];
    expect(summarize(f).production_migration_job_outcome).toBe('missing');
    expect(summarize(f).production_migration_execution_proven).toBe(false);
  });

  it('rejects missing jobs, ambiguous IDs, corrupted timestamps or status contradictions', () => {
    const cases = [
      f => { delete f.jobsByRun['101']; },
      f => { f.runs.push({ ...f.runs[0] }); },
      f => { f.runs[0].created_at = 'not-an-iso'; },
      f => { f.jobsByRun['101'][0].conclusion = null; },
      f => { f.runs[0] = { ...f.runs[0], status: 'in_progress', conclusion: 'success' }; },
      f => { f.jobsByRun['101'].push(job('CI Verify')); },
    ];
    for (const change of cases) {
      const f = fixture();
      change(f);
      expect(() => summarize(f)).toThrow();
    }
    expect(() => summarize(fixture(), { latestMainSha: sha('z') })).toThrow();
  });

  it('ignores non-main-push evidence and chooses newest run per workflow deterministically', () => {
    const f = fixture();
    f.runs.push({
      ...run(110, 'CI', sha('b')), event: 'pull_request', head_branch: 'feature',
    });
    f.runs.push({
      ...run(111, 'CI', sha('b'), 'failure'), created_at: '2026-10-17T11:30:00Z',
    });
    f.jobsByRun['111'] = [job('CI Verify', 'failure'), job('db-authority-core', 'failure')];
    expect(summarize(f).latest_main_full_ci_proven).toBe(false);
    expect(summarize(f).latest_main_workflows.find(x => x.name === 'CI').run_id).toBe(111);
  });
});
