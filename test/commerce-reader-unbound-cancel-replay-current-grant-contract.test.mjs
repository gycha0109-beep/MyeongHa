import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const source=readFileSync('supabase/migrations/2390_official_reader_full_cancel_exact_event_replay_guard_v1.sql','utf8');
const forward=readFileSync('supabase/migrations/2410_official_reader_unbound_cancel_replay_current_grant_guard_v1.sql','utf8');
const generator=readFileSync('test/db/commerce_claim_noticed_reader_fixture_pg17_generator.mjs','utf8');
const policy=readFileSync('test/db/staged_commerce_migration_policy.sh','utf8');

describe('unbound paid Reader exact full cancellation replay',()=>{
 it('keeps the exact 2390 private GET/Receipt gate and existing locks',()=>{
  const fn='create or replace function public.cmd_apply_verified_portone_reader_full_cancellation_v1(';
  expect(source).toContain(fn);
  expect((forward.match(/create or replace function public\.cmd_apply_verified_portone_reader_full_cancellation_v1\(/gu)??[])).toHaveLength(1);
  for(const v of [
   'security definer',
   'public.internal_acquire_official_reader_purchase_lock_v1(',
   'public.internal_acquire_official_reader_scope_lock_v1(',
   'public.internal_apply_entitlement_effect_v1(',
   "v_unbound_effect->>'result_replayed'='true'",
   'current_grant.source_receipt_id=v_receipt.id',
   "current_grant.status='revoked'",
   'current_grant.last_effective_at=v_event.provider_occurred_at',
   'current_grant.last_provider_ordering_key is not distinct from',
   'original_effect.source_provider_event_id=v_event.id',
   'official_reader_unbound_replayed_effect_no_longer_current',
   'v_event.verified_payload_jsonb is distinct from v_payload',
   'to myeongha_commerce_internal_executor',
  ])expect(forward).toContain(v);
  expect(forward).not.toContain('create table ');
 });
 it('injects ROLLBACK-only actual PG17 pre-bind paid Grant replay and stale tests',()=>{
  for(const v of [
   'OFFICIAL_B2_UNBOUND_PRE_BIND_GRANT_BOUNDARY_CHANGED',
   'UNBOUND_REPLAY_PRE_BIND_GRANT_ALREADY_BOUND',
   'UNBOUND_REPLAY_FIRST_EXACT_REVOKE_FAILED',
   'UNBOUND_REPLAY_IDEMPOTENT_EXACT_EVENT_FAILED',
   'official_reader_unbound_replayed_effect_no_longer_current',
   'UNBOUND_REPLAY_SUPERSEDED_GRANT_OR_EVENT_LEAK',
   'UNBOUND_REPLAY_PROBE_FORCE_ROLLBACK',
   'UNBOUND_REPLAY_PRE_BIND_FIXTURE_NOT_RESTORED'
  ])expect(generator).toContain(v);
 });
 it('preserves historical fixture exclusion with pinned migration blob',()=>{
  expect(policy).toContain('2410_official_reader_unbound_cancel_replay_current_grant_guard_v1.sql');
  expect(policy).toContain("expected='27ade134deb15bd2f7c0aff1c13606f557950930'");
  expect(policy).toContain('HOLD_UNBOUND_REPLAY_MIGRATION_FINGERPRINT_DRIFT');
 });
});
