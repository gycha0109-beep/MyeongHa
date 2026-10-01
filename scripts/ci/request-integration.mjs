import { execFileSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { assertRepositoryPrerequisites, checkCandidate, currentCandidate, integrationLabel } from './integration-candidate.mjs';

const repo = process.argv[2];
const pr = process.argv[3];
const current = currentCandidate(repo, pr);
const candidate = { pr, head: current.head.sha, base: current.defaultSha };
checkCandidate(candidate, repo);
assertRepositoryPrerequisites(repo, current);
const labels = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp',
  'repos/' + repo + '/labels?per_page=100'], { encoding: 'utf8' })).flat();
if (!labels.some(label => label.name === integrationLabel)) {
  execFileSync('gh', ['label', 'create', integrationLabel, '--repo', repo,
    '--color', 'BFD4F2', '--description', 'Request pinned pre-merge CI integration'], { stdio: 'inherit' });
}
// Repeated requests need a fresh labeled event; workflows never receive write permissions.
if (current.labels.some(label => label.name === integrationLabel)) {
  execFileSync('gh', ['pr', 'edit', pr, '--repo', repo, '--remove-label', integrationLabel], { stdio: 'inherit' });
}
checkCandidate(candidate, repo);
execFileSync('gh', ['pr', 'edit', pr, '--repo', repo, '--add-label', integrationLabel], { stdio: 'inherit' });
console.log('Integration requested: ' + repo + ' PR #' + pr + ', head=' + candidate.head + ', base=' + candidate.base);
console.log('This command does not merge. Confirm CI Integration Verify and current head/base before merging.');
