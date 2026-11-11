-- Candidate only. Install after commerce_approved_saju_issuance_v1.sql.
-- The separately provisioned issuance login receives only the narrow
-- facade role. No membership is assigned to a serving login here.
create role myeongha_approved_saju_issuer_executor nologin noinherit
  nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

create function public.qry_approved_saju_issue_scope_v1(uuid,uuid,text)
returns jsonb
language sql stable security definer set search_path=pg_catalog
as $function$
  select commerce_saju_private.approved_issue_scope_v1($1,$2,$3)
$function$;

create function public.prepare_approved_component_reading_v1(uuid,uuid,text,uuid,uuid,text,text)
returns table(reading_id uuid,session_id uuid)
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
begin
  return query select * from commerce_saju_private.prepare_approved_component_reading_v1($1,$2,$3,$4,$5,$6,$7);
  -- The existing invoker constraint triggers read protected tables.
  -- Run them while the controlled wrapper owns the write, before COMMIT.
  set constraints public.ct_reading_session_authority,public.ct_reading_request_authority,
    public.ct_reading_finalize_from_reading immediate;
  set constraints public.ct_reading_session_authority,public.ct_reading_request_authority,
    public.ct_reading_finalize_from_reading deferred;
end
$function$;

create function public.admit_approved_saju_issue_attempt_v1(uuid,uuid,text,uuid,uuid,uuid,uuid,text)
returns boolean
language sql volatile security definer set search_path=pg_catalog
as $function$
  select case when $6 is null then false
    else commerce_saju_private.admit_approved_issue_attempt_v1($1,$2,$3,$4,$5,$6,$7,$8) end
$function$;

create function public.cmd_prepare_approved_saju_attempt_v1(
  p_subject uuid,p_purchase uuid,p_component text,p_reading uuid,p_session uuid,
  p_attempt uuid,p_birth uuid,p_request_hash text,p_transport text,p_engine text,p_engine_version text
)
returns table(execution_attempt_id uuid,execution_attempt_no integer,attempt_state text,replayed boolean)
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
declare prepared record;
begin
  if not commerce_saju_private.admit_approved_issue_attempt_v1(
    p_subject,p_purchase,p_component,p_reading,p_session,null,p_birth,p_request_hash
  ) then return; end if;
  select * into strict prepared from public.cmd_prepare_reading_transport_attempt_v1(
    p_subject,p_reading,p_attempt,p_transport,p_engine,p_engine_version
  );
  if prepared.replayed then return; end if;
  if not commerce_saju_private.admit_approved_issue_attempt_v1(
    p_subject,p_purchase,p_component,p_reading,p_session,p_attempt,p_birth,p_request_hash
  ) then
    raise exception using errcode='P0001',constraint='approved_saju_issuer_current_scope_unavailable',
      message='Approved Saju issuance authority changed';
  end if;
  set constraints public.ct_reading_finalize_from_reading immediate;
  set constraints public.ct_reading_finalize_from_reading deferred;
  return query select prepared.execution_attempt_id,prepared.execution_attempt_no,
    prepared.attempt_state,prepared.replayed;
end
$function$;

create function public.cmd_finalize_approved_saju_reading_v1(
  p_subject uuid,p_purchase uuid,p_component text,p_reading uuid,p_attempt uuid,p_event uuid,
  p_request_hash text,p_external_request text,p_engine_version text,p_native_reading text,
  p_birth_hash text,p_snapshot jsonb,p_stored_hash text
)
returns table(reading_id uuid,execution_attempt_id uuid,response_hash text,replayed boolean)
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
declare
  session_row record;
  committed record;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  select session.id,session.source_birth_revision_id into session_row
    from public.readings reading join public.reading_sessions session on session.id=reading.reading_session_id
      and session.subject_id=reading.subject_id
    where reading.id=p_reading and reading.subject_id=p_subject and session.target_birth_revision_id is null;
  if not found or (p_snapshot->'reading'->>'readingId') is distinct from p_reading::text
    or p_snapshot->>'state' is distinct from 'delivered'
    or p_snapshot->>'responseVersion' is distinct from 'myeonghwa-product-reading-response-v2'
    or not commerce_saju_private.admit_approved_issue_attempt_v1(
      p_subject,p_purchase,p_component,p_reading,session_row.id,p_attempt,session_row.source_birth_revision_id,p_request_hash
    ) then
    raise exception using errcode='P0001',constraint='approved_saju_issuer_current_scope_unavailable',
      message='Approved Saju issuance authority changed';
  end if;
  select * into strict committed from public.cmd_finalize_reading_transport_success_v1(
    p_subject,p_reading,p_attempt,p_event,p_external_request,p_engine_version,p_native_reading,
    p_birth_hash,null,'myeonghwa-product-reading-response-v2','delivered',null,null,null,p_snapshot,p_stored_hash
  );
  perform commerce_saju_private.bind_approved_component_reading_v1(
    p_subject,p_purchase,p_component,p_reading,p_request_hash,p_stored_hash
  );
  set constraints public.ct_reading_finalize_from_reading,public.ct_reading_finalize_from_ref,
    public.ct_reading_finalize_from_execution immediate;
  set constraints public.ct_reading_finalize_from_reading,public.ct_reading_finalize_from_ref,
    public.ct_reading_finalize_from_execution deferred;
  return query select committed.reading_id,committed.execution_attempt_id,committed.response_hash,committed.replayed;
end
$function$;

create function public.qry_approved_saju_stored_lineage_v1(uuid,uuid,uuid)
returns table(native_reading_id text,external_request_ref text,source_birth_input_hash text,
  saju_engine_version text,attempt_engine_version text,reading_contract_version text,
  product_response_state text,stored_snapshot jsonb,stored_response_hash text,target_birth_input_hash text)
language sql stable security definer set search_path=pg_catalog
as $function$
  select * from commerce_saju_private.approved_stored_lineage_v1($1,$2,$3)
$function$;

revoke all on function
  public.qry_approved_saju_issue_scope_v1(uuid,uuid,text),
  public.prepare_approved_component_reading_v1(uuid,uuid,text,uuid,uuid,text,text),
  public.admit_approved_saju_issue_attempt_v1(uuid,uuid,text,uuid,uuid,uuid,uuid,text),
  public.cmd_prepare_approved_saju_attempt_v1(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,text,text),
  public.cmd_finalize_approved_saju_reading_v1(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,jsonb,text),
  public.qry_approved_saju_stored_lineage_v1(uuid,uuid,uuid)
  from public,anon,authenticated,service_role,myeongha_api_executor;

grant execute on function
  public.begin_member_subject_context_v1(uuid),
  public.current_myeongha_subject_id(),
  public.assert_myeongha_subject_context_v1(uuid),
  public.qry_approved_saju_issue_scope_v1(uuid,uuid,text),
  public.prepare_approved_component_reading_v1(uuid,uuid,text,uuid,uuid,text,text),
  public.admit_approved_saju_issue_attempt_v1(uuid,uuid,text,uuid,uuid,uuid,uuid,text),
  public.cmd_prepare_approved_saju_attempt_v1(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,text,text),
  public.cmd_finalize_approved_saju_reading_v1(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,jsonb,text),
  public.qry_approved_saju_stored_lineage_v1(uuid,uuid,uuid)
  to myeongha_approved_saju_issuer_executor;
