-- D3e2 PRIVATE SHADOW: persist observed PortOne cancellation event identity and
-- relative ordering. NOT proof of a refund, not an entitlement authority.
-- No production webhook caller, no runtime GRANT and no price/PII payload.
-- This migration merely records separately source-verified candidate fields.
-- Source worker does NOT exist; role grants deliberately denied.

create table if not exists public.official_reader_portone_cancel_observation_shadow_v1 (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'portone_v2'
    check (provider='portone_v2'),
  webhook_id text not null,
  payment_id text not null,
  transaction_id text not null,
  cancellation_id text not null,
  event_type text not null check (event_type in (
    'Transaction.CancelPending','Transaction.PartialCancelled','Transaction.Cancelled'
  )),
  source_disposition text not null check (source_disposition in (
    'pending','partial','full_candidate','superseded'
  )),
  event_occurred_at timestamptz not null,
  provider_status_changed_at timestamptz not null,
  paid_amount_minor bigint not null check (paid_amount_minor>0),
  cancelled_amount_minor bigint not null
    check (cancelled_amount_minor>=0 and cancelled_amount_minor<=paid_amount_minor),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  source_evidence_fingerprint text not null,
  shadow_classification text not null check (shadow_classification in (
    'observed','out_of_order','ordering_unproven'
  )),
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint official_reader_portone_cancel_observation_shadow_webhook_unique
    unique (provider,webhook_id)
);
create index if not exists official_reader_portone_cancel_shadow_transaction_idx
  on public.official_reader_portone_cancel_observation_shadow_v1(
    provider,payment_id,transaction_id,provider_status_changed_at desc,event_occurred_at desc
  );
alter table public.official_reader_portone_cancel_observation_shadow_v1
  enable row level security;
revoke all on table public.official_reader_portone_cancel_observation_shadow_v1 from public;
do $d3e2_table_acl$
declare role_name text;
begin
  for role_name in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on table public.official_reader_portone_cancel_observation_shadow_v1 from %I',
      role_name);
  end loop;
end
$d3e2_table_acl$;

