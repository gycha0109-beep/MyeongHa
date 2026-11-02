-- Owner-gated report-era vs current SELF Birth revision metadata.
-- The official body and exact paid Grant authority remain separate and unchanged.
-- Deploy only through the existing governed DB migration pipeline; do not open a sale or a Production issuer.

-- Report-era vs current SELF Birth revision status is read-only provenance.
-- Only an already owner- and current-Grant-authorized official report can
-- reveal this information. A direct table SELECT is intentionally not granted
-- to myeongha_api_executor. Missing or non-self lineage is UNKNOWN, never stale.
create or replace function public.qry_official_reading_birth_revision_status_v1(
  p_subject_id uuid,
  p_reading_id uuid
)
returns table (
  issued_revision_no integer,
  current_revision_no integer,
  revision_state text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_reading_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_official_reading_record_reading_required',
      message = 'Official Reading record identity is required.';
  end if;

  if not exists (
    select 1 from public.qry_official_reading_record_runtime_v1(
      p_subject_id, p_reading_id
    )
  ) then
    return;
  end if;

  return query
  select
    case when bp.id is null then null::integer else issued.revision_no end,
    active.revision_no,
    case
      when bp.id is null or issued.id is null or active.id is null then 'unknown'::text
      when issued.id = active.id then 'current'::text
      else 'changed'::text
    end
  from public.readings r
  join public.reading_sessions rs
    on rs.id = r.reading_session_id
   and rs.subject_id = r.subject_id
  left join public.birth_profile_revisions issued
    on issued.id = rs.source_birth_revision_id
   and issued.subject_id = r.subject_id
  left join public.birth_profiles bp
    on bp.id = issued.birth_profile_id
   and bp.subject_id = r.subject_id
   and bp.profile_kind = 'self'
   and bp.archived_at is null
  left join public.birth_profile_revisions active
    on active.id = bp.current_revision_id
   and active.subject_id = r.subject_id
   and active.birth_profile_id = bp.id
  where r.id = p_reading_id
    and r.subject_id = p_subject_id;
end
$$;

comment on function public.qry_official_reading_birth_revision_status_v1(uuid,uuid) is
'Owner- and paid-Grant-gated, self-only report-era/current Birth revision comparison. Missing lineage means unknown; this never grants regenerate rights.';

revoke all on function public.qry_official_reading_birth_revision_status_v1(uuid,uuid)
  from public;
do $$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_official_reading_birth_revision_status_v1(uuid,uuid) from %I',
      v_role
    );
  end loop;
end
$$;
grant execute on function public.qry_official_reading_birth_revision_status_v1(uuid,uuid)
  to myeongha_api_executor;

do $$
begin
  if not pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_official_reading_birth_revision_status_v1(uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.qry_official_reading_birth_revision_status_v1(uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_official_reading_birth_revision_status_v1(uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Official Reading Birth provenance executor ACL mismatch';
  end if;
end
$$;
