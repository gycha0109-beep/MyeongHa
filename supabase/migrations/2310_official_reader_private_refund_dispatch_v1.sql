-- Owner-reviewed full Reader refund: a durable authorization and a single
-- outbound dispatch reservation. This migration does NOT call PortOne, create
-- an authorization or mount a public endpoint.
-- Only the privileged operations owner may INSERT an explicit adjudication.
create table public.commerce_reader_full_refund_dispatches_v1 (
  id uuid primary key,
  receipt_id uuid not null unique references public.commerce_receipts(id),
  legal_decision_ref text not null unique,
  legal_actor_ref text not null,
  -- Non-reversible provenance only. Raw customer claim remains P0-PR-01 DELETE.
  source_claim_fingerprint text unique,
  legal_approved_at timestamptz not null,
  reason text not null,
  -- Existing P0-PR-01 Commerce financial-evidence retention class P5Y.
  -- This table contains no raw claim/body/Subject or operator PII.
  retained_until timestamptz not null default (pg_catalog.clock_timestamp()+interval '5 years'),
  status text not null default 'approved',
  provider_cancellation_id text,
  provider_request_status text,
  reserved_at timestamptz,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint reader_refund_decision_ref_chk check
    (legal_decision_ref ~ '^sha256:v1:[a-f0-9]{64}$'),
  constraint reader_refund_actor_chk check
    (legal_actor_ref ~ '^operator:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  constraint reader_refund_claim_source_chk check
    (source_claim_fingerprint is null or
     source_claim_fingerprint ~ '^sha256:v1:[a-f0-9]{64}$'),
  constraint reader_refund_reason_chk check
    (reason in ('customer_withdrawal','non_delivery','contract_mismatch',
      'duplicate_charge','statutory_obligation','other_approved')),
  constraint reader_refund_approval_time_chk check
    (legal_approved_at <= created_at),
  constraint reader_refund_retention_chk check
    (retained_until >= legal_approved_at + interval '5 years'),
  constraint reader_refund_status_chk check
    (status in ('approved','dispatching','submitted','confirmed')),
  constraint reader_refund_cancellation_id_chk check
    (provider_cancellation_id is null or
     (length(provider_cancellation_id) between 1 and 512 and
      provider_cancellation_id=btrim(provider_cancellation_id))),
  constraint reader_refund_request_status_chk check
    (provider_request_status is null or
     provider_request_status in ('REQUESTED','SUCCEEDED')),
  constraint reader_refund_state_shape_chk check (
    (status='approved' and reserved_at is null and submitted_at is null
      and confirmed_at is null and provider_cancellation_id is null)
    or (status='dispatching' and reserved_at is not null
      and submitted_at is null and confirmed_at is null)
    or (status='submitted' and reserved_at is not null
      and submitted_at is not null and confirmed_at is null
      and provider_cancellation_id is not null)
    or (status='confirmed' and reserved_at is not null
      and confirmed_at is not null and provider_cancellation_id is not null)
  )
);

alter table public.commerce_reader_full_refund_dispatches_v1 enable row level security;

-- No grants on the table to API, worker, service_role or Commerce executor.
-- A privileged operations owner must record the actual legal disposition.
revoke all on public.commerce_reader_full_refund_dispatches_v1 from public;

create function public.internal_reserve_reader_full_refund_dispatch_v1(p_id uuid)
returns table(
  decision text, payment_id text, transaction_id text,
  original_amount_minor bigint, original_currency text,
  refund_reason text, known_cancellation_id text
)
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_refund_reserve$
declare
  v public.commerce_reader_full_refund_dispatches_v1%rowtype;
  r public.commerce_receipts%rowtype;
  v_attempt public.commerce_payment_attempts%rowtype;
  v_attempt_id uuid;
  v_attempt_count integer;
begin
  if p_id is null then
    raise exception 'Missing authorized refund identity' using errcode='23514';
  end if;
  select * into strict v from public.commerce_reader_full_refund_dispatches_v1
    where id=p_id for update;
  select * into strict r from public.commerce_receipts
    where id=v.receipt_id and provider='portone_v2'
      and environment='production'
      and verification_status in ('verified','revoked')
      and verified_amount_minor > 0 and verified_currency ~ '^[A-Z]{3}$';
  select count(*), min(a.id::text)::uuid into v_attempt_count, v_attempt_id
    from public.commerce_payment_attempts a
    where a.purchase_intent_id=r.purchase_intent_id
      and a.subject_id=r.subject_id and a.product_offer_id=r.product_offer_id
      and a.environment='production' and a.provider='portone_v2'
      and a.provider_transaction_id=r.external_transaction_id;
  if v_attempt_count <> 1 then
    raise exception 'Refund original payment attempt ambiguous' using errcode='23514';
  end if;
  select * into strict v_attempt from public.commerce_payment_attempts
    where id=v_attempt_id;
  if not exists(
    select 1 from public.purchase_intent_reader_selections prs
      where prs.purchase_intent_id=r.purchase_intent_id
  ) then
    raise exception 'Refund is not an exact Reader purchase' using errcode='23514';
  end if;
  if v.status='approved' then
    if r.verification_status <> 'verified'
      or not exists(
        select 1 from public.purchase_intents pi where pi.id=r.purchase_intent_id
          and pi.subject_id=r.subject_id and pi.status='verified'
      ) then
      raise exception 'Original Reader purchase not refundable' using errcode='23514';
    end if;
    update public.commerce_reader_full_refund_dispatches_v1
    set status='dispatching',reserved_at=pg_catalog.clock_timestamp()
    where id=p_id;
    decision:='dispatch';
  elsif v.status='confirmed' then
    decision:='completed';
  else
    decision:='reconcile_only';
  end if;
  payment_id:=v_attempt.provider_request_id;
  transaction_id:=r.external_transaction_id;
  original_amount_minor:=r.verified_amount_minor;
  original_currency:=r.verified_currency;
  refund_reason:=v.reason;
  known_cancellation_id:=v.provider_cancellation_id;
  return next;
end;
$reader_refund_reserve$;

create function public.internal_record_reader_full_refund_response_v1(
  p_id uuid,p_cancellation_id text,p_status text
) returns boolean
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_refund_record$
declare v public.commerce_reader_full_refund_dispatches_v1%rowtype;
begin
  select * into strict v from public.commerce_reader_full_refund_dispatches_v1
  where id=p_id for update;
  if p_cancellation_id is null or length(p_cancellation_id) not between 1 and 512
     or p_cancellation_id<>btrim(p_cancellation_id)
     or p_status not in ('REQUESTED','SUCCEEDED')
     or v.status not in ('dispatching','submitted','confirmed')
     or (v.provider_cancellation_id is not null
         and v.provider_cancellation_id is distinct from p_cancellation_id) then
    raise exception 'Refund response mismatch' using errcode='23514';
  end if;
  if v.status='dispatching' then
    update public.commerce_reader_full_refund_dispatches_v1
       set status='submitted',provider_cancellation_id=p_cancellation_id,
           provider_request_status=p_status,submitted_at=pg_catalog.clock_timestamp()
      where id=p_id;
  end if;
  return true;
end;
$reader_refund_record$;

create function public.internal_confirm_reader_full_refund_dispatch_v1(
  p_id uuid,p_cancellation_id text
) returns boolean
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_refund_confirm$
declare v public.commerce_reader_full_refund_dispatches_v1%rowtype;
begin
  select * into strict v from public.commerce_reader_full_refund_dispatches_v1
    where id=p_id for update;
  if v.status not in ('submitted','confirmed')
    or v.provider_cancellation_id is distinct from p_cancellation_id
    or not exists(
      select 1 from public.commerce_receipts cr
      join public.commerce_provider_events pe
        on pe.resolved_receipt_id=cr.id
       and pe.resolved_subject_id=cr.subject_id
       and pe.provider='portone_v2'
       and pe.event_type='Transaction.Cancelled'
       and pe.external_event_id=('myeongha:portone-v2:full-cancel:v1:'||p_cancellation_id)
       and pe.status in ('verified','processed')
      where cr.id=v.receipt_id and cr.verification_status='revoked'
      and cr.environment='production' and cr.provider='portone_v2'
    ) then
    raise exception 'Refund receipt still unconfirmed by verified cancellation' using errcode='23514';
  end if;
  update public.commerce_reader_full_refund_dispatches_v1
    set status='confirmed',confirmed_at=coalesce(confirmed_at,pg_catalog.clock_timestamp()),
        retained_until=greatest(retained_until,
          pg_catalog.clock_timestamp()+interval '5 years')
  where id=p_id;
  return true;
end;
$reader_refund_confirm$;

revoke all on function public.internal_reserve_reader_full_refund_dispatch_v1(uuid) from public;
revoke all on function public.internal_record_reader_full_refund_response_v1(uuid,text,text) from public;
revoke all on function public.internal_confirm_reader_full_refund_dispatch_v1(uuid,text) from public;
do $refund_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role','myeongha_api_executor',
       'myeongha_worker_runtime','myeongha_commerce_internal_executor')
  loop
    execute pg_catalog.format('revoke all on public.commerce_reader_full_refund_dispatches_v1 from %I',v_role);
    execute pg_catalog.format('revoke all on function public.internal_reserve_reader_full_refund_dispatch_v1(uuid) from %I',v_role);
    execute pg_catalog.format('revoke all on function public.internal_record_reader_full_refund_response_v1(uuid,text,text) from %I',v_role);
    execute pg_catalog.format('revoke all on function public.internal_confirm_reader_full_refund_dispatch_v1(uuid,text) from %I',v_role);
  end loop;