create or replace function public.internal_record_official_reader_portone_cancel_shadow_v1(
  p_webhook_id text,
  p_payment_id text,
  p_transaction_id text,
  p_cancellation_id text,
  p_event_type text,
  p_source_disposition text,
  p_event_occurred_at timestamptz,
  p_provider_status_changed_at timestamptz,
  p_paid_amount_minor bigint,
  p_cancelled_amount_minor bigint,
  p_currency text,
  p_evidence_fingerprint text
)
returns table(
  shadow_observation_id uuid,
  shadow_result text,
  effect_authorized boolean
)
language plpgsql volatile security invoker
set search_path = pg_catalog, public
as $d3e2_shadow$
declare
  v_seen public.official_reader_portone_cancel_observation_shadow_v1%rowtype;
  v_latest public.official_reader_portone_cancel_observation_shadow_v1%rowtype;
  v_classification text := 'observed';
  v_created uuid;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='d3e2_shadow_requires_read_committed',
      message='PortOne cancellation shadow requires READ COMMITTED';
  end if;
  if p_webhook_id is null or p_payment_id is null or p_transaction_id is null
     or p_cancellation_id is null
     or pg_catalog.length(p_webhook_id) not between 1 and 512
     or pg_catalog.length(p_payment_id) not between 1 and 512
     or pg_catalog.length(p_transaction_id) not between 1 and 512
     or pg_catalog.length(p_cancellation_id) not between 1 and 512
     or p_webhook_id <> pg_catalog.btrim(p_webhook_id)
     or p_payment_id <> pg_catalog.btrim(p_payment_id)
     or p_transaction_id <> pg_catalog.btrim(p_transaction_id)
     or p_cancellation_id <> pg_catalog.btrim(p_cancellation_id)
     or p_webhook_id ~ '[[:cntrl:]]' or p_payment_id ~ '[[:cntrl:]]'
     or p_transaction_id ~ '[[:cntrl:]]' or p_cancellation_id ~ '[[:cntrl:]]'
     or p_event_type not in ('Transaction.CancelPending',
       'Transaction.PartialCancelled','Transaction.Cancelled')
     or p_source_disposition not in ('pending','partial','full_candidate','superseded')
     or p_event_occurred_at is null or p_provider_status_changed_at is null
     or p_paid_amount_minor is null or p_cancelled_amount_minor is null
     or p_paid_amount_minor<=0 or p_cancelled_amount_minor<0
     or p_cancelled_amount_minor>p_paid_amount_minor
     or p_currency is null or p_currency !~ '^[A-Z]{3}$'
     or p_evidence_fingerprint is null
     or p_evidence_fingerprint !~ '^sha256:v1:[0-9a-f]{64}$'
     or (p_source_disposition='full_candidate' and
       (p_event_type<>'Transaction.Cancelled'
         or p_cancelled_amount_minor<>p_paid_amount_minor))
     or (p_source_disposition='partial' and
       p_event_type<>'Transaction.PartialCancelled')
     or (p_source_disposition='pending' and
       p_event_type<>'Transaction.CancelPending')
  then
    raise exception using errcode='23514',
      constraint='d3e2_shadow_invalid_source_shape',
      message='PortOne cancellation shadow requires complete source IDs, safe amounts and typed event';
  end if;

  -- One durable transaction stream at a time, without granting L0/L1 or CAS.
  -- Any hash collision only serializes unrelated records more conservatively.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'myeongha:d3e2:portone_v2:'||p_payment_id||':'||p_transaction_id,0
  ));

  select * into v_seen from public.official_reader_portone_cancel_observation_shadow_v1 s
  where s.provider='portone_v2' and s.webhook_id=p_webhook_id;

  if found then
    if v_seen.payment_id is distinct from p_payment_id
       or v_seen.transaction_id is distinct from p_transaction_id
       or v_seen.cancellation_id is distinct from p_cancellation_id
       or v_seen.event_type is distinct from p_event_type
       or v_seen.source_disposition is distinct from p_source_disposition
       or v_seen.event_occurred_at is distinct from p_event_occurred_at
       or v_seen.provider_status_changed_at is distinct from p_provider_status_changed_at
       or v_seen.paid_amount_minor is distinct from p_paid_amount_minor
       or v_seen.cancelled_amount_minor is distinct from p_cancelled_amount_minor
       or v_seen.currency is distinct from p_currency
       or v_seen.source_evidence_fingerprint is distinct from p_evidence_fingerprint
    then
      raise exception using errcode='23505',
        constraint='d3e2_shadow_webhook_identity_conflict',
        message='Provider webhook identity cannot be rebound to different cancellation facts';
    end if;
    return query select v_seen.id,'replayed'::text,false;
    return;
  end if;

  select * into v_latest
  from public.official_reader_portone_cancel_observation_shadow_v1 s
  where s.provider='portone_v2' and s.payment_id=p_payment_id
    and s.transaction_id=p_transaction_id
  order by s.provider_status_changed_at desc,s.event_occurred_at desc,s.id desc
  limit 1;

  if found then
    if p_provider_status_changed_at < v_latest.provider_status_changed_at
       or p_event_occurred_at < v_latest.event_occurred_at then
      v_classification:='out_of_order';
    elsif p_provider_status_changed_at=v_latest.provider_status_changed_at
      and p_event_occurred_at=v_latest.event_occurred_at then
      v_classification:='ordering_unproven';
    end if;
  end if;

  insert into public.official_reader_portone_cancel_observation_shadow_v1(
    provider,webhook_id,payment_id,transaction_id,cancellation_id,
    event_type,source_disposition,event_occurred_at,
    provider_status_changed_at,paid_amount_minor,cancelled_amount_minor,
    currency,source_evidence_fingerprint,shadow_classification
  ) values (
    'portone_v2',p_webhook_id,p_payment_id,p_transaction_id,p_cancellation_id,
    p_event_type,p_source_disposition,p_event_occurred_at,
    p_provider_status_changed_at,p_paid_amount_minor,p_cancelled_amount_minor,
    p_currency,p_evidence_fingerprint,v_classification
  ) returning id into v_created;

  return query select v_created,v_classification,false;
end
$d3e2_shadow$;

revoke all on function public.internal_record_official_reader_portone_cancel_shadow_v1(
  text,text,text,text,text,text,timestamptz,timestamptz,bigint,bigint,text,text
) from public;
do $d3e2_function_acl$
declare role_name text;
begin
  for role_name in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_record_official_reader_portone_cancel_shadow_v1(text,text,text,text,text,text,timestamptz,timestamptz,bigint,bigint,text,text) from %I',
      role_name);
  end loop;
end
$d3e2_function_acl$;

comment on table public.official_reader_portone_cancel_observation_shadow_v1
  is 'D3e2 private Provider cancel observation stream; no consumer/payment payload, no entitlement or refund effect. Non-authoritative without verified worker.';
comment on function public.internal_record_official_reader_portone_cancel_shadow_v1(
  text,text,text,text,text,text,timestamptz,timestamptz,bigint,bigint,text,text
) is 'D3e2 private immutable webhook replay/conflict and out-of-order observation, always effect_authorized=false. No provider ingress role.';
