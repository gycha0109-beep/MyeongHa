-- Candidate only: not a Production migration. Apply solely on a disposable DB
-- until Commerce Product/credit authority, Privacy deletion/restore and deployment
-- adoption are explicitly reconciled. Payment / Reading bonus minting is NOT
-- authorized. The existing Se-yeon AI provider cost ledger is independent.
-- Watchtower-Track: commerce-payment

create table public.chat_credit_lots_v1 (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  subject_id uuid not null references public.subjects(id),
  source_kind text not null check (source_kind in ('signup','portone_topup','reading_reward')),
  source_ref uuid not null,
  credits_issued integer not null check (credits_issued > 0),
  credits_remaining integer not null check (credits_remaining >= 0),
  issued_at timestamptz not null,
  expires_at timestamptz null,
  constraint chat_credit_lots_remaining_bound_v1 check (credits_remaining <= credits_issued),
  constraint chat_credit_lots_validity_v1 check (
    (source_kind = 'signup' and expires_at is not null and expires_at > issued_at)
    or (source_kind = 'portone_topup' and (expires_at is null or expires_at > issued_at))
    or (source_kind = 'reading_reward' and expires_at >= issued_at + interval '90 days')
  ),
  constraint chat_credit_lots_unique_source_v1 unique(subject_id,source_kind,source_ref),
  constraint chat_credit_lots_global_source_v1 unique(source_kind,source_ref)
);
create unique index chat_credit_first_reading_reward_once_v1
  on public.chat_credit_lots_v1(subject_id) where source_kind = 'reading_reward';

create index chat_credit_lots_spendable_v1
  on public.chat_credit_lots_v1(subject_id,expires_at,issued_at,id)
  where credits_remaining > 0;

create table public.chat_credit_turn_reservations_v1 (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  subject_id uuid not null,
  thread_id uuid not null,
  client_turn_id uuid not null,
  required_credits integer not null default 10 check (required_credits = 10),
  state text not null check (state in ('reserved','settled','released')),
  delivered_turn_id uuid null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  finalized_at timestamptz null,
  constraint chat_credit_turn_reservations_id_owner_v1 unique(id,subject_id),
  constraint chat_credit_turn_reservations_turn_v1 unique(subject_id,thread_id,client_turn_id),
  constraint chat_credit_turn_reservations_thread_v1
    foreign key (thread_id,subject_id) references public.conversation_threads(id,subject_id),
  constraint chat_credit_turn_reservations_state_time_v1 check
    ((state = 'reserved' and finalized_at is null and delivered_turn_id is null)
      or (state = 'settled' and finalized_at is not null and delivered_turn_id is not null)
      or (state = 'released' and finalized_at is not null and delivered_turn_id is null))
);
create table public.chat_credit_turn_allocations_v1 (
  reservation_id uuid not null references public.chat_credit_turn_reservations_v1(id),
  lot_id uuid not null references public.chat_credit_lots_v1(id),
  credits integer not null check (credits > 0),
  primary key (reservation_id,lot_id)
);

-- No anon, authenticated, service_role or API executor table/SQL access.
revoke all on table public.chat_credit_lots_v1 from public;
revoke all on table public.chat_credit_turn_reservations_v1 from public;
revoke all on table public.chat_credit_turn_allocations_v1 from public;
alter table public.chat_credit_lots_v1 enable row level security;
alter table public.chat_credit_lots_v1 force row level security;
alter table public.chat_credit_turn_reservations_v1 enable row level security;
alter table public.chat_credit_turn_reservations_v1 force row level security;
alter table public.chat_credit_turn_allocations_v1 enable row level security;
alter table public.chat_credit_turn_allocations_v1 force row level security;

-- Lock the canonical Subject to serialize multi-tab / multi-thread usage.
-- No AI calls or payment provider callbacks run inside this transaction.
create function public.internal_qry_chat_credit_balance_v1(p_subject_id uuid)
returns table(available_credits bigint,total_credits bigint)
language plpgsql stable security definer
set search_path=pg_catalog,public
as $$
begin
  if not exists (select 1 from public.subjects
      where id=p_subject_id and status='active') then
    raise exception 'Credit owner is not an active Subject';
  end if;
  return query
  select coalesce(sum(credits_remaining) filter (where (expires_at is null or expires_at>clock_timestamp())),0)::bigint,
         coalesce(sum(credits_remaining),0)::bigint
    from public.chat_credit_lots_v1 where subject_id=p_subject_id;
end $$;

