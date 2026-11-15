import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';

const forward=readFileSync(
 'supabase/migrations/2380_official_reader_current_exact_cancellation_status_provenance_v1.sql','utf8'
);
const historic=readFileSync(
 'supabase/migrations/2160_official_reader_s2_verified_provider_cancellation_status_private_v1.sql','utf8'
);
const policy=readFileSync('test/db/staged_commerce_migration_policy.sh','utf8');
const pg17=readFileSync('test/db/commerce_verified_reader_claim_cancel_effect_pg17.sql','utf8');

describe('current exact original Reader cancellation display under S1',()=>{
 it('forward-replaces only the same existing private reader display function',()=>{
   const name='public.internal_qry_official_reader_verified_cancellation_status_v1(';
   expect(historic).toContain('create or replace function '+name);
   expect(forward).toContain('create or replace function '+name);
   expect((forward.match(/create or replace function public\.internal_qry_official_reader_verified_cancellation_status_v1\(/gu)??[])).toHaveLength(1);
   expect(forward).toContain('public.internal_qry_official_reader_locked_bundle_scope_v1(');
   expect(forward).toContain("v_current_count>0");
   expect(forward).toContain("'current_verified_purchase'");
   expect(forward).toContain("'verified_full_cancellation'");
   expect(forward).toContain("'not_confirmed'");
 });
 it('ties the displayed cancellation to the live Grant, exact original GET, payment and effect',()=>{
   for(const check of [
    "grant_row.last_effective_at=ev.effective_at",
    "grant_row.last_provider_ordering_key is not distinct from",
    "ev.effective_at=provider_event.provider_occurred_at",
    "ev.provider_ordering_key is not distinct from",
    "provider_event.provider_ordering_key=(",
    "provider_event.resolved_receipt_id",
    "original_receipt.verification_status='revoked'",
    "provider_event.external_transaction_id=",
    "provider_event.external_event_id=(",
    "portone-full-cancel-verified-v1",
    "provider_event.payload_fingerprint ~",
    "provider_event.verified_payload_jsonb->>'paymentId'",
    "provider_event.verified_payload_jsonb->>'verifiedAmountMinor'",
    "provider_event.verified_payload_jsonb->>'verifiedCurrency'",
    "provider_event.verified_payload_jsonb->>'evidenceFingerprint'",
    "provider_event.verified_payload_jsonb->>'verifierRevision'",
    "payment_attempt.provider_transaction_id=",
    ")=1",
   ]) expect(forward).toContain(check);
 });
 it('does not create a public cancellation status route or relax the original ACL',()=>{
   expect(forward).toContain('revoke all on function public.internal_qry_official_reader_verified_cancellation_status_v1(');
   expect(forward).toContain('myeongha_commerce_internal_executor');
   expect(forward).not.toContain('grant execute on function public.internal_qry_official_reader_verified_cancellation_status_v1(');
   expect(forward).not.toContain('create table ');
   expect(forward).not.toContain('http://');
   expect(forward).not.toContain('https://api.portone.io');
 });
 it('pins 2380 out of historical fixtures and executes only with Reader-integrated PG17',()=>{
   expect(policy).toContain("2380_official_reader_current_exact_cancellation_status_provenance_v1.sql");
   expect(policy).toContain("expected='f7dbad4218a9443894f53af4777bd46eb823f99c'");
   expect(policy).toContain('HOLD_READER_STATUS_MIGRATION_FINGERPRINT_DRIFT');
   expect(policy).toContain('[[ "$inclusion" == \'reader-integrated\' ]] && return 1');
 });
 it('exercises actual migrated PG17 display with active sibling, exact effect and later clock',()=>{
   for(const assertion of [
      'CLAIM_E2E_READER_SIBLING_PURCHASE_CANCEL_DISPLAY_OVERRIDDEN',
      'CLAIM_E2E_EXACT_FULL_CANCEL_STATUS_NOT_OBSERVED',
      'CLAIM_E2E_STALE_HISTORICAL_CANCEL_DISPLAY_ALLOWED',
      'CLAIM_E2E_PRIVATE_CANCEL_STATUS_PROBE_ROLLBACK',
      'CLAIM_E2E_PRIVATE_CANCEL_STATUS_PROBE_LEAK',
      "v_display_state<>'current_verified_purchase'",
      "v_display_state<>'verified_full_cancellation'",
      "v_display_state<>'not_confirmed'",
   ])expect(pg17).toContain(assertion);
   expect(pg17.trimEnd().endsWith('rollback;')).toBe(true);
 });
});
