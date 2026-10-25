-- Legal/Commerce: draft durable single-unit checkout and actual-delivery evidence.
-- PROPOSAL ONLY; NOT a Production migration or checkout activation.
-- Requires Privacy retention/disposition and Commerce/S7 producer approval.
-- This contains NO buyer text, DOB, payment key, raw receipt or Reading body.
begin;

create table public.legal_digital_reading_checkout_evidence_v1 (
  purchase_intent_id uuid not null references public.purchase_intents(id),
  unit_id text not null check (unit_id ~ '^standard-reading:[a-z0-9_-]{1,96}$'),
  product_spec_version text not null check (length(btrim(product_spec_version))>0),
  notice_revision text not null check (length(btrim(notice_revision))>0),
  preview_or_information_revision text not null
    check (length(btrim(preview_or_information_revision))>0),
  safeguard_method text not null
    check (safeguard_method in ('sample','trial','time_limited','sufficient_information')),
  displayed_at timestamptz not null,
  safeguard_provided_at timestamptz not null,
  acknowledged_at timestamptz null,
  primary key(purchase_intent_id,unit_id),
  constraint legal_reading_checkout_order_v1
    check (safeguard_provided_at>=displayed_at
       and (acknowledged_at is null or acknowledged_at>=safeguard_provided_at))
);

create table public.legal_digital_reading_delivery_evidence_v1 (
  purchase_intent_id uuid not null references public.purchase_intents(id),
  unit_id text not null check (unit_id ~ '^standard-reading:[a-z0-9_-]{1,96}$'),
  delivery_event_digest text not null unique
    check (delivery_event_digest ~ '^[a-f0-9]{64}$'),
  delivered_at timestamptz not null,
  primary key(purchase_intent_id,unit_id)
);

alter table public.legal_digital_reading_checkout_evidence_v1 enable row level security;
alter table public.legal_digital_reading_delivery_evidence_v1 enable row level security;
revoke all on public.legal_digital_reading_checkout_evidence_v1
  from public,anon,authenticated,service_role,myeongha_api_executor,
       myeongha_commerce_internal_executor;
revoke all on public.legal_digital_reading_delivery_evidence_v1
  from public,anon,authenticated,service_role,myeongha_api_executor,
       myeongha_commerce_internal_executor;

-- Called ONLY by reviewed internal checkout/S7 response producers, after the
-- sample/info was successfully served. DB timestamps are never client times.
create function public.cmd_record_digital_reading_checkout_display_v1(
  p_subject_id uuid,p_purchase_intent_id uuid,p_unit_id text,
  p_notice_revision text,p_preview_revision text,p_safeguard_method text
) returns boolean language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $display$
declare v_now timestamptz := clock_timestamp(); v_spec text;
begin
  if p_subject_id is null or p_purchase_intent_id is null
     or p_unit_id is null or p_unit_id !~ '^standard-reading:[a-z0-9_-]{1,96}$'
     or p_notice_revision is null or btrim(p_notice_revision)=''
     or p_preview_revision is null or btrim(p_preview_revision)=''
     or p_safeguard_method not in
        ('sample','trial','time_limited','sufficient_information') then
    return false;
  end if;
  select spec.spec_version into v_spec
  from public.purchase_intents pi
  join public.purchase_intent_reader_selections selection
    on selection.purchase_intent_id=pi.id
  join public.standard_reading_product_specs spec
    on spec.product_id=selection.product_id
  where pi.id=p_purchase_intent_id and pi.subject_id=p_subject_id
    and pi.status in ('created','pending')
    and p_unit_id='standard-reading:'||selection.reader_character_id;
  if v_spec is null then return false; end if;
  insert into public.legal_digital_reading_checkout_evidence_v1(
    purchase_intent_id,unit_id,product_spec_version,notice_revision,
    preview_or_information_revision,safeguard_method,
    displayed_at,safeguard_provided_at
  ) values (
    p_purchase_intent_id,p_unit_id,v_spec,p_notice_revision,
    p_preview_revision,p_safeguard_method,v_now,v_now
  ) on conflict(purchase_intent_id,unit_id) do nothing;
  return found;
end $display$;

-- A separately recorded consumer confirmation; must precede payment authority.
create function public.cmd_record_digital_reading_checkout_ack_v1(
  p_subject_id uuid,p_purchase_intent_id uuid,p_unit_id text,p_notice_revision text
) returns boolean language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $ack$
begin
  update public.legal_digital_reading_checkout_evidence_v1 n
  set acknowledged_at=clock_timestamp()
  from public.purchase_intents pi
  where n.purchase_intent_id=p_purchase_intent_id
    and n.unit_id=p_unit_id and n.notice_revision=p_notice_revision
    and n.acknowledged_at is null
    and pi.id=n.purchase_intent_id and pi.subject_id=p_subject_id
    and pi.status in ('created','pending')
    and not exists (
      select 1 from public.commerce_receipts r
       where r.purchase_intent_id=pi.id and r.subject_id=p_subject_id
         and r.verification_status='verified'
    );
  return found;
end $ack$;

