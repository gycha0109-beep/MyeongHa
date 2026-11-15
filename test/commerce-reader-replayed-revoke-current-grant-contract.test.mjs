import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';

const source=readFileSync('supabase/migrations/1770_official_reader_scope_provider_effect_revoke_v1.sql','utf8');
const forward=readFileSync('supabase/migrations/2400_official_reader_replayed_revoke_current_grant_guard_v1.sql','utf8');
const integrated=readFileSync('test/db/commerce_verified_reader_claim_cancel_effect_pg17.sql','utf8');
const staged=readFileSync('test/db/staged_commerce_migration_policy.sh','utf8');

describe('S2 Reader exact replay may not borrow superseded revoked effects',()=>{
 it('forward-replaces the current private scoped writer without changing 1080 authority or lock order',()=>{
   const fn='create or replace function public.internal_apply_official_reader_provider_revoke_under_scope_v1(';
   expect(source).toContain(fn);
   expect(forward).toContain(fn);
   expect((forward.match(/create or replace function public\.internal_apply_official_reader_provider_revoke_under_scope_v1\(/gu)??[])).toHaveLength(1);
   for (const x of [
      'security invoker',
      'public.internal_acquire_official_reader_scope_lock_v1(',
      'public.internal_apply_entitlement_effect_v1(',
      "'official-reader-s2-provider-revoke-v1'",
      'from public.entitlement_grants current_grant',
      'original_effect.id=v_effect.result_entitlement_event_id',
      "current_grant.status=p_event_type",
      'current_grant.last_effective_at=p_effective_at',
      'current_grant.last_provider_ordering_key is not distinct from',
      'original_effect.source_provider_event_id=p_provider_event_id',
      "original_effect.source_type='provider_event'",
      'original_effect.effective_at=p_effective_at',
      'original_effect.provider_ordering_key is not distinct from',
      "v_effect.result_replayed is true",
      'official_reader_s2_replayed_effect_no_longer_current',
   ])expect(forward).toContain(x);
   expect(forward.indexOf('public.internal_apply_entitlement_effect_v1('))
     .toBeLessThan(forward.indexOf('official_reader_s2_replayed_effect_no_longer_current'));
   expect(forward).not.toContain('create table ');
   expect(forward).not.toContain('grant execute on function');
 });
 it('exercises true PostgreSQL17 original exact replay, superseded activation and new order with rollback',()=>{
   for(const x of [
     'CLAIM_E2E_FULL_CANCEL_EXACT_REPLAY_OR_SIBLING_CHANGED',
     'v_replayed_reactivated_denied:=true',
     'v_replayed_reordered_denied:=true',
     'CLAIM_E2E_SUPERSEDED_REVOKE_REPLAY_OR_SIBLING_LEAK',
     'official_reader_s2_replayed_effect_no_longer_current',
     'v_original_other_revision',
   ])expect(integrated).toContain(x);
   expect(integrated.trimEnd().endsWith('rollback;')).toBe(true);
 });
 it('keeps historical catalog fingerprint-pinned and installs 2400 only for integrated Reader PG17',()=>{
   expect(staged).toContain("2400_official_reader_replayed_revoke_current_grant_guard_v1.sql");
   expect(staged).toContain("expected='ac0d025948aa6cc30403fa637c2415da98c22526'");
   expect(staged).toContain('HOLD_READER_REPLAY_CURRENT_MIGRATION_FINGERPRINT_DRIFT');
   expect(staged).toContain('[[ "$inclusion" == \'reader-integrated\' ]] && return 1');
 });
});