-- Exactly-once signup source. No paid/reward source accepted through this RPC.
create function public.internal_cmd_chat_signup_credit_v1(p_subject_id uuid)
returns uuid
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $$
declare v_id uuid;
begin
  perform 1 from public.subjects where id=p_subject_id
    and kind='member' and status='active' for update;
  if not found then raise exception 'Only active Member signup is eligible'; end if;
  insert into public.chat_credit_lots_v1
    (subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at)
  values (p_subject_id,'signup',p_subject_id,50,50,clock_timestamp(),
          clock_timestamp()+interval '30 days')
  on conflict on constraint chat_credit_lots_unique_source_v1 do nothing;
  select id into strict v_id from public.chat_credit_lots_v1
  where subject_id=p_subject_id and source_kind='signup' and source_ref=p_subject_id;
  return v_id;
end $$;

create function public.internal_cmd_chat_credit_reserve_v1(
 p_subject_id uuid,p_thread_id uuid,p_client_turn_id uuid
)
returns table(outcome text,reservation_id uuid,committed_turn_id uuid,available_credits bigint,total_credits bigint)
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $$
declare
 v_row public.chat_credit_turn_reservations_v1%rowtype;
 v_lot record;
 v_remaining integer:=10;
 v_take integer;
 v_available bigint;
 v_total bigint;
 v_id uuid;
begin
  perform 1 from public.subjects where id=p_subject_id and status='active' for update;
  if not found then raise exception 'Credit owner is not an active Subject'; end if;
  perform 1 from public.conversation_threads
  where id=p_thread_id and subject_id=p_subject_id
    and status='active' and deleted_at is null;
  if not found then raise exception 'Chat credit Thread is not currently owned and active'; end if;

  select * into v_row from public.chat_credit_turn_reservations_v1
  where subject_id=p_subject_id and thread_id=p_thread_id
    and client_turn_id=p_client_turn_id;
  if found then
    select b.available_credits,b.total_credits into v_available,v_total
    from public.internal_qry_chat_credit_balance_v1(p_subject_id) b;
    outcome:=case when v_row.state='reserved' then 'already_reserved'
                  when v_row.state='settled' then 'committed_replay'
                  else 'conflict' end;
    reservation_id:=v_row.id;committed_turn_id:=v_row.delivered_turn_id;
    available_credits:=v_available;total_credits:=v_total;
    return next; return;
  end if;

  select b.available_credits,b.total_credits into v_available,v_total
    from public.internal_qry_chat_credit_balance_v1(p_subject_id) b;
  if v_available<10 then
    outcome:='insufficient'; reservation_id:=null;committed_turn_id:=null;
    available_credits:=v_available; total_credits:=v_total;
    return next;return;
  end if;

  insert into public.chat_credit_turn_reservations_v1(
    subject_id,thread_id,client_turn_id,state
  ) values(p_subject_id,p_thread_id,p_client_turn_id,'reserved')
  returning id into v_id;

  for v_lot in select l.id,l.credits_remaining
    from public.chat_credit_lots_v1 l
    where l.subject_id=p_subject_id and l.credits_remaining>0
      and (l.expires_at is null or l.expires_at>clock_timestamp())
    order by l.expires_at nulls last,l.issued_at,l.id for update
  loop
    v_take:=least(v_remaining,v_lot.credits_remaining);
    update public.chat_credit_lots_v1 set credits_remaining=credits_remaining-v_take
      where id=v_lot.id;
    insert into public.chat_credit_turn_allocations_v1(reservation_id,lot_id,credits)
      values(v_id,v_lot.id,v_take);
    v_remaining:=v_remaining-v_take;
    exit when v_remaining=0;
  end loop;
  if v_remaining<>0 then raise exception 'Credit balance changed during reservation'; end if;
  outcome:='reserved';reservation_id:=v_id;committed_turn_id:=null;
  available_credits:=v_available-10;total_credits:=v_total-10;
  return next;
end $$;

-- Settle ONLY after authoritative delivery; release on definitive non-delivery.
-- No caller is granted EXECUTE until the delivered-turn owner is integrated.
create function public.internal_cmd_chat_credit_finalize_v1(
 p_subject_id uuid,p_reservation_id uuid,p_delivered boolean,
 p_committed_turn_id uuid default null
)
returns text
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $$
declare
 v_row public.chat_credit_turn_reservations_v1%rowtype;
 v_alloc record;
 v_state text;
