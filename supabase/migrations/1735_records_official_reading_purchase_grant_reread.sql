-- Records official Reading reread must observe the CURRENT exact paid purchase Grant.
--
-- Historical Reader ids and owner membership are display provenance, not paid
-- artifact access. A successful persisted reading remains immutable after
-- refund/revoke, but its protected full-body reread must be denied when all
-- purchase-backed Reader rights for that official artifact have expired.
--
-- Reuse the existing v1/v2 exact-grant source functions. Do not activate
-- Saju Production interpretation, saleable Offers, or public checkout.

create or replace function public.qry_official_reading_record_runtime_v1(
  p_subject_id uuid,
  p_reading_id uuid
)
returns table (
  reading_id uuid,
  reading_session_id uuid,
  saju_domain text,
  reading_contract_version text,
  product_response_state text,
  response_snapshot_jsonb jsonb,
  response_hash text,
  reader_character_ids text[],
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_reading_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_official_reading_record_reading_required',
      message = 'Official Reading record identity is required.';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    r.id,
    r.reading_session_id,
    r.saju_domain,
    rr.reading_contract_version,
    rr.product_response_state,
    rr.response_snapshot_jsonb,
    rr.response_hash,
    coalesce(
      (
        select pg_catalog.array_agg(provenance.reader_character_id order by provenance.reader_character_id)
        from (
          select distinct sri.reader_character_id
          from public.standard_reading_reader_interpretations sri
          where sri.official_reading_id = r.id
            and sri.subject_id = p_subject_id
        ) provenance
      ),
      array[]::text[]
    ),
    r.completed_at
  from public.readings r
  join public.reading_refs rr
    on rr.reading_id = r.id
   and rr.subject_id = r.subject_id
   and rr.execution_attempt_id = r.committed_execution_attempt_id
  where r.id = p_reading_id
    and r.subject_id = p_subject_id
    and r.execution_status = 'succeeded'
    and r.committed_execution_attempt_id is not null
    and r.completed_at is not null
    and rr.product_response_state in ('delivered', 'delivered_with_fallback')
    and (
      -- Existing non-Commerce-bound history retains its legacy owner-scoped
      -- reread policy. A paid source binding must NEVER fall through here.
      (
        not exists (
          select 1 from public.standard_reading_official_bindings o
          where o.reading_id = r.id
        )
        and not exists (
          select 1 from public.standard_reading_unit_bindings b
          where b.reading_id = r.id
        )
      )
      -- Current Reader-independent official Reading: any one exact active
      -- Reader purchase grants the same immutable source. Revoking A does
      -- not remove B; revoking all closes the full-body reread.
      or exists (
        select 1
        from public.standard_reading_official_bindings o
        join public.standard_reading_reader_access_grants a
          on a.official_reading_id = o.reading_id
         and a.subject_id = o.subject_id
        cross join lateral public.internal_qry_standard_reading_artifact_source_v2(
          p_subject_id, r.id, a.reader_character_id, pg_catalog.transaction_timestamp()
        ) paid
        where o.reading_id = r.id
          and o.subject_id = p_subject_id
          and o.reading_session_id = r.reading_session_id
          and paid.reading_id = r.id
          and paid.product_id = o.product_id
          and paid.reading_contract_version = rr.reading_contract_version
          and paid.product_response_state = rr.product_response_state
          and paid.response_hash = rr.response_hash
      )
      -- Legacy reader-bound purchase lineage stays independently gated by
      -- its exact consumed Grant, never by an aggregate current entitlement.
      or (
        -- Once a Reading has a Reader-independent official binding, a legacy
        -- unit binding must never bypass its v2 exact-Grant revocation.
        not exists (
          select 1 from public.standard_reading_official_bindings official
          where official.reading_id = r.id
        )
        and exists (
        select 1
        from public.standard_reading_unit_bindings b
        cross join lateral public.internal_qry_standard_reading_artifact_source_v1(
          p_subject_id, r.id, pg_catalog.transaction_timestamp()
        ) paid
        where b.reading_id = r.id
          and b.subject_id = p_subject_id
          and b.reading_session_id = r.reading_session_id
          and paid.reading_id = r.id
          and paid.reading_session_id = r.reading_session_id
          and paid.product_id = b.product_id
          and paid.reading_contract_version = rr.reading_contract_version
          and paid.product_response_state = rr.product_response_state
          and paid.response_hash = rr.response_hash
        )
      )
    );
end
$$;

comment on function public.qry_official_reading_record_runtime_v1(uuid, uuid) is
'Server-only owner-scoped Records archive. Standard Reading v1/v2 paid artifacts require current exact purchase-backed grant; Reader history does not authorize full-body reread.';

revoke all on function public.qry_official_reading_record_runtime_v1(uuid, uuid)
  from public;
do $$
declare
  v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_official_reading_record_runtime_v1(uuid,uuid) from %I', v_role
    );
  end loop;
end
$$;
grant execute on function public.qry_official_reading_record_runtime_v1(uuid, uuid)
  to myeongha_api_executor;

do $$
begin
  if not pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_official_reading_record_runtime_v1(uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.qry_official_reading_record_runtime_v1(uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_official_reading_record_runtime_v1(uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Records paid reread API executor ACL mismatch';
  end if;
end
$$;


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
