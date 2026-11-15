import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const historic=readFileSync('supabase/migrations/1890_official_reader_exact_receipt_multi_payment_cancel_v1.sql','utf8');
const replay=readFileSync('supabase/migrations/2390_official_reader_full_cancel_exact_event_replay_guard_v1.sql','utf8');
const sql=readFileSync('test/db/commerce_verified_reader_claim_cancel_effect_pg17.sql','utf8');
const policy=readFileSync('test/db/staged_commerce_migration_policy.sh','utf8');
describe('Reader verified PortOne full cancellation exact replay provenance',()=>{
 it('reuses the existing private 1890 writer, scope locks, effect dispatch and restricted role',()=>{
   const functionName='create or replace function public.cmd_apply_verified_portone_reader_full_cancellation_v1(';
   expect(historic).toContain(functionName);
   expect(replay).toContain(functionName);
   expect((replay.match(/create or replace function public\.cmd_apply_verified_portone_reader_full_cancellation_v1\(/gu)??[])).toHaveLength(1);
   for(const guard of [
    "public.internal_acquire_official_reader_purchase_lock_v1(",
    "public.internal_acquire_official_reader_scope_lock_v1(",
    "public.internal_dispatch_verified_official_reader_revoke_event_v1(v_event.id)",
    "public.internal_apply_entitlement_effect_v1(",
    "grant execute on function public.cmd_apply_verified_portone_reader_full_cancellation_v1(",
    "to myeongha_commerce_internal_executor",
    "official_reader_portone_cancel_replay_conflict",
   ])expect(replay).toContain(guard);
   expect(replay).not.toContain('create table ');
 });
 it('rejects conflicting replays using exact whole GET evidence, ordering and original attempt',()=>{
   for(const guard of [
    "v_event.resolved_receipt_id is distinct from v_receipt.id",
    "v_event.resolved_subject_id is distinct from v_receipt.subject_id",
    "v_event.external_transaction_id is distinct from p_transaction_id",
    "v_event.external_original_transaction_id is not null",
    "v_event.resolution_source_type is distinct from 'receipt'",
    "v_event.environment is distinct from p_environment",
    "v_event.provider_occurred_at is distinct from p_cancelled_at",
    "v_event.provider_ordering_key is distinct from (",
    "v_event.payload_fingerprint is distinct from p_evidence_fingerprint",
    "v_event.verifier_revision is distinct from p_verifier_revision",
    "v_event.verified_payload_jsonb is distinct from v_payload",
    "v_event.event_type is distinct from 'Transaction.Cancelled'",
    "v_event.status not in ('verified','processed')",
   ])expect(replay).toContain(guard);
 });
 it('runs a true PostgreSQL17 same-source replay and changed-revision rejection, preserving sibling',()=>{
   for(const check of [
    'CLAIM_E2E_FULL_CANCEL_EXACT_REPLAY_OR_SIBLING_CHANGED',
    'CLAIM_E2E_REPLAY_DIFFERENT_VERIFIER_REVISION_ACCEPTED',
    'v_replay_revision_conflict_denied:=true',
    "v_verified_cancel_replay->'revoke'->'effects'->0->>'replayed'<>'true'",
    "v_original_other_revision",
   ])expect(sql).toContain(check);
   expect(sql.trimEnd().endsWith('rollback;')).toBe(true);
 });
 it('pins 2390 only to Reader-integrated PG17, excluding untouched historical catalogs',()=>{
   expect(policy).toContain("2390_official_reader_full_cancel_exact_event_replay_guard_v1.sql");
   expect(policy).toContain("expected='15767023608188b9269df992f1663a5189528a36'");
   expect(policy).toContain("HOLD_READER_CANCEL_REPLAY_MIGRATION_FINGERPRINT_DRIFT");
   expect(policy).toContain('[[ "$inclusion" == \'reader-integrated\' ]] && return 1');
 });
});
