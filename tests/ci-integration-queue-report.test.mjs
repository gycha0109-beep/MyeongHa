import { describe, expect, it } from 'vitest';
import { summarizeIntegrationQueue } from '../scripts/ci/integration-queue-report.mjs';

const HEAD = 'a'.repeat(40);
const at = n => new Date(Date.parse('2026-10-17T00:00:00Z') + n * 1000).toISOString();
const run = (id, pr, created, finished = true, head = HEAD) => ({
  id,
  event: 'pull_request',
  display_title: 'Integration PR #' + pr + ' at ' + head,
  head_sha: head,
  created_at: at(created),
  status: finished ? 'completed' : 'in_progress',
  conclusion: finished ? 'success' : null,
});
const job = (name, created, start, end, conclusion = 'success') => ({
  name,
  created_at: at(created),
  started_at: start === null ? null : at(start),
  completed_at: end === null ? null : at(end),
  status: end === null ? 'in_progress' : 'completed',
  conclusion: end === null ? null : conclusion,
});
const analyze = (runs, jobs, observed = 300) =>
  summarizeIntegrationQueue(runs, jobs, { observedAt: at(observed) });

describe('read-only integration queue measurement', () => {
  it('quantifies three overlapping candidates without confusing queue and runner time', () => {
    const runs = [run(3, 13, 20), run(1, 11, 0), run(2, 12, 10)];
    const jobs = {
      1: [job('admission', 3, 4, 8), job('db-authority-core', 10, 11, 90)],
      2: [job('admission', 93, 94, 99), job('db-authority-core', 100, 101, 180)],
      3: [job('admission', 183, 184, 189), job('db-authority-core', 190, 191, 260)],
    };
    const report = analyze(runs, jobs);
    expect(report.max_observed_overlapping_candidates).toBe(3);
    expect(report.runs.map(row => row.pr)).toEqual([11, 12, 13]);
    expect(report.runs.map(row => row.first_job_wait_seconds)).toEqual([3, 83, 163]);
    expect(report.runs.map(row => row.candidates_open_at_submission)).toEqual([1, 2, 3]);
    expect(report.runs[0].completed_wall_seconds).toBe(90);
    expect(report.runs[0].runner_job_seconds).toBe(83);
    expect(report.runs[0].longest_job).toEqual({ name: 'db-authority-core', seconds: 79 });
    expect(report.runs[0].all_11_passed).toBe(false);
    expect(report.duplicate_pr_head_pairs).toEqual([]);
  });

  it('keeps pending runs unresolved and detects same-head duplicate requests', () => {
    const runs = [run(9, 42, 0), run(10, 42, 10, false)];
    const jobs = {
      9: [job('admission', 1, 2, 8)],
      10: [],
    };
    const report = analyze(runs, jobs);
    expect(report.duplicate_pr_head_pairs).toEqual([{ key: '42:' + HEAD, count: 2 }]);
    expect(report.runs[1].first_job_wait_seconds).toBeNull();
    expect(report.runs[1].completed_wall_seconds).toBeNull();
    expect(report.runs[1].all_11_passed).toBe(false);
    expect(report.runs[1].candidates_open_at_submission).toBe(1);
  });

  it('does not present failed or skipped jobs as full CI success', () => {
    const jobs = { 1: Array.from({ length: 11 }, (_, i) =>
      job('job-' + i, 1, 2, 5, i === 10 ? 'failure' : 'success')) };
    const report = analyze([{ ...run(1, 44, 0), conclusion: 'failure' }], jobs);
    expect(report.runs[0].passed_jobs).toBe(10);
    expect(report.runs[0].failed_jobs).toEqual(['job-10']);
    expect(report.runs[0].all_11_passed).toBe(false);
  });

  it('accepts exactly eleven successful jobs as integration evidence', () => {
    const jobs = { 1: Array.from({ length: 11 }, (_, i) => job('job-' + i, 1, 2, 5)) };
    const report = analyze([run(1, 44, 0)], jobs);
    expect(report.runs[0].all_11_passed).toBe(true);
  });

  it('rejects missing evidence or mismatched PR head rather than guessing', () => {
    expect(() => analyze([run(1, 44, 0)], {})).toThrow('Missing job inventory');
    expect(() => analyze([{ ...run(1, 44, 0), head_sha: 'b'.repeat(40) }], { 1: [] }))
      .toThrow('does not match');
    expect(() => summarizeIntegrationQueue([], {}, {})).toThrow('observedAt');
  });

  it('excludes non-PR diagnostic dispatch evidence', () => {
    const result = analyze([{ ...run(1, 44, 0), event: 'workflow_dispatch' }], {});
    expect(result.candidate_count).toBe(0);
  });

  it('keeps incomplete job metadata from being presented as a completed duration', () => {
    const result = analyze([run(1, 44, 0)], { 1: [{ ...job('admission', 1, 2, 10), completed_at: null }] });
    expect(result.runs[0].completed_wall_seconds).toBeNull();
    expect(result.runs[0].all_11_passed).toBe(false);
  });
});
