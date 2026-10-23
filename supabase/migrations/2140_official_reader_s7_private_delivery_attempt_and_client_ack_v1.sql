-- S7 PRIVATE paid Reader delivery accounting. The S5 encrypted-answer commit
-- is independent of transport. "HTTP response prepared" is NOT "delivered".
-- Only an explicitly authenticated client receipt records an acknowledgment.
-- A timeout or lost response leaves a retryable prepared receipt; it cannot
-- rewrite the S5 ciphertext/Chat marker/committed_at.
--
-- Saju Production issuer, Owner Privacy acceptance and S8 public release
-- remain HOLD. No paid-read/ack HTTP route or app SQL EXECUTE is activated.
-- Watchtower-Track: db-authority-core

create table public.official_reader_paid_delivery_attempts_v1 (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  subject_id uuid not null,
  body_id uuid not null,
  thread_id uuid not null,
  safe_message_id uuid not null,
  delivery_request_id uuid not null,
  acknowledgement_token_hash text not null,
  response_prepared_at timestamptz not null default pg_catalog.clock_timestamp(),
  acknowledgement_deadline timestamptz not null,
  client_acknowledged_at timestamptz,
  retention_until timestamptz not null,
  constraint official_reader_s7_body_fk
    foreign key(body_id)
    references public.official_reader_paid_answer_bodies(id) on delete cascade,
  constraint official_reader_s7_subject_fk
    foreign key(subject_id) references public.subjects(id) on delete cascade,
  constraint official_reader_s7_once_per_client_request
    unique (subject_id,body_id,delivery_request_id),
  constraint official_reader_s7_token_digest_shape
    check(acknowledgement_token_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint official_reader_s7_deadline_order
    check(acknowledgement_deadline>response_prepared_at
      and acknowledgement_deadline<=response_prepared_at+interval '24 hours'),
  constraint official_reader_s7_retention_limit
    check(retention_until>response_prepared_at
      and retention_until<=response_prepared_at+interval '90 days'),
  constraint official_reader_s7_ack_order
    check(client_acknowledged_at is null
      or client_acknowledged_at>=response_prepared_at)
);

create index official_reader_s7_delivery_retention_idx
  on public.official_reader_paid_delivery_attempts_v1(retention_until,id);
create index official_reader_s7_delivery_subject_marker_idx
  on public.official_reader_paid_delivery_attempts_v1(
    subject_id,thread_id,safe_message_id,response_prepared_at desc
  );
alter table public.official_reader_paid_delivery_attempts_v1
  enable row level security;
alter table public.official_reader_paid_delivery_attempts_v1
  force row level security;
revoke all on table public.official_reader_paid_delivery_attempts_v1 from public;

do $reader_s7_table_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner','myeongha_system_executor'
    )
  loop
    execute pg_catalog.format(
      'revoke all on table public.official_reader_paid_delivery_attempts_v1 from %I',
      v_role
    );
  end loop;
end
$reader_s7_table_acl$;

-- Invoked ONLY as part of the same Subject+Reader S6 ciphertext transaction,
-- AFTER the current Entitlement lock, Saju source proof, Chat marker, and
-- outside-backup Privacy read lease were checked. Recheck S6 on the SQL side
-- so this function cannot be called as a weaker alternative to that gate.
create or replace function public.internal_prepare_official_reader_paid_delivery_v1(
  p_subject_id uuid,
  p_body_id uuid,
  p_thread_id uuid,
  p_safe_message_id uuid,
  p_delivery_request_id uuid,
  p_acknowledgement_token_hash text
)
returns table (
  delivery_attempt_id uuid,
  response_prepared_at timestamptz,
  already_prepared boolean
)
language plpgsql
volatile security definer
set search_path=pg_catalog,public
as $reader_s7_prepare$
declare
  v_existing public.official_reader_paid_delivery_attempts_v1%rowtype;
  v_created public.official_reader_paid_delivery_attempts_v1%rowtype;
  v_now timestamptz;
