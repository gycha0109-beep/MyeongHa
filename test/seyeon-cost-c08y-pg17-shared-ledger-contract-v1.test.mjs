import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

describe('C08-Y real PG17 shared ledger, disposable-only contract',()=>{
 it('registers an isolated PG17 case without applying Production migrations',()=>{
  const runner=read('test/db/run_ci_case.sh');
  const suites=JSON.parse(read('scripts/ci/db-suites.json'));
  expect(suites.postgres17.cases).toContain('seyeon-c08y-disposable-shared-ledger-pg17');
  expect(suites.runtime.cases).not.toContain('seyeon-c08y-disposable-shared-ledger-pg17');
  const start=runner.indexOf('  seyeon-c08y-disposable-shared-ledger-pg17)');
  const finish=runner.indexOf('  seyeon-c08-first-turn-local-pg17)',start);
  expect(start).toBeGreaterThan(0);
  expect(finish).toBeGreaterThan(start);
  const body=runner.slice(start,finish);
  expect(body).toContain('verify_pg17');
  expect(body).toContain('bash test/db/seyeon_c08y_disposable_shared_ledger_pg17.sh');
  expect(body).not.toMatch(/apply_.*migrations|DATABASE_URL|OPENAI_API_KEY/);
 });
 it('uses restricted RPC-only role and fixed owner/batch/slot ordering',()=>{
  const sql=read('test/db/seyeon_c08y_disposable_shared_ledger_pg17.sql');
  expect(sql).toContain('create schema c08y_offline;');
  expect(sql).toContain('create role c08y_synthetic_reserver nologin');
  expect(sql).toContain('revoke all on all tables in schema c08y_offline from c08y_synthetic_reserver');
  expect(sql).toContain('revoke all on all functions in schema c08y_offline from public');
  expect(sql).toContain('for update;');
  expect(sql).toContain('on conflict do nothing');
  expect(sql).toContain("observed_count<>prior_count");
  expect(sql).toContain("'UNKNOWN_OUTCOME_HOLD'");
  expect(sql).toContain('reserved_micro_usd = 3277');
  expect(sql).not.toMatch(/OPENAI_API_KEY|api\.openai\.com|grant all on all tables|create extension/i);
 });
 it('two independent PG17 sessions must race, one wins, crash and unknown block replay',()=>{
  const shell=read('test/db/seyeon_c08y_disposable_shared_ledger_pg17.sh');
  expect(shell).toContain('GITHUB_ACTIONS:-');
  expect(shell).toContain('DB_SUITE:-');
  expect(shell).toContain('PGHOST:-');
  expect(shell).toContain('myeongha_ci_case_');
  expect(shell).toContain('show server_version_num');
  expect(shell).toContain('SET LOCAL ROLE c08y_synthetic_reserver;');
  expect(shell).toContain('pg_backend_pid()');
  expect(shell).toContain('ready$other');
  expect(shell).toContain('timeout 15 sh');
  expect(shell).toContain('PASS_C08Y_TWO_INDEPENDENT_PG17_BACKENDS_ONE_DURABLE_CLAIM');
  expect(shell).toContain('PASS_C08Y_PG17_RESTART_DUPLICATE_REJECTED_AND_UNKNOWN_BLOCKS_NEXT');
  expect(shell).toContain("reserve(900,3)");
  expect(shell).not.toMatch(/DATABASE_URL|OPENAI_API_KEY|GITHUB_TOKEN|api\.github\.com/i);
 });
 it('never claims provider billing attestation, production durability or paid dispatch',()=>{
  const files=['test/db/seyeon_c08y_disposable_shared_ledger_pg17.sql',
   'test/db/seyeon_c08y_disposable_shared_ledger_pg17.sh'];
  for(const f of files){
   const text=read(f);
   expect(text).not.toMatch(/production\.db|api\.openai\.com|\/v1\/responses|OPENAI_EVAL_API_KEY/i);
  }
 });
});