begin
  perform 1 from public.subjects where id=p_subject_id for update;
  if not found then raise exception 'Unknown credit owner';end if;
  select * into v_row from public.chat_credit_turn_reservations_v1
   where id=p_reservation_id and subject_id=p_subject_id for update;
  if not found then raise exception 'Unknown Subject-scoped credit reservation';end if;
  v_state:=case when p_delivered then 'settled' else 'released' end;
  if (p_delivered and p_committed_turn_id is null)
     or (not p_delivered and p_committed_turn_id is not null) then
    raise exception 'Delivery requires exact committed Turn ID; release must not provide one';
  end if;
  if v_row.state<> 'reserved' then
    if v_row.state=v_state and
       (not p_delivered or v_row.delivered_turn_id=p_committed_turn_id) then
      return v_state;
    end if;
    raise exception 'Credit reservation finalization conflict';
  end if;
  if not p_delivered then
    for v_alloc in select lot_id,credits from public.chat_credit_turn_allocations_v1
      where reservation_id=p_reservation_id
    loop
      update public.chat_credit_lots_v1
        set credits_remaining=credits_remaining+v_alloc.credits
        where id=v_alloc.lot_id;
    end loop;
  end if;
  update public.chat_credit_turn_reservations_v1
    set state=v_state,delivered_turn_id=p_committed_turn_id,
        finalized_at=clock_timestamp()
    where id=p_reservation_id;
  return v_state;
end $$;

-- Candidate-only SQL privilege boundary; NO runtime or public grants.
revoke all on function public.internal_qry_chat_credit_balance_v1(uuid) from public;
revoke all on function public.internal_cmd_chat_signup_credit_v1(uuid) from public;
revoke all on function public.internal_cmd_chat_credit_reserve_v1(uuid,uuid,uuid) from public;
revoke all on function public.internal_cmd_chat_credit_finalize_v1(uuid,uuid,boolean,uuid) from public;


-- Candidate-only verified PortOne receipt -> exactly-one paid Credit Lot.
-- No EXECUTE grant, no checkout mount, no LIVE activation. An explicit
-- Product-governance-approved validity policy is required; no default term.
-- Unresolved refund/revocation rules must be handled before Production use.
create function public.internal_cmd_chat_credit_verified_topup_v1(
  p_subject_id uuid,
  p_receipt_id uuid,
  p_approved_offer_id uuid,
  p_validity_mode text,
  p_validity_days integer
)
returns table(lot_id uuid,issued boolean,available_credits bigint,total_credits bigint)
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_expiry timestamptz;
  v_existing public.chat_credit_lots_v1%rowtype;
  v_lot_id uuid;
  v_issued boolean := false;
