-- Provider-neutral Commerce payment-attempt authority.
--
-- This migration fills only the provider-handoff provenance gap between an immutable
-- Purchase Intent and later server-verified Commerce Receipt / Provider Event evidence.
-- A payment attempt is NOT monetary truth, verified payment proof, or entitlement
-- authority. Amount/currency remain pinned exclusively on Purchase Intent v2 and a
-- successful provider verification must still materialize canonical Receipt/Event
-- evidence before any entitlement effect is authorized.
--
-- This migration activates no PSP and performs no network I/O.

create table public.commerce_payment_attempts (
  id uuid primary key,
  purchase_intent_id uuid not null,
  subject_id uuid not null,
  product_offer_id uuid not null,
  attempt_no integer not null,
  provider text not null,
  environment text not null,
  idempotency_key text not null,
  provider_request_id text not null,
  provider_transaction_id text null,
  status text not null,
  failure_code text null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint commerce_payment_attempts_id_subject_unique
    unique (id, subject_id),
  constraint commerce_payment_attempts_intent_attempt_unique
    unique (purchase_intent_id, attempt_no),
  constraint commerce_payment_attempts_intent_idempotency_unique
    unique (purchase_intent_id, idempotency_key),
  constraint commerce_payment_attempts_provider_request_unique
    unique (provider, environment, provider_request_id),
  constraint commerce_payment_attempts_purchase_subject_fk
    foreign key (purchase_intent_id, subject_id)
    references public.purchase_intents(id, subject_id),
  constraint commerce_payment_attempts_product_offer_fk
    foreign key (product_offer_id) references public.product_offers(id),
  constraint commerce_payment_attempts_attempt_no_check
    check (attempt_no > 0),
  constraint commerce_payment_attempts_provider_check
    check (btrim(provider) <> ''),
  constraint commerce_payment_attempts_environment_check
    check (environment in ('sandbox', 'production')),
  constraint commerce_payment_attempts_idempotency_check
    check (btrim(idempotency_key) <> ''),
  constraint commerce_payment_attempts_provider_request_check
    check (btrim(provider_request_id) <> ''),
  constraint commerce_payment_attempts_provider_transaction_check
    check (provider_transaction_id is null or btrim(provider_transaction_id) <> ''),
  constraint commerce_payment_attempts_status_check
    check (status in ('created', 'handed_off', 'response_received', 'failed', 'cancelled')),
  constraint commerce_payment_attempts_failure_shape_check
    check (
      (status = 'failed' and failure_code is not null and btrim(failure_code) <> '')
      or (status <> 'failed' and failure_code is null)
    ),
  constraint commerce_payment_attempts_timestamp_order_check
    check (updated_at >= created_at)
);

create unique index commerce_payment_attempts_provider_transaction_unique
  on public.commerce_payment_attempts(provider, environment, provider_transaction_id)
  where provider_transaction_id is not null;

create index commerce_payment_attempts_subject_created_idx
  on public.commerce_payment_attempts(subject_id, created_at desc);

create index commerce_payment_attempts_intent_created_idx
  on public.commerce_payment_attempts(purchase_intent_id, attempt_no desc);

comment on table public.commerce_payment_attempts is
  'Operational PSP handoff provenance for an immutable Purchase Intent. Never payment verification or entitlement authority.';
comment on column public.commerce_payment_attempts.provider_request_id is
  'Merchant/server-owned identifier supplied to the PSP for this attempt, e.g. a provider order/payment request identifier.';
comment on column public.commerce_payment_attempts.provider_transaction_id is
  'Optional provider-issued payment/transaction identifier learned during handoff. It is provenance only until independently verified into canonical Commerce evidence.';
comment on column public.commerce_payment_attempts.status is
  'Operational handoff state only. response_received does not mean payment verified or paid.';

create or replace function public.tr_commerce_payment_attempt_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_payment_attempt_no_delete',
      message = 'commerce payment-attempt provenance cannot be deleted';
  end if;

  if row(old.id, old.purchase_intent_id, old.subject_id, old.product_offer_id,
         old.attempt_no, old.provider, old.environment, old.idempotency_key,
         old.provider_request_id, old.created_at)
     is distinct from
     row(new.id, new.purchase_intent_id, new.subject_id, new.product_offer_id,
         new.attempt_no, new.provider, new.environment, new.idempotency_key,
         new.provider_request_id, new.created_at) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_payment_attempt_identity_immutable',
      message = 'payment-attempt ownership, provider request identity, and ordinal are immutable';
  end if;

  if old.provider_transaction_id is not null
     and new.provider_transaction_id is distinct from old.provider_transaction_id then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_payment_attempt_provider_transaction_immutable',
      message = 'provider transaction identity cannot be rewritten once recorded';
  end if;

  if old.failure_code is not null
     and new.failure_code is distinct from old.failure_code then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_payment_attempt_failure_immutable',
      message = 'payment-attempt failure code cannot be rewritten once recorded';
  end if;

  if old.status in ('response_received', 'failed', 'cancelled')
     and new is distinct from old then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_payment_attempt_terminal_immutable',
      message = 'terminal payment-attempt handoff provenance cannot be rewritten';
  end if;

  if old.status = 'created'
     and new.status not in ('created', 'handed_off', 'response_received', 'failed', 'cancelled') then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_payment_attempt_transition',
      message = 'invalid payment-attempt transition from created';
  end if;

  if old.status = 'handed_off'
     and new.status not in ('handed_off', 'response_received', 'failed', 'cancelled') then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_payment_attempt_transition',
      message = 'invalid payment-attempt transition from handed_off';
  end if;

  if new.updated_at < old.updated_at then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_payment_attempt_updated_at_monotonic',
      message = 'payment-attempt updated_at cannot move backwards';
  end if;

  return new;
