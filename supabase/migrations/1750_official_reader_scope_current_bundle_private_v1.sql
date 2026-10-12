-- S2-private: current Reader purchase-backed bundle cardinality under common lock.
-- Watchtower-Track: db-authority-core
--
-- REVIEW ONLY. Unexposed transaction-scoped helper; no Product approval,
-- official Saju provenance, refund policy, T2 commit or paid reveal.
-- MUST NOT be promoted to public/API EXECUTE or production migration.
-- Calls S1's private scope lock in the SAME transaction BEFORE a fresh
-- current-access query. Existing Commerce writers do not participate yet.
--
-- Uses the authoritative v2 Reader current purchase-backed read, which
-- deduplicates independent same-bundle Grants, while exposing multiple
-- distinct active bundles. No historical replay is treated as entitlement.
--
-- The caller must use a proven READ COMMITTED transaction or equivalent
-- fresh-visibility contract; a REPEATABLE READ snapshot created before a
-- concurrent Writer's commit is not a valid post-lock freshness guarantee.

create or replace function public.internal_qry_official_reader_locked_bundle_scope_v1(
  p_subject_id uuid,
  p_reading_ref uuid,
  p_reader_character_id text
)
returns table (
  scope_state text,
  active_bundle_count bigint,
  current_bundle_id uuid
)
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $reader_locked_scope$
declare
  v_effective_at timestamptz;
begin
  -- A pre-existing REPEATABLE READ / SERIALIZABLE snapshot can remain stale
  -- even after waiting for a cooperative writer's advisory transaction lock.
  -- Until a separate fresh-snapshot protocol is proven, refuse these modes.
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using
      errcode = '25001',
      constraint = 'official_reader_scope_requires_read_committed',
      message = 'Official Reader scope current access requires READ COMMITTED';
  end if;

  -- Also asserts the canonical transaction Subject and rejects invalid input.
  perform public.internal_acquire_official_reader_scope_lock_v1(
    p_subject_id, p_reading_ref, p_reader_character_id
  );

  -- Capture time after the lock wait, never from transaction_timestamp().
  v_effective_at := pg_catalog.clock_timestamp();

  return query
    with active_bundles as materialized (
      select distinct a.reader_content_bundle_id as bundle_id
      from public.internal_qry_character_standard_reading_access_v2(
        p_subject_id, p_reader_character_id, v_effective_at
      ) a
      where a.reading_id = p_reading_ref
    ),
    counts as (
      select count(*) as bundle_count
      from active_bundles
    )
    select
      case
        when counts.bundle_count = 0 then 'no_active_grant'::text
        when counts.bundle_count = 1 then 'one_current_bundle'::text
        else 'ambiguous_bundles'::text
      end as scope_state,
      counts.bundle_count as active_bundle_count,
      case when counts.bundle_count = 1
        then (select b.bundle_id from active_bundles b limit 1) else null::uuid
      end as current_bundle_id
    from counts;
end
$reader_locked_scope$;

revoke all on function public.internal_qry_official_reader_locked_bundle_scope_v1(
  uuid, uuid, text
) from public;

do $scope_current_acl$
declare
  v_role text;
begin
  for v_role in
    select rolname
    from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
                      'myeongha_api_executor','myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_qry_official_reader_locked_bundle_scope_v1(uuid,uuid,text) from %I',
      v_role
    );
  end loop;
end
$scope_current_acl$;

comment on function public.internal_qry_official_reader_locked_bundle_scope_v1(
  uuid, uuid, text
) is
'Private S2 current-bundle cardinality under shared advisory scope lock only. This is not a Grant, Product, Reading or paid reveal authority. All original Commerce writers must adopt the same lock BEFORE any T2 claim; no runtime EXECUTE.';
