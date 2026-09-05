-- MyeongHa current entitlement projection read authority.
--
-- API_CONTRACT §16 exposes current effective entitlement state. This query reads
-- the provider-independent `entitlements` projection only; it never exposes or
-- reconstructs provider receipts, account links, grants, or entitlement events.
-- P0-CM-01 is decided as Web + one-off launch MVP, but provider-specific
-- verification/apply runtime and Production Commerce activation remain outside
-- this read boundary.
--
-- P0-AUTH-01 is decided as a dedicated non-BYPASSRLS API execution role plus
-- transaction-scoped trusted canonical subject context. SECURITY INVOKER is
-- retained and PUBLIC EXECUTE remains revoked; runtime grants are governed by
-- the dedicated API-role ACL migrations.

create or replace function public.qry_entitlements_v1(
  p_subject_id uuid
)
returns table (
  entitlement_id uuid,
  entitlement_key text,
  scope_key text,
  status text,
  active_grant_count integer,
  effective_valid_until timestamptz,
  revision bigint,
  updated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_entitlements_subject_required',
      message = 'entitlement subject identity is required';
  end if;

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.status = 'active'
      and s.merged_into_subject_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_entitlements_subject_ineligible',
      message = 'entitlement read requires an active canonical subject';
  end if;

  return query
  select
    e.id,
    e.entitlement_key,
    e.scope_key,
    e.status,
    e.active_grant_count,
    e.effective_valid_until,
    e.revision,
    e.updated_at
  from public.entitlements e
  where e.subject_id = p_subject_id
  order by e.entitlement_key, e.scope_key_norm;
end;
$$;

revoke execute on function public.qry_entitlements_v1(uuid) from public;
