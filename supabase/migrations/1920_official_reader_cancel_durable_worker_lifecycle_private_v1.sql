-- D3e5 PRIVATE lifecycle for the 1910 signed cancel inbox and 1860 shadow.
-- DB-owner/offline candidate. NEVER a hosted worker, refund/entitlement grant,
-- production role GRANT, raw provider body store, or automatic retention purge.
-- An inbox 'completed' status means OBSERVATION TRANSFER ONLY, not refund.

do $d3e5_remove_queued_only_check$
declare v_constraint text;
declare v_count bigint;
begin
  select count(*), min(con.conname::text) into v_count, v_constraint
  from pg_catalog.pg_constraint con
  where con.conrelid='public.official_reader_portone_cancel_ingress_inbox_v1'::pg_catalog.regclass
    and con.contype='c'
    and pg_catalog.pg_get_constraintdef(con.oid) like '%inbox_state%'
    and pg_catalog.pg_get_constraintdef(con.oid) like '%queued%';
  if v_count<>1 then
    raise exception using errcode='23514',
      message='D3e5 expected one original queued-only inbox state constraint';
  end if;
  execute pg_catalog.format(
    'alter table public.official_reader_portone_cancel_ingress_inbox_v1 drop constraint %I',
    v_constraint);
end
$d3e5_remove_queued_only_check$;

alter table public.official_reader_portone_cancel_ingress_inbox_v1
  add column attempt_count integer not null default 0,
  add column lease_owner text,
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column next_attempt_at timestamptz not null default pg_catalog.clock_timestamp(),
  add column last_failure_code text,
  add column completed_at timestamptz,
  add column shadow_observation_id uuid references
    public.official_reader_portone_cancel_observation_shadow_v1(id),
  add constraint official_reader_portone_cancel_work_state_v1_check
    check (inbox_state in (
      'queued','leased','retry_wait','completed','held','dead_letter'
    )),
  add constraint official_reader_portone_cancel_work_attempts_v1_check
    check (attempt_count between 0 and 8),
  add constraint official_reader_portone_cancel_work_lease_v1_check
    check (
      (inbox_state='leased'
        and lease_owner is not null and lease_token is not null
        and lease_expires_at is not null)
      or (inbox_state<>'leased'
        and lease_owner is null and lease_token is null
        and lease_expires_at is null)
    ),
  add constraint official_reader_portone_cancel_work_owner_v1_check
    check (lease_owner is null
      or (length(lease_owner) between 1 and 96
        and lease_owner ~ '^[A-Za-z0-9_-]+$')),
  add constraint official_reader_portone_cancel_work_failure_v1_check
    check (last_failure_code is null or last_failure_code in (
      'LOOKUP_FAILED','LOOKUP_TIMEOUT','LOOKUP_TOO_LARGE',
      'INVALID_SOURCE','SOURCE_MISMATCH','INBOX_INVALID',
      'INBOX_INTEGRITY','INBOX_CHANGED','SHADOW_CONFLICT',
      'INTERNAL_FAILURE','LEASE_EXHAUSTED','ORDERING_REVIEW',
      'INVALID_WORKER_RESULT'
    )),
  add constraint official_reader_portone_cancel_work_completion_v1_check
    check ((inbox_state='completed' and completed_at is not null
        and shadow_observation_id is not null)
      or (inbox_state<>'completed' and completed_at is null)),
  add constraint official_reader_portone_cancel_work_shadow_v1_check
    check (shadow_observation_id is null
      or inbox_state in ('completed','held'));

create index official_reader_portone_cancel_work_due_v1_idx
  on public.official_reader_portone_cancel_ingress_inbox_v1(
    inbox_state,next_attempt_at,lease_expires_at,received_at,id
  ) where inbox_state in ('queued','leased','retry_wait');

-- Advisory/ACL boundaries from 1910 persist; add no roles or policies.
create function public.internal_claim_official_reader_cancel_work_v1(
  p_worker_id text,
  p_lease_seconds integer
)
returns table(
  inbox_id uuid,
  claim_token uuid,
  claim_attempt_count integer,
  claim_expires_at timestamptz,
  effect_authorized boolean
)
language plpgsql volatile security invoker
set search_path=pg_catalog, public
as $d3e5_claim$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_id uuid;
  v_token uuid := pg_catalog.gen_random_uuid();
  v_row public.official_reader_portone_cancel_ingress_inbox_v1%rowtype;