begin
  if p_subject_id is null or p_body_id is null
     or p_thread_id is null or p_safe_message_id is null
     or p_delivery_request_id is null
     or p_acknowledgement_token_hash is null
     or p_acknowledgement_token_hash !~ '^sha256:v1:[0-9a-f]{64}$'
     or pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='23514',
      constraint='reader_s7_preparation_invalid',
      message='Paid Reader delivery preparation is unavailable';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- This private S6 function takes the SAME S1 advisory xact lock and
  -- rechecks independent CURRENT verified purchase/Reading/Reader/Bundle,
  -- active Chat marker and unrevoked Saju Production source proof.
  perform 1
  from public.internal_qry_official_reader_paid_answer_ciphertext_v1(
    p_subject_id,p_body_id
  ) current_answer
  where current_answer.body_id=p_body_id
    and current_answer.thread_id=p_thread_id
    and current_answer.safe_message_id=p_safe_message_id;
  if not found then
    raise exception using errcode='P0001',
      constraint='reader_s7_preparation_current_read_denied',
      message='Paid Reader delivery is unavailable';
  end if;

  v_now:=pg_catalog.clock_timestamp();

  insert into public.official_reader_paid_delivery_attempts_v1(
    subject_id,body_id,thread_id,safe_message_id,delivery_request_id,
    acknowledgement_token_hash,response_prepared_at,
    acknowledgement_deadline,retention_until
  ) values (
    p_subject_id,p_body_id,p_thread_id,p_safe_message_id,
    p_delivery_request_id,p_acknowledgement_token_hash,
    v_now,v_now+interval '24 hours',v_now+interval '90 days'
  )
  on conflict on constraint official_reader_s7_once_per_client_request
  do nothing
  returning * into v_created;

  if found then
    return query select v_created.id,v_created.response_prepared_at,false;
    return;
  end if;

  -- Retrying the EXACT client idempotency key returns the original event,
  -- never mutates its timestamps, ciphertext, delivery state, or token hash.
  select d.* into v_existing
  from public.official_reader_paid_delivery_attempts_v1 d
  where d.subject_id=p_subject_id and d.body_id=p_body_id
    and d.delivery_request_id=p_delivery_request_id
    and d.thread_id=p_thread_id and d.safe_message_id=p_safe_message_id
  for update;

  if not found
     or v_existing.acknowledgement_token_hash
        is distinct from p_acknowledgement_token_hash
     or v_existing.acknowledgement_deadline<=v_now then
    raise exception using errcode='23514',
      constraint='reader_s7_idempotency_scope_or_token_changed',
      message='Paid Reader delivery retry cannot change its original receipt';
  end if;

  return query select v_existing.id,v_existing.response_prepared_at,true;
end
$reader_s7_prepare$;

-- Browser/app acknowledgment is a separate event from DB commit and the
-- server's HTTP Response construction. It is NOT proof that a human read the
-- answer, and it does not set chat_turns.delivered_at. A canceled or lost
-- response remains only "prepared"; no fabricated delivery timestamp.
create or replace function public.internal_ack_official_reader_paid_delivery_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_safe_message_id uuid,
  p_delivery_attempt_id uuid,
  p_delivery_request_id uuid,
  p_acknowledgement_token_hash text
)
returns table (
  client_acknowledged_at timestamptz,
  replayed boolean
)
language plpgsql
volatile security definer
set search_path=pg_catalog,public
as $reader_s7_ack$
declare
  v_row public.official_reader_paid_delivery_attempts_v1%rowtype;
  v_now timestamptz;