begin
  if p_subject_id is null or p_receipt_id is null or p_approved_offer_id is null then
    raise exception 'Verified top-up requires exact server-approved Subject, Receipt and Offer';
  end if;
  if not (
    (p_validity_mode = 'never' and p_validity_days is null)
    or (p_validity_mode = 'days' and p_validity_days is not null and p_validity_days > 0)
  ) then
    raise exception 'Paid credit validity is not explicitly approved';
  end if;

  -- Same lock as reserve/signup: payout cannot race two concurrent spends.
  perform 1 from public.subjects
  where id=p_subject_id and status='active'
  for update;
  if not found then raise exception 'Verified top-up owner is not active'; end if;

  -- Independently recheck source authority INSIDE the mint transaction.
  -- The external provider lookup/persistence happens before this function.
  -- Locks block concurrent Receipt revoke or Offer retirement during issuance.
  perform 1 from public.commerce_receipts cr
  join public.purchase_intents pi
    on pi.id=cr.purchase_intent_id
   and pi.subject_id=cr.subject_id
   and pi.product_offer_id=cr.product_offer_id
  join public.product_offers po on po.id=cr.product_offer_id
  join public.products p on p.id=po.product_id
  join public.product_capability_sets pcs
    on pcs.id=pi.capability_set_id and pcs.product_id=p.id
  where cr.id=p_receipt_id
    and cr.subject_id=p_subject_id
    and cr.product_offer_id=p_approved_offer_id
    and cr.provider='portone_v2'
    and cr.platform='web'
    and cr.environment='production'
    and cr.verification_status='verified'
    and cr.verified_at is not null
    and cr.verified_amount_minor=1900
    and cr.verified_currency='KRW'
    and cr.external_transaction_id<>''
    and cr.receipt_fingerprint<>''
    and pi.status='verified'
    and pi.expected_amount_minor=1900
    and pi.expected_currency='KRW'
    and pi.capability_snapshot_hash is not null
    and pi.capability_snapshot_jsonb=pg_catalog.jsonb_build_object(
      'capabilitySetId',pcs.id::text,
      'definitionVersion',pcs.definition_version,
      'definitionHash',pcs.definition_hash
    )
    and po.provider='portone_v2'
    and po.platform='web'
    and po.enabled and po.retired_at is null
    and po.currency='KRW'
    and po.display_price_minor=1900
    and p.enabled and p.retired_at is null
    and p.product_key='chat_credits_300_v1'
    and p.product_type='credit'
  for share of cr,pi,po,p,pcs;
  if not found then
    raise exception 'Receipt is not authorized for PortOne credit fulfillment';
  end if;

  -- This validity is an explicit, server-authorized input, not a business
  -- policy invented by the candidate. First issuance pins immutable expiry.
  v_expiry := case when p_validity_mode='days'
    then v_now + pg_catalog.make_interval(days => p_validity_days)
    else null end;
  if v_expiry is not null and v_expiry <= v_now then
    raise exception 'Paid credit expiration is invalid';
  end if;

  select l.* into v_existing from public.chat_credit_lots_v1 l
    where l.source_kind='portone_topup' and l.source_ref=p_receipt_id
    for update;
  if found then
    if v_existing.subject_id<>p_subject_id or v_existing.credits_issued<>300 then
      raise exception 'Paid credit source already belongs to incompatible lot';
    end if;
    v_lot_id := v_existing.id;
  else
    insert into public.chat_credit_lots_v1
      (subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at)
    values(p_subject_id,'portone_topup',p_receipt_id,300,300,v_now,v_expiry)
    on conflict on constraint chat_credit_lots_global_source_v1 do nothing
    returning id into v_lot_id;
    if v_lot_id is null then
      raise exception 'Paid credit source conflicted with another owner';
    end if;
    v_issued := true;
  end if;

  return query
  select v_lot_id,v_issued,b.available_credits,b.total_credits
    from public.internal_qry_chat_credit_balance_v1(p_subject_id) b;
end $$;

revoke all on function public.internal_cmd_chat_credit_verified_topup_v1(
  uuid,uuid,uuid,text,integer
) from public;

-- First eligible paid Reading reward candidate: ONE 150-credit/90-day bonus
-- per canonical owner, never an independent browser/PSP credit issuance route.
-- Server must supply a governance-approved eligible Reading Offer; until
-- Product/Offer eligibility and refund semantics are signed off this is inert.
create function public.internal_cmd_chat_first_paid_reading_reward_v1(
  p_subject_id uuid,
  p_receipt_id uuid,
  p_approved_reading_offer_id uuid
)
returns table(lot_id uuid, outcome text, available_credits bigint, total_credits bigint)
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $$
declare
 v_now timestamptz := clock_timestamp();
 v_existing public.chat_credit_lots_v1%rowtype;
 v_lot_id uuid;
 v_outcome text := 'issued';
begin
 if p_subject_id is null or p_receipt_id is null or p_approved_reading_offer_id is null then
   raise exception 'First Reading reward requires approved owner, Receipt and Offer';
 end if;
 perform 1 from public.subjects
 where id=p_subject_id and status='active' for update;
 if not found then raise exception 'Reading reward owner is not active'; end if;

 perform 1 from public.commerce_receipts cr
 join public.purchase_intents pi
   on pi.id=cr.purchase_intent_id
  and pi.subject_id=cr.subject_id
  and pi.product_offer_id=cr.product_offer_id
 join public.product_offers po on po.id=cr.product_offer_id
 join public.products p on p.id=po.product_id
 join public.product_capability_sets pcs
   on pcs.id=pi.capability_set_id and pcs.product_id=p.id
 where cr.id=p_receipt_id
   and cr.subject_id=p_subject_id
   and cr.product_offer_id=p_approved_reading_offer_id
   and cr.provider='portone_v2'
   and cr.platform='web'
   and cr.environment='production'
   and cr.verification_status='verified'
   and cr.verified_at is not null
   and cr.verified_amount_minor > 0
   and cr.verified_amount_minor=pi.expected_amount_minor
   and cr.verified_currency=pi.expected_currency
   and cr.external_transaction_id<>''
   and cr.receipt_fingerprint<>''
   and pi.status='verified'
   and pi.capability_snapshot_hash is not null
   and pi.capability_snapshot_jsonb=pg_catalog.jsonb_build_object(
      'capabilitySetId',pcs.id::text,
      'definitionVersion',pcs.definition_version,
      'definitionHash',pcs.definition_hash
   )
   and po.enabled and po.retired_at is null
   and po.provider='portone_v2' and po.platform='web'
   and po.currency=pi.expected_currency
   and po.display_price_minor=pi.expected_amount_minor
   and p.enabled and p.retired_at is null
   and p.product_type='reading'
 for share of cr,pi,po,p,pcs;
 if not found then raise exception 'Not an approved verified paid Reading'; end if;

 select l.* into v_existing
 from public.chat_credit_lots_v1 l
 where l.subject_id=p_subject_id and l.source_kind='reading_reward'
 for update;
 if found then
   if v_existing.credits_issued<>150 or v_existing.expires_at is null then
     raise exception 'Existing Reading reward source is invalid';
   end if;
   v_lot_id:=v_existing.id;
   v_outcome:='already_awarded';
 else
   insert into public.chat_credit_lots_v1
     (subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at)
   values(p_subject_id,'reading_reward',p_receipt_id,150,150,v_now,
     v_now + interval '90 days')
   returning id into v_lot_id;
 end if;

 return query
 select v_lot_id,v_outcome,b.available_credits,b.total_credits
 from public.internal_qry_chat_credit_balance_v1(p_subject_id) b;
