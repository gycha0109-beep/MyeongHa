import { execFileSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import {
  api, assertRepositoryPrerequisites, assertParallelTrackLoosePolicy,
  checkCandidate, currentCandidate, integrationLabel,
} from './integration-candidate.mjs';
import { decideIntegrationSubmission } from './integration-submission-state.mjs';

const repo = process.argv[2];
const pr = process.argv[3];
const current = currentCandidate(repo, pr);
const candidate = { pr, head: current.head.sha, base: current.defaultSha };
checkCandidate(candidate, repo);
assertRepositoryPrerequisites(repo, current);
assertParallelTrackLoosePolicy(api(`repos/${repo}/rules/branches/${encodeURIComponent(current.defaultBranch)}`));

const labels = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp',
  'repos/' + repo + '/labels?per_page=100'], { encoding: 'utf8' })).flat();
if (!labels.some(label => label.name === integrationLabel)) {
  execFileSync('gh', ['label', 'create', integrationLabel, '--repo', repo,
    '--color', 'BFD4F2', '--description', 'Request pinned pre-merge CI integration'], { stdio: 'inherit' });
}

const latestRuns = api(`repos/${repo}/actions/workflows/ci-integration.yml/runs?event=pull_request&head_sha=${candidate.head}&per_page=100`).workflow_runs;
if (!Array.isArray(latestRuns)) throw new Error('Cannot verify prior integration runs; do not create a duplicate');
const decision = decideIntegrationSubmission({
  pr, head: candidate.head, runs: latestRuns,
  hasLabel: current.labels.some(label => label.name === integrationLabel),
});
if (decision.action === 'no-op') {
  console.log(`Integration not re-requested: ${decision.reason} for frozen PR #${pr}, head=${candidate.head}, run=${decision.runId}`);
  console.log('Do not update the PR head while integration is queued or running; advancing main alone is not a retry trigger.');
  process.exit(0);
}

// Repeated failed requests need a new label event; never rewrite or rebase the PR head.
if (decision.action === 'refresh-label') {
  execFileSync('gh', ['pr', 'edit', pr, '--repo', repo, '--remove-label', integrationLabel], { stdio: 'inherit' });
}
checkCandidate(candidate, repo);
execFileSync('gh', ['pr', 'edit', pr, '--repo', repo, '--add-label', integrationLabel], { stdio: 'inherit' });
console.log('Integration requested: ' + repo + ' PR #' + pr + ', head=' + candidate.head + ', base=' + candidate.base);
console.log('Freeze this PR head through completion. Advancing main is not a reason to rebase or resubmit.');
console.log('Merge only after current-head integration succeeds, mergeability and current required checks are verified.');
