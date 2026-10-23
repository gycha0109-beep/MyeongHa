import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/governance.yml', 'utf8').replace(/\r\n/gu, '\n');
const guard = workflow.slice(workflow.indexOf('      - name: Require every selected governance check'));
const script = guard.slice(guard.indexOf('        run: |\n') + '        run: |\n'.length)
  .split('\n').map(line => line.replace(/^ {10}/u, '')).join('\n');
// Windows' WSL bash does not inherit arbitrary Windows environment variables.
const bash = process.platform === 'win32'
  ? resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '..', '..', '..', 'bin', 'bash.exe')
  : 'bash';

function result(overrides: Record<string, string>) {
  return spawnSync(bash, ['-s'], {
    input: script, encoding: 'utf8',
    env: { ...process.env, SCOPE_RESULT: 'success', CONTRACTS_SELECTED: 'false', CONTRACTS_RESULT: 'skipped', DEPENDENCIES_SELECTED: 'false', DEPENDENCY_RESULT: 'skipped', EVENT_NAME: 'pull_request', ...overrides },
  });
}

describe('required Governance result', () => {
  it('allows only checks that were not selected to be skipped', () => {
    expect(result({}).status).toBe(0);
  });
  it('fails when a required contract check was skipped or failed', () => {
    for (const outcome of ['skipped', 'failure']) {
      expect(result({ CONTRACTS_SELECTED: 'true', CONTRACTS_RESULT: outcome }).status).toBe(1);
    }
  });
  it('fails when the required dependency review did not pass', () => {
    expect(result({ DEPENDENCIES_SELECTED: 'true', DEPENDENCY_RESULT: 'skipped' }).status).toBe(1);
    expect(result({ DEPENDENCIES_SELECTED: 'true', DEPENDENCY_RESULT: 'success' }).status).toBe(0);
  });
  it('fails closed when scope calculation failed', () => {
    expect(result({ SCOPE_RESULT: 'failure' }).status).toBe(1);
  });
});

describe('required CI DB results', () => {
  const source = readFileSync('.github/workflows/ci.yml', 'utf8').replace(/\r\n/gu, '\n');
  const step = source.slice(source.indexOf('      - name: Require selected CI gates'));
  const ciScript = step.slice(step.indexOf('        run: |\n') + '        run: |\n'.length)
    .split('\n').map(line => line.replace(/^ {10}/u, '')).join('\n');
  function ciResult(overrides: Record<string, string>) {
    const defaults: Record<string, string> = { SCOPE_RESULT: 'success', FOUNDATION_RESULT: 'success', DB_SELECTED: 'false', DB_RESULT: 'skipped' };
    for (let index = 0; index < 5; index++) {
      defaults[`DB_SELECTED_${index}`] = 'false';
      defaults[`DB_TRACK_${index}`] = 'skipped';
    }
    return spawnSync(bash, ['-s'], { input: ciScript, encoding: 'utf8', env: { ...process.env, ...defaults, ...overrides } }).status;
  }
  it('allows unselected DB suites to be skipped', () => {
    expect(ciResult({})).toBe(0);
  });
  it('requires selected authority core and every selected suite to pass', () => {
    expect(ciResult({ DB_SELECTED: 'true' })).toBe(1);
    expect(ciResult({ DB_SELECTED: 'true', DB_RESULT: 'success' })).toBe(0);
    for (let index = 0; index < 5; index++) {
      expect(ciResult({ [`DB_SELECTED_${index}`]: 'true' })).toBe(1);
      expect(ciResult({ [`DB_SELECTED_${index}`]: 'true', [`DB_TRACK_${index}`]: 'success' })).toBe(0);
      expect(ciResult({ [`DB_SELECTED_${index}`]: 'true', [`DB_TRACK_${index}`]: 'failure' })).toBe(1);
    }
  });
});
