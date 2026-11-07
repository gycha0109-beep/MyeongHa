import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';

const sql=readFileSync('test/db/commerce_verified_reader_claim_cancel_effect_pg17.sql','utf8');
const shell=readFileSync('test/db/commerce_verified_reader_claim_cancel_effect_pg17.sh','utf8');
const matrix=JSON.parse(readFileSync('scripts/ci/db-suites.json','utf8'));
const ci=readFileSync('test/db/run_ci_case.sh','utf8');
const confirmer=readFileSync(
 'supabase/migrations/2370_commerce_reader_refund_confirm_exact_provider_lineage_v1.sql',
 'utf8',
);
const e2eIndex=(source,needle)=>source.indexOf(needle);

describe('exact paid Reader Claim -> owner decision -> refund progress real PG17 contract',()=>{
 it('runs ONLY in disposable migrated PostgreSQL17 and rolls back all hypothetical decisions',()=>{
  expect(matrix.postgres17.postgres).toBe(17);
  expect(shell).toContain("DB_SUITE:-");
  expect(shell).toContain('postgres17');
  expect(shell).toContain('myeongha_ci_case_[0-9]+');
  expect(ci).toContain('commerce-verified-reader-claim-cancel-effect-pg17');
  expect(sql).toContain('begin;');
  expect(sql.trimEnd().endsWith('rollback;')).toBe(true);
  expect(sql).not.toMatch(/\\bcommit\\s*;/iu);
  expect(sql).not.toContain('https://api.portone.io');
 });
 it('connects immutable original Claim to separately approved one-Receipt refund lifecycle',()=>{
  const claim=sql.indexOf('from public.cmd_receive_digital_reading_withdrawal_claim_v1(');
  const decision=sql.indexOf('insert into public.commerce_reader_full_refund_dispatches_v1(');
  const reserve=sql.indexOf('from public.internal_reserve_reader_full_refund_dispatch_v1(');
  const response=sql.indexOf('public.internal_record_reader_full_refund_response_v1(');
  const revoke=sql.indexOf('from public.internal_apply_entitlement_effect_v1(');
  const deny=sql.indexOf('public.internal_confirm_reader_full_refund_dispatch_v1(');
  const deletion=sql.indexOf('from public.internal_finalize_account_deletion_db_v1(');
  expect(claim).toBeGreaterThan(0);
  expect(decision).toBeGreaterThan(claim);
  expect(reserve).toBeGreaterThan(decision);
  expect(response).toBeGreaterThan(reserve);
  expect(revoke).toBeGreaterThan(response);
  expect(deny).toBeGreaterThan(revoke);
  expect(deletion).toBeGreaterThan(deny);
  expect(sql).toContain('source_claim_fingerprint=v_claim_fingerprint');
  expect(sql).toContain('CLAIM_E2E_MANUAL_DECISION_NOT_REFLECTED_WITH_IMMUTABLE_CLAIM');
  expect(sql).toContain('CLAIM_E2E_REFUND_RESERVATION_STATUS_NOT_VISIBLE');
  expect(sql).toContain('CLAIM_E2E_SUBMITTED_REQUEST_WRONGLY_CLAIMED_CONFIRMED');
 });
 it('pins refund confirmation to the exact original full cancellation GET and Receipt',()=>{
  expect(confirmer).toContain('create or replace function public.internal_confirm_reader_full_refund_dispatch_v1(');
  for(const check of [
    "pe.resolved_receipt_id=cr.id","pe.resolved_subject_id=cr.subject_id",
    "pe.resolution_source_type='receipt'",
    "pe.event_type='Transaction.Cancelled'",
    "pe.environment='production'",
    "pe.verified_payload_jsonb->>'schemaVersion'=",
    "portone-full-cancel-verified-v1",
    "pe.verified_payload_jsonb->>'paymentId'",
    "pe.verified_payload_jsonb->>'verifiedAmountMinor'",
    "pe.verified_payload_jsonb->>'verifiedCurrency'",
    "pe.verified_payload_jsonb->>'cancellationId'",
    "pe.verified_payload_jsonb->>'evidenceFingerprint'",
    "pe.verified_payload_jsonb->>'verifierRevision'",
    "attempt.provider_transaction_id=cr.external_transaction_id",
    "v_matching_source_count<>1",
  ])expect(confirmer).toContain(check);
  expect(confirmer).toContain('grant execute on function public.internal_confirm_reader_full_refund_dispatch_v1(');
  expect(confirmer).toContain('to myeongha_commerce_internal_executor');
  expect(confirmer).not.toContain('supabase db push');
  const p=e2eIndex(sql,'-- Regression of the old 2310 false-positive');
  expect(p).toBeGreaterThan(0);
  expect(sql).toContain('CLAIM_E2E_WRONG_AMOUNT_FULL_CANCEL_FALSE_REFUND_CONFIRMED');
  expect(sql).toContain("v_receipt.verified_amount_minor+1");
 });
 it('never turns a provisional provider request or effect into a confirmed customer refund',()=>{
  expect(sql).toContain("'refund_decision_recorded'");
  expect(sql).toContain("'refund_processing'");
  expect(sql).toContain("'REQUESTED'");
  expect(sql).toContain('Refund receipt still unconfirmed by verified cancellation');
  expect(sql).toContain('CLAIM_E2E_UNVERIFIED_REFUND_CONFIRMATION_ALLOWED');
  expect(sql).not.toContain("set status='confirmed'");
  expect(sql).not.toContain("v_request_state<>'refund_confirmed'");
 });
 it('keeps unrelated Subject Claim at received and preserves only P5Y decision after deletion',()=>{
  expect(sql).toContain('CLAIM_E2E_OTHER_SUBJECT_REFUND_STATUS_LEAK');
  expect(sql).toContain('where id=v_refund_decision_id and receipt_id=v_receipt.id');
  expect(sql).toContain('retained_until>pg_catalog.clock_timestamp()');
  expect(sql).toContain('where subject_id=v_subject)<>0');
  expect(sql).toContain('v_deleted_replay.replayed is distinct from true');
  expect(sql).toContain('CLAIM_E2E_ACCOUNT_PRIVACY_FINALIZER_RETENTION_OR_ISOLATION_FAILED');
 });
});