begin
  if p_subject_id is null or p_thread_id is null
     or p_safe_message_id is null or p_delivery_attempt_id is null
     or p_delivery_request_id is null
     or p_acknowledgement_token_hash is null
     or p_acknowledgement_token_hash !~ '^sha256:v1:[0-9a-f]{64}$'
     or pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='23514',
      constraint='reader_s7_ack_invalid',
      message='Paid Reader delivery acknowledgment is unavailable';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  select d.* into v_row
  from public.official_reader_paid_delivery_attempts_v1 d
  where d.id=p_delivery_attempt_id and d.subject_id=p_subject_id
    and d.thread_id=p_thread_id and d.safe_message_id=p_safe_message_id
    and d.delivery_request_id=p_delivery_request_id
    and d.acknowledgement_token_hash=p_acknowledgement_token_hash
  for update;
  if not found then
    raise exception using errcode='P0001',
      constraint='reader_s7_ack_receipt_not_found',
      message='Paid Reader delivery acknowledgment is unavailable';
  end if;

  v_now:=pg_catalog.clock_timestamp();
  if v_row.client_acknowledged_at is not null then
    return query select v_row.client_acknowledged_at,true;
    return;
  end if;
  if v_now>v_row.acknowledgement_deadline then
    raise exception using errcode='P0001',
      constraint='reader_s7_ack_expired',
      message='Paid Reader delivery acknowledgment has expired';
  end if;

  update public.official_reader_paid_delivery_attempts_v1 d
  set client_acknowledged_at=v_now
  where d.id=v_row.id and d.subject_id=p_subject_id
    and d.client_acknowledged_at is null;

  if not found then
    raise exception using errcode='40001',
      constraint='reader_s7_ack_concurrent_revision',
      message='Paid Reader acknowledgment changed concurrently';
  end if;

  return query select v_now,false;
end
$reader_s7_ack$;

-- Privacy D5: ephemeral, no-content prepared/client-ack records are bounded
-- by 90 days and are deleted sooner when the parent protected answer/account
-- is erased. No source text, response hash, message content or token stored.
create or replace function public.internal_prune_official_reader_paid_delivery_v1(
  p_limit integer
)
returns bigint
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_s7_prune$
declare v_deleted bigint;
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception using errcode='23514',
      constraint='reader_s7_prune_limit_invalid',
      message='Paid Reader delivery retention batch size is invalid';
  end if;
  with expired as (
    select d.id from public.official_reader_paid_delivery_attempts_v1 d
    where d.retention_until<=pg_catalog.clock_timestamp()
    order by d.retention_until,d.id
    for update skip locked limit p_limit
  )
  delete from public.official_reader_paid_delivery_attempts_v1 d
  using expired e where d.id=e.id;
  get diagnostics v_deleted=row_count;
  return v_deleted;
end
$reader_s7_prune$;

revoke all on function public.internal_prepare_official_reader_paid_delivery_v1(
  uuid,uuid,uuid,uuid,uuid,text
) from public;
revoke all on function public.internal_ack_official_reader_paid_delivery_v1(
  uuid,uuid,uuid,uuid,uuid,text
) from public;
revoke all on function public.internal_prune_official_reader_paid_delivery_v1(
  integer
) from public;

do $reader_s7_function_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner','myeongha_system_executor'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_prepare_official_reader_paid_delivery_v1(uuid,uuid,uuid,uuid,uuid,text) from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.internal_ack_official_reader_paid_delivery_v1(uuid,uuid,uuid,uuid,uuid,text) from %I',
      v_role
    );
  end loop;
end
$reader_s7_function_acl$;

-- This pruning authority belongs ONLY to existing private system Worker.
grant execute on function public.internal_prune_official_reader_paid_delivery_v1(integer)
  to myeongha_system_executor;

comment on table public.official_reader_paid_delivery_attempts_v1 is
'S7 private receipt with independent prepared/client_acknowledged timestamps. NEVER claim HTTP construction is delivery. No paid text, text hash, token, broad Analytics/Outbox/Chat/Memory export or runtime access. At most 90 days or parent deletion, whichever comes first. Public release HOLD.';