end;
$refund_acl$;
grant execute on function public.internal_reserve_reader_full_refund_dispatch_v1(uuid)
  to myeongha_commerce_internal_executor;
grant execute on function public.internal_record_reader_full_refund_response_v1(uuid,text,text)
  to myeongha_commerce_internal_executor;
grant execute on function public.internal_confirm_reader_full_refund_dispatch_v1(uuid,text)
  to myeongha_commerce_internal_executor;


-- P0-PR-01 P5Y: keep financial disposition evidence after ordinary account
-- deletion, without customer Subject/PII columns. No direct customer FK.
-- Legal owner decision fields cannot be modified after insertion. Completion
-- can only advance and confirmation extends the retention floor.
create function public.tr_guard_reader_full_refund_dispatch_v1()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public as $reader_refund_immutability$
begin
  if tg_op='DELETE' then
    if old.status <> 'confirmed'
       or old.retained_until > pg_catalog.clock_timestamp() then
      raise exception 'Reader refund legal evidence remains within P5Y'
        using errcode='23514';
    end if;
    return old;
  end if;
  if tg_op='INSERT' then
    if new.status <> 'approved'
       or new.reserved_at is not null
       or new.submitted_at is not null
       or new.confirmed_at is not null
       or new.provider_cancellation_id is not null
       or new.provider_request_status is not null then
      raise exception 'New Reader refund disposition must be an unsubmitted legal decision'
        using errcode='23514';
    end if;
    return new;
  end if;
  if row(new.id,new.receipt_id,new.legal_decision_ref,new.legal_actor_ref,
    new.source_claim_fingerprint,new.legal_approved_at,new.reason,new.created_at)
    is distinct from
    row(old.id,old.receipt_id,old.legal_decision_ref,old.legal_actor_ref,
      old.source_claim_fingerprint,old.legal_approved_at,old.reason,old.created_at)
      or new.retained_until < old.retained_until then
    raise exception 'Reader legal refund evidence is immutable'
      using errcode='23514';
  end if;
  if not (
      (old.status='approved' and new.status='dispatching')
      or (old.status='dispatching' and new.status='submitted')
      or (old.status='submitted' and new.status='confirmed')
      or (old.status='confirmed' and new.status='confirmed')
    ) then
    raise exception 'Reader refund dispatch state regression forbidden'
      using errcode='23514';
  end if;
  if old.provider_cancellation_id is not null and
    new.provider_cancellation_id is distinct from old.provider_cancellation_id
    then
      raise exception 'Reader refund cancellation identity cannot change'
        using errcode='23514';
  end if;
  if new.status='confirmed' then
    -- A single precise committed confirmation timestamp, not a second
    -- independent clock_timestamp() call, anchors the five-year minimum.
    new.retained_until:=greatest(new.retained_until,
      new.confirmed_at+interval '5 years');
  end if;
  return new;
