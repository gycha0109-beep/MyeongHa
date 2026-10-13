-- D3 PRIVATE: verified cancellation L0-first for bound and unbound official purchase Grants.
-- Watchtower-Track: db-authority-core
-- Applies only in a disposable/staged DB. No live PortOne adapter or runtime GRANT.
--
-- Execution rule: READ COMMITTED, a trusted verified event/receipt/Grant, DB-derived
-- single Product, all L0 before any L1, original 1080 after all scope locks.
-- Unsupported provider events, restore, multi-Grant cancellation and non-official
-- products are fail-closed rather than being silently reduced to one effect.

create or replace function public.internal_apply_official_reader_verified_cancel_scope_v2(
  p_provider_event_id uuid,
  p_grant_id uuid,
  p_expected_revision bigint,
  p_expected_last_provider_ordering_key text,
  p_effective_at timestamptz,
  p_target_valid_from timestamptz,
  p_target_valid_until timestamptz,
  p_reason_code text
)
returns table (
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
as $d3_effect$
declare
  v_subject uuid;
  v_receipt uuid;
  v_intent uuid;
  v_product uuid;
  v_role text;
  v_lineage_count bigint;
  v_lineage_before jsonb;
  v_lineage_after jsonb;
  v_scope_before jsonb;
  v_scope_after jsonb;
  v_scope_count integer;
  v_scope_matched integer;
  v_scope_product_count integer;
  v_readings uuid[];
  v_readers text[];
  v_locked integer;
begin
  if p_provider_event_id is null or p_grant_id is null
     or p_expected_revision is null
     or p_effective_at is null or p_target_valid_from is null then
    raise exception using errcode='23514',
      constraint='reader_d3_verified_cancel_input_required',
      message='Exact verified cancellation, Grant and CAS effect required';
  end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='reader_d3_read_committed_required',
      message='Official Reader cancellation requires READ COMMITTED';
  end if;

  -- PRELOCK READ ONLY: no row lock before Product L0. The original 1080 remains
  -- the only source of Provider ordering/CAS/ledger/outbox authorization.
  select count(*), (array_agg(g.subject_id))[1], (array_agg(cr.id))[1],
         (array_agg(pi.id))[1], (array_agg(po.product_id))[1],
         (array_agg(roles.purchase_role))[1]
    into v_lineage_count,v_subject,v_receipt,v_intent,v_product,v_role
  from public.commerce_provider_events pe
  join public.commerce_receipts cr on cr.id=pe.resolved_receipt_id
    and cr.subject_id=pe.resolved_subject_id
    and cr.provider=pe.provider
    and cr.environment='production'
    and cr.verification_status in ('verified','revoked')
  join public.entitlement_grants g on g.id=p_grant_id
    and g.subject_id=cr.subject_id
    and g.source_receipt_id=cr.id
    and g.grant_source_type='purchase'
  join public.purchase_intents pi on pi.id=cr.purchase_intent_id
    and pi.subject_id=cr.subject_id
    and pi.product_offer_id=cr.product_offer_id
    and pi.status='verified'
  join public.product_offers po on po.id=pi.product_offer_id
  join public.standard_reading_product_specs spec on spec.product_id=po.product_id
  join public.standard_reading_offer_roles roles on roles.product_offer_id=po.id
    and roles.purchase_role in ('initial_reading','additional_reader_interpretation')
  where pe.id=p_provider_event_id
    and pe.environment='production'
    and pe.event_type='payment.cancelled'
    and pe.status in ('verified','processed')
    and pe.resolution_source_type='receipt'
    and (pe.external_transaction_id is null
         or pe.external_transaction_id=cr.external_transaction_id);

  if v_lineage_count <> 1 or v_subject is null or v_product is null
     or v_receipt is null or v_intent is null then
    raise exception using errcode='P0001',
      constraint='reader_d3_verified_cancel_lineage_unavailable',
      message='One verified official purchase cancellation lineage required';
  end if;
  perform public.assert_myeongha_subject_context_v1(v_subject);

  -- Read-only scope inventory, including independent grants that have NOT yet
  -- been bound to a Reading. Such a grant still has its unique L0 from Intent.
  select count(*)::integer, count(o.reading_id)::integer,
         count(distinct o.product_id)::integer,
         coalesce(pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_array(a.purchase_intent_id::text,
             a.official_reading_id::text,a.reader_character_id,
             a.reader_content_bundle_id::text,o.product_id::text)
           order by a.official_reading_id,a.reader_character_id,a.purchase_intent_id
         ),'[]'::jsonb),
         pg_catalog.array_agg(a.official_reading_id
           order by a.official_reading_id,a.reader_character_id),
         pg_catalog.array_agg(a.reader_character_id
           order by a.official_reading_id,a.reader_character_id)
  into v_scope_count,v_scope_matched,v_scope_product_count,v_scope_before,
       v_readings,v_readers
  from public.standard_reading_reader_access_grants a
  left join public.standard_reading_official_bindings o
    on o.reading_id=a.official_reading_id and o.subject_id=v_subject
  where a.entitlement_grant_id=p_grant_id and a.subject_id=v_subject;

  if v_scope_count > 64 or v_scope_matched <> v_scope_count
     or (v_scope_count > 0 and (
       v_scope_product_count <> 1 or exists (
         select 1 from public.standard_reading_reader_access_grants a
         join public.standard_reading_official_bindings o
           on o.reading_id=a.official_reading_id and o.subject_id=v_subject
         where a.entitlement_grant_id=p_grant_id
           and a.subject_id=v_subject and o.product_id <> v_product
       )
     )) then
    raise exception using errcode='P0001',
      constraint='reader_d3_scope_products_ambiguous',
      message='Official Reader cancellation has a malformed or cross-Product scope';
  end if;

  -- One authoritative Grant -> one immutable original Purchase Product.
  -- All affected bound Reading targets must have that SAME Product; therefore
  -- taking it first is also the sorted complete L0 set. If not, reject,
  -- never introduce another L0 after starting L1.
  v_locked:=public.internal_acquire_official_reader_product_lockset_v1(
    v_subject,array[v_product]::uuid[]);
  if v_locked <> 1 then
    raise exception using errcode='40001',
      constraint='reader_d3_product_lock_failed',
      message='Exact Official Reader Product lock was not acquired';
  end if;

  if v_scope_count > 0 then
    -- D1 checks DB-owned Reading -> Product identity, obtains no *new*
    -- Product after the proven single L0, then acquires ordered L1 locks.
    perform 1 from public.internal_acquire_official_reader_reading_lockset_v1(
      v_subject,v_readings,v_readers);
  end if;

  select count(*)::integer,count(o.reading_id)::integer,
         coalesce(pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_array(a.purchase_intent_id::text,
             a.official_reading_id::text,a.reader_character_id,
             a.reader_content_bundle_id::text,o.product_id::text)
           order by a.official_reading_id,a.reader_character_id,a.purchase_intent_id
         ),'[]'::jsonb)
    into v_scope_count,v_scope_matched,v_scope_after
  from public.standard_reading_reader_access_grants a
  left join public.standard_reading_official_bindings o
    on o.reading_id=a.official_reading_id and o.subject_id=v_subject
  where a.entitlement_grant_id=p_grant_id and a.subject_id=v_subject;
  if v_scope_after is distinct from v_scope_before
     or v_scope_matched <> v_scope_count then
    raise exception using errcode='40001',
      constraint='reader_d3_scope_drift',
      message='Official Reader grant bindings changed during cancellation locks';
  end if;

  -- Re-evaluate immutable lineage after all waits, not Grant mutable fields.
  select pg_catalog.jsonb_build_array(
    pe.id::text,pe.resolved_subject_id::text,pe.resolved_receipt_id::text,
    g.id::text,g.source_receipt_id::text,pi.id::text,po.product_id::text)
  into v_lineage_before
  from public.commerce_provider_events pe
  join public.commerce_receipts cr on cr.id=pe.resolved_receipt_id
    and cr.subject_id=pe.resolved_subject_id
  join public.entitlement_grants g on g.id=p_grant_id
    and g.subject_id=cr.subject_id and g.source_receipt_id=cr.id
    and g.grant_source_type='purchase'
  join public.purchase_intents pi on pi.id=cr.purchase_intent_id
    and pi.subject_id=cr.subject_id and pi.product_offer_id=cr.product_offer_id
    and pi.status='verified'
  join public.product_offers po on po.id=pi.product_offer_id
  where pe.id=p_provider_event_id and pe.environment='production'
    and pe.event_type='payment.cancelled' and pe.status in ('verified','processed')
    and cr.environment='production'
    and cr.verification_status in ('verified','revoked');
  if v_lineage_before is null
     or v_lineage_before->>1 is distinct from v_subject::text
     or v_lineage_before->>2 is distinct from v_receipt::text
     or v_lineage_before->>5 is distinct from v_intent::text
     or v_lineage_before->>6 is distinct from v_product::text then
    raise exception using errcode='40001',
      constraint='reader_d3_lineage_drift',
      message='Original Purchase or Provider scope changed after L0/L1 wait';
  end if;

  -- This is the ONLY mutating operation, using the pre-existing Commerce 1080
  -- CAS, provider ordering and immutable event/ledger/outbox transitions.
  return query
  select * from public.internal_apply_entitlement_effect_v1(
    'provider_event',p_provider_event_id,p_grant_id,null,
    p_expected_revision,p_expected_last_provider_ordering_key,
    'revoked',p_effective_at,'revoked',
    p_target_valid_from,p_target_valid_until,p_reason_code
  );

  -- Fail with statement-level rollback if a nonparticipating writer introduced
  -- a phantom during mutation. Does NOT close all bypasses until cutover.
  select pg_catalog.jsonb_build_array(
    pe.id::text,pe.resolved_subject_id::text,pe.resolved_receipt_id::text,
    g.id::text,g.source_receipt_id::text,pi.id::text,po.product_id::text)
  into v_lineage_after
  from public.commerce_provider_events pe
  join public.commerce_receipts cr on cr.id=pe.resolved_receipt_id
    and cr.subject_id=pe.resolved_subject_id
  join public.entitlement_grants g on g.id=p_grant_id
    and g.subject_id=cr.subject_id and g.source_receipt_id=cr.id
    and g.grant_source_type='purchase'
  join public.purchase_intents pi on pi.id=cr.purchase_intent_id
    and pi.subject_id=cr.subject_id and pi.product_offer_id=cr.product_offer_id
    and pi.status='verified'
  join public.product_offers po on po.id=pi.product_offer_id
  where pe.id=p_provider_event_id and pe.environment='production'
    and pe.event_type='payment.cancelled' and pe.status in ('verified','processed')
    and cr.environment='production'
    and cr.verification_status in ('verified','revoked');
  select coalesce(pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_array(a.purchase_intent_id::text,
             a.official_reading_id::text,a.reader_character_id,
             a.reader_content_bundle_id::text,o.product_id::text)
           order by a.official_reading_id,a.reader_character_id,a.purchase_intent_id
         ),'[]'::jsonb)
  into v_scope_after
  from public.standard_reading_reader_access_grants a
  left join public.standard_reading_official_bindings o
    on o.reading_id=a.official_reading_id and o.subject_id=v_subject
  where a.entitlement_grant_id=p_grant_id and a.subject_id=v_subject;

  if v_lineage_after is distinct from v_lineage_before
     or v_scope_after is distinct from v_scope_before then
    raise exception using errcode='40001',
      constraint='reader_d3_post_effect_scope_drift',
      message='Provider cancellation scope changed while applying Commerce effect';
  end if;