-- IMPORTANT: call only AFTER an actual successful delivery response tied to the
-- exact purchased unit, never from T2 COMMIT, an internal render or browser read_at.
-- The proof digest must be generated by the trusted S7 delivery producer.
create function public.cmd_record_digital_reading_delivery_v1(
  p_subject_id uuid,p_purchase_intent_id uuid,p_unit_id text,
  p_delivery_event_digest text
) returns boolean language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $deliver$
declare v_now timestamptz := clock_timestamp();
begin
  if p_delivery_event_digest is null or
     p_delivery_event_digest !~ '^[a-f0-9]{64}$' then return false; end if;
  if not exists(
    select 1 from public.purchase_intents pi
    join public.purchase_intent_reader_selections selection
      on selection.purchase_intent_id=pi.id
    join public.commerce_receipts receipt
      on receipt.purchase_intent_id=pi.id and receipt.subject_id=pi.subject_id
    where pi.id=p_purchase_intent_id and pi.subject_id=p_subject_id
      and p_unit_id='standard-reading:'||selection.reader_character_id
      and pi.status='verified' and receipt.verification_status='verified'
      and receipt.environment='production' and receipt.verified_at is not null
      and receipt.verified_at<=v_now
  ) then return false; end if;
  insert into public.legal_digital_reading_delivery_evidence_v1(
    purchase_intent_id,unit_id,delivery_event_digest,delivered_at
  ) values(p_purchase_intent_id,p_unit_id,p_delivery_event_digest,v_now)
  on conflict(purchase_intent_id,unit_id) do nothing;
  return found;
end $deliver$;

-- Reading authority for ONE canonical owner and ONE immutable purchased unit.
-- A trusted receipt proves money. Only the independently captured notice and
-- successful actual-delivery event can produce a restriction REVIEW candidate.
create function public.qry_owned_digital_reading_withdrawal_snapshot_v1(
  p_subject_id uuid,p_purchase_intent_id uuid,p_unit_id text
) returns table(purchase_json jsonb,notice_json jsonb,delivery_json jsonb)
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $query$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  return query
  select
    case when receipt.id is not null then jsonb_build_object(
      'purchaseIntentId',pi.id::text,'unitId',p_unit_id,
      'productSpecVersion',spec.spec_version,'status','verified',
      'purchasedAt',to_char(receipt.verified_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) else null::jsonb end,
    case when notice.purchase_intent_id is not null then jsonb_build_object(
      'purchaseIntentId',pi.id::text,'unitId',p_unit_id,
      'productSpecVersion',notice.product_spec_version,
      'authority','server_checkout_snapshot','noticeRevision',notice.notice_revision,
      'previewOrInformationRevision',notice.preview_or_information_revision,
      'safeguardMethod',notice.safeguard_method,
      'safeguardProvidedAt',to_char(notice.safeguard_provided_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'acknowledged',notice.acknowledged_at is not null,
      'displayedAt',to_char(notice.displayed_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'acknowledgedAt',case when notice.acknowledged_at is not null then
        to_char(notice.acknowledged_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') else null end)
    else null::jsonb end,
    case when delivery.purchase_intent_id is not null then jsonb_build_object(
      'purchaseIntentId',pi.id::text,'unitId',p_unit_id,
      'productSpecVersion',spec.spec_version,
      'authority','server_delivery_record','state','DELIVERED_PROVABLE',
      'deliveredAt',to_char(delivery.delivered_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    else null::jsonb end
  from public.purchase_intents pi
  join public.purchase_intent_reader_selections selection
    on selection.purchase_intent_id=pi.id
  join public.standard_reading_product_specs spec
    on spec.product_id=selection.product_id
  left join lateral (
    select r.id,r.verified_at from public.commerce_receipts r
    where r.purchase_intent_id=pi.id and r.subject_id=pi.subject_id
      and r.verification_status='verified' and r.environment='production'
      and r.verified_at is not null
    order by r.verified_at,r.id limit 1
  ) receipt on true
  left join public.legal_digital_reading_checkout_evidence_v1 notice
    on notice.purchase_intent_id=pi.id and notice.unit_id=p_unit_id
  left join public.legal_digital_reading_delivery_evidence_v1 delivery
    on delivery.purchase_intent_id=pi.id and delivery.unit_id=p_unit_id
  where pi.id=p_purchase_intent_id and pi.subject_id=p_subject_id
    and p_unit_id='standard-reading:'||selection.reader_character_id;
end $query$;

revoke all on function public.cmd_record_digital_reading_checkout_display_v1(
  uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function public.cmd_record_digital_reading_checkout_ack_v1(
  uuid,uuid,text,text) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function public.cmd_record_digital_reading_delivery_v1(
  uuid,uuid,text,text) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function public.qry_owned_digital_reading_withdrawal_snapshot_v1(
  uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.cmd_record_digital_reading_checkout_display_v1(
  uuid,uuid,text,text,text,text) to myeongha_commerce_internal_executor;
grant execute on function public.cmd_record_digital_reading_checkout_ack_v1(
  uuid,uuid,text,text) to myeongha_commerce_internal_executor;
grant execute on function public.cmd_record_digital_reading_delivery_v1(
  uuid,uuid,text,text) to myeongha_commerce_internal_executor;
grant execute on function public.qry_owned_digital_reading_withdrawal_snapshot_v1(
  uuid,uuid,text) to myeongha_api_executor;
commit;
