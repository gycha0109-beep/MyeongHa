-- Exact official Reading attempt state for INTERNAL issuer reconciliation only.
-- This does not authorize any new attempt, transport retry, Product Offer,
-- successful Saju source, stored report disclosure, or Reader AI context.
-- The transport prepare/finalize writer ACL from 1000 remains unchanged.
create or replace function public.qry_saju_official_attempt_reconciliation_status_v1(
  p_subject_id uuid,
  p_reading_id uuid,
  p_execution_attempt_id uuid
)
returns table (
  execution_attempt_no integer,
  attempt_state text,
  reading_state text,
  is_committed_source boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_reading_id is null or p_execution_attempt_id is null then
    return;
  end if;

  return query
  select
    rea.execution_attempt_no,
    rea.state,
    r.execution_status,
    r.execution_status = 'succeeded'
      and rea.state = 'succeeded'
      and r.committed_execution_attempt_id = rea.id
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
   and o.source_birth_revision_id = rs.source_birth_revision_id
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
    and rs.state = 'active'
    and r.id = p_reading_id
    and rea.id = p_execution_attempt_id
    and pi.status = 'verified'
    and g.status = 'active'
    and g.grant_source_type = 'purchase'
    and g.valid_from <= statement_timestamp()
    and (g.valid_until is null or g.valid_until > statement_timestamp());
end
$$;

comment on function public.qry_saju_official_attempt_reconciliation_status_v1(uuid,uuid,uuid) is
'Internal, exact-Subject and active initial purchase protected attempt status. Neither an issuer confirmation nor a retry/disclosure authorization.';

revoke all on function public.qry_saju_official_attempt_reconciliation_status_v1(uuid,uuid,uuid)
  from public;

do $$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_saju_official_attempt_reconciliation_status_v1(uuid,uuid,uuid) from %I',
      v_role
    );
  end loop;
end
$$;

grant execute on function public.qry_saju_official_attempt_reconciliation_status_v1(uuid,uuid,uuid)
  to myeongha_api_executor;

do $$
begin
  if not pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_saju_official_attempt_reconciliation_status_v1(uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.qry_saju_official_attempt_reconciliation_status_v1(uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_saju_official_attempt_reconciliation_status_v1(uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'public.qry_saju_official_attempt_reconciliation_status_v1(uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_prepare_reading_transport_attempt_v1(uuid,uuid,uuid,text,text,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_finalize_reading_transport_failure_v1(uuid,uuid,uuid,boolean,text,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_finalize_reading_transport_success_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Saju official reconciliation status ACL mismatch or transport writer became open';
  end if;
end
$$;
