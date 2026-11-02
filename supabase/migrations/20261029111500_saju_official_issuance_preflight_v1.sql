-- A read-only, Subject-bound preflight for a PREPARED official Reading attempt.
-- This does not grant the transport writer, Production issuer, Product Offer,
-- any Entitlement, or permission to expose an official report.
-- The same predicate is re-run with grant row locks before atomic finalization.
create or replace function public.qry_saju_official_issuance_preflight_v1(
  p_subject_id uuid,
  p_reading_id uuid,
  p_reading_session_id uuid,
  p_execution_attempt_id uuid,
  p_source_birth_revision_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_reading_id is null or p_reading_session_id is null
    or p_execution_attempt_id is null or p_source_birth_revision_id is null then
    return false;
  end if;

  -- This is the *exact initial Reader purchase* that allocated this official
  -- Reading. A historical Grant, another Reader, aggregate entitlement, or
  -- another Birth revision must not authorize a new source-generation call.
  -- FOR SHARE serializes the final admission with refunds, subject deletion,
  -- Birth updates, attempt finalization, and other relevant row mutations.
  perform 1
    from public.subjects s
    join public.reading_sessions rs
      on rs.subject_id = s.id
    join public.readings r
      on r.reading_session_id = rs.id
     and r.subject_id = rs.subject_id
    join public.reading_execution_attempts rea
      on rea.reading_id = r.id
     and rea.subject_id = r.subject_id
    join public.standard_reading_official_bindings o
      on o.reading_id = r.id
     and o.reading_session_id = rs.id
     and o.subject_id = rs.subject_id
    join public.birth_profiles bp
      on bp.id = o.source_birth_profile_id
     and bp.subject_id = rs.subject_id
    join public.birth_profile_revisions birth
      on birth.id = o.source_birth_revision_id
     and birth.subject_id = rs.subject_id
     and birth.birth_profile_id = bp.id
    join public.standard_reading_reader_access_grants a
      on a.official_reading_id = o.reading_id
     and a.subject_id = o.subject_id
     and a.access_role = 'initial_reader'
     and a.purchase_intent_id = o.generation_purchase_intent_id
     and a.entitlement_grant_id = o.generation_entitlement_grant_id
    join public.purchase_intents pi
      on pi.id = a.purchase_intent_id
     and pi.subject_id = a.subject_id
    join public.entitlement_grants g
      on g.id = a.entitlement_grant_id
     and g.subject_id = a.subject_id
    where s.id = p_subject_id
      and s.status = 'active'
      and rs.id = p_reading_session_id
      and rs.source_birth_revision_id = p_source_birth_revision_id
      and rs.state = 'active'
      and r.id = p_reading_id
      and r.execution_status in ('pending', 'running')
      and r.committed_execution_attempt_id is null
      and rea.id = p_execution_attempt_id
      and rea.state = 'running'
      and o.source_birth_revision_id = rs.source_birth_revision_id
      and o.saju_domain = rs.saju_domain
      and bp.profile_kind = 'self'
      and bp.archived_at is null
      and bp.current_revision_id = birth.id
      and pi.status = 'verified'
      and g.grant_source_type = 'purchase'
      and g.status = 'active'
      and g.valid_from <= statement_timestamp()
      and (g.valid_until is null or g.valid_until > statement_timestamp())
    for share of s, rs, r, rea, o, bp, birth, a, pi, g;

  return found;
end
$$;

comment on function public.qry_saju_official_issuance_preflight_v1(uuid,uuid,uuid,uuid,uuid) is
'Internal Subject-scoped exact initial purchase + prepared attempt + current SELF Birth check. Does not activate Saju issuance, the transport writer, or paid access.';

revoke all on function public.qry_saju_official_issuance_preflight_v1(uuid,uuid,uuid,uuid,uuid)
  from public;
do $$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_saju_official_issuance_preflight_v1(uuid,uuid,uuid,uuid,uuid) from %I',
      v_role
    );
  end loop;
end
$$;
grant execute on function public.qry_saju_official_issuance_preflight_v1(uuid,uuid,uuid,uuid,uuid)
  to myeongha_api_executor;

do $$
begin
  if not pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_saju_official_issuance_preflight_v1(uuid,uuid,uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.qry_saju_official_issuance_preflight_v1(uuid,uuid,uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_saju_official_issuance_preflight_v1(uuid,uuid,uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'public.qry_saju_official_issuance_preflight_v1(uuid,uuid,uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Saju official issuance preflight ACL mismatch';
  end if;
end
$$;