end
$d3_effect$;

-- Only DB-owner review can call this dormant bridge. The provider event itself
-- MUST already be authenticated and independently verified by trusted backend.
create or replace function public.internal_execute_official_reader_verified_cancel_v2(
  p_provider_event_id uuid,
  p_grant_id uuid,
  p_expected_revision bigint,
  p_expected_last_provider_ordering_key text,
  p_effective_at timestamptz,
  p_target_valid_from timestamptz,
  p_target_valid_until timestamptz,
  p_reason_code text
)
returns table (
  result_grant_id uuid,
  result_entitlement_event_id uuid,
  result_projection_id uuid,
  result_grant_revision bigint,
  result_projection_revision bigint,
  result_projection_changed boolean,
  result_outbox_event_id uuid,
  result_replayed boolean
)
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $d3_bridge$
declare
  v_subject uuid;
  v_prior text:=pg_catalog.current_setting('myeongha.subject_id',true);
begin
  if p_provider_event_id is null or p_grant_id is null
     or pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='reader_d3_bridge_input_or_isolation',
      message='Verified cancellation and READ COMMITTED required';
  end if;
  select pe.resolved_subject_id into v_subject
  from public.commerce_provider_events pe
  join public.commerce_receipts cr
    on cr.id=pe.resolved_receipt_id
    and cr.subject_id=pe.resolved_subject_id and cr.provider=pe.provider
    and cr.environment='production' and cr.verification_status in ('verified','revoked')
  join public.entitlement_grants g on g.id=p_grant_id
    and g.subject_id=cr.subject_id and g.source_receipt_id=cr.id
    and g.grant_source_type='purchase'
  where pe.id=p_provider_event_id
    and pe.status in ('verified','processed')
    and pe.event_type='payment.cancelled'
    and pe.resolution_source_type='receipt'
    and pe.environment='production'
    and (pe.external_transaction_id is null
         or pe.external_transaction_id=cr.external_transaction_id);
  if v_subject is null then
    raise exception using errcode='P0001',
      constraint='reader_d3_bridge_verified_lineage_required',
      message='Verified Provider cancellation Receipt and Grant lineage unavailable';
  end if;
  if v_prior is not null and pg_catalog.btrim(v_prior)<>''
     and v_prior is distinct from v_subject::text then
    raise exception using errcode='42501',
      constraint='reader_d3_bridge_subject_mismatch',
      message='Provider callback may not override canonical Subject context';
  end if;
  perform pg_catalog.set_config('myeongha.subject_id',v_subject::text,true);
  begin
    return query
    select * from public.internal_apply_official_reader_verified_cancel_scope_v2(
      p_provider_event_id,p_grant_id,p_expected_revision,
      p_expected_last_provider_ordering_key,p_effective_at,
      p_target_valid_from,p_target_valid_until,p_reason_code
    );
  exception when others then
    perform pg_catalog.set_config('myeongha.subject_id',coalesce(v_prior,''),true);
    raise;
  end;
  perform pg_catalog.set_config('myeongha.subject_id',coalesce(v_prior,''),true);
end
$d3_bridge$;

revoke all on function public.internal_apply_official_reader_verified_cancel_scope_v2(
 uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text
) from public;
revoke all on function public.internal_execute_official_reader_verified_cancel_v2(
 uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text
) from public;
do $d3_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_apply_official_reader_verified_cancel_scope_v2(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text) from %I',v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.internal_execute_official_reader_verified_cancel_v2(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text) from %I',v_role
    );
  end loop;
end
$d3_acl$;

comment on function public.internal_apply_official_reader_verified_cancel_scope_v2(
 uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text
) is 'D3 PRIVATE verified payment.cancelled single Grant; initial unbound L0, bound L0 then all L1; original 1080 CAS. No restore, multi-Grant or public actor.';
comment on function public.internal_execute_official_reader_verified_cancel_v2(
 uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text
) is 'D3 DORMANT verified cancellation bridge, DB-derived Subject, temporary context restore, no runtime EXECUTE or callback registration.';
