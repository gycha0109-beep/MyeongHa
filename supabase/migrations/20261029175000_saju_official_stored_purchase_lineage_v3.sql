-- Follow-on v3: verify exact original purchase Intent and stored source lineage together.
-- V1 callers remain intact; this does not grant a transport writer or Production issuer.
-- Read back a newly finalized official Reading from the SAME canonical Subject
-- transaction without granting the API executor direct SELECT over private
-- reading_refs or reading_execution_attempts.
-- The Saju issuer and cmd_finalize Reading transport writer remain HOLD.
-- Create and restrict this SECURITY DEFINER function in a single transaction.
begin;
create or replace function public.qry_saju_official_stored_lineage_v3(
  p_subject_id uuid,
  p_reading_id uuid,
  p_execution_attempt_id uuid
)
returns table (
  native_reading_id text,
  external_request_ref text,
  source_birth_input_hash text,
  saju_engine_version text,
  attempt_engine_version text,
  reading_contract_version text,
  product_response_state text,
  stored_snapshot jsonb,
  stored_response_hash text
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
    rr.external_reading_ref,
    rea.external_request_ref,
    rr.source_birth_input_hash,
    rr.saju_engine_version,
    rea.resolved_engine_version,
    rr.reading_contract_version,
    rr.product_response_state,
    rr.response_snapshot_jsonb,
    rr.response_hash
  from public.readings r
  join public.reading_refs rr
    on rr.reading_id = r.id
   and rr.subject_id = r.subject_id
   and rr.execution_attempt_id = r.committed_execution_attempt_id
  join public.reading_execution_attempts rea
    on rea.id = rr.execution_attempt_id
   and rea.reading_id = r.id
   and rea.subject_id = r.subject_id
  join public.reading_sessions rs
    on rs.id = r.reading_session_id
   and rs.subject_id = r.subject_id
  join public.standard_reading_official_bindings o
    on o.reading_id = r.id
   and o.reading_session_id = rs.id
   and o.subject_id = rs.subject_id
   and o.source_birth_revision_id = rs.source_birth_revision_id
   and o.saju_domain = rs.saju_domain
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
  join public.subjects s
    on s.id = r.subject_id
  where r.id = p_reading_id
    and r.subject_id = p_subject_id
    and rr.execution_attempt_id = p_execution_attempt_id
    and r.execution_status = 'succeeded'
    and rea.state = 'succeeded'
    and rea.resolved_engine_version = rr.saju_engine_version
    and r.completed_at is not null
    and s.status = 'active'
    and pi.status = 'verified'
    and g.status = 'active'
    and g.grant_source_type = 'purchase'
    and g.valid_from <= statement_timestamp()
    and (g.valid_until is null or g.valid_until > statement_timestamp());
end
$$;

comment on function public.qry_saju_official_stored_lineage_v3(uuid,uuid,uuid) is
'Internal exact-subject, verified-original-purchase, active-initial-Grant and committed-attempt lineage recheck for an approved Saju official issuer transaction. Never exposed as a public Reading body API.';

revoke all on function public.qry_saju_official_stored_lineage_v3(uuid,uuid,uuid)
  from public;
do $$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_saju_official_stored_lineage_v3(uuid,uuid,uuid) from %I',
      v_role
    );
  end loop;
end
$$;
grant execute on function public.qry_saju_official_stored_lineage_v3(uuid,uuid,uuid)
  to myeongha_api_executor;

do $$
begin
  if not pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_saju_official_stored_lineage_v3(uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.qry_saju_official_stored_lineage_v3(uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_saju_official_stored_lineage_v3(uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'public.qry_saju_official_stored_lineage_v3(uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Saju official stored lineage ACL mismatch';
  end if;
end
$$;

commit;
