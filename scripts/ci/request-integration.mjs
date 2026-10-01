import { execFileSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { api, assertPrerequisites, checkCandidate, currentCandidate } from './integration-candidate.mjs';

const repo = process.argv[2];
const pr = process.argv[3];
const current = currentCandidate(repo, pr);
const candidate = { pr, head: current.head.sha, base: current.defaultSha };
checkCandidate(candidate, repo);
const rules = api(`repos/${repo}/rules/branches/${encodeURIComponent(current.defaultBranch)}`);
const required = rules.filter(rule => rule.type === 'required_status_checks')
  .flatMap(rule => rule.parameters.required_status_checks);
if (!required.length) throw new Error('No required-check policy found; do not infer a merge policy');
const checks = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp',
  `repos/${repo}/commits/${candidate.head}/check-runs?per_page=100`], { encoding: 'utf8' }))
  .flatMap(page => page.check_runs);
const statuses = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp',
  `repos/${repo}/commits/${candidate.head}/statuses?per_page=100`], { encoding: 'utf8' })).flat();
assertPrerequisites(required, checks, statuses);
checkCandidate(candidate, repo);
execFileSync('gh', ['workflow', 'run', 'ci-integration.yml', '--repo', repo, '--ref', current.head.ref,
  '-f', `pr=${pr}`, '-f', `head_sha=${candidate.head}`, '-f', `base_sha=${candidate.base}`], { stdio: 'inherit' });
console.log(`Integration requested: ${repo} PR #${pr}, head=${candidate.head}, base=${candidate.base}`);
console.log('This command does not merge. Confirm CI Integration Verify and current head/base before merging.');
