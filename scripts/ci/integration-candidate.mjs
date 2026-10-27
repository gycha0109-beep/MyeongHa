import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { setTimeout as sleepFor } from 'node:timers/promises';

export const integrationContext = 'CI Integration Verify';
export const integrationLabel = 'ci-integration-ready';

export function assertSubmissionEvent(event, candidate) {
  if (event.action !== 'labeled' || event.label?.name !== integrationLabel) {
    throw new Error('Integration requires the dedicated CI submission label event');
  }
  if (String(event.number) !== String(candidate.pr)
    || event.pull_request?.head.sha !== candidate.head
    || event.pull_request?.base.sha !== candidate.base) {
    throw new Error('Candidate must match the immutable PR submission event');
  }
}

export function validateCandidate(candidate, current) {
  if (!/^[1-9][0-9]*$/u.test(String(candidate.pr))
    || !/^[a-f0-9]{40}$/u.test(candidate.head)
    || !/^[a-f0-9]{40}$/u.test(candidate.base)) throw new Error('Invalid pinned PR/head/base');
  if (current.state !== 'open' || current.draft) throw new Error('PR must be open and ready for review');
  if (current.head.repo.full_name !== current.base.repo.full_name) throw new Error('Cross-repository candidates require a separate trust design');
  if (current.base.ref !== current.defaultBranch) throw new Error('Candidate must target the default branch');
  if (current.head.sha !== candidate.head) throw new Error('PR head changed; request a new candidate');
}

export function assertStagedPolicy(rules) {
  const checks = rules.filter(rule => rule.type === 'required_status_checks')
    .flatMap(rule => rule.parameters.required_status_checks);
  if (!checks.some(check => check.context === integrationContext && check.integration_id === 15368)) {
    throw new Error('Staged CI requires CI Integration Verify from GitHub Actions in the default-branch ruleset');
  }
}

export function assertParallelTrackLoosePolicy(rules) {
  const statusRules = rules.filter(rule => rule.type === 'required_status_checks');
  if (statusRules.length !== 1
    || statusRules[0].parameters?.strict_required_status_checks_policy !== false) {
    throw new Error('Frozen-head parallel-track integration requires explicit loose main-freshness policy; do not bypass strict protection');
  }
}

export function assertPrerequisites(required, checks, statuses) {
  for (const { context: name, integration_id: app } of required) {
    if (name === integrationContext) continue;
    const runs = checks.filter(check => check.name === name && (!app || check.app?.id === app))
      .sort((a, b) => b.id - a.id);
    // Commit statuses do not expose the app binding used by rulesets.
    const matchingStatuses = app ? [] : statuses.filter(status => status.context === name);
    if (runs.length && runs[0].status !== 'completed') {
      throw new Error(`Required check is pending: ${name}`);
    }
    if (runs.length && runs[0].conclusion !== 'success') {
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

export function assertRepositoryPrerequisites(repo, current) {
  const rules = api(`repos/${repo}/rules/branches/${encodeURIComponent(current.defaultBranch)}`);
  const required = rules.filter(rule => rule.type === 'required_status_checks')
    .flatMap(rule => rule.parameters.required_status_checks);
  if (!required.length) throw new Error('No required-check policy found; do not infer a merge policy');
  const checks = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp',
    `repos/${repo}/commits/${current.head.sha}/check-runs?per_page=100`], { encoding: 'utf8' }))
    .flatMap(page => page.check_runs);
  const statuses = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp',
    `repos/${repo}/commits/${current.head.sha}/statuses?per_page=100`], { encoding: 'utf8' })).flat();
  assertPrerequisites(required, checks, statuses);
}

export function checkCandidate(candidate, repo) {
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
    && process.env.GITHUB_SHA !== candidate.head) {
    throw new Error('Dispatch ref must resolve to the pinned PR head; checks cannot be attributed to another commit');
  }
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    assertSubmissionEvent(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')), candidate);
  }
  const current = currentCandidate(repo, candidate.pr);
  validateCandidate(candidate, current);
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') assertRepositoryPrerequisites(repo, current);
  if (current.defaultSha !== candidate.base) {
    process.stdout.write('Default branch advanced during frozen-head CI; original head remains unchanged. No automatic PR branch rewrite or restart.\\n');
  }
  return current;
}

/**
 * GitHub Actions may register CI Verify only after the ordinary CI completes.
 * On 2026-10-27 that took roughly four minutes after labeling PR #2669;
 * 12 retries/96 seconds was insufficient and exhausted before CI Verify existed.
 * Bound retry to 60 x 8s (plus API calls), with 15m job timeout.
 * Only missing/running CI Verify is transient. Failed CI Verify and any
 * incomplete, failed, misattributed or absent OTHER check block immediately.
 * Re-read the complete pinned PR/ruleset/check state on every bounded retry.
 */
export async function waitForCiVerifyRegistration(guard, {
  maxRetries = 60,
  sleep = sleepFor,
  intervalMs = 8000,
} = {}) {
  if (typeof guard !== 'function' || !Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 60
      || !Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 8000) {
    throw new Error('Invalid CI registration retry policy');
  }
  for (let attempt = 0; ; attempt++) {
    try {
      return guard();
    } catch (error) {
      if (!(error instanceof Error)
          || !['Required check is missing: CI Verify', 'Required check is pending: CI Verify'].includes(error.message)
          || attempt >= maxRetries) throw error;
      process.stdout.write('CI Verify is missing or still running; rechecking pinned candidate authority.\n');
      await sleep(intervalMs);
    }
  }
}

async function run() {
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
    await waitForCiVerifyRegistration(() => checkCandidate(candidate, repo));
  } else throw new Error('Expected policy, prepare, or guard');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