end;
$reader_refund_immutability$;

create trigger tr_guard_reader_full_refund_dispatch_v1
before insert or update or delete on public.commerce_reader_full_refund_dispatches_v1
for each row execute function public.tr_guard_reader_full_refund_dispatch_v1();
revoke all on function public.tr_guard_reader_full_refund_dispatch_v1() from public;
create index commerce_reader_refund_retention_v1_idx
on public.commerce_reader_full_refund_dispatches_v1(retained_until,id)
where status='confirmed';

comment on table public.commerce_reader_full_refund_dispatches_v1 is
'P0-PR-01 Commerce P5Y minimal financial legal disposition, no customer body or raw claim. Owner-only initial approval; provider submission alone never grants refund completion.';


-- Privileged owner-only P5Y retention cleanup. Unresolved dispatches are
-- never purged just because five years have elapsed. All other Commerce P5Y
-- tables remain governed by their existing independent retention jobs.
create function public.internal_purge_completed_reader_refund_dispositions_v1(
  p_limit integer
) returns integer
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $reader_refund_retention$
declare v_count integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Reader refund retention cleanup limit invalid'
      using errcode='23514';
  end if;
  with candidates as (
    select d.id from public.commerce_reader_full_refund_dispatches_v1 d
    where d.status='confirmed'
      and d.retained_until<=pg_catalog.clock_timestamp()
    order by d.retained_until,d.id
    limit p_limit
    for update skip locked
  ), deleted as (
    delete from public.commerce_reader_full_refund_dispatches_v1 d
    using candidates c where d.id=c.id
    returning d.id
  )
  select pg_catalog.count(*)::integer into v_count from deleted;
  return v_count;
end;
$reader_refund_retention$;
revoke all on function public.internal_purge_completed_reader_refund_dispositions_v1(integer)
  from public;
-- No EXECUTE granted to Commerce, API, workers, service_role or Web clients.
