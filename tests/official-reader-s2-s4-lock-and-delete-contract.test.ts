import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Drift guards on actual forward-only writer source, NOT a declaration that
// every Commerce/Chat writer is integrated or that paid T2 can commit.
const migration = (n: string) => readFileSync(`supabase/migrations/${n}`, 'utf8');
const sliceAfter = (s: string, marker: string): string => {
  const i = s.indexOf(marker);
  expect(i, marker).toBeGreaterThanOrEqual(0);
  return s.slice(i);
};
const before = (s: string, a: string, b: string) => {
  const ia = s.indexOf(a), ib = s.indexOf(b);
  expect(ia, a).toBeGreaterThanOrEqual(0);
  expect(ib, b).toBeGreaterThanOrEqual(0);
  expect(ia, `${a} must precede ${b}`).toBeLessThan(ib);
};

describe('S2 Reader writer lock hierarchy / S4 approved deletion boundary', () => {
  it('combined verified issuance locks purchase advisory then scope before creating Grants', () => {
    const src = sliceAfter(
      migration('1870_official_reader_unbound_zero_grant_cancel_purchase_lock_v1.sql'),
      'create or replace function public.internal_apply_verified_reader_purchase_under_scope_v1('
    );
    before(src, 'perform public.internal_acquire_official_reader_purchase_lock_v1(', 'perform public.internal_acquire_official_reader_scope_lock_v1(');
    before(src, 'perform public.internal_acquire_official_reader_scope_lock_v1(', 'from public.internal_apply_verified_receipt_capability_effects_v1(');
  });
  it('verified refund locks purchase, sorts Reader scopes, only then locks exact Receipt/Grant', () => {
    const src = sliceAfter(
      migration('1900_official_reader_receipt_local_unbound_cancellation_v1.sql'),
      'create or replace function public.cmd_apply_verified_portone_reader_full_cancellation_v1('
    );
    before(src, 'perform public.internal_acquire_official_reader_purchase_lock_v1(', 'for v_scope in');
    before(src, 'order by a.subject_id,a.official_reading_id,a.reader_character_id', 'for update;');
    before(src, 'for update;', 'for update\n');
    expect(src).toContain('Reader binding completed during cancellation lock wait');
    expect(src).toContain('source_receipt_id=v_receipt.id');
  });
  it('standalone Reader binding takes scope before purchase row and Grant/Birth locks', () => {
    const src = sliceAfter(
      migration('1810_official_reader_direct_bind_shared_scope_lock_v1.sql'),
      'create or replace function public.cmd_bind_standard_reading_access_v2('
    );
    before(src, 'perform public.internal_acquire_official_reader_scope_lock_v1(', 'for update;');
    before(src, 'perform public.internal_acquire_official_reader_scope_lock_v1(', 'for update of eg;');
    expect(src).toContain('official_reader_s2_bind_scope_changed_before_lock');
  });
  it('dispatch sorts every scope before taking the old Grant effect path', () => {
    const src = sliceAfter(
      migration('1770_official_reader_scope_provider_effect_revoke_v1.sql'),
      'create or replace function public.internal_dispatch_verified_official_reader_revoke_event_v1('
    );
    before(src, 'order by a.subject_id,a.official_reading_id,a.reader_character_id', 'for v_grant in');
    before(src, 'perform public.internal_acquire_official_reader_scope_lock_v1(', 'for v_grant in');
    expect(src).toContain('v_event_at<=v_grant.last_effective_at');
  });
  it('old finalizer requires forward-only child-first extension with existing policy unchanged', () => {
    const src = migration('1520_account_deletion_finalizer_relationship_runtime_sync.sql');
    before(src, 'internal_account_deletion_finalization_preflight_v1(', 'delete from public.standard_reading_reader_access_grants where subject_id = p_subject_id;');
    before(src, 'delete from public.standard_reading_reader_access_grants where subject_id = p_subject_id;', 'delete from public.conversation_messages where subject_id = p_subject_id;');
    expect(src).not.toContain('official_reader_s4_fixture');
    const candidate = readFileSync('test/db/official_reader_s4_finalizer_forward_contract.sql','utf8');
    before(candidate,'delete from official_reader_s4_fixture.protected_bodies b', 'delete from public.standard_reading_reader_access_grants');
    expect(candidate).toContain('rollback;');
    expect(candidate).toContain('revoke all on function official_reader_s4_fixture.rehearse_account_delete_child_first_v1');
  });
});
