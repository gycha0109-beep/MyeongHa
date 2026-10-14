-- D3e6 PRIVATE: operational queue health and audited limited manual review.
-- Follows 1860/1910/1920. No live endpoint, no production role GRANT,
-- no raw provider payload, no automatic scheduler or retention deletion.
-- Manual retry is NOT a refund, canonical payment proof or entitlement change.

create table public.official_reader_portone_cancel_ops_review_v1 (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  inbox_id uuid not null references
    public.official_reader_portone_cancel_ingress_inbox_v1(id) on delete cascade,
  action text not null check (action in ('acknowledge','retry_transient')),
  ticket_reference text not null check (
    ticket_reference ~ '^OPS-[0-9]{4,12}$'
  ),
  operator_db_principal text not null
    check (length(operator_db_principal) between 1 and 96),
  previous_state text not null check (previous_state in ('held','dead_letter')),
  previous_failure_code text,
  reviewed_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint official_reader_portone_cancel_ops_review_ticket_unique
    unique(inbox_id,ticket_reference,action)
);
-- At most ONE privileged manual retry per event, regardless of ticket.
create unique index official_reader_portone_cancel_ops_one_retry_idx
  on public.official_reader_portone_cancel_ops_review_v1(inbox_id)
  where action='retry_transient';
create index official_reader_portone_cancel_ops_review_by_inbox_idx
  on public.official_reader_portone_cancel_ops_review_v1(inbox_id,reviewed_at);

alter table public.official_reader_portone_cancel_ops_review_v1
  enable row level security;
revoke all on table public.official_reader_portone_cancel_ops_review_v1 from public;

-- Metrics intentionally return COUNTS and an AGE only; never row IDs,
-- provider identifiers, dates of birth, customer details or raw errors.
create function public.internal_private_cancel_queue_health_v1()
returns table (
  queued_due bigint,
  retry_due bigint,
  leased_active bigint,
  leased_expired bigint,
  held bigint,
  dead_letter bigint,
  completed bigint,
  oldest_unresolved_age_seconds bigint,
  effect_authorized boolean
)
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $d3e6_health$
declare v_now timestamptz := pg_catalog.clock_timestamp();
begin
  return query
    select
      count(*) filter (where i.inbox_state='queued' and i.next_attempt_at<=v_now),
      count(*) filter (where i.inbox_state='retry_wait' and i.next_attempt_at<=v_now),
      count(*) filter (where i.inbox_state='leased' and i.lease_expires_at>v_now),
      count(*) filter (where i.inbox_state='leased' and i.lease_expires_at<=v_now),
      count(*) filter (where i.inbox_state='held'),
      count(*) filter (where i.inbox_state='dead_letter'),
      count(*) filter (where i.inbox_state='completed'),
      coalesce(max(greatest(0,floor(extract(epoch from (v_now-i.received_at)))::bigint))
        filter (where i.inbox_state<>'completed'),0)::bigint,
      false
    from public.official_reader_portone_cancel_ingress_inbox_v1 i;
end
$d3e6_health$;

-- Isolated DB-owner review only. DOES NOT allow requeuing a security HOLD,
-- ordering ambiguity, mismatch, active lease or a completed observation.
create function public.internal_private_cancel_review_v1(
  p_inbox_id uuid,
  p_action text,
  p_ticket_reference text
)
returns table (
  review_state text,
  effect_authorized boolean
)
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $d3e6_review$
declare
  v_row public.official_reader_portone_cancel_ingress_inbox_v1%rowtype;
  v_state text;
begin
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',
      message='Private cancellation operator review requires READ COMMITTED';
  end if;
  if p_inbox_id is null or p_action is null
      or p_action not in ('acknowledge','retry_transient')
      or p_ticket_reference is null
      or p_ticket_reference !~ '^OPS-[0-9]{4,12}$' then
    raise exception using errcode='23514',
      constraint='d3e6_invalid_review_shape',
      message='Private cancellation review requires a valid reference and typed action';
  end if;

  select * into v_row
  from public.official_reader_portone_cancel_ingress_inbox_v1
  where id=p_inbox_id for update;
  if not found or v_row.inbox_state not in ('held','dead_letter') then
    raise exception using errcode='55000',
      constraint='d3e6_not_reviewable_state',
      message='Private cancellation item is not eligible for operator review';
  end if;

  if p_action='retry_transient' and
     (v_row.inbox_state<>'dead_letter'
       or v_row.shadow_observation_id is not null
       or v_row.last_failure_code not in (
         'LOOKUP_FAILED','LOOKUP_TIMEOUT','INTERNAL_FAILURE','LEASE_EXHAUSTED'
       )
       or exists (
         select 1 from public.official_reader_portone_cancel_ops_review_v1 a
         where a.inbox_id=p_inbox_id and a.action='retry_transient'
       )
     ) then
    raise exception using errcode='55000',
      constraint='d3e6_retry_not_authorized',
      message='Private cancellation replay requires one transient dead letter';
  end if;

  -- The role itself is captured, NOT an untrusted caller-provided human name.
  -- Before production, external identity/ticket approval must be bound to DB role.
  insert into public.official_reader_portone_cancel_ops_review_v1 (
    inbox_id,action,ticket_reference,operator_db_principal,
    previous_state,previous_failure_code
  ) values (
    v_row.id,p_action,p_ticket_reference,session_user,
    v_row.inbox_state,v_row.last_failure_code
  );

  if p_action='retry_transient' then
    update public.official_reader_portone_cancel_ingress_inbox_v1
    set inbox_state='queued',attempt_count=0,
      next_attempt_at=pg_catalog.clock_timestamp(),
      last_failure_code=null
    where id=v_row.id;
    v_state:='queued';
  else
    v_state:=v_row.inbox_state;
  end if;

  return query select v_state,false;
end
$d3e6_review$;

revoke all on function public.internal_private_cancel_queue_health_v1() from public;
revoke all on function public.internal_private_cancel_review_v1(uuid,text,text) from public;

do $d3e6_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on table public.official_reader_portone_cancel_ops_review_v1 from %I',
      v_role);
    execute pg_catalog.format(
      'revoke all on function public.internal_private_cancel_queue_health_v1() from %I',
      v_role);
    execute pg_catalog.format(
      'revoke all on function public.internal_private_cancel_review_v1(uuid,text,text) from %I',
      v_role);
    if pg_catalog.has_function_privilege(v_role,
      'public.internal_private_cancel_queue_health_v1()','EXECUTE')
      or pg_catalog.has_function_privilege(v_role,
      'public.internal_private_cancel_review_v1(uuid,text,text)','EXECUTE')
      or pg_catalog.has_table_privilege(v_role,
      'public.official_reader_portone_cancel_ops_review_v1','SELECT') then
      raise exception using errcode='42501',
        message='D3e6 private cancellation operations became runtime accessible';
    end if;
  end loop;
end
$d3e6_acl$;

comment on table public.official_reader_portone_cancel_ops_review_v1
is 'Private one-shot operator decision log, linked to temporary inbox and erased with parent; NOT P5Y statutory evidence. No arbitrary operator notes.';
comment on function public.internal_private_cancel_queue_health_v1()
is 'Private aggregated queue health only, zero provider IDs and no authorized effects.';
comment on function public.internal_private_cancel_review_v1(uuid,text,text)
is 'Private logged operator acknowledgement or single transient dead-letter requeue; security/order HOLDs cannot requeue. No public grants.';
