import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const source = readFileSync('scripts/operations/resolve-postgres-authoritative-privacy-replay-source.sh', 'utf8');
const repo = 'gycha0109-beep/MyeongHa';
const records = [
  {
    target: 'ledger_run_json',
    name: '[WT:ops] Production PostgreSQL Privacy Recovery Ledger',
    path: '.github/workflows/production-postgres-privacy-recovery-ledger.yml',
  },
  {
    target: 'canary_run_json',
    name: '[WT:ops] Production Privacy Recovery Canary',
    path: '.github/workflows/production-privacy-recovery-canary.yml',
  },
];

function approvalFilter(target) {
  const endMarker = "' \"$" + target + "\" >/dev/null";
  const end = source.indexOf(endMarker);
  expect(end).toBeGreaterThan(0);
  const start = source.lastIndexOf("jq -e '", end);
  expect(start).toBeGreaterThan(0);
  return source.slice(start + "jq -e '".length, end);
}

function runJq(query, record) {
  return spawnSync('jq', ['-e', query], {
    encoding: 'utf8',
    input: JSON.stringify(record),
    env: { ...process.env, GITHUB_REPOSITORY: repo },
  });
}

const hasJq = spawnSync('jq', ['--version'], { encoding: 'utf8' }).status === 0;

describe('protected ops source provenance for isolated privacy replay', () => {
  it('requires exact Watchtower titles, not the generic workflow headers', () => {
    for (const { target, name } of records) {
      const query = approvalFilter(target);
      expect(query).toContain('.name == "' + name + '"');
      expect(query).not.toContain('.name == "' + name.replace('[WT:ops] ', '') + '"');
    }
  });

  it.skipIf(!hasJq)('accepts verified ops runs but rejects mismatched metadata', () => {
    for (const { target, name, path } of records) {
      const query = approvalFilter(target);
      const valid = {
        name, path,
        conclusion: 'success',
        head_branch: 'main',
        event: 'workflow_dispatch',
        repository: { full_name: repo },
      };
      expect(runJq(query, valid).status).toBe(0);
      for (const changed of [
        { name: name.replace('[WT:ops] ', '') },
        { name: name.replace('[WT:ops]', '[WT:commerce]') },
        { path: '.github/workflows/another-workflow.yml' },
        { conclusion: 'failure' },
        { head_branch: 'feature' },
        { event: 'push' },
        { repository: { full_name: 'another/repository' } },
      ]) {
        expect(runJq(query, { ...valid, ...changed }).status).toBe(1);
      }
    }
  });

  it.skipIf(!hasJq)('keeps scheduled ledger eligibility but never scheduled canary', () => {
    for (const entry of records) {
      const valid = {
        name: entry.name, path: entry.path,
        conclusion: 'success',
        head_branch: 'main',
        event: 'schedule',
        repository: { full_name: repo },
      };
      expect(runJq(approvalFilter(entry.target), valid).status)
        .toBe(entry.target === 'ledger_run_json' ? 0 : 1);
    }
  });
});
