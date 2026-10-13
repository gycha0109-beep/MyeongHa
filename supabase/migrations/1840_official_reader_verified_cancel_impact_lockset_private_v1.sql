-- D3b PRIVATE: verified cancellation IMPACT DISCOVERY and GLOBAL L0 -> L1 lockset.
-- Watchtower-Track: db-authority-core
-- NO entitlement effect and NO live PortOne callback.
--
-- Input pairs are trusted server event/grant IDs ONLY. Everything that
-- authorizes the lock target is resolved from DB verified Provider/Receipt/
-- Purchase Intent/Offer/Grant and official Reading ownership.
-- Lock acquisition is NEVER permission to refund or read paid content.

create or replace function public.internal_qry_official_reader_verified_cancel_impact_v1(
  p_subject_id uuid,
  p_provider_event_ids uuid[],
  p_grant_ids uuid[]
)
returns table (
  affected_products uuid[],
  affected_readings uuid[],
  affected_readers text[],
  affected_grants uuid[],
  unbound_grants integer,
  authority_snapshot jsonb
)
language plpgsql volatile security invoker
set search_path = pg_catalog, public
as $d3b_resolve$
declare
  v_supplied integer;
  v_found integer;
  v_product_ids uuid[];
  v_reading_ids uuid[];
  v_reader_ids text[];
  v_grant_ids uuid[];
  v_unbound integer;
  v_access_total integer;
  v_access_valid integer;
  v_snapshot jsonb;
  v_all_receipt_grants integer;
