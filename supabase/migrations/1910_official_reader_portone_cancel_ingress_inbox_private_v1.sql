-- D3e3 PRIVATE signed PortOne cancellation intake: durable BEFORE provider GET.
-- Separate from the 1860 verified shadow and nine statutory Commerce history tables.
-- Candidate only: no operational HTTP mount, worker, runtime roles or retention executor.
-- Stores a minimal signed envelope and K1 keyed fingerprint; NO raw webhook/headers
-- bearer secret, card data, consumer Subject, Reading or consultation content.
-- Access/30d post-transfer purge policy: see 2026-10-14 inbox privacy decision.
-- QUEUED-only state; do not acknowledge incoming HTTP until owning transaction commits.

create table if not exists public.official_reader_portone_cancel_ingress_inbox_v1 (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'portone_v2'
    check (provider='portone_v2'),
  environment text not null
    check (environment in ('sandbox','production')),
  webhook_id text not null,
  payment_id text not null,
  transaction_id text not null,
  store_id text not null,
  cancellation_id text not null,
  event_type text not null check (event_type in (
    'Transaction.CancelPending','Transaction.PartialCancelled','Transaction.Cancelled'
  )),
  event_occurred_at timestamptz not null,
  ingress_fingerprint text not null
    check (ingress_fingerprint ~ '^hmac-sha256:k1:[a-f0-9]{64}$'),
  inbox_state text not null default 'queued'
    check (inbox_state = 'queued'),
  received_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint official_reader_portone_cancel_inbox_webhook_unique
    unique (provider,environment,webhook_id),
  constraint official_reader_portone_cancel_inbox_webhook_shape
    check (length(webhook_id) between 1 and 512),
  constraint official_reader_portone_cancel_inbox_payment_shape
    check (length(payment_id) between 1 and 512),
  constraint official_reader_portone_cancel_inbox_transaction_shape
    check (length(transaction_id) between 1 and 512),
  constraint official_reader_portone_cancel_inbox_store_shape
    check (length(store_id) between 1 and 512),
  constraint official_reader_portone_cancel_inbox_cancellation_shape
    check (length(cancellation_id) between 1 and 512)
);
create index if not exists official_reader_portone_cancel_inbox_queue_idx
  on public.official_reader_portone_cancel_ingress_inbox_v1(
    inbox_state,received_at,id
  );
alter table public.official_reader_portone_cancel_ingress_inbox_v1
  enable row level security;
revoke all on table public.official_reader_portone_cancel_ingress_inbox_v1 from public;
do $d3e3_inbox_acl$
declare role_name text;
begin
  for role_name in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on table public.official_reader_portone_cancel_ingress_inbox_v1 from %I',
      role_name);
  end loop;
end
$d3e3_inbox_acl$;

create or replace function public.internal_enqueue_official_reader_portone_cancel_inbox_v1(
  p_environment text,
  p_webhook_id text,
  p_payment_id text,
  p_transaction_id text,
  p_store_id text,
  p_cancellation_id text,
  p_event_type text,
  p_event_occurred_at timestamptz,
  p_ingress_fingerprint text
)
returns table(
  inbox_id uuid,
  intake_result text,
  effect_authorized boolean
)
language plpgsql volatile security invoker
set search_path = pg_catalog, public
as $d3e3_enqueue$
declare
  v_seen public.official_reader_portone_cancel_ingress_inbox_v1%rowtype;
  v_created uuid;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='d3e3_inbox_requires_read_committed',
      message='Cancellation private inbox requires READ COMMITTED';
  end if;
  if p_environment not in ('sandbox','production')
     or p_environment is null or p_webhook_id is null
     or p_payment_id is null or p_transaction_id is null
     or p_store_id is null or p_cancellation_id is null
     or p_event_type is null or p_event_occurred_at is null
     or p_ingress_fingerprint is null
     or pg_catalog.length(p_webhook_id) not between 1 and 512
     or pg_catalog.length(p_payment_id) not between 1 and 512
     or pg_catalog.length(p_transaction_id) not between 1 and 512
     or pg_catalog.length(p_store_id) not between 1 and 512
     or pg_catalog.length(p_cancellation_id) not between 1 and 512
     or p_webhook_id<>pg_catalog.btrim(p_webhook_id)
     or p_payment_id<>pg_catalog.btrim(p_payment_id)
     or p_transaction_id<>pg_catalog.btrim(p_transaction_id)
     or p_store_id<>pg_catalog.btrim(p_store_id)
     or p_cancellation_id<>pg_catalog.btrim(p_cancellation_id)
     or p_webhook_id ~ '[[:cntrl:].]'
     or p_payment_id ~ '[[:cntrl:]]'
     or p_transaction_id ~ '[[:cntrl:]]'
     or p_store_id ~ '[[:cntrl:]]'
     or p_cancellation_id ~ '[[:cntrl:]]'
     or p_event_type not in (
       'Transaction.CancelPending','Transaction.PartialCancelled','Transaction.Cancelled'
     )
     or p_ingress_fingerprint !~ '^hmac-sha256:k1:[a-f0-9]{64}$'
  then
    raise exception using errcode='23514',
      constraint='d3e3_inbox_invalid_signed_envelope',
      message='Cancellation private inbox requires a bounded signed envelope';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'myeongha:d3e3:'||p_environment||':'||p_webhook_id,0
  ));
  select * into v_seen
    from public.official_reader_portone_cancel_ingress_inbox_v1 s
    where s.provider='portone_v2'
      and s.environment=p_environment and s.webhook_id=p_webhook_id;

  if found then
    if v_seen.payment_id is distinct from p_payment_id
       or v_seen.transaction_id is distinct from p_transaction_id
       or v_seen.store_id is distinct from p_store_id
       or v_seen.cancellation_id is distinct from p_cancellation_id
       or v_seen.event_type is distinct from p_event_type
       or v_seen.event_occurred_at is distinct from p_event_occurred_at
       or v_seen.ingress_fingerprint is distinct from p_ingress_fingerprint
    then
      raise exception using errcode='23505',
        constraint='d3e3_inbox_webhook_identity_conflict',
        message='Signed webhook identity is already bound to different facts';
    end if;
    return query select v_seen.id,'replayed'::text,false;
    return;
  end if;

  insert into public.official_reader_portone_cancel_ingress_inbox_v1(
    environment,webhook_id,payment_id,transaction_id,store_id,cancellation_id,
    event_type,event_occurred_at,ingress_fingerprint
  ) values (
    p_environment,p_webhook_id,p_payment_id,p_transaction_id,p_store_id,p_cancellation_id,
    p_event_type,p_event_occurred_at,p_ingress_fingerprint
  ) returning id into v_created;
  return query select v_created,'queued'::text,false;
end
$d3e3_enqueue$;

revoke all on function public.internal_enqueue_official_reader_portone_cancel_inbox_v1(
  text,text,text,text,text,text,text,timestamptz,text
) from public;
do $d3e3_function_acl$
declare role_name text;
begin
  for role_name in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_enqueue_official_reader_portone_cancel_inbox_v1(text,text,text,text,text,text,text,timestamptz,text) from %I',
      role_name);
  end loop;
end
$d3e3_function_acl$;

comment on table public.official_reader_portone_cancel_ingress_inbox_v1
  is 'Private signed PortOne cancel ingress, queued-only before independent GET; indirect personal identifiers, privacy classification and deletion not yet live.';
comment on function public.internal_enqueue_official_reader_portone_cancel_inbox_v1(
  text,text,text,text,text,text,text,timestamptz,text
) is 'Private signature-preverified caller only; idempotent immutable enqueue, no refund, no rights change and no operational GRANT.';
