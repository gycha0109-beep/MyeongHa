-- S5 pre-commit linkage (PRIVATE, HOLD ONLY), not a paid-content writer.
-- Watchtower-Track: db-authority-core
--
-- Reuse the exact S1 transactional scope lock + S2 current purchased-bundle
-- query with enforced READ COMMITTED (1820). The proposed bundle is compared
-- with DB authority AFTER the lock. Neither Saju's official source-attested
-- Production proof nor Privacy's protected-body retention/deletion/restore
-- policy is approved (Saju #2410, MyeongHa #2318).
--
-- The function can NEVER authorize storing, rendering, sending, remembering
-- or paying for an Official Reader answer. No new tables, output content,
-- provenance records, runtime grants, or production application.

create or replace function public.internal_qry_official_reader_s5_precommit_held_scope_v1(
  p_subject_id uuid,
  p_official_reading_id uuid,
  p_reader_character_id text,
  p_expected_reader_bundle_id uuid
)
returns table (
  gate_state text,
  reason_code text,
  can_persist boolean,
  can_disclose boolean
)
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $reader_s5_held$
declare
  v_scope_state text;
  v_bundle_count bigint;
  v_current_bundle uuid;
begin
  if p_expected_reader_bundle_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'official_reader_s5_expected_bundle_required',
      message = 'Official Reader precommit requires a server-pinned bundle';
  end if;

  -- Same transaction and canonical Subject; this helper refuses old
  -- REPEATABLE READ/SERIALIZABLE snapshots, then acquires the S1 lock BEFORE
  -- making the current entitlement query. The lock lasts until COMMIT.
  select q.scope_state, q.active_bundle_count, q.current_bundle_id
    into v_scope_state, v_bundle_count, v_current_bundle
  from public.internal_qry_official_reader_locked_bundle_scope_v1(
    p_subject_id, p_official_reading_id, p_reader_character_id
  ) q;

  if not found or v_scope_state is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'official_reader_s5_scope_read_unavailable',
      message = 'Official Reader locked precommit access is unavailable';
  end if;

  if v_scope_state = 'no_active_grant' and v_bundle_count = 0
     and v_current_bundle is null then
    return query select
      'blocked'::text, 'no_current_purchase_right'::text,
      false, false;
    return;
  end if;

  if v_scope_state = 'ambiguous_bundles' and v_bundle_count > 1
     and v_current_bundle is null then
    return query select
      'blocked'::text, 'multiple_current_bundles'::text,
      false, false;
    return;
  end if;

  if v_scope_state <> 'one_current_bundle' or v_bundle_count <> 1
     or v_current_bundle is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'official_reader_s5_scope_result_invalid',
      message = 'Official Reader locked precommit access is inconsistent';
  end if;

  if v_current_bundle is distinct from p_expected_reader_bundle_id then
    return query select
      'blocked'::text, 'current_bundle_changed'::text,
      false, false;
    return;
  end if;

  -- Purchase scope matching is NECESSARY but never SUFFICIENT.
  -- The Saju Owner has not issued official Production source proof, and the
  -- Privacy Owner has not approved a protected-body deletion/restore contract.
  -- Keep both permissions false even on the perfectly matching scope.
  return query select
    'held'::text, 'saju_and_privacy_owner_contracts_missing'::text,
    false, false;
end
$reader_s5_held$;

revoke all on function public.internal_qry_official_reader_s5_precommit_held_scope_v1(
  uuid, uuid, text, uuid
) from public;

do $reader_s5_held_acl$
declare v_role text;
begin
  for v_role in
    select rolname
    from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_seyeon_chat_runtime_owner',
      'myeongha_commerce_internal_executor'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_qry_official_reader_s5_precommit_held_scope_v1(uuid,uuid,text,uuid) from %I',
      v_role
    );
  end loop;
end
$reader_s5_held_acl$;

comment on function public.internal_qry_official_reader_s5_precommit_held_scope_v1(
  uuid, uuid, text, uuid
) is
'Private Official Reader S5 precommit purchase scope HOLD gate. S1 xact lock, 1820 READ COMMITTED, current purchased bundle check; even exact match returns HELD and can_persist/can_disclose FALSE. No Saju issuer or Privacy approval, no paid write/HTTP/API execute.';