begin
  if p_subject_id is null or p_provider_event_ids is null or p_grant_ids is null
    or pg_catalog.array_ndims(p_provider_event_ids) is distinct from 1
    or pg_catalog.array_ndims(p_grant_ids) is distinct from 1
    or pg_catalog.cardinality(p_provider_event_ids) not between 1 and 64
    or pg_catalog.cardinality(p_provider_event_ids) <> pg_catalog.cardinality(p_grant_ids)
    or exists (
      select 1 from rows from (
        pg_catalog.unnest(p_provider_event_ids), pg_catalog.unnest(p_grant_ids)
      ) as supplied(event_id,grant_id)
      where supplied.event_id is null or supplied.grant_id is null
    )
    or (select count(distinct id) from pg_catalog.unnest(p_grant_ids) as x(id))
       <> pg_catalog.cardinality(p_grant_ids) then
    raise exception using errcode='23514',
      constraint='reader_d3b_impact_pair_shape',
      message='Exact one-to-one verified event/Grant pairs required (1-64, no duplicate Grant)';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='reader_d3b_read_committed_required',
      message='Verified Reader cancellation impact requires READ COMMITTED';
  end if;

  v_supplied:=pg_catalog.cardinality(p_grant_ids);
  -- Resolve every proposed pair using INNER JOIN authority, not caller scope.
  with input as (
    select event_id,grant_id from rows from (
      pg_catalog.unnest(p_provider_event_ids),pg_catalog.unnest(p_grant_ids)
    ) as inp(event_id,grant_id)
  ), qualified as (
    select inp.event_id,inp.grant_id,pe.status as event_status,
      pe.provider_ordering_key,pe.resolved_receipt_id,
      cr.purchase_intent_id,pi.product_offer_id,po.product_id,
      g.status as grant_status,g.revision,g.last_provider_ordering_key
    from input inp
    join public.commerce_provider_events pe on pe.id=inp.event_id
      and pe.event_type='payment.cancelled'
      and pe.status in ('verified','processed')
      and pe.environment='production'
      and pe.resolution_source_type='receipt'
      and pe.resolved_subject_id=p_subject_id
    join public.commerce_receipts cr on cr.id=pe.resolved_receipt_id
      and cr.subject_id=p_subject_id and cr.provider=pe.provider
      and cr.environment='production'
      and cr.verification_status in ('verified','revoked')
      and (pe.external_transaction_id is null
        or pe.external_transaction_id=cr.external_transaction_id)
    join public.entitlement_grants g on g.id=inp.grant_id
      and g.source_receipt_id=cr.id
      and g.subject_id=p_subject_id
      and g.grant_source_type='purchase'
    join public.purchase_intents pi on pi.id=cr.purchase_intent_id
      and pi.subject_id=cr.subject_id
      and pi.product_offer_id=cr.product_offer_id
      and pi.status='verified'
    join public.product_offers po on po.id=pi.product_offer_id
      and po.product_id is not null
    join public.standard_reading_product_specs spec on spec.product_id=po.product_id
    join public.standard_reading_offer_roles roles on roles.product_offer_id=po.id
      and roles.purchase_role in ('initial_reading','additional_reader_interpretation')
  )
  select count(*)::integer,
    pg_catalog.array_agg(distinct q.product_id order by q.product_id),
    pg_catalog.array_agg(q.grant_id order by q.grant_id),
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'event',q.event_id,'receipt',q.resolved_receipt_id,
        'intent',q.purchase_intent_id,'offer',q.product_offer_id,
        'product',q.product_id,'grant',q.grant_id,
        'providerStatus',q.event_status,'providerOrder',q.provider_ordering_key,
        'grantStatus',q.grant_status,'revision',q.revision,
        'grantOrder',q.last_provider_ordering_key,
        'scope',coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_array(a.official_reading_id,
              a.reader_character_id,a.reader_content_bundle_id,
              a.purchase_intent_id,o.product_id)
            order by a.official_reading_id,a.reader_character_id,a.purchase_intent_id
          )
          from public.standard_reading_reader_access_grants a
          left join public.standard_reading_official_bindings o
            on o.reading_id=a.official_reading_id and o.subject_id=p_subject_id
          where a.entitlement_grant_id=q.grant_id and a.subject_id=p_subject_id
        ),'[]'::jsonb)
      ) order by q.grant_id,q.event_id
    )
  into v_found,v_product_ids,v_grant_ids,v_snapshot
  from qualified q;

  if v_found <> v_supplied or v_product_ids is null
     or pg_catalog.cardinality(v_product_ids) not between 1 and 64 then
    raise exception using errcode='P0001',
      constraint='reader_d3b_verified_impact_unavailable',
      message='Every Provider cancellation must resolve one authoritative Official Product and purchase Grant';
  end if;

  -- No partial event impact set: each affected receipt must enumerate ALL
  -- purchase-backed Grants. Additional receipts that are NOT impacted are
  -- never inferred from the same Subject/Product.
  select count(*)::integer into v_all_receipt_grants
  from public.entitlement_grants g
  where g.grant_source_type='purchase'
    and g.subject_id=p_subject_id
    and g.source_receipt_id in (
      select distinct pe.resolved_receipt_id
      from pg_catalog.unnest(p_provider_event_ids) as inp(id)
      join public.commerce_provider_events pe on pe.id=inp.id
    );
  if v_all_receipt_grants <> v_supplied then
    raise exception using errcode='P0001',
      constraint='reader_d3b_receipt_grant_set_incomplete',
      message='Verified cancellation impact cannot omit or duplicate any receipt-backed Grant';
  end if;

  with input as (
    select grant_id from pg_catalog.unnest(p_grant_ids) as g(grant_id)
  ), refs as (
    select inp.grant_id,a.official_reading_id,a.reader_character_id,
      a.purchase_intent_id,a.reader_content_bundle_id,
      o.reading_id as valid_reading,o.product_id as bound_product,
      q.product_id as receipt_product,q.purchase_intent_id as receipt_intent
    from input inp
    join public.entitlement_grants g on g.id=inp.grant_id
    join public.commerce_receipts cr on cr.id=g.source_receipt_id
    join public.purchase_intents pi on pi.id=cr.purchase_intent_id
    join public.product_offers po on po.id=pi.product_offer_id
    cross join lateral (select po.product_id,pi.id as purchase_intent_id) q
    join public.standard_reading_reader_access_grants a
      on a.entitlement_grant_id=inp.grant_id and a.subject_id=p_subject_id
    left join public.standard_reading_official_bindings o
      on o.reading_id=a.official_reading_id and o.subject_id=p_subject_id
  )
  select count(*)::integer,
    count(*) filter (where valid_reading is not null
      and receipt_product=bound_product
      and receipt_intent=purchase_intent_id
      and reader_character_id is not null
      and pg_catalog.btrim(reader_character_id)<>''
      and reader_content_bundle_id is not null)::integer,
    pg_catalog.array_agg(official_reading_id
      order by official_reading_id,reader_character_id,grant_id),
    pg_catalog.array_agg(reader_character_id
      order by official_reading_id,reader_character_id,grant_id)
  into v_access_total,v_access_valid,v_reading_ids,v_reader_ids
  from refs;

  if v_access_total > 64 or v_access_total <> v_access_valid then
    raise exception using errcode='P0001',
      constraint='reader_d3b_cross_product_or_malformed_access',
      message='Reader access rows must belong to their exact purchase/Official Product';
  end if;

  select count(*)::integer into v_unbound
  from pg_catalog.unnest(p_grant_ids) as inp(grant_id)
  where not exists (
    select 1 from public.standard_reading_reader_access_grants a
    where a.entitlement_grant_id=inp.grant_id and a.subject_id=p_subject_id
  );

  return query select v_product_ids,v_reading_ids,v_reader_ids,
                      v_grant_ids,v_unbound,v_snapshot;
