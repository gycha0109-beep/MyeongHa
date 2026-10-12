-- CAP-B2/S4 first Reading receipt issuance, verified cancellation
-- ingress, and original Commerce authority are strictly PRIVATE.
-- Watchtower-Track: applizing
-- Lock order: server-derived INITIAL Reading -> Product policy -> existing
-- Receipt/Grant row locks. NO external caller is granted EXECUTE.

create or replace function public.internal_apply_initial_official_reader_receipt_locked_v1(
  p_receipt_id uuid,
  p_capability_item_keys text[],
  p_effective_ats timestamptz[],
  p_target_valid_froms timestamptz[],
  p_target_valid_untils timestamptz[],
  p_reason_codes text[]
)
returns table (
  result_item_key text,
  result_grant_id uuid,
  result_entitlement_event_id uuid,
  result_projection_id uuid,
  result_grant_revision bigint,
  result_projection_revision bigint,
  result_projection_changed boolean,
  result_outbox_event_id uuid,
  result_replayed boolean
)
language plpgsql volatile security invoker
set search_path = pg_catalog, public
as $s4_initial_issuer$
declare
  v_subject uuid;
  v_intent uuid;
  v_initial record;
  v_after record;
begin
  if p_receipt_id is null then
    raise exception using errcode='23514',
      constraint='standard_s4_initial_receipt_required',
      message='One verified initial Standard Reader receipt is required';
  end if;
  select cr.subject_id,cr.purchase_intent_id
    into v_subject,v_intent
  from public.commerce_receipts cr
  where cr.id=p_receipt_id
    and cr.verification_status='verified'
    and cr.environment='production';
  if v_subject is null or v_intent is null then
    raise exception using errcode='P0001',
      constraint='standard_s4_initial_receipt_lineage_unavailable',
      message='Verified initial Reader purchase Receipt is unavailable';
  end if;
  select * into strict v_initial
  from public.internal_acquire_official_reader_initial_purchase_lock_v1(
    v_subject,v_intent
  );
  perform public.internal_acquire_standard_reader_product_policy_lock_v1(
    v_initial.product_id
  );
  -- Never use a pre-wait snapshot as authorization.
  select * into strict v_after
  from public.internal_qry_official_reader_initial_scope_candidate_v1(
    v_subject,v_intent
  );
  if v_after.scope_identity is distinct from v_initial.scope_identity
     or v_after.product_id is distinct from v_initial.product_id then
    raise exception using errcode='40001',
      constraint='standard_s4_initial_receipt_scope_drift',
      message='Verified initial Reader receipt scope changed before issuance';
  end if;
  return query
  select * from public.internal_apply_verified_receipt_capability_effects_v1(
    p_receipt_id,p_capability_item_keys,p_effective_ats,
    p_target_valid_froms,p_target_valid_untils,p_reason_codes
  );
  select * into strict v_after
  from public.internal_qry_official_reader_initial_scope_candidate_v1(
    v_subject,v_intent
  );
  if v_after.scope_identity is distinct from v_initial.scope_identity
     or v_after.product_id is distinct from v_initial.product_id then
    raise exception using errcode='40001',
      constraint='standard_s4_initial_receipt_scope_drift',
      message='Verified initial Reader receipt scope changed after issuance';
  end if;
end
$s4_initial_issuer$;

revoke all on function public.internal_apply_initial_official_reader_receipt_locked_v1(
  uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]
) from public;

do $s4_issuer_acl$
declare r text;
begin
 for r in select rolname from pg_catalog.pg_roles where rolname in
 ('anon','authenticated','service_role','myeongha_api_executor',
  'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
 loop
  execute pg_catalog.format(
   'revoke all on function public.internal_apply_initial_official_reader_receipt_locked_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]) from %I',r
  );
 end loop;
end
$s4_issuer_acl$;

comment on function public.internal_apply_initial_official_reader_receipt_locked_v1(
  uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]
) is 'PRIVATE, staged, actual first Reader verified receipt issuer; S3 initial scope/Product lock before original Commerce writer. No runtime or payment callback connected.';