begin
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',
      message='D3e5 worker requires READ COMMITTED';
  end if;
  if p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9_-]{1,96}$'
     or p_lease_seconds is null or p_lease_seconds not between 45 and 900 then
    raise exception using errcode='23514',
      message='Invalid private cancel worker lease request';
  end if;

  -- Expired final-attempt leases must never disappear as silently unclaimable.
  -- Bounded SKIP LOCKED dead-letter sweep, no deletion and no effect.
  with exhausted as (
    select s.id from public.official_reader_portone_cancel_ingress_inbox_v1 s
    where s.inbox_state='leased' and s.lease_expires_at<=v_now
      and s.attempt_count>=8
    order by s.lease_expires_at,s.id
    limit 32 for update skip locked
  )
  update public.official_reader_portone_cancel_ingress_inbox_v1 s
    set inbox_state='dead_letter',lease_owner=null,lease_token=null,
      lease_expires_at=null,last_failure_code='LEASE_EXHAUSTED'
  from exhausted where s.id=exhausted.id;

  select s.id into v_id
  from public.official_reader_portone_cancel_ingress_inbox_v1 s
  where s.attempt_count<8 and (
    s.inbox_state='queued'
    or (s.inbox_state='retry_wait' and s.next_attempt_at<=v_now)
    or (s.inbox_state='leased' and s.lease_expires_at<=v_now)
  )
  order by s.received_at,s.id
  limit 1 for update skip locked;

  if not found then return; end if;

  update public.official_reader_portone_cancel_ingress_inbox_v1 s
  set inbox_state='leased',attempt_count=s.attempt_count+1,
      lease_owner=p_worker_id,lease_token=v_token,
      lease_expires_at=v_now+pg_catalog.make_interval(secs=>p_lease_seconds),
      last_failure_code=null
  where s.id=v_id
  returning * into v_row;

  return query select v_row.id,v_token,v_row.attempt_count,
    v_row.lease_expires_at,false;
end
$d3e5_claim$;

-- Caller MUST record verified 1860 facts within the same READ COMMITTED txn
-- before invoking this completion. A prior shadow alone is not payment authority.
create function public.internal_complete_official_reader_cancel_work_v1(
  p_inbox_id uuid,
  p_worker_id text,
  p_claim_token uuid
)
returns table(
  completion_state text,
  linked_observation_id uuid,
  effect_authorized boolean
)
language plpgsql volatile security invoker
set search_path=pg_catalog, public
as $d3e5_complete$
declare
  v_now timestamptz;
  v_work public.official_reader_portone_cancel_ingress_inbox_v1%rowtype;
  v_shadow public.official_reader_portone_cancel_observation_shadow_v1%rowtype;
  v_state text;
begin
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',message='D3e5 completion requires READ COMMITTED';
  end if;
  select * into v_work
  from public.official_reader_portone_cancel_ingress_inbox_v1
  where id=p_inbox_id for update;
  -- Re-read DB clock AFTER acquiring row lock; never permit an expired lease.
  v_now:=pg_catalog.clock_timestamp();
  if not found or v_work.inbox_state<>'leased'
    or p_worker_id is null or p_claim_token is null
    or v_work.lease_owner is distinct from p_worker_id
    or v_work.lease_token is distinct from p_claim_token
    or v_work.lease_expires_at<=v_now then
    raise exception using errcode='55000',
      constraint='d3e5_stale_completion_lease',
      message='Private cancellation completion requires a live fenced lease';
  end if;

  select * into v_shadow
  from public.official_reader_portone_cancel_observation_shadow_v1 s
  where s.provider='portone_v2' and s.webhook_id=v_work.webhook_id
    and s.payment_id=v_work.payment_id
    and s.transaction_id=v_work.transaction_id
    and s.cancellation_id=v_work.cancellation_id
    and s.event_type=v_work.event_type
    and s.event_occurred_at=v_work.event_occurred_at;
  if not found then
    raise exception using errcode='23514',
      constraint='d3e5_no_matching_verified_observation',
      message='Cannot complete private inbox without matching 1860 observation';
  end if;

  v_state := case when v_shadow.shadow_classification='observed'
    then 'completed' else 'held' end;

  update public.official_reader_portone_cancel_ingress_inbox_v1
  set inbox_state=v_state,lease_owner=null,lease_token=null,
    lease_expires_at=null,
    shadow_observation_id=v_shadow.id,
    completed_at=case when v_state='completed' then v_now else null end,
    last_failure_code=case when v_state='held' then 'ORDERING_REVIEW' else null end
  where id=p_inbox_id;

  return query select v_state,v_shadow.id,false;
end
$d3e5_complete$;

create function public.internal_fail_official_reader_cancel_work_v1(
  p_inbox_id uuid,
  p_worker_id text,
  p_claim_token uuid,
  p_failure_code text,
  p_retryable boolean
)
returns table(
  failure_state text,
  retry_due_at timestamptz,
  effect_authorized boolean
)
language plpgsql volatile security invoker
set search_path=pg_catalog, public
as $d3e5_fail$
declare
  v_now timestamptz;
  v_work public.official_reader_portone_cancel_ingress_inbox_v1%rowtype;
  v_state text;
  v_due timestamptz;
  v_seconds integer;
