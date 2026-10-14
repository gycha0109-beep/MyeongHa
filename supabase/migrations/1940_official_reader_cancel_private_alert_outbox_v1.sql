-- D3e7 PRIVATE operations alert candidate. Typed, aggregate-derived alerts only.
-- No SMTP/Slack/pager/webhook destination, endpoint, service grants, schedule,
-- PortOne action, personal identifiers, payment authority, or automatic purge.
-- This is an at-least-once outbox, NOT exactly-once external delivery.

create table public.official_reader_portone_cancel_ops_alert_outbox_v1 (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  alert_code text not null check (alert_code in (
    'HELD_REVIEW_REQUIRED','DEAD_LETTER_REVIEW_REQUIRED',
    'EXPIRED_LEASES_PRESENT','UNRESOLVED_AGE_EXCEEDED'
  )),
  window_started_at timestamptz not null,
  delivery_state text not null default 'queued'
    check (delivery_state in ('queued','leased','retry_wait','delivered','dead_letter')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default pg_catalog.clock_timestamp(),
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint official_reader_cancel_ops_alert_dedupe_v1
    unique (alert_code,window_started_at),
  constraint official_reader_cancel_ops_alert_lease_v1
    check (
      (delivery_state='leased'
        and lease_owner is not null and lease_token is not null and lease_expires_at is not null)
      or (delivery_state<>'leased'
        and lease_owner is null and lease_token is null and lease_expires_at is null)
    ),
  constraint official_reader_cancel_ops_alert_worker_v1
    check (lease_owner is null or lease_owner ~ '^[A-Za-z0-9_-]{1,96}$'),
  constraint official_reader_cancel_ops_alert_delivery_v1
    check ((delivery_state='delivered' and delivered_at is not null)
      or (delivery_state<>'delivered' and delivered_at is null))
);
create index official_reader_cancel_ops_alert_due_v1_idx
  on public.official_reader_portone_cancel_ops_alert_outbox_v1
    (delivery_state,next_attempt_at,lease_expires_at,created_at,id)
  where delivery_state in ('queued','retry_wait','leased');
alter table public.official_reader_portone_cancel_ops_alert_outbox_v1
  enable row level security;
revoke all on public.official_reader_portone_cancel_ops_alert_outbox_v1 from public;

-- Fenced snapshot uses DB wall clock and D3e6 private aggregate-only health.
-- At most one alert per category per 15-minute window (no raw counts stored).
create function public.internal_private_cancel_enqueue_alerts_v1()
returns table (enqueued_count integer,effect_authorized boolean)
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $d3e7_enqueue$
declare
  v_health record;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window timestamptz;
  v_written integer;
begin
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',
      message='Private cancellation alert enqueue requires READ COMMITTED';
  end if;
  select * into v_health from public.internal_private_cancel_queue_health_v1();
  if not found or v_health.effect_authorized is distinct from false then
    raise exception using errcode='23514',
      message='Private cancellation aggregate health is unavailable';
  end if;
  v_window:=pg_catalog.to_timestamp(
    (pg_catalog.floor(pg_catalog.extract(epoch from v_now)/900)*900)::double precision
  );
  insert into public.official_reader_portone_cancel_ops_alert_outbox_v1
    (alert_code,window_started_at)
  select cases.code,v_window
  from (values
    ('HELD_REVIEW_REQUIRED'::text,v_health.held>0),
    ('DEAD_LETTER_REVIEW_REQUIRED'::text,v_health.dead_letter>0),
    ('EXPIRED_LEASES_PRESENT'::text,v_health.leased_expired>0),
    ('UNRESOLVED_AGE_EXCEEDED'::text,v_health.oldest_unresolved_age_seconds>=3600)
  ) cases(code,triggered)
  where cases.triggered
  on conflict (alert_code,window_started_at) do nothing;
  get diagnostics v_written=row_count;
  return query select v_written,false;
end
$d3e7_enqueue$;

-- No claim can run without a committed outbox record. Lock-free provider work:
-- claim commits first, then transport injected by isolated caller.
create function public.internal_private_cancel_claim_alert_v1(
  p_worker_id text,p_lease_seconds integer
)
returns table (
  alert_id uuid,alert_kind text,delivery_token uuid,
  delivery_attempt integer,effect_authorized boolean
)
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $d3e7_claim$
declare
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_id uuid;
  v_token uuid:=pg_catalog.gen_random_uuid();
  v_item public.official_reader_portone_cancel_ops_alert_outbox_v1%rowtype;
begin
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',message='Private alert claim requires READ COMMITTED';
  end if;
  if p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9_-]{1,96}$'
    or p_lease_seconds is null or p_lease_seconds not between 30 and 300 then
    raise exception using errcode='23514',message='Invalid private alert delivery lease';
  end if;
  -- Reconcile failed last-attempt leases without deleting outstanding alerts.
  with exhausted as (
    select a.id
    from public.official_reader_portone_cancel_ops_alert_outbox_v1 a
    where a.delivery_state='leased' and a.lease_expires_at<=v_now
      and a.attempt_count>=5
    order by a.lease_expires_at,a.id
    limit 32 for update skip locked
  )
  update public.official_reader_portone_cancel_ops_alert_outbox_v1 a
  set delivery_state='dead_letter',lease_owner=null,lease_token=null,lease_expires_at=null
  from exhausted where a.id=exhausted.id;

  select a.id into v_id
  from public.official_reader_portone_cancel_ops_alert_outbox_v1 a
  where a.attempt_count<5 and (
    a.delivery_state='queued'
    or (a.delivery_state='retry_wait' and a.next_attempt_at<=v_now)
    or (a.delivery_state='leased' and a.lease_expires_at<=v_now)
  )
  order by a.created_at,a.id
  limit 1 for update skip locked;
  if not found then return; end if;

  update public.official_reader_portone_cancel_ops_alert_outbox_v1 a
  set delivery_state='leased',attempt_count=a.attempt_count+1,
    lease_owner=p_worker_id,lease_token=v_token,
    lease_expires_at=pg_catalog.clock_timestamp()
      +pg_catalog.make_interval(secs=>p_lease_seconds)
  where a.id=v_id
  returning * into v_item;

  return query select v_item.id,v_item.alert_code,v_token,v_item.attempt_count,false;
