const activeStatuses = new Set(['queued', 'pending', 'in_progress', 'waiting', 'requested']);

function matchingIntegrationRunsForHead(runs, { pr, head }) {
  if (!/^[1-9][0-9]*$/u.test(String(pr)) || !/^[a-f0-9]{40}$/u.test(head)) {
    throw new Error('Invalid pinned PR/head');
  }
  const expectedTitle = `Integration PR #${pr} at ${head}`;
  const matching = runs.filter(run =>
    run.event === 'pull_request'
    && (run.display_title === expectedTitle || run.name === expectedTitle)
    && run.head_sha === head);
  return matching.sort((a, b) => b.id - a.id);
}

export function selectIntegrationRunForHead(runs, candidate) {
  return matchingIntegrationRunsForHead(runs, candidate)[0] ?? null;
}

export function decideIntegrationSubmission({ pr, head, runs, hasLabel }) {
  const matching = matchingIntegrationRunsForHead(runs, { pr, head });
  // A newer terminal failure must not cause relabeling while another exact
  // PR/head run is still active. Only an explicit completed result is retryable.
  const active = matching.find(run => activeStatuses.has(run.status));
  if (active) {
    return Object.freeze({ action: 'no-op', reason: 'CURRENT_HEAD_INTEGRATION_ACTIVE', runId: active.id });
  }
  const latest = matching[0] ?? null;
  if (latest !== null) {
    if (latest.status === 'completed' && latest.conclusion === 'success') {
      return Object.freeze({ action: 'no-op', reason: 'CURRENT_HEAD_INTEGRATION_PASSED', runId: latest.id });
    }
    if (latest.status !== 'completed' || latest.conclusion == null) {
      return Object.freeze({ action: 'no-op', reason: 'CURRENT_HEAD_INTEGRATION_UNRESOLVED', runId: latest.id });
    }
  }
  // GitHub indexes new workflow runs asynchronously after the label event.
  // Treat an already-present label with no indexed run as an outstanding
  // submission, not an invitation to toggle and trigger duplicate workflows.
  // A genuinely stale label on a new head requires explicit diagnosis/resubmission.
  if (latest === null && hasLabel) {
    return Object.freeze({
      action: 'no-op', reason: 'LABEL_PRESENT_RUN_NOT_YET_INDEXED',
    });
  }
  return Object.freeze({
    action: latest === null ? 'add-label' : (hasLabel ? 'refresh-label' : 'add-label'),
    reason: latest === null ? 'CURRENT_HEAD_INTEGRATION_NOT_REQUESTED' : 'CURRENT_HEAD_INTEGRATION_NOT_SUCCESSFUL',
    ...(latest === null ? {} : { runId: latest.id }),
  });
}
