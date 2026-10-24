-- Candidate only: not a Production migration. Apply solely on a disposable DB
-- until Commerce Product/credit authority, Privacy deletion/restore and deployment
-- adoption are explicitly reconciled. Payment / Reading bonus minting is NOT
-- authorized. The existing Se-yeon AI provider cost ledger is independent.
-- Watchtower-Track: commerce-payment

create table public.chat_credit_lots_v1 (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  subject_id uuid not null references public.subjects(id),
  source_kind text not null check (source_kind in ('signup')),
  source_ref uuid not null,
  credits_issued integer not null check (credits_issued > 0),
  credits_remaining integer not null check (credits_remaining >= 0),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  constraint chat_credit_lots_remaining_bound_v1 check (credits_remaining <= credits_issued),
  constraint chat_credit_lots_validity_v1 check (expires_at > issued_at),
  constraint chat_credit_lots_unique_source_v1 unique(subject_id,source_kind,source_ref)
);
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
  select coalesce(sum(credits_remaining) filter (where expires_at>clock_timestamp()),0)::bigint,
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
      and l.expires_at>clock_timestamp()
    order by l.expires_at,l.issued_at,l.id for update
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
