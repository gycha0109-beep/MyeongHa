import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/postgres-isolated-rls-capacity-acceptance.yml', 'utf8');
const runner = readFileSync('scripts/operations/run-isolated-postgres-phase7-phase11-ci.sh', 'utf8');
const rlsFixture = readFileSync('test/postgres-subject-rls-isolated-phase7.test.ts', 'utf8');
const capacityProbe = readFileSync('scripts/operations/measure-isolated-postgres-capacity-phase11.mjs', 'utf8');

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
    expect(runner).toContain('Isolated PostgreSQL 18 RLS diagnostic (sanitized)');
    expect(runner).toContain('tail -n 85');
    expect(runner).toContain('[SYNTHETIC_UUID]');
    expect(runner).toContain('[DATABASE_URL_REDACTED]');
    expect(runner).toContain("grep -F '1 passed'");
    expect(runner).toContain('measure-isolated-postgres-capacity-phase11.mjs');
    expect(runner).toContain('.totalRequested == 96');
    expect(runner).toContain('.observations[3].acquireTimeouts > 0');
    expect(runner).toContain('postSaturationRecovery == true');
  });

  it('uses a private Unix socket directory per synthetic PostgreSQL instance on Linux', () => {
    expect(rlsFixture).toContain("process.platform === 'win32' ? '' : ' -c unix_socket_directories='+dir");
    expect(capacityProbe).toContain("process.platform === 'win32' ? '' : ' -c unix_socket_directories=' + dataDir");
    expect(rlsFixture).toContain("'127.0.0.1'");
    expect(capacityProbe).toContain("'127.0.0.1'");
    expect(runner).toContain("PG_BIN_DIR:-");
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

  it('includes bounded actual PostgreSQL18 product-path HTTP measurements in the existing manual job', () => {
    const product = readFileSync('test/ops/product-saju-isolated-pg18-phase11.test.mjs', 'utf8');
    expect(runner).toContain('product-saju-isolated-pg18-phase11.test.mjs');
    expect(runner).toContain('MH_OPS_ISOLATED_PRODUCT_PROOF_PATH="$scratch/product-path.json"');
    expect(runner).toContain('[[ -s "$scratch/product-path.json" ]]');
    expect(runner).not.toContain("sed -n 's/^MYEONGHA_REAL_PG18_PRODUCT_PATH_PHASE10_11_PASS");
    expect(product).toContain("writeFile(proofFile, JSON.stringify(proof), { flag: 'wx', mode: 0o600 })");
    expect(runner).toContain('MYEONGHA_REAL_PG18_PRODUCT_PATH_PHASE10_11_PASS');
    expect(runner).toContain('actual_ephemeral_postgres18_rls');
    expect(runner).toContain('synthetic_response_not_real_engine');
    expect(runner).toContain('isolatedProductPath: $product[0]');
    expect(product).toContain('const isolated = BIN ? describe : describe.skip');
    expect(product).toContain('PostgreSQL 18');
    expect(product).toContain('CREATE POLICY ops_phase11_owner');
    expect(product).toContain('NOINHERIT');
    expect(product).toContain('http://127.0.0.1:');
    expect(product).toContain("productionCapacityProven: false");
    expect(product).toContain("drReady: false");
    expect(product).not.toContain('process.env.DATABASE_URL');
    expect(product).not.toContain('process.env.SUPABASE_DB_PASSWORD');
  });
  it('runs a distinct actual GoTrue, PG18 and pinned Saju experiment with no hosted environment', () => {
    const realRunner = readFileSync('scripts/operations/run-isolated-real-product-chain-phase11-ci.sh', 'utf8');
    const realCompose = readFileSync('scripts/operations/real-gotrue-product-phase11.compose.yml', 'utf8');
    const product = readFileSync('test/ops/product-saju-isolated-pg18-phase11.test.mjs', 'utf8');

    expect(workflow).toContain('run-isolated-real-product-chain-phase11-ci.sh');
    expect(workflow).toContain('9807ce89c08afc61b587560d515a475efd819032');
    expect(workflow).toContain('repository: gycha0109-beep/Saju');
    expect(workflow).toContain('isolated-real-product-chain-phase11-');
    expect(workflow).not.toContain('environment: production');
    expect(workflow).not.toContain('secrets.');

    expect(realRunner).toContain('GITHUB_EVENT_NAME:-');
    expect(realRunner).toContain('GITHUB_REF:-');
    expect(realRunner).toContain('SUPABASE_DB_PASSWORD');
    expect(realRunner).toContain('docker context inspect');
    expect(realRunner).toContain('up --detach gotrue');
    expect(realRunner).toContain('down --volumes --remove-orphans');
    expect(realRunner).toContain('MH_OPS_REAL_PRODUCT_PROOF_PATH');
    expect(realRunner).toContain('BLOCKED_INCOMPLETE');
    expect(realRunner).toContain('OBSERVED_ISOLATED_REAL_CHAIN');
    expect(realRunner).toContain('cloudflareWorkerRuntimeMeasured==false');
    expect(realRunner).toContain('actualSajuResourceCgroupConstrained==false');
    expect(realRunner).toContain('outputContainsIdentifiers==false');

    expect(realCompose).toContain('image: supabase/gotrue:v2.196.0');
    expect(realCompose).toContain('image: postgres:15');
    expect(realCompose).toContain('127.0.0.1:');
    expect(realCompose).toContain('internal: true');
    expect(realCompose).toContain('networks: [disposable, host-loopback]');
    expect(realCompose).toContain('host_binding_ipv4');
    expect(realCompose).toContain('127.0.0.1:');
    expect(realCompose.split('  gotrue:')[0]).toContain('    networks: [disposable]');
    expect(realRunner).toContain('inside-container health=');
    expect(realRunner).toContain('MYEONGHA_REAL_CHAIN_FAILURE_STAGE:');
    expect(realRunner).toContain('No allowlisted stage emitted');
    expect(realRunner).not.toContain('cat "$scratch/vitest.log"');
    expect(realRunner).not.toContain('tail -n 75 "$scratch/vitest.log"');
    expect(product).toContain("phase='member_signup'");
    expect(product).toContain("phase='isolated_pg18_start'");
    expect(product).toContain("phase='real_saju_start'");
    expect(product).toContain("phase='baseline_requests'");
    expect(product).toContain("phase='contended_requests'");
    expect(product).toContain("console.error('MYEONGHA_REAL_CHAIN_FAILURE_STAGE: '+phase)");
    expect(realCompose).not.toContain('SUPABASE_DB_PASSWORD');
    expect(realCompose).not.toContain('myeongha-admin');

    expect(product).toContain('registerDisposableGoTrueMembers');
    expect(product).toContain('startIsolatedPg18');
    expect(product).toContain('launchActualSajuHost');
    expect(product).toContain("memberCount:4");
    expect(product).toContain("productionCapacityProven:false");
    expect(product).toContain("actualSajuResourceCgroupConstrained:sustainedExperiment");
    expect(product).toContain('flag:\'wx\'');
  });

  it('keeps sustained load opt-in and verifies Saju limits and teardown', () => {
    const realRunner = readFileSync('scripts/operations/run-isolated-real-product-chain-phase11-ci.sh', 'utf8');
    const compose = readFileSync('scripts/operations/real-gotrue-product-phase11.compose.yml', 'utf8');
    expect(workflow).toContain('options: [short, sustained]');
    expect(workflow).toContain('default: short');
    expect(compose).toContain('profiles: [sustained]');
    expect(compose).toContain('cpus: 0.50');
    expect(compose).toContain('memswap_limit: 256m');
    expect(compose).toContain('127.0.0.1::43007');
    expect(compose).toContain('127.0.0.1::43008');
    expect(realRunner).toContain('.sustained.recoverySucceeded==true');
    expect(realRunner).toContain('.runtimeCleanupVerified==true');
    expect(realRunner).toContain('.dockerCleanupVerified=true');
  });

});