begin
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',message='D3e5 failure requires READ COMMITTED';
  end if;
  if p_failure_code is null or p_failure_code not in (
    'LOOKUP_FAILED','LOOKUP_TIMEOUT','LOOKUP_TOO_LARGE',
    'INVALID_SOURCE','SOURCE_MISMATCH','INBOX_INVALID',
    'INBOX_INTEGRITY','INBOX_CHANGED','SHADOW_CONFLICT',
    'INTERNAL_FAILURE','INVALID_WORKER_RESULT'
  ) or p_retryable is null then
    raise exception using errcode='23514',
      message='D3e5 requires a bounded public-safe failure code';
  end if;
  -- Only actual lookup outage/timeouts and bounded internal recovery may retry.
  if p_retryable and p_failure_code not in (
    'LOOKUP_FAILED','LOOKUP_TIMEOUT','INTERNAL_FAILURE'
  ) then
    raise exception using errcode='23514',
      message='Non-transient cancellation failure cannot be retried';
  end if;
  select * into v_work
  from public.official_reader_portone_cancel_ingress_inbox_v1
  where id=p_inbox_id for update;
  -- Re-read DB clock AFTER acquiring row lock; never permit an expired lease.
  v_now:=pg_catalog.clock_timestamp();
  if not found or v_work.inbox_state<>'leased'
    or p_worker_id is null or p_claim_token is null
    or v_work.lease_owner is distinct from p_worker_id
    or v_work.lease_token is distinct from p_claim_token
    or v_work.lease_expires_at<=v_now then
    raise exception using errcode='55000',
      constraint='d3e5_stale_failure_lease',
      message='Private cancellation failure requires a live fenced lease';
  end if;

  if not p_retryable then
    v_state:='held';
  elsif v_work.attempt_count>=8 then
    v_state:='dead_letter';
  else
    v_state:='retry_wait';
    v_seconds:=least(3600,15*pg_catalog.power(2,v_work.attempt_count-1)::integer);
    v_due:=v_now+pg_catalog.make_interval(secs=>v_seconds);
  end if;

  update public.official_reader_portone_cancel_ingress_inbox_v1
  set inbox_state=v_state,lease_owner=null,lease_token=null,
      lease_expires_at=null,
      next_attempt_at=coalesce(v_due,next_attempt_at),
      last_failure_code=p_failure_code
  where id=p_inbox_id;

  return query select v_state,v_due,false;
end
$d3e5_fail$;

-- The DB owner can exercise these only in disposable fixtures; no runtime
-- principals acquire EXECUTE or INSERT/UPDATE/SELECT via this migration.
revoke all on function public.internal_claim_official_reader_cancel_work_v1(text,integer) from public;
revoke all on function public.internal_complete_official_reader_cancel_work_v1(uuid,text,uuid) from public;
revoke all on function public.internal_fail_official_reader_cancel_work_v1(uuid,text,uuid,text,boolean) from public;

do $d3e5_role_fence$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_claim_official_reader_cancel_work_v1(text,integer) from %I',v_role);
    execute pg_catalog.format(
      'revoke all on function public.internal_complete_official_reader_cancel_work_v1(uuid,text,uuid) from %I',v_role);
    execute pg_catalog.format(
      'revoke all on function public.internal_fail_official_reader_cancel_work_v1(uuid,text,uuid,text,boolean) from %I',v_role);
    execute pg_catalog.format(
      'revoke all on table public.official_reader_portone_cancel_ingress_inbox_v1 from %I',v_role);
    if pg_catalog.has_function_privilege(v_role,
      'public.internal_claim_official_reader_cancel_work_v1(text,integer)','EXECUTE')
      or pg_catalog.has_function_privilege(v_role,
      'public.internal_complete_official_reader_cancel_work_v1(uuid,text,uuid)','EXECUTE')
      or pg_catalog.has_function_privilege(v_role,
      'public.internal_fail_official_reader_cancel_work_v1(uuid,text,uuid,text,boolean)','EXECUTE')
    then
      raise exception using errcode='42501',
        message='D3e5 private worker function became reachable by runtime';
    end if;
  end loop;
end
$d3e5_role_fence$;

comment on function public.internal_claim_official_reader_cancel_work_v1(text,integer)
is 'D3e5 private DB owner only. SKIP LOCKED lease fencing; MAX 8 attempts; no refunds, entitlements or runtime grants.';
comment on function public.internal_complete_official_reader_cancel_work_v1(uuid,text,uuid)
is 'D3e5 observation-only same-tx completion after 1860 verified shadow. Held if ordering ambiguous.';
comment on function public.internal_fail_official_reader_cancel_work_v1(uuid,text,uuid,text,boolean)
is 'D3e5 private retry/hold/dead-letter with bounded codes; no user text or payload retention.';
