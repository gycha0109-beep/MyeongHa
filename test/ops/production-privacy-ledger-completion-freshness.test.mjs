import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import {
  assessPrivacyLedgerFreshness,
  inspectPrivacyLedgerCompletion,
} from '../../scripts/operations/check-privacy-ledger-completion-freshness.mjs';

const NOW = Date.parse('2026-11-01T12:00:00Z');
const run = (ageSeconds, overrides = {}) => ({
  id: 41287556554, status: 'completed', conclusion: 'success',
  head_branch: 'main', event: 'schedule',
  updated_at: new Date(NOW - ageSeconds * 1000).toISOString(),
  ...overrides,
});
const artifact = (id = 41287556554, overrides = {}) => ({
  workflow_run: { id },
  name: 'myeongha-privacy-ledger-20261101T080834Z',
  expired: false,
  ...overrides,
});
const assess = (runs, artifacts = [artifact()]) =>
  assessPrivacyLedgerFreshness({ runs, artifacts, nowMs: NOW });

test('recent completed encrypted capture is observed but cannot prove continuous privacy authority', () => {
  const result = assess([run(3600)]);
  assert.equal(result.checkPassed, true);
  assert.equal(result.status, 'RECENT_CAPTURE_COMPLETION_OBSERVED');
  assert.equal(result.elapsedSinceRunCompletionSeconds, 3600);
  assert.equal(result.drReady, false);
  assert.equal(result.sourceContinuityProven, false);
  assert.equal(result.futureSafePrivacyReconciliation, false);
  assert.equal(result.serviceResumptionAllowed, false);
  assert.equal(result.outputContainsIdentifiers, false);
});

test('two nominal hours is a fail-closed completion freshness alert, not an RPO', () => {
  const result = assess([run(7200)]);
  assert.equal(result.checkPassed, false);
  assert.equal(result.status, 'CAPTURE_COMPLETION_STALE');
  assert.equal(result.maximumObservedCompletionAgeSeconds, 7200);
  assert.equal(result.approvedRpoProven, false);
});

test('prior observed >6h40 gap triggers the same stale capture signal', () => {
  assert.equal(assess([run(24043)]).status, 'CAPTURE_COMPLETION_STALE');
});

test('missing or expired encrypted artifact cannot pass even with successful job', () => {
  assert.equal(assess([run(30)], []).status, 'ENCRYPTED_ARTIFACT_UNAVAILABLE');
  assert.equal(assess([run(30)], [artifact(41287556554, { expired: true })]).checkPassed, false);
  assert.equal(assess([run(30)], [artifact(11111)]).checkPassed, false);
  assert.equal(assess([run(30)], [artifact(41287556554, { name: 'some-other-artifact' })]).checkPassed, false);
});

test('latest authorized successful run is selected, not latest failed run or unrelated branch', () => {
  const older = run(1900);
  const failed = run(20, { id: 41287556555, conclusion: 'failure' });
  const spoof = run(10, { id: 41287556556, head_branch: 'testing' });
  const result = assess([failed, spoof, older]);
  assert.equal(result.latestSuccessfulRunId, older.id);
  assert.equal(result.checkPassed, true);
});

test('no successful capture, future completion and malformed evidence fail closed', () => {
  assert.equal(assess([]).status, 'NO_SUCCESSFUL_CAPTURE');
  assert.equal(assess([run(-120)]).status, 'INVALID_FUTURE_COMPLETION');
  assert.throws(() => assessPrivacyLedgerFreshness({ runs: {}, artifacts: [], nowMs: NOW }),
    /invalid metadata input/u);
});

test('read-only watcher refuses non-main and non-scheduled GitHub execution scopes', async () => {
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'gycha0109-beep/MyeongHa',
    GITHUB_REF: 'refs/heads/feature',
    GITHUB_EVENT_NAME: 'schedule',
    GH_TOKEN: 'synthetic-test-token-not-authorized',
  };
  await assert.rejects(() => inspectPrivacyLedgerCompletion(env, NOW), /main-only/u);
  await assert.rejects(() => inspectPrivacyLedgerCompletion({ ...env, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'pull_request' }, NOW),
    /main-only/u);
  await assert.rejects(() => inspectPrivacyLedgerCompletion({ ...env, GITHUB_REF: 'refs/heads/main', GH_TOKEN: '' }, NOW),
    /read-only Actions token/u);
});

test('workflow-only GitHub API requests and artifact binding are required', async () => {
  const previous = globalThis.fetch;
  const paths = [];
  try {
    globalThis.fetch = async (url, options) => {
      paths.push(url.toString());
      assert.equal(url.host, 'api.github.com');
      assert.equal(options.redirect, 'error');
      if (url.pathname.includes('/workflows/')) return Response.json({ workflow_runs: [run(100)] });
      return Response.json({ artifacts: [artifact()] });
    };
    const res = await inspectPrivacyLedgerCompletion({
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'gycha0109-beep/MyeongHa',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GH_TOKEN: 'synthetic-test-token-not-authorized',
    }, NOW);
    assert.equal(res.checkPassed, true);
    assert.equal(paths.length, 2);
    assert.ok(paths[0].includes('/workflows/production-postgres-privacy-recovery-ledger.yml/runs'));
    assert.ok(paths[1].includes('/runs/41287556554/artifacts'));
  } finally {
    globalThis.fetch = previous;
  }
});


test('scheduled watcher has only GitHub read permissions and no Production secrets', () => {
  const wf = readFileSync('.github/workflows/production-privacy-ledger-freshness-watch.yml', 'utf8');
  assert.match(wf, /workflow_dispatch:/u);
  assert.match(wf, /cron: '23 \* \* \* \*'/u);
  assert.match(wf, /actions: read/u);
  assert.match(wf, /contents: read/u);
  assert.match(wf, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(wf, /GH_TOKEN: \$\{\{ github\.token \}\}/u);
  assert.doesNotMatch(wf, /secrets\.|environment: production|SUPABASE_(?:DB|PROJECT)/u);
});