end;
$$;

create trigger tr_commerce_payment_attempt_immutable
  before update or delete on public.commerce_payment_attempts
  for each row execute function public.tr_commerce_payment_attempt_immutable();

create or replace function public.ct_validate_commerce_payment_attempt_authority()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_subject_kind text;
  v_subject_status text;
  v_subject_merged_into uuid;
  v_intent_offer_id uuid;
  v_intent_status text;
  v_expected_amount_minor bigint;
  v_expected_currency text;
  v_charge_terms_version text;
  v_offer_provider text;
begin
  select s.kind, s.status, s.merged_into_subject_id
    into v_subject_kind, v_subject_status, v_subject_merged_into
  from public.subjects s
  where s.id = new.subject_id;

  if v_subject_kind not in ('guest', 'member')
     or v_subject_status is distinct from 'active'
     or v_subject_merged_into is not null then
    raise exception using
      errcode = '23514',
      constraint = 'ct_commerce_payment_attempt_active_canonical_subject',
      message = 'payment attempt requires an active canonical Guest or Member subject';
  end if;

  select pi.product_offer_id,
         pi.status,
         pi.expected_amount_minor,
         pi.expected_currency,
         pi.charge_terms_version
    into v_intent_offer_id,
         v_intent_status,
         v_expected_amount_minor,
         v_expected_currency,
         v_charge_terms_version
  from public.purchase_intents pi
  where pi.id = new.purchase_intent_id
    and pi.subject_id = new.subject_id;

  if not found then
    raise exception using
      errcode = '23514',
      constraint = 'ct_commerce_payment_attempt_purchase_intent',
      message = 'payment attempt requires an owner-matched Purchase Intent';
  end if;

  if v_intent_offer_id is distinct from new.product_offer_id then
    raise exception using
      errcode = '23514',
      constraint = 'ct_commerce_payment_attempt_offer_mapping',
      message = 'payment-attempt product offer must equal the immutable Purchase Intent offer';
  end if;

  if v_intent_status not in ('created', 'pending') then
    raise exception using
      errcode = '23514',
      constraint = 'ct_commerce_payment_attempt_intent_state',
      message = 'new payment attempts require a non-terminal Purchase Intent';
  end if;

  if v_expected_amount_minor is null
     or v_expected_currency is null
     or v_charge_terms_version is null then
    raise exception using
      errcode = '23514',
      constraint = 'ct_commerce_payment_attempt_pinned_charge_terms',
      message = 'payment attempt requires Purchase Intent v2 pinned charge terms';
  end if;

  select po.provider into v_offer_provider
  from public.product_offers po
  where po.id = new.product_offer_id;

  if v_offer_provider is distinct from new.provider then
    raise exception using
      errcode = '23514',
      constraint = 'ct_commerce_payment_attempt_provider_mapping',
      message = 'payment-attempt provider must match the immutable Product Offer mapping';
  end if;

  return new;
end;
$$;

create constraint trigger ct_commerce_payment_attempt_authority
  after insert on public.commerce_payment_attempts
  deferrable initially immediate
  for each row execute function public.ct_validate_commerce_payment_attempt_authority();

