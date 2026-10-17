import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const verifier = fileURLToPath(new URL('../scripts/verify-ci-responsibility-map.mjs', import.meta.url));
const required = new Map([
  ['ci.yml', 'CI Verify'],
  ['governance.yml', 'Governance Verify'],
  ['web-pr-domain-gates.yml', 'Web PR Verify'],
  ['ci-integration.yml', 'CI Integration Verify'],
]);

function verifyFixture(mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'myeongha-ci-required-checks-'));
  try {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    mkdirSync(join(dir, 'docs', 'ci'), { recursive: true });
    const entries = {};
    for (const [file, check] of required) {
      const source = `name: Fixture
on:
  push:
permissions:
  contents: read
jobs:
  verify:
    name: ${check}
    runs-on: ubuntu-latest
`;
      writeFileSync(join(dir, '.github', 'workflows', file), mutate(file, source) ?? source);
      entries[file] = {
        responsibility: 'project-wide-ci',
        prMode: 'required',
        mainMode: 'required',
        workTrackAttribution: 'pr-metadata',
      };
    }
    writeFileSync(join(dir, 'docs', 'ci', 'workflow-responsibility-map.json'),
      JSON.stringify({ schemaVersion: 1, authority: { deprecatedWorkTrackKeys: [] }, workflows: entries }));
    return spawnSync(process.execPath, [verifier], { cwd: dir, encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('all four ruleset-required CI contexts', () => {
  it('accepts the four matching required check names', () => {
    const result = verifyFixture();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('required_checks=4');
  });

  it('rejects a renamed or absent integration check', () => {
    const result = verifyFixture((file, source) => file === 'ci-integration.yml'
      ? source.replace('name: CI Integration Verify', 'name: CI Integration Passed')
      : source);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ci-integration.yml: required check contract missing: name: CI Integration Verify');
  });

  it('does not mistake a stale comment or step name for the required integration job', () => {
    const result = verifyFixture((file, source) => file === 'ci-integration.yml'
      ? source.replace('    name: CI Integration Verify', '    name: CI Integration Passed')
        + '  # name: CI Integration Verify\\n'
        + '    steps:\\n      - name: CI Integration Verify\\n        run: true\\n'
      : source);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ci-integration.yml: required check contract missing: name: CI Integration Verify');
  });

  it('still rejects a renamed ordinary required check', () => {
    const result = verifyFixture((file, source) => file === 'ci.yml'
      ? source.replace('name: CI Verify', 'name: CI Passed')
      : source);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ci.yml: required check contract missing: name: CI Verify');
  });
});
