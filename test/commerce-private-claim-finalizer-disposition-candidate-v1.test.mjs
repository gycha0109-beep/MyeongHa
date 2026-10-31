import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,it,expect} from 'vitest';

const ROOT=resolve('.');
const file=p=>readFileSync(resolve(ROOT,p),'utf8').replace(/\r\n/g,'\n');
const old=file('supabase/migrations/1520_account_deletion_finalizer_relationship_runtime_sync.sql');
const candidate=file('docs/operations/candidates/account_deletion_finalizer_with_private_withdrawal_claim_v1.sql');
const claim=file('docs/operations/candidates/digital_reading_withdrawal_claim_private_v1.sql');
const sources=[
 'public.internal_finalize_account_deletion_db_v1',
 'myeongha.account_deletion_finalizer_subject_id',
 'account_deletion_finalizer_preflight_failed',
 'delete from public.standard_reading_reader_access_grants',
 'delete from public.standard_reading_official_bindings',
 "set constraints all deferred",
 "set constraints all immediate",
 "set status = 'deleted'",
];
const replay=String.raw`    -- Replayed finalization must not tolerate restored private claim data.
    if exists (
      select 1 from public.digital_reading_withdrawal_claims_private_v1 claim
      where claim.subject_id = p_subject_id
    ) then
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_finalizer_claim_replay_residue',
        message = 'Private withdrawal claim remains after account DB finalization';
    end if;
`;
const deleted=String.raw`  -- P0-PR-01 DELETE: new private withdrawal claim is personal service evidence,
  -- not one of the nine approved Commerce P5Y retained evidence tables.
  -- Its Purchase Intent FK targets retained Commerce purchase evidence; deleting
  -- the child first must leave the original Purchase Intent intact.
  delete from public.digital_reading_withdrawal_claims_private_v1
  where subject_id = p_subject_id;

`;
const check=String.raw`  -- No deleted Subject claim may survive the finalizer. Any inconsistency
  -- aborts the entire transaction instead of marking the Subject deleted.
  if exists (
    select 1 from public.digital_reading_withdrawal_claims_private_v1 claim
    where claim.subject_id = p_subject_id
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_claim_residue',
      message = 'Private withdrawal claim could not be deleted';
  end if;

`;
const header=String.raw`-- STAGED CANDIDATE ONLY: DO NOT COPY INTO supabase/migrations OR DEPLOY.
-- Built from 1520_account_deletion_finalizer_relationship_runtime_sync.sql.
-- Requires private withdrawal claim table, including finalizer-only exact-Subject
-- DELETE trigger, to be installed in the same approved forward-only change.
-- P0-PR-01 DELETE-class disposition only. No changes to P5Y Commerce evidence.
-- Must be validated against the complete PostgreSQL 17 deletion graph first.

`;
describe('approved P0-PR-01 private withdrawal claim finalizer integration candidate',()=>{
 it('stays outside deployed migration and keeps current integration HOLD',()=>{
  expect(candidate.startsWith(header)).toBe(true);
  expect(existsSync(resolve(ROOT,'supabase/migrations/1540_account_deletion_finalizer_private_withdrawal_claim_v1.sql'))).toBe(false);
  const privateIntake=file('apps/api/src/commerce-digital-reading-withdrawal-private-intake-v1.ts');
  expect(privateIntake).toContain('claimDispositionGraphIntegrated: false');
  expect(privateIntake).toContain('input.privateOperationsIntakeApproved !== true');
  expect(privateIntake).toContain('productionMounted: false');
  expect(privateIntake).toContain('publicRouteMounted: false');
 });
 it('does not rewrite any existing 1520 finalizer behavior beyond exact DELETE/replay checks',()=>{
  const restored=candidate.slice(header.length)
   .replace(replay,'')
   .replace(deleted,'')
   .replace(check,'');
  expect(restored).toBe(old);
 });
 it('includes the current finalizer preflight, lock, privacy, replay and terminal lifecycle',()=>{
  for(const marker of sources)expect(candidate).toContain(marker);
  expect(candidate).toContain('security definer');
  expect(candidate).toContain("finalization_policy_version = 'account-deletion-finalization-v1'");
 });
 it('deletes exact Subject claim before reader access and retained purchase remains untouched',()=>{
  const claimIndex=candidate.indexOf('delete from public.digital_reading_withdrawal_claims_private_v1');
  const accessIndex=candidate.indexOf('delete from public.standard_reading_reader_access_grants');
  const retainedIndex=candidate.indexOf('update public.commerce_account_links');
  expect(claimIndex).toBeGreaterThan(0);
  expect(claimIndex).toBeLessThan(accessIndex);
  expect(claimIndex).toBeLessThan(retainedIndex);
  expect(candidate).not.toContain('delete from public.purchase_intents');
  expect(candidate).not.toContain('delete from public.commerce_receipts');
  expect(candidate).not.toContain('delete from public.entitlement_grants');
 });
 it('replayed already-deleted Subject must not contain restored claim rows',()=>{
  const idx=candidate.indexOf("if v_status = 'deleted' then");
  const checkIdx=candidate.indexOf('account_deletion_finalizer_claim_replay_residue');
  const leaseIdx=candidate.indexOf('account_deletion_finalizer_replay_lease_mismatch');
  expect(checkIdx).toBeGreaterThan(idx);
  expect(checkIdx).toBeLessThan(leaseIdx);
 });
 it('checks erased private claims before any finalized account job is committed',()=>{
  const residue=candidate.indexOf('account_deletion_finalizer_claim_residue');
  const status=candidate.indexOf("set status = 'deleted'");
  const constraints=candidate.indexOf('set constraints all immediate');
  expect(residue).toBeGreaterThan(0);
  expect(residue).toBeLessThan(constraints);
  expect(residue).toBeLessThan(status);
 });
 it('existing append-only claim records allow finalizer exact-Subject DELETE only',()=>{
  expect(claim).toContain("if tg_op = 'DELETE' and");
  expect(claim).toContain('current_user = (');
  expect(claim).toContain('public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)');
  expect(claim).toContain("'myeongha.account_deletion_finalizer_subject_id'");
  expect(claim).toContain('old.subject_id');
  expect(claim).toContain("if tg_op <> 'INSERT' then");
 });
 it('approved change does not authorize consumer intake or refund money actions',()=>{
  expect(candidate).not.toMatch(/\bhttp_post\b|grant execute|grant (all|insert|select)/iu);
  expect(candidate).not.toContain('portone.io');
  expect(candidate).not.toContain('internal_apply_entitlement_effect_v1');
 });
});