end
$d3e7_claim$;

create function public.internal_private_cancel_finalize_alert_v1(
  p_alert_id uuid,p_worker_id text,p_token uuid,p_delivered boolean
)
returns table (
  final_state text,retry_due_at timestamptz,effect_authorized boolean
)
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $d3e7_finalize$
declare
  v_item public.official_reader_portone_cancel_ops_alert_outbox_v1%rowtype;
  v_now timestamptz;
  v_state text;
  v_due timestamptz;
  v_delay integer;
begin
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',message='Private alert finalize requires READ COMMITTED';
  end if;
  if p_delivered is null then
    raise exception using errcode='23514',message='Private alert delivery outcome is required';
  end if;
  select * into v_item
  from public.official_reader_portone_cancel_ops_alert_outbox_v1
  where id=p_alert_id for update;
  -- Clock must be sampled AFTER the row lock acquisition.
  v_now:=pg_catalog.clock_timestamp();
  if not found or v_item.delivery_state<>'leased'
    or p_worker_id is null or p_token is null
    or v_item.lease_owner is distinct from p_worker_id
    or v_item.lease_token is distinct from p_token
    or v_item.lease_expires_at<=v_now then
    raise exception using errcode='55000',
      constraint='d3e7_stale_alert_delivery_lease',
      message='Private alert finalize requires a live fenced claim';
  end if;

  if p_delivered then
    v_state:='delivered';
  elsif v_item.attempt_count>=5 then
    v_state:='dead_letter';
  else
    v_state:='retry_wait';
    v_delay:=least(900,30*pg_catalog.power(2,v_item.attempt_count-1)::integer);
    v_due:=v_now+pg_catalog.make_interval(secs=>v_delay);
  end if;

  update public.official_reader_portone_cancel_ops_alert_outbox_v1 a
  set delivery_state=v_state,lease_owner=null,lease_token=null,lease_expires_at=null,
    next_attempt_at=coalesce(v_due,a.next_attempt_at),
    delivered_at=case when v_state='delivered' then v_now else null end
  where a.id=p_alert_id;

  return query select v_state,v_due,false;
end
$d3e7_finalize$;

revoke all on function public.internal_private_cancel_enqueue_alerts_v1() from public;
revoke all on function public.internal_private_cancel_claim_alert_v1(text,integer) from public;
revoke all on function public.internal_private_cancel_finalize_alert_v1(uuid,text,uuid,boolean) from public;
do $d3e7_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles where rolname in (
    'anon','authenticated','service_role','myeongha_api_executor',
    'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner'
  )
  loop
    execute pg_catalog.format(
      'revoke all on public.official_reader_portone_cancel_ops_alert_outbox_v1 from %I',v_role);
    execute pg_catalog.format(
      'revoke all on function public.internal_private_cancel_enqueue_alerts_v1() from %I',v_role);
    execute pg_catalog.format(
      'revoke all on function public.internal_private_cancel_claim_alert_v1(text,integer) from %I',v_role);
    execute pg_catalog.format(
      'revoke all on function public.internal_private_cancel_finalize_alert_v1(uuid,text,uuid,boolean) from %I',v_role);
    if pg_catalog.has_table_privilege(v_role,
      'public.official_reader_portone_cancel_ops_alert_outbox_v1','SELECT')
      or pg_catalog.has_function_privilege(v_role,
      'public.internal_private_cancel_enqueue_alerts_v1()','EXECUTE')
      or pg_catalog.has_function_privilege(v_role,
      'public.internal_private_cancel_claim_alert_v1(text,integer)','EXECUTE')
      or pg_catalog.has_function_privilege(v_role,
      'public.internal_private_cancel_finalize_alert_v1(uuid,text,uuid,boolean)','EXECUTE')
    then
      raise exception using errcode='42501',
        message='Private cancellation alert outbox is reachable by runtime';
    end if;
  end loop;
end
$d3e7_acl$;

comment on table public.official_reader_portone_cancel_ops_alert_outbox_v1
  is 'D3e7 private aggregate-derived alert queue, no IDs of payers or webhook events, at-least-once only; retention and delivery inactive.';
comment on function public.internal_private_cancel_enqueue_alerts_v1()
  is 'Owner-only, dedupe per alert class per 15-minute UTC window; no sender and no right effects.';
comment on function public.internal_private_cancel_claim_alert_v1(text,integer)
  is 'Owner-only alert claim, SKIP LOCKED with expiring fenced token and max five attempts.';
comment on function public.internal_private_cancel_finalize_alert_v1(uuid,text,uuid,boolean)
  is 'Owner-only fenced alert delivery acknowledgement or retry/dead-letter; no actual network sender.';
