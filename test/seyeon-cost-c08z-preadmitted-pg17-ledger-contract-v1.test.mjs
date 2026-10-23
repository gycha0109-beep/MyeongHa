import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

describe('C08-Z: restricted PG17 fake-ledger requires external administrator pre-admission',()=>{
 it('pre-admission binds exact batch, run ID, HEAD SHA, offline scope, paid=false',()=>{
  const sql=read('test/db/seyeon_c08y_disposable_shared_ledger_pg17.sql');
  const table=sql.slice(sql.indexOf('create table c08y_offline.trusted_admissions'),sql.indexOf('create table c08y_offline.reservations'));
  expect(table).toContain('owner_run bigint not null unique');
  expect(table).toContain("head_sha text not null check (head_sha ~ '^[0-9a-f]{40}$')");
  expect(table).toContain("scope text not null check (scope='OFFLINE_ONLY')");
  expect(table).toContain('paid_dispatch_enabled=false');
  for(const decl of [
   'create table c08y_offline.trusted_admissions',
   'create table c08y_offline.reservations',
   'create table c08y_offline.observations',
  ])expect(sql.split(decl)).toHaveLength(2);
  expect(sql.trimEnd().endsWith(
   '-- and direct update, delete, insert, truncate are denied to the runner role.'
  )).toBe(true);
  const claim=sql.slice(sql.indexOf('create function c08y_offline.claim_batch_v1'),sql.indexOf('create function c08y_offline.reserve_slot_v1'));
  expect(claim).toContain('from c08y_offline.trusted_admissions a');
  expect(claim).toContain('a.owner_run=p_run and a.head_sha=p_sha');
  expect(claim).toContain("a.scope='OFFLINE_ONLY' and a.paid_dispatch_enabled=false");
  expect(claim).not.toContain("values('c08y-six-slot-v1',p_run,p_sha)");
 });
 it('the same pinned admission must be intact for BOTH reservation and observation',()=>{
  const sql=read('test/db/seyeon_c08y_disposable_shared_ledger_pg17.sql');
  const reserve=sql.slice(sql.indexOf('create function c08y_offline.reserve_slot_v1'),sql.indexOf('create function c08y_offline.observe_slot_v1'));
  const observe=sql.slice(sql.indexOf('create function c08y_offline.observe_slot_v1'));
  for(const part of [reserve,observe]){
   expect(part).toContain('from c08y_offline.trusted_admissions a');
   expect(part).toContain('a.owner_run=p_run and a.head_sha=c.head_sha');
   expect(part).toContain('for update;');
  }
  expect(sql).toContain('revoke all on all tables in schema c08y_offline from c08y_synthetic_reserver');
  expect(sql).toContain('revoke all on all functions in schema c08y_offline from public');
 });
 it('real disposable PG17 denies attempts before approval and mismatched SHA after',()=>{
  const shell=read('test/db/seyeon_c08y_disposable_shared_ledger_pg17.sh');
  const before=shell.indexOf('HOLD_C08Z_UNAUTHORIZED_PRECLAIM');
  const approve=shell.indexOf('insert into c08y_offline.trusted_admissions');
  const mismatch=shell.indexOf('HOLD_C08Z_MISMATCHED_ADMIN_PIN');
  const race=shell.indexOf('race_dir=');
  expect(before).toBeGreaterThan(0);
  expect(approve).toBeGreaterThan(before);
  expect(mismatch).toBeGreaterThan(approve);
  expect(race).toBeGreaterThan(mismatch);
  for(const word of ['PASS_C08Z_PREAUTHORIZED_RUN_SHA_REQUIRED_BEFORE_PG17_CLAIM',
  'PASS_C08Z_ADMIN_REVOKE_DENIES_FURTHER_RPC',
  "'c08y_offline.trusted_admissions','SELECT'",
  "'c08y_offline.trusted_admissions','INSERT'",
  "'c08y_offline.trusted_admissions','UPDATE'",
  "'c08y_offline.trusted_admissions','DELETE'"]){
   expect(shell).toContain(word);
  }
  expect(shell).not.toMatch(/DATABASE_URL|OPENAI_API_KEY|api\.openai\.com/);
 });
 it('remains scratch PG17 only and never enables provider dispatch',()=>{
  const harness=read('test/db/run_ci_case.sh');
  const suite=JSON.parse(read('scripts/ci/db-suites.json'));
  const shell=read('test/db/seyeon_c08y_disposable_shared_ledger_pg17.sh');
  expect(suite.postgres17.cases).toContain('seyeon-c08y-disposable-shared-ledger-pg17');
  expect(harness).toContain('bash test/db/seyeon_c08y_disposable_shared_ledger_pg17.sh');
  expect(shell).toContain("DB_SUITE:-");
  expect(shell).toContain("PGDATABASE:-");
  expect(shell).toContain('myeongha_ci_case_');
  expect(shell).toContain('HOLD_C08Y_DISPOSABLE_CI_PG17_ONLY');
 });
});
