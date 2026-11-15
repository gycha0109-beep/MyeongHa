import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const prior=readFileSync('supabase/migrations/2240_official_reader_s7_private_withdrawal_delivery_evidence_v1.sql','utf8');
const next=readFileSync('supabase/migrations/2420_official_reader_s7_withdrawal_exact_full_cancel_provenance_v1.sql','utf8');
const source=readFileSync('apps/api/src/commerce-recorded-reader-s7-evidence-v1.ts','utf8');
const policy=readFileSync('test/db/staged_commerce_migration_policy.sh','utf8');

describe('Reader withdrawal S7 original refunded purchase proof',()=>{
 it('keeps the exact previously private S1-locked evidence function and ACL',()=>{
   const func='create or replace function public.internal_qry_official_reader_withdrawal_delivery_evidence_v1(';
   expect(prior).toContain(func);
   expect((next.match(/create or replace function public\.internal_qry_official_reader_withdrawal_delivery_evidence_v1\(/gu)??[])).toHaveLength(1);
   for(const x of [
     'public.internal_qry_official_reader_locked_bundle_scope_v1(',
     'public.assert_myeongha_subject_context_v1(',
     "receipt.verification_status='verified'",
     "receipt.verification_status='revoked'",
     'revoke all on function public.internal_qry_official_reader_withdrawal_delivery_evidence_v1(',
     'from public;',
     'grant_row.status=\'revoked\''
   ])expect(next).toContain(x);
   expect(next).not.toContain('grant execute on function public.internal_qry_official_reader_withdrawal_delivery_evidence_v1(');
   expect(next).not.toContain('create table ');
 });
 it('requires current exact event with original payment GET, HMAC and provider timing',()=>{
   for(const text of [
     'grant_row.last_effective_at=revoked.effective_at',
     'grant_row.last_provider_ordering_key is not distinct from',
     'revoked.effective_at=cancelled.provider_occurred_at',
     'revoked.provider_ordering_key is not distinct from',
     'cancelled.provider_ordering_key=(',
     "receipt.provider='portone_v2'",
     "cancelled.external_transaction_id=",
     "cancelled.external_event_id=(",
     "'myeongha:portone-v2:full-cancel:v1:'",
     "'^hmac-sha256:k1:[0-9a-f]{64}$'",
     "'portone-full-cancel-verified-v1'",
     "cancelled.verified_payload_jsonb->>'transactionId'",
     "cancelled.verified_payload_jsonb->>'cancellationId'",
     "cancelled.verified_payload_jsonb->>'verifiedAmountMinor'",
     "cancelled.verified_payload_jsonb->>'verifiedCurrency'",
     "cancelled.verified_payload_jsonb->>'evidenceFingerprint'",
     "cancelled.verified_payload_jsonb->>'verifierRevision'",
     'from public.commerce_payment_attempts attempt',
     "cancelled.verified_payload_jsonb->>'paymentId'",
     ')=1',
   ])expect(next).toContain(text);
 });
 it('applies the same revoked Receipt lineage to the independent owner-only recorded S7 read',()=>{
   const sql=source.slice(source.indexOf('RECORDED_READER_S7_EXACT_PURCHASE_SQL_V1='));
   for(const text of [
     "receipt.verification_status='verified'",
     "receipt.verification_status='revoked'",
     "grant_row.status='revoked'",
     'grant_row.last_effective_at=revoked.effective_at',
     'revoked.effective_at=cancelled.provider_occurred_at',
     'cancelled.provider_ordering_key=(',
     'from public.commerce_payment_attempts attempt',
     "cancelled.verified_payload_jsonb->>'paymentId'",
     "'portone-full-cancel-verified-v1'",
   ])expect(sql).toContain(text);
   expect(sql).toContain('consumerDeliveryProven:false');
   expect(sql).toContain('legallyProvenDeliveredAt:null');
   expect(sql).toContain('providerRefundAuthorized:false');
   expect(sql).toContain('grantMutationAuthorized:false');
   expect(sql).not.toContain('grant execute');
 });
 it('keeps historical fixture identity and loads 2420 only for integrated Reader PG17',()=>{
    expect(policy).toContain('2420_official_reader_s7_withdrawal_exact_full_cancel_provenance_v1.sql');
    expect(policy).toContain("expected='5da0a5039f643748eac510dd64d18a374ff470ef'");
    expect(policy).toContain('HOLD_READER_S7_ORIGINAL_CANCEL_MIGRATION_FINGERPRINT_DRIFT');
    expect(policy).toContain('[[ "$inclusion" == \'reader-integrated\' ]] && return 1');
 });
});
