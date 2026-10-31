import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';

const read=path=>readFileSync(path,'utf8');
const runner=read('test/db/commerce_private_claim_finalizer_full_pg17.sh');
const scenario=read('test/db/commerce_private_claim_finalizer_pg17_assertions.sh');
const existing=read('test/db/account_deletion_db_finalizer.sh');
const suite=read('test/db/run_ci_case.sh');
const matrix=JSON.parse(read('scripts/ci/db-suites.json'));
const candidate=read('docs/operations/candidates/account_deletion_finalizer_with_private_withdrawal_claim_v1.sql');
const claim=read('docs/operations/candidates/digital_reading_withdrawal_claim_private_v1.sql');

describe('P4 staged private Claim DELETE integration in full PostgreSQL account finalizer',()=>{
 it('installs both candidates only inside disposable isolated full-migration PostgreSQL DB',()=>{
  expect(runner).toContain('^myeongha_[a-z0-9_]+$');
  expect(runner).toContain('"$db" == *production*');
  expect(runner).toContain('digital_reading_withdrawal_claim_private_v1.sql');
  expect(runner).toContain('account_deletion_finalizer_with_private_withdrawal_claim_v1.sql');
  expect(runner).toContain('COMMERCE_PRIVATE_CLAIM_FINALIZER_PG17_PROOF=1');
  expect(runner).toContain("show server_version_num");
  expect(runner).not.toContain('supabase db push');
 });
 it('runs the actual existing end-to-end DB finalizer rather than a copied simulation',()=>{
  expect(runner).toContain('bash test/db/account_deletion_db_finalizer.sh');
  expect(matrix.postgres17.postgres).toBe(17);
  expect(matrix.postgres17.cases).toContain('commerce-private-claim-full-finalizer-pg17');
  expect(suite).toContain('commerce-private-claim-full-finalizer-pg17)');
  expect(suite).toContain('HOLD_COMMERCE_PRIVATE_CLAIM_FINALIZER_NOT_ISOLATED_PG17');
  expect(suite).toContain('bash test/db/commerce_private_claim_finalizer_full_pg17.sh');
  expect(read('test/db/run_authority_core.sh')).not.toContain('commerce_private_claim_finalizer_full_pg17.sh');
  expect(existing).toContain('internal_finalize_account_deletion_db_v1(');
  expect(existing).toContain('create table public._finalizer_blocker');
  expect(existing).toContain('COMMERCE_PRIVATE_CLAIM_FINALIZER_PG17_PROOF');
 });
 it('the current production finalizer test remains unchanged unless explicitly opted into this isolated case',()=>{
  expect(existing).toContain('"${COMMERCE_PRIVATE_CLAIM_FINALIZER_PG17_PROOF:-0}" == \'1\'');
  expect((existing.match(/COMMERCE_PRIVATE_CLAIM_FINALIZER_PG17_PROOF/g)||[]).length).toBe(3);
  expect(existing).toContain('commerce_private_claim_finalizer_pg17_assertions.sh seed');
  expect(existing).toContain('commerce_private_claim_finalizer_pg17_assertions.sh after-rollback');
  expect(existing).toContain('commerce_private_claim_finalizer_pg17_assertions.sh after-finalization');
 });
 it('checks exact Subject claim removal, unaffected second Subject and retained Purchase evidence',()=>{
  expect(scenario).toContain('insert into public.digital_reading_withdrawal_claims_private_v1');
  expect(scenario).toContain('from public.purchase_intents');
  expect(scenario).toContain("'0|1|2'");
  expect(scenario).toContain('exact deletion / other account / retained Purchase Intent mismatch');
  expect(scenario).toContain("where subject_id='$other_subject_id'::uuid");
 });
 it('checks that failed account deletion rolls back original private Claim removal',()=>{
  expect(scenario).toContain('after-rollback)');
  expect(scenario).toContain("'1|1'");
  expect(existing).toContain('late FK blocker did not abort');
  expect(existing).toContain('rollback mismatch');
 });
 it('requires the actual finalizer replay to reject resurrected Claim instead of returning idempotent success',()=>{
  expect(scenario).toContain('after-finalization)');
  expect(scenario).toContain('account_deletion_finalizer_claim_replay_residue');
  expect(scenario).toContain('internal_finalize_account_deletion_db_v1(');
  expect(scenario).toContain('rollback;');
  expect(scenario).toContain('replay proof leaked synthetic residual data');
 });
 it('claim append-only guard denies ordinary DELETE outside the finalizer',()=>{
  expect(scenario).toContain('ordinary DELETE unexpectedly accepted');
  expect(claim).toContain("if tg_op = 'DELETE'");
  expect(claim).toContain("myeongha.account_deletion_finalizer_subject_id");
  expect(claim).toContain('tr_digital_reading_withdrawal_claim_private_v1');
 });
 it('reuses the staged finalizer without editing actual migration or P5Y evidence',()=>{
  expect(candidate).toContain('delete from public.digital_reading_withdrawal_claims_private_v1');
  expect(candidate).toContain('account_deletion_finalizer_claim_residue');
  expect(candidate).toContain('account_deletion_finalizer_claim_replay_residue');
  expect(runner).not.toContain('grant execute');
  expect(runner).not.toContain('internal_apply_entitlement_effect_v1');
 });
});