end
$d3b_resolve$;

create or replace function public.internal_acquire_official_reader_verified_cancel_impact_lockset_v1(
  p_subject_id uuid,
  p_provider_event_ids uuid[],
  p_grant_ids uuid[]
)
returns table (
  affected_products uuid[],
  affected_readings uuid[],
  affected_readers text[],
  affected_grants uuid[],
  unbound_grants integer
)
language plpgsql volatile security invoker
set search_path = pg_catalog, public
as $d3b_lock$
declare
  v_pre record;
  v_post_l0 record;
  v_post_l1 record;
begin
  select * into strict v_pre
  from public.internal_qry_official_reader_verified_cancel_impact_v1(
    p_subject_id,p_provider_event_ids,p_grant_ids);

  perform public.internal_acquire_official_reader_product_lockset_v1(
    p_subject_id,v_pre.affected_products);

  select * into strict v_post_l0
  from public.internal_qry_official_reader_verified_cancel_impact_v1(
    p_subject_id,p_provider_event_ids,p_grant_ids);
  if v_post_l0.authority_snapshot is distinct from v_pre.authority_snapshot
     or v_post_l0.affected_products is distinct from v_pre.affected_products
     or v_post_l0.affected_readings is distinct from v_pre.affected_readings
     or v_post_l0.affected_readers is distinct from v_pre.affected_readers then
    raise exception using errcode='40001',
      constraint='reader_d3b_impact_drift_after_l0',
      message='Verified Provider impact changed while waiting for Products';
  end if;

  if v_pre.affected_readings is not null then
    -- D1 reader helper reacquires only L0 Products already held from complete
    -- VERIFIED impact scope, then globally sorts L1.
    perform 1 from public.internal_acquire_official_reader_reading_lockset_v1(
      p_subject_id,v_pre.affected_readings,v_pre.affected_readers);
  end if;

  select * into strict v_post_l1
  from public.internal_qry_official_reader_verified_cancel_impact_v1(
    p_subject_id,p_provider_event_ids,p_grant_ids);
  if v_post_l1.authority_snapshot is distinct from v_pre.authority_snapshot
     or v_post_l1.affected_products is distinct from v_pre.affected_products
     or v_post_l1.affected_readings is distinct from v_pre.affected_readings
     or v_post_l1.affected_readers is distinct from v_pre.affected_readers
     or v_post_l1.unbound_grants is distinct from v_pre.unbound_grants then
    raise exception using errcode='40001',
      constraint='reader_d3b_impact_drift_after_l1',
      message='Verified Provider impact changed while waiting for Reader scopes';
  end if;

  return query select v_post_l1.affected_products,v_post_l1.affected_readings,
                      v_post_l1.affected_readers,v_post_l1.affected_grants,
                      v_post_l1.unbound_grants;
end
$d3b_lock$;

revoke all on function public.internal_qry_official_reader_verified_cancel_impact_v1(
 uuid,uuid[],uuid[]
) from public;
revoke all on function public.internal_acquire_official_reader_verified_cancel_impact_lockset_v1(
 uuid,uuid[],uuid[]
) from public;
do $d3b_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_qry_official_reader_verified_cancel_impact_v1(uuid,uuid[],uuid[]) from %I',v_role);
    execute pg_catalog.format(
      'revoke all on function public.internal_acquire_official_reader_verified_cancel_impact_lockset_v1(uuid,uuid[],uuid[]) from %I',v_role);
  end loop;
end
$d3b_acl$;

comment on function public.internal_qry_official_reader_verified_cancel_impact_v1(
  uuid,uuid[],uuid[]
) is 'D3b PRIVATE DB-owned verified event/Receipt/Grant impact inventory; no effect/authorization. Input pair must cover all receipt-backed Grants.';
comment on function public.internal_acquire_official_reader_verified_cancel_impact_lockset_v1(
  uuid,uuid[],uuid[]
) is 'D3b PRIVATE complete Product L0 then Reading/Reader L1 impact locks. This function neither revokes nor restores Grants.';
