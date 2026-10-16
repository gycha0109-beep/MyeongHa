import { describe, expect, it } from 'vitest';
import {
  decideIntegrationSubmission, selectIntegrationRunForHead,
} from '../scripts/ci/integration-submission-state.mjs';

const head = 'a'.repeat(40);
const staleHead = 'b'.repeat(40);
const req = { pr: '2175', head };
const run = (id, status, conclusion = null, changes = {}) => ({
  id, event: 'pull_request',
  display_title: `Integration PR #2175 at ${head}`,
  head_sha: head, status, conclusion, ...changes,
});

describe('idempotent CI integration submission for parallel PRs', () => {
  it('requests once for an untested frozen head, using the existing label correctly', () => {
    expect(decideIntegrationSubmission({ ...req, runs: [], hasLabel: false }).action).toBe('add-label');
    expect(decideIntegrationSubmission({ ...req, runs: [], hasLabel: true }).action).toBe('refresh-label');
  });
  it.each(['queued', 'pending', 'in_progress', 'waiting', 'requested'])(
    'does not flood the queue or edit PR when the same head is %s',
    status => {
      const result = decideIntegrationSubmission({
        ...req, runs: [run(99, status)], hasLabel: true,
      });
      expect(result).toMatchObject({ action: 'no-op', reason: 'CURRENT_HEAD_INTEGRATION_ACTIVE', runId: 99 });
    },
  );
  it('does not resubmit an already successful frozen head merely because main moved', () => {
    const decision = decideIntegrationSubmission({ ...req, runs: [run(55, 'completed', 'success')], hasLabel: true });
    expect(decision).toMatchObject({ action: 'no-op', reason: 'CURRENT_HEAD_INTEGRATION_PASSED' });
  });
  it.each(['failure', 'cancelled', 'timed_out', 'skipped'])(
    'allows a deliberate re-request when the latest exact head completed with %s',
    conclusion => {
      const decision = decideIntegrationSubmission({ ...req,
        runs: [run(10, 'completed', 'success'), run(11, 'completed', conclusion)],
        hasLabel: true });
      expect(decision.action).toBe('refresh-label');
    },
  );
  it('ignores runs for another PR, a different head, and unrelated workflow', () => {
    const unrelated = [
      run(20, 'in_progress', null, { display_title: 'Integration PR #2176 at ' + head }),
      run(21, 'in_progress', null, { head_sha: staleHead }),
      run(22, 'completed', 'success', { event: 'workflow_dispatch' }),
    ];
    expect(selectIntegrationRunForHead(unrelated, req)).toBeNull();
    expect(decideIntegrationSubmission({ ...req, runs: unrelated, hasLabel: false }).action).toBe('add-label');
  });
  it('chooses the newest matching run even when API order differs', () => {
    const result = selectIntegrationRunForHead([
      run(10, 'completed', 'success'), run(12, 'in_progress'), run(11, 'completed', 'failure'),
    ], req);
    expect(result.id).toBe(12);
  });
  it('never interprets an unknown completion or malformed candidate as success', () => {
    expect(decideIntegrationSubmission({ ...req, runs: [run(18, 'completed', 'neutral')], hasLabel: true }).action).toBe('refresh-label');
    expect(() => decideIntegrationSubmission({ ...req, head: 'not-a-sha', runs: [], hasLabel: false })).toThrow('Invalid pinned');
  });
});
