import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/postgres-isolated-rls-capacity-acceptance.yml', 'utf8');
const runner = readFileSync('scripts/operations/run-isolated-postgres-phase7-phase11-ci.sh', 'utf8');

describe('isolated PG18 actual authority and capacity workflow', () => {
  it('is manual, exact main, read-only, and without Production credentials', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('runs-on: ubuntu-26.04');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('node-version: \'24\'');
    expect(workflow).toContain('PG_BIN_DIR: /usr/lib/postgresql/18/bin');
    expect(workflow).toContain('npm ci --ignore-scripts');
    expect(workflow).not.toContain('secrets.');
    expect(workflow).not.toContain('environment: production');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('ignore-health-check');
  });

  it('requires actual RLS test execution and exact measured synthetic pool pressure', () => {
    expect(runner).toContain('GITHUB_EVENT_NAME:-');
    expect(runner).toContain('GITHUB_WORKSPACE:-');
    expect(runner).toContain('SUPABASE_DB_PASSWORD:-');
    expect(runner).toContain('pg_config');
    expect(runner).toContain('postgres-subject-rls-isolated-phase7.test.ts');
    expect(runner).toContain('MYEONGHA_ISOLATED_POSTGRES_RLS_PHASE7_PASS');
    expect(runner).toContain("grep -F '1 passed'");
    expect(runner).toContain('measure-isolated-postgres-capacity-phase11.mjs');
    expect(runner).toContain('.totalRequested == 96');
    expect(runner).toContain('.observations[3].acquireTimeouts > 0');
    expect(runner).toContain('postSaturationRecovery == true');
  });

  it('always blocks Production and service-resumption claims even on evidence PASS', () => {
    expect(runner).toContain('BLOCKED_INCOMPLETE');
    expect(runner).toContain('realIsolatedRlsProven: true');
    expect(runner).toContain('isolatedPoolSaturationProven: true');
    expect(runner).toContain('productionRlsProven: false');
    expect(runner).toContain('productionCapacityProven: false');
    expect(runner).toContain('sajuResourceCeilingProven: false');
    expect(runner).toContain('scalingThresholdApproved: false');
    expect(runner).toContain('drReady: false');
    expect(runner).toContain('serviceResumptionAllowed: false');
    expect(runner).toContain('outputContainsIdentifiers: false');
    expect(workflow).toContain('if-no-files-found: ignore');
  });
});
