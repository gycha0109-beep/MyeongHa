-- D3e8 PRIVATE, SANDBOX-ONLY dual-signature operator preflight.
-- Structural DB fence for independently verified Ed25519 attestations in TS.
-- SECURITY INVOKER, owner-only fixture. No execution roles, network, provider
-- refund, entitlement effect, live identity/key registration or automatic purge.
--
-- IMPORTANT: SQL does NOT cryptographically verify Ed25519 signatures. Only
-- trusted, explicitly injected offline verifier may call this candidate.
-- The legacy D3e6 DB-owner function still exists; production authorization
-- requires execution-identity segregation and blocking that bypass.

create table public.official_reader_cancel_review_approval_v1 (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  inbox_id uuid not null references
    public.official_reader_portone_cancel_ingress_inbox_v1(id) on delete cascade,
  review_id uuid not null unique references
    public.official_reader_portone_cancel_ops_review_v1(id) on delete cascade,
  challenge_id uuid not null unique,
  action text not null check (action in ('acknowledge','retry_transient')),
  ticket_reference text not null
    check (ticket_reference ~ '^OPS-[0-9]{4,12}$'),
  requester_key_id text not null
    check (requester_key_id ~ '^key_[a-z0-9_]{6,32}$'),
  approver_key_id text not null
    check (approver_key_id ~ '^key_[a-z0-9_]{6,32}$'),
  requester_principal_id text not null
    check (requester_principal_id ~ '^op_[a-z0-9_]{6,32}$'),
  approver_principal_id text not null
    check (approver_principal_id ~ '^op_[a-z0-9_]{6,32}$'),
  statement_digest text not null
    check (statement_digest ~ '^sha256:[a-f0-9]{64}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  authorized_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint official_reader_cancel_review_distinct_keys_v1
    check (requester_key_id<>approver_key_id),
  constraint official_reader_cancel_review_distinct_people_v1
    check (requester_principal_id<>approver_principal_id),
  constraint official_reader_cancel_review_short_lived_v1
    check (expires_at>issued_at and expires_at<=issued_at+interval '10 minutes')
);

create index official_reader_cancel_review_approval_inbox_v1_idx
  on public.official_reader_cancel_review_approval_v1(inbox_id,authorized_at);
alter table public.official_reader_cancel_review_approval_v1
  enable row level security;
revoke all on public.official_reader_cancel_review_approval_v1 from public;

create function public.internal_private_cancel_commit_review_approval_v1(
  p_inbox_id uuid,
  p_action text,
  p_ticket_reference text,
  p_challenge_id uuid,
  p_issued_at timestamptz,
  p_expires_at timestamptz,
  p_requester_key_id text,
  p_approver_key_id text,
  p_requester_principal_id text,
  p_approver_principal_id text,
  p_statement_digest text
)
returns table (
  review_state text,
  authorization_receipt_id uuid,
  effect_authorized boolean
)
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $d3e8_commit$
declare
  v_now timestamptz;
  v_env text;
  v_state text;
  v_review_id uuid;
  v_approval_id uuid;
begin
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',
      message='Private signed cancellation review requires READ COMMITTED';
  end if;
  if p_inbox_id is null or p_challenge_id is null
    or p_action is null or p_action not in ('acknowledge','retry_transient')
    or p_ticket_reference is null
    or p_ticket_reference !~ '^OPS-[0-9]{4,12}$'
    or p_requester_key_id is null
    or p_requester_key_id !~ '^key_[a-z0-9_]{6,32}$'
    or p_approver_key_id is null
    or p_approver_key_id !~ '^key_[a-z0-9_]{6,32}$'
    or p_requester_key_id=p_approver_key_id
    or p_requester_principal_id is null
    or p_requester_principal_id !~ '^op_[a-z0-9_]{6,32}$'
    or p_approver_principal_id is null
    or p_approver_principal_id !~ '^op_[a-z0-9_]{6,32}$'
    or p_requester_principal_id=p_approver_principal_id
    or p_statement_digest is null
    or p_statement_digest !~ '^sha256:[a-f0-9]{64}$'
  then
    raise exception using errcode='23514',
      constraint='d3e8_invalid_review_attestations',
      message='Private signed cancellation review requires distinct typed trusted signers';
  end if;

  -- Locks the actual temporary work row and samples clock AFTER lock.
  -- The signed TS statement is sandbox-only, short lived and action-specific.
  select i.environment into v_env
  from public.official_reader_portone_cancel_ingress_inbox_v1 i
  where i.id=p_inbox_id for update;
  v_now:=pg_catalog.clock_timestamp();
  if not found or v_env<>'sandbox'
    or p_issued_at is null or p_expires_at is null
    or p_issued_at>v_now+interval '30 seconds'
    or p_issued_at<v_now-interval '10 minutes'
    or p_expires_at<=v_now
    or p_expires_at<=p_issued_at
    or p_expires_at>p_issued_at+interval '10 minutes'
  then
    raise exception using errcode='55000',
      constraint='d3e8_review_expired_or_non_sandbox',
      message='Private signed cancellation review is expired or outside sandbox';
  end if;

  -- Prevent challenge reuse, even across multiple inbox rows/tickets.
  -- Row lock and nonce uniqueness hold through the next D3e6 review.
  if exists (
    select 1 from public.official_reader_cancel_review_approval_v1
    where challenge_id=p_challenge_id
  ) then
    raise exception using errcode='55000',
      constraint='d3e8_challenge_replayed',
      message='Private cancellation approval challenge has already been used';
  end if;

  select r.review_state into v_state
  from public.internal_private_cancel_review_v1(
    p_inbox_id,p_action,p_ticket_reference
  ) r;
  if not found then
    raise exception using errcode='55000',
      message='D3e6 review did not return a state';
  end if;
  if (p_action='retry_transient' and v_state<>'queued')
    or (p_action='acknowledge' and v_state not in ('held','dead_letter')) then
    raise exception using errcode='23514',
      message='D3e8 review has a mismatched D3e6 outcome';
  end if;

  select r.id into strict v_review_id
  from public.official_reader_portone_cancel_ops_review_v1 r
  where r.inbox_id=p_inbox_id
    and r.action=p_action and r.ticket_reference=p_ticket_reference;

  insert into public.official_reader_cancel_review_approval_v1 (
    inbox_id,review_id,challenge_id,action,ticket_reference,
    requester_key_id,approver_key_id,
    requester_principal_id,approver_principal_id,
    statement_digest,issued_at,expires_at
  ) values (
    p_inbox_id,v_review_id,p_challenge_id,p_action,p_ticket_reference,
    p_requester_key_id,p_approver_key_id,
    p_requester_principal_id,p_approver_principal_id,
    p_statement_digest,p_issued_at,p_expires_at
  )
  returning id into v_approval_id;

  return query select v_state,v_approval_id,false;
end
$d3e8_commit$;

revoke all on function public.internal_private_cancel_commit_review_approval_v1(
  uuid,text,text,uuid,timestamptz,timestamptz,
  text,text,text,text,text
) from public;

do $d3e8_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner'
    )
  loop
    execute pg_catalog.format(
      'revoke all on public.official_reader_cancel_review_approval_v1 from %I',
      v_role);
    execute pg_catalog.format(
      'revoke all on function public.internal_private_cancel_commit_review_approval_v1(uuid,text,text,uuid,timestamptz,timestamptz,text,text,text,text,text) from %I',
      v_role);
    if pg_catalog.has_table_privilege(v_role,
      'public.official_reader_cancel_review_approval_v1','SELECT')
      or pg_catalog.has_function_privilege(v_role,
      'public.internal_private_cancel_commit_review_approval_v1(uuid,text,text,uuid,timestamptz,timestamptz,text,text,text,text,text)',
      'EXECUTE') then
      raise exception using errcode='42501',
        message='Private signed cancellation review is reachable by runtime';
    end if;
  end loop;
end
$d3e8_acl$;

comment on table public.official_reader_cancel_review_approval_v1
is 'D3e8 temporary approval reference; pseudonymous key/principal IDs (personal data), digest only, ON DELETE CASCADE with private inbox. No signing keys or raw signatures. NOT statutory P5Y evidence.';
comment on function public.internal_private_cancel_commit_review_approval_v1(
  uuid,text,text,uuid,timestamptz,timestamptz,text,text,text,text,text
) is 'D3e8 owner-only sandbox signed-preflight commit; trusts verified TS caller, not public or production authority. No effect authorization.';