create or replace function public.cmd_create_payment_attempt_v1(
  p_subject_id uuid,
  p_payment_attempt_id uuid,
  p_purchase_intent_id uuid,
  p_environment text,
  p_idempotency_key text,
  p_provider_request_id text
)
returns table (
  payment_attempt_id uuid,
  purchase_intent_id uuid,
  product_offer_id uuid,
  attempt_no integer,
  provider text,
  environment text,
  provider_request_id text,
  provider_transaction_id text,
  status text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_existing public.commerce_payment_attempts%rowtype;
  v_intent_offer_id uuid;
  v_intent_status text;
  v_expected_amount_minor bigint;
  v_expected_currency text;
  v_charge_terms_version text;
  v_provider text;
  v_attempt_no integer;
  v_now timestamptz;
begin
  if p_subject_id is null or p_payment_attempt_id is null or p_purchase_intent_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_v1_ids_required',
      message = 'subject, payment-attempt id, and Purchase Intent id are required';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_environment not in ('sandbox', 'production') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_v1_environment',
      message = 'payment-attempt environment must be sandbox or production';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_v1_idempotency_required',
      message = 'payment-attempt idempotency key is required';
  end if;

  if p_provider_request_id is null or btrim(p_provider_request_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_v1_provider_request_required',
      message = 'provider request identifier is required';
  end if;

  -- Fast replay path. Replays remain resolvable after the parent Purchase Intent later
  -- reaches a terminal state because the original attempt identity is already pinned.
  select cpa.* into v_existing
  from public.commerce_payment_attempts cpa
  where cpa.purchase_intent_id = p_purchase_intent_id
    and cpa.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.subject_id is distinct from p_subject_id
       or v_existing.environment is distinct from p_environment
       or v_existing.provider_request_id is distinct from p_provider_request_id then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_payment_attempt_v1_idempotency_conflict',
        message = 'payment-attempt idempotency key already exists with different request identity';
    end if;

    return query
      select v_existing.id,
             v_existing.purchase_intent_id,
             v_existing.product_offer_id,
             v_existing.attempt_no,
             v_existing.provider,
             v_existing.environment,
             v_existing.provider_request_id,
             v_existing.provider_transaction_id,
             v_existing.status,
             true;
    return;
  end if;

  -- Serialize attempt ordinal allocation and eligibility checks on the immutable
  -- Purchase Intent. This prevents concurrent retries from sharing an ordinal.
  select pi.product_offer_id,
         pi.status,
         pi.expected_amount_minor,
         pi.expected_currency,
         pi.charge_terms_version
    into v_intent_offer_id,
         v_intent_status,
         v_expected_amount_minor,
         v_expected_currency,
         v_charge_terms_version
  from public.purchase_intents pi
  where pi.id = p_purchase_intent_id
    and pi.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_payment_attempt_v1_intent_not_found',
      message = 'owner-matched Purchase Intent was not found';
  end if;

  -- A concurrent caller may have committed the same logical attempt while this call
  -- waited on the parent row lock. Re-read under the serialized parent boundary so
  -- identical retries replay instead of surfacing a uniqueness error.
  select cpa.* into v_existing
  from public.commerce_payment_attempts cpa
  where cpa.purchase_intent_id = p_purchase_intent_id
    and cpa.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.subject_id is distinct from p_subject_id
       or v_existing.environment is distinct from p_environment
       or v_existing.provider_request_id is distinct from p_provider_request_id then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_payment_attempt_v1_idempotency_conflict',
        message = 'payment-attempt idempotency key already exists with different request identity';
    end if;

    return query
      select v_existing.id,
             v_existing.purchase_intent_id,
             v_existing.product_offer_id,
             v_existing.attempt_no,
             v_existing.provider,
             v_existing.environment,
             v_existing.provider_request_id,
             v_existing.provider_transaction_id,
             v_existing.status,
             true;
    return;
  end if;

  if v_intent_status not in ('created', 'pending') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_v1_intent_terminal',
      message = 'new payment attempts require a non-terminal Purchase Intent';
  end if;

  if v_expected_amount_minor is null
     or v_expected_currency is null
     or v_charge_terms_version is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_v1_charge_terms_missing',
      message = 'payment attempt requires Purchase Intent v2 pinned charge terms';
  end if;

  select po.provider into v_provider
  from public.product_offers po
  where po.id = v_intent_offer_id;

  if not found or v_provider is null or btrim(v_provider) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_v1_provider_missing',
      message = 'Purchase Intent offer must resolve to an immutable provider mapping';
  end if;

  select coalesce(max(cpa.attempt_no), 0) + 1
    into v_attempt_no
  from public.commerce_payment_attempts cpa
  where cpa.purchase_intent_id = p_purchase_intent_id;

  v_now := clock_timestamp();

  insert into public.commerce_payment_attempts(
    id,
    purchase_intent_id,
    subject_id,
    product_offer_id,
    attempt_no,
    provider,
    environment,
    idempotency_key,
    provider_request_id,
    provider_transaction_id,
    status,
    failure_code,
    created_at,
    updated_at
  ) values (
    p_payment_attempt_id,
    p_purchase_intent_id,
    p_subject_id,
    v_intent_offer_id,
    v_attempt_no,
    v_provider,
    p_environment,
    p_idempotency_key,
    p_provider_request_id,
    null,
    'created',
    null,
    v_now,
    v_now
  );

  return query
    select p_payment_attempt_id,
           p_purchase_intent_id,
           v_intent_offer_id,
           v_attempt_no,
           v_provider,
           p_environment,
           p_provider_request_id,
           null::text,
           'created'::text,
           false;
end;
$$;

create or replace function public.cmd_transition_payment_attempt_v1(
  p_subject_id uuid,
  p_payment_attempt_id uuid,
  p_target_status text,
  p_provider_transaction_id text,
  p_failure_code text
)
returns table (
  payment_attempt_id uuid,
  purchase_intent_id uuid,
  attempt_no integer,
  provider text,
  environment text,
  provider_request_id text,
  provider_transaction_id text,
  status text,
  failure_code text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_attempt public.commerce_payment_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null or p_payment_attempt_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_transition_ids_required',
      message = 'subject and payment-attempt id are required';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_target_status not in ('handed_off', 'response_received', 'failed', 'cancelled') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_transition_target',
      message = 'unsupported payment-attempt target state';
  end if;

  if p_provider_transaction_id is not null and btrim(p_provider_transaction_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_transition_transaction_id',
      message = 'provider transaction identifier cannot be blank';
  end if;

  if p_target_status = 'failed' then
    if p_failure_code is null or btrim(p_failure_code) = '' then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_payment_attempt_transition_failure_code',
        message = 'failed payment attempt requires a non-empty failure code';
    end if;
  elsif p_failure_code is not null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_transition_failure_shape',
      message = 'failure code is accepted only for failed payment attempts';
  end if;

  select cpa.* into v_attempt
  from public.commerce_payment_attempts cpa
  where cpa.id = p_payment_attempt_id
    and cpa.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_payment_attempt_transition_not_found',
      message = 'owner-matched payment attempt was not found';
  end if;

  -- Exact replay is a no-op. This keeps provider callbacks/runtime retries idempotent
  -- without permitting a terminal row to be rewritten.
  if v_attempt.status = p_target_status then
    if v_attempt.provider_transaction_id is distinct from p_provider_transaction_id
       or v_attempt.failure_code is distinct from p_failure_code then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_payment_attempt_transition_replay_conflict',
        message = 'payment-attempt transition replay does not match stored provenance';
    end if;

    return query
      select v_attempt.id,
             v_attempt.purchase_intent_id,
             v_attempt.attempt_no,
             v_attempt.provider,
             v_attempt.environment,
             v_attempt.provider_request_id,
             v_attempt.provider_transaction_id,
             v_attempt.status,
             v_attempt.failure_code;
    return;
  end if;

  if v_attempt.status = 'created'
     and p_target_status not in ('handed_off', 'response_received', 'failed', 'cancelled') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_transition_state',
      message = 'invalid payment-attempt transition from created';
  end if;

  if v_attempt.status = 'handed_off'
     and p_target_status not in ('response_received', 'failed', 'cancelled') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_transition_state',
      message = 'invalid payment-attempt transition from handed_off';
  end if;

  if v_attempt.status in ('response_received', 'failed', 'cancelled') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_transition_terminal',
      message = 'terminal payment-attempt handoff state cannot transition';
  end if;

  if v_attempt.provider_transaction_id is not null
     and v_attempt.provider_transaction_id is distinct from p_provider_transaction_id then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_payment_attempt_transition_transaction_conflict',
      message = 'provider transaction identity cannot be rewritten once recorded';
  end if;

  update public.commerce_payment_attempts cpa
  set status = p_target_status,
      provider_transaction_id = p_provider_transaction_id,
      failure_code = p_failure_code,
      updated_at = v_now
  where cpa.id = v_attempt.id;

  return query
    select cpa.id,
           cpa.purchase_intent_id,
           cpa.attempt_no,
           cpa.provider,
           cpa.environment,
           cpa.provider_request_id,
           cpa.provider_transaction_id,
           cpa.status,
           cpa.failure_code
    from public.commerce_payment_attempts cpa
    where cpa.id = v_attempt.id;
end;
$$;

-- This is server-runtime authority, not a public Supabase Data API surface. The
-- dedicated API executor may invoke commands but receives no direct table rights.
revoke all on table public.commerce_payment_attempts from public;
revoke all on function public.cmd_create_payment_attempt_v1(
  uuid, uuid, uuid, text, text, text
) from public;
revoke all on function public.cmd_transition_payment_attempt_v1(
  uuid, uuid, text, text, text
) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'myeongha_api_executor')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on table public.commerce_payment_attempts from %I',
      v_role
    );
  END LOOP;

  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.cmd_create_payment_attempt_v1(uuid,uuid,uuid,text,text,text) from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on function public.cmd_transition_payment_attempt_v1(uuid,uuid,text,text,text) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.cmd_create_payment_attempt_v1(
  uuid, uuid, uuid, text, text, text
) to myeongha_api_executor;

grant execute on function public.cmd_transition_payment_attempt_v1(
  uuid, uuid, text, text, text
) to myeongha_api_executor;
