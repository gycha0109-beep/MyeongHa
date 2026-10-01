import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

export const integrationContext = 'CI Integration Verify';

export function validateCandidate(candidate, current) {
  if (!/^[1-9][0-9]*$/u.test(String(candidate.pr))
    || !/^[a-f0-9]{40}$/u.test(candidate.head)
    || !/^[a-f0-9]{40}$/u.test(candidate.base)) throw new Error('Invalid pinned PR/head/base');
  if (current.state !== 'open' || current.draft) throw new Error('PR must be open and ready for review');
  if (current.head.repo.full_name !== current.base.repo.full_name) throw new Error('Cross-repository candidates require a separate trust design');
  if (current.base.ref !== current.defaultBranch) throw new Error('Candidate must target the default branch');
  if (current.head.sha !== candidate.head) throw new Error('PR head changed; request a new candidate');
  if (current.defaultSha !== candidate.base) throw new Error('Default branch changed; request a new candidate');
}

export function assertStagedPolicy(rules) {
  const checks = rules.filter(rule => rule.type === 'required_status_checks')
    .flatMap(rule => rule.parameters.required_status_checks);
  const strict = rules.some(rule => rule.type === 'required_status_checks'
    && rule.parameters.strict_required_status_checks_policy === true);
  if (!strict || !checks.some(check => check.context === integrationContext && check.integration_id === 15368)) {
    throw new Error('Staged CI requires CI Integration Verify from GitHub Actions and strict up-to-date checks in the default-branch ruleset');
  }
}

export function assertPrerequisites(required, checks, statuses) {
  for (const { context: name, integration_id: app } of required) {
    if (name === integrationContext) continue;
    const runs = checks.filter(check => check.name === name && (!app || check.app?.id === app))
      .sort((a, b) => b.id - a.id);
    // Commit statuses do not expose the app binding used by rulesets.
    const matchingStatuses = app ? [] : statuses.filter(status => status.context === name);
    if (runs.length && (runs[0].status !== 'completed' || runs[0].conclusion !== 'success')) {
      throw new Error(`Required check is not successful: ${name}`);
    }
    if (matchingStatuses.length && matchingStatuses[0].state !== 'success') {
      throw new Error(`Required status is not successful: ${name}`);
    }
    if (!runs.length && !matchingStatuses.length) throw new Error(`Required check is missing: ${name}`);
  }
}

export function api(path) {
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
}

export function currentCandidate(repo, pr) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo) || !/^[1-9][0-9]*$/u.test(String(pr))) {
    throw new Error('Invalid repository/PR');
  }
  const current = api(`repos/${repo}/pulls/${pr}`);
  const metadata = api(`repos/${repo}`);
  current.defaultBranch = metadata.default_branch;
  current.defaultSha = api(`repos/${repo}/commits/${encodeURIComponent(metadata.default_branch)}`).sha;
  return current;
}

export function checkCandidate(candidate, repo) {
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
    && process.env.GITHUB_SHA !== candidate.head) {
    throw new Error('Dispatch ref must resolve to the pinned PR head; checks cannot be attributed to another commit');
  }
  const current = currentCandidate(repo, candidate.pr);
  validateCandidate(candidate, current);
  return current;
}

function run() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (process.argv[2] === 'policy') {
    if (process.env.CI_STAGED_VERIFICATION !== 'true') return;
    const metadata = api(`repos/${repo}`);
    assertStagedPolicy(api(`repos/${repo}/rules/branches/${encodeURIComponent(metadata.default_branch)}`));
    return;
  }
  const candidate = { pr: process.env.CANDIDATE_PR, head: process.env.CANDIDATE_HEAD, base: process.env.CANDIDATE_BASE };
  if (process.argv[2] === 'prepare') {
    if (!/^[1-9][0-9]*$/u.test(String(candidate.pr))
      || ![candidate.head, candidate.base].every(sha => /^[a-f0-9]{40}$/u.test(sha ?? ''))) {
      throw new Error('Invalid candidate inputs');
    }
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (head !== candidate.head) throw new Error('Checkout does not match pinned head');
    execFileSync('git', ['fetch', '--no-tags', 'origin', candidate.base], { stdio: 'inherit' });
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=CI integration',
      '-c', 'user.email=ci-integration@localhost', 'merge', '--no-edit', '--no-ff', candidate.base], { stdio: 'inherit' });
    const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
    process.stdout.write(`Pinned candidate tree: ${tree}\n`);
  } else if (process.argv[2] === 'guard') {
    checkCandidate(candidate, repo);
  } else throw new Error('Expected policy, prepare, or guard');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