end $$;

revoke all on function public.internal_cmd_chat_first_paid_reading_reward_v1(
  uuid,uuid,uuid
) from public;

-- The delivery acknowledgement is an exact owned ChatTurn + committed assistant
-- message correlation. A browser "success" flag alone cannot debit anything.
-- Chat/UI tracks must adopt this acknowledged-delivery contract before mounting.
create function public.internal_cmd_chat_credit_ack_delivered_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_client_turn_id uuid,
  p_reservation_id uuid,
  p_turn_id uuid,
  p_assistant_message_id uuid
)
returns text
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $$
declare
  v_turn public.chat_turns%rowtype;
  v_reservation public.chat_credit_turn_reservations_v1%rowtype;
  v_message_id uuid;
begin
  if p_subject_id is null or p_thread_id is null or p_client_turn_id is null
     or p_reservation_id is null or p_turn_id is null or p_assistant_message_id is null then
    raise exception 'Delivery acknowledgement requires exact owner and committed turn identities';
  end if;

  perform 1 from public.subjects
  where id=p_subject_id and kind='member' and status='active'
  for update;
  if not found then raise exception 'Only active Member can acknowledge paid chat'; end if;

  select * into v_reservation
  from public.chat_credit_turn_reservations_v1
  where id=p_reservation_id and subject_id=p_subject_id
    and thread_id=p_thread_id and client_turn_id=p_client_turn_id
  for update;
  if not found or v_reservation.state='released' then
    raise exception 'Delivery has no valid owned credit reservation';
  end if;

  select * into v_turn from public.chat_turns
  where id=p_turn_id
    and subject_id=p_subject_id
    and thread_id=p_thread_id
    and client_turn_id=p_client_turn_id::text
  for update;
  if not found or v_turn.state not in ('committed','delivered')
     or v_turn.committed_attempt_id is null or v_turn.committed_at is null then
    raise exception 'Delivery has no matching committed ChatTurn';
  end if;

  select a.committed_message_id into v_message_id
  from public.chat_turn_attempts a
  join public.conversation_messages m
    on m.id=a.committed_message_id
   and m.turn_id=p_turn_id
   and m.subject_id=p_subject_id
   and m.thread_id=p_thread_id
   and m.sender_type='character'
   and m.redacted_at is null
  where a.id=v_turn.committed_attempt_id
    and a.turn_id=p_turn_id
    and a.subject_id=p_subject_id
    and a.state='committed'
    and a.committed_message_id=p_assistant_message_id;
  if not found or v_message_id is distinct from p_assistant_message_id then
    raise exception 'Delivery assistant message is not the committed reply';
  end if;

  if v_turn.state='committed' then
    update public.chat_turns set
      state='delivered',
      delivered_at=clock_timestamp(),
      updated_at=clock_timestamp()
    where id=p_turn_id and subject_id=p_subject_id and state='committed';
  elsif v_turn.delivered_at is null then
    raise exception 'Delivered ChatTurn has no persisted delivery timestamp';
  end if;

  return public.internal_cmd_chat_credit_finalize_v1(
    p_subject_id,p_reservation_id,true,p_turn_id
  );
end $$;

revoke all on function public.internal_cmd_chat_credit_ack_delivered_v1(
  uuid,uuid,uuid,uuid,uuid,uuid
) from public;
