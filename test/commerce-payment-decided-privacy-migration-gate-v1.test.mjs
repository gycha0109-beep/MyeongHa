import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const file=(p)=>resolve(process.cwd(),p);
describe('Commerce P0-PR-01 DECIDED + new claim table deployment gate',()=>{
 it('reads the actual owner-approved P0 decision, never a historic OPEN snapshot',()=>{
  const record=readFileSync(file('docs/P0_DECISION_REGISTER.md'),'utf8');
  const section=record.match(/^### P0-PR-01\r?\n([\s\S]*?)^### P0-PR-01A/mu)?.[1];
  expect(section).toMatch(/status:\s*DECIDED/u);
  expect(section).toContain('decided_at: 2026-09-19');
  expect(section).toContain('period: P5Y');
  const machine=JSON.parse(readFileSync(
    file('docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json'),'utf8'));
  expect(machine.decisionStatus).toBe('DECIDED');
  expect(machine.backupRetentionPeriod).toBe('P30D');
  expect(machine.commerceRetentionClasses.flatMap(x=>x.tables)).not
    .toContain('digital_reading_withdrawal_claims_private_v1');
 });
 it('keeps the new Subject-reachable claim table OUT of auto-deploy migrations',()=>{
  expect(existsSync(file(
   'supabase/migrations/20261030150000_digital_reading_withdrawal_claim_private_v1.sql'
  ))).toBe(false);
  expect(existsSync(file(
   'docs/operations/candidates/digital_reading_withdrawal_claim_private_v1.sql'
  ))).toBe(true);
 });
 it('reports owner policy decided but claim graph integration separately blocked',()=>{
  const code=readFileSync(file(
   'apps/api/src/commerce-digital-reading-withdrawal-private-intake-v1.ts'
  ),'utf8');
  expect(code).toContain('accountDeletionPolicyDecided: true');
  expect(code).toContain('claimDispositionGraphIntegrated: false');
  expect(code).toContain('if (input.claimDispositionGraphIntegrated !== true');
  expect(code).not.toContain('retentionPolicyApproved');
 });
});

describe('private claim DELETE is reserved for approved DB finalizer only',()=>{
 it('permits only the trusted finalizer owner on the exact deletion Subject',()=>{
  const sql=readFileSync(file(
   'docs/operations/candidates/digital_reading_withdrawal_claim_private_v1.sql'
  ),'utf8');
  expect(sql).toContain("if tg_op = 'DELETE' and");
  expect(sql).toContain('current_user = (');
  expect(sql).toContain(
   'public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)'
  );
  expect(sql).toContain('myeongha.account_deletion_finalizer_subject_id');
  expect(sql).toMatch(/old\.subject_id[\s\S]*?then\s+return old;/u);
  expect(sql).toContain("if tg_op <> 'INSERT' then");
  expect(sql).toContain('enable row level security');
  const finalizer=readFileSync(file(
   'supabase/migrations/1520_account_deletion_finalizer_relationship_runtime_sync.sql'
  ),'utf8');
  expect(finalizer).toContain(
   "'myeongha.account_deletion_finalizer_subject_id'"
  );
 });
 it('still blocks deployment until the full privacy graph and FK order are integrated',()=>{
  const privateIntake=readFileSync(file(
   'apps/api/src/commerce-digital-reading-withdrawal-private-intake-v1.ts'
  ),'utf8');
  expect(privateIntake).toContain('claimDispositionGraphIntegrated: false');
  expect(existsSync(file(
   'supabase/migrations/20261030150000_digital_reading_withdrawal_claim_private_v1.sql'
  ))).toBe(false);
 });
});
