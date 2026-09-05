-- Guest-aware effective entitlement read authority.
--
-- A canonical active Guest reads only its own provider-independent entitlement
-- projection. A canonical active Member reads the effective union of its own
-- projection plus direct merged Guest subjects whose immutable historical rows
-- remain owned by those Guest subject ids. No lineage rows are rewritten and no
-- recursive merge ancestry is inferred.
--
-- Duplicate logical entitlement keys across those source subjects collapse only
-- at read time. The result intentionally omits projection ids, revisions, grant
-- counts, receipts, provider events, and source-subject identities because there
-- is no single authoritative aggregate value for those fields.
--
-- Wall-clock expiry is fail-closed and deterministic through p_effective_at:
-- status must be active and effective_valid_until must be NULL or strictly later
-- than p_effective_at. If any contributing effective projection is unbounded, the
-- collapsed effective_valid_until is NULL; otherwise it is the latest bound.
--
-- SECURITY INVOKER and PUBLIC EXECUTE revocation preserve the existing DB
-- authority model. Production relation/EXECUTE grants are intentionally not
-- widened in this migration.

create or replace function public.qry_effective_entitlements_v2(
  p_subject_id uuid,
  p_effective_at timestamptz
)
returns table (
  entitlement_key text,
  scope_key text,
  effective_valid_until timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subject_kind text;
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_effective_entitlements_v2_subject_required',
      message = 'effective entitlement subject identity is required';
  end if;

  if p_effective_at is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_effective_entitlements_v2_effective_at_required',
      message = 'effective entitlement evaluation timestamp is required';
  end if;

  select s.kind
    into v_subject_kind
  from public.subjects s
  where s.id = p_subject_id
    and s.kind in ('guest', 'member')
    and s.status = 'active'
    and s.merged_into_subject_id is null
    and (s.kind <> 'member' or s.auth_user_id is not null);

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_effective_entitlements_v2_subject_ineligible',
      message = 'effective entitlement read requires an active canonical Guest or Member subject';
  end if;

  return query
  with source_subjects(subject_id) as (
    select p_subject_id
    union all
    select s.id
    from public.subjects s
    where v_subject_kind = 'member'
      and s.kind = 'guest'
      and s.status = 'merged'
      and s.merged_into_subject_id = p_subject_id
  ),
  effective_source_rows as (
    select
      e.entitlement_key,
      e.scope_key,
      e.scope_key_norm,
      e.effective_valid_until
    from public.entitlements e
    join source_subjects src
      on src.subject_id = e.subject_id
    where e.status = 'active'
      and e.active_grant_count > 0
      and (
        e.effective_valid_until is null
        or e.effective_valid_until > p_effective_at
      )
  )
  select
    e.entitlement_key,
    max(e.scope_key) as scope_key,
    case
      when bool_or(e.effective_valid_until is null) then null
      else max(e.effective_valid_until)
    end as effective_valid_until
  from effective_source_rows e
  group by e.entitlement_key, e.scope_key_norm
  order by e.entitlement_key, e.scope_key_norm;
end;
$$;

revoke execute on function public.qry_effective_entitlements_v2(uuid, timestamptz) from public;
