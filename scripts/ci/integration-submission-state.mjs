export function selectIntegrationRunForHead(runs, { pr, head }) {
  if (!/^[1-9][0-9]*$/u.test(String(pr)) || !/^[a-f0-9]{40}$/u.test(head)) {
    throw new Error('Invalid pinned PR/head');
  }
  const expectedTitle = `Integration PR #${pr} at ${head}`;
  const matching = runs.filter(run =>
    run.event === 'pull_request'
    && (run.display_title === expectedTitle || run.name === expectedTitle)
    && run.head_sha === head);
  return matching.sort((a, b) => b.id - a.id)[0] ?? null;
}

export function decideIntegrationSubmission({ pr, head, runs, hasLabel }) {
  const latest = selectIntegrationRunForHead(runs, { pr, head });
  if (latest !== null) {
    if (['queued', 'pending', 'in_progress', 'waiting', 'requested'].includes(latest.status)) {
      return Object.freeze({ action: 'no-op', reason: 'CURRENT_HEAD_INTEGRATION_ACTIVE', runId: latest.id });
    }
    if (latest.status === 'completed' && latest.conclusion === 'success') {
      return Object.freeze({ action: 'no-op', reason: 'CURRENT_HEAD_INTEGRATION_PASSED', runId: latest.id });
    }
  }
  return Object.freeze({
    action: hasLabel ? 'refresh-label' : 'add-label',
    reason: latest === null ? 'CURRENT_HEAD_INTEGRATION_NOT_REQUESTED' : 'CURRENT_HEAD_INTEGRATION_NOT_SUCCESSFUL',
    ...(latest === null ? {} : { runId: latest.id }),
  });
}
