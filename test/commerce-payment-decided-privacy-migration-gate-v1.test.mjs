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
