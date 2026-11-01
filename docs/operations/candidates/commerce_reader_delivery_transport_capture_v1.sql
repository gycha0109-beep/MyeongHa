-- Commerce P4: internal, non-deployed delivery transport evidence candidate.
-- This SQL is intentionally NOT a production migration.
-- The approved account-deletion disposition and final Reader S7/R2 gate must be
-- extended before any runtime can execute it. It is not legal delivery proof.
begin;

create table public.commerce_reader_delivery_preparations_v1 (
  delivery_attempt_id uuid primary key,
  purchase_intent_id uuid not null,
  subject_id uuid not null,
  entitlement_grant_id uuid not null,
  official_reading_id uuid not null,
  reader_character_id text not null,
  reader_content_bundle_id uuid not null,
  protected_body_id uuid not null,
  safe_message_id uuid not null,
  ack_challenge_hmac text not null,
  response_prepared_at timestamptz not null default clock_timestamp(),
  constraint commerce_reader_delivery_preparations_intent_subject_fk
    foreign key (purchase_intent_id, subject_id)
    references public.purchase_intents(id, subject_id),
  constraint commerce_reader_delivery_preparations_access_fk
    foreign key (purchase_intent_id)
    references public.standard_reading_reader_access_grants(purchase_intent_id),
  constraint commerce_reader_delivery_preparations_grant_fk
    foreign key (entitlement_grant_id)
    references public.entitlement_grants(id),
  constraint commerce_reader_delivery_preparations_reading_subject_fk
    foreign key (official_reading_id, subject_id)
    references public.standard_reading_official_bindings(reading_id, subject_id),
  constraint commerce_reader_delivery_preparations_hmac_chk
    check (ack_challenge_hmac ~ '^hmac-sha256:k[0-9]+:[0-9a-f]{64}$'),
  constraint commerce_reader_delivery_preparations_reader_chk
    check (length(btrim(reader_character_id)) between 1 and 160),
  constraint commerce_reader_delivery_preparations_retry_unique
    unique (purchase_intent_id, subject_id, safe_message_id)
);

create table public.commerce_reader_delivery_client_acks_v1 (
  delivery_attempt_id uuid primary key
    references public.commerce_reader_delivery_preparations_v1(delivery_attempt_id),
  subject_id uuid not null references public.subjects(id),
  client_acknowledged_at timestamptz not null default clock_timestamp()
);

create function public.internal_prepare_reader_delivery_transport_v1(
  p_delivery_attempt_id uuid,
  p_purchase_intent_id uuid,
  p_subject_id uuid,
  p_entitlement_grant_id uuid,
  p_official_reading_id uuid,
  p_reader_character_id text,
  p_reader_content_bundle_id uuid,
  p_protected_body_id uuid,
  p_safe_message_id uuid,
  p_ack_challenge_hmac text
) returns table (delivery_attempt_id uuid, response_prepared_at timestamptz)
language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare v_preparation public.commerce_reader_delivery_preparations_v1%rowtype;
begin
  if p_delivery_attempt_id is null or p_purchase_intent_id is null
     or p_subject_id is null or p_entitlement_grant_id is null
     or p_official_reading_id is null or p_reader_content_bundle_id is null
     or p_protected_body_id is null or p_safe_message_id is null
     or p_reader_character_id is null
     or p_ack_challenge_hmac is null then
    raise exception 'reader delivery transport identity missing' using errcode='23514';
  end if;

  -- Require the exact verified paid Reader purchase and currently active
  -- independent Grant. The original official Reading must be committed.
  insert into public.commerce_reader_delivery_preparations_v1 (
    delivery_attempt_id,purchase_intent_id,subject_id,entitlement_grant_id,
    official_reading_id,reader_character_id,reader_content_bundle_id,
    protected_body_id,safe_message_id,ack_challenge_hmac
  )
  select p_delivery_attempt_id,p_purchase_intent_id,p_subject_id,
    p_entitlement_grant_id,p_official_reading_id,p_reader_character_id,
    p_reader_content_bundle_id,p_protected_body_id,p_safe_message_id,
    p_ack_challenge_hmac
  from public.standard_reading_reader_access_grants a
  join public.purchase_intents pi
    on pi.id=a.purchase_intent_id and pi.subject_id=a.subject_id
   and pi.status='verified'
  join public.entitlement_grants g
    on g.id=a.entitlement_grant_id and g.subject_id=a.subject_id
   and g.grant_source_type='purchase' and g.status='active'
   and g.valid_from <= clock_timestamp()
   and (g.valid_until is null or g.valid_until > clock_timestamp())
  join public.standard_reading_official_bindings binding
    on binding.reading_id=a.official_reading_id
   and binding.subject_id=a.subject_id
  join public.readings r
    on r.id=binding.reading_id and r.subject_id=binding.subject_id
   and r.reading_session_id=binding.reading_session_id
   and r.execution_status='succeeded'
   and r.committed_execution_attempt_id is not null
   and r.completed_at is not null
  join public.reading_refs ref
    on ref.reading_id=r.id and ref.subject_id=r.subject_id
   and ref.execution_attempt_id=r.committed_execution_attempt_id
   and ref.product_response_state in ('delivered','delivered_with_fallback')
  where a.purchase_intent_id=p_purchase_intent_id
    and a.subject_id=p_subject_id
    and a.entitlement_grant_id=p_entitlement_grant_id
    and a.official_reading_id=p_official_reading_id
    and a.reader_character_id=p_reader_character_id
    and a.reader_content_bundle_id=p_reader_content_bundle_id
  on conflict (delivery_attempt_id) do nothing;

  select * into v_preparation
    from public.commerce_reader_delivery_preparations_v1 d
   where d.delivery_attempt_id=p_delivery_attempt_id;
  if not found
    or row(v_preparation.purchase_intent_id,v_preparation.subject_id,
      v_preparation.entitlement_grant_id,v_preparation.official_reading_id,
      v_preparation.reader_character_id,v_preparation.reader_content_bundle_id,
      v_preparation.protected_body_id,v_preparation.safe_message_id,
      v_preparation.ack_challenge_hmac)
    is distinct from
      row(p_purchase_intent_id,p_subject_id,p_entitlement_grant_id,
        p_official_reading_id,p_reader_character_id,p_reader_content_bundle_id,
        p_protected_body_id,p_safe_message_id,p_ack_challenge_hmac)
  then
    raise exception 'reader delivery transport purchase or replay mismatch' using errcode='23514';
  end if;

  -- A duplicate deliveryAttemptId is not allowed to replay a previously
  -- prepared receipt after the purchased Grant has been revoked.
  if not exists (
    select 1 from public.standard_reading_reader_access_grants a
    join public.purchase_intents pi on pi.id=a.purchase_intent_id
      and pi.subject_id=a.subject_id and pi.status='verified'
    join public.entitlement_grants g on g.id=a.entitlement_grant_id
      and g.subject_id=a.subject_id and g.status='active'
      and g.grant_source_type='purchase'
      and g.valid_from <= clock_timestamp()
      and (g.valid_until is null or g.valid_until > clock_timestamp())
    where a.purchase_intent_id=v_preparation.purchase_intent_id
      and a.subject_id=v_preparation.subject_id
      and a.entitlement_grant_id=v_preparation.entitlement_grant_id
      and a.official_reading_id=v_preparation.official_reading_id
      and a.reader_character_id=v_preparation.reader_character_id
      and a.reader_content_bundle_id=v_preparation.reader_content_bundle_id
  ) then
    raise exception 'reader delivery entitlement no longer active' using errcode='23514';
  end if;

  -- Preparation is an internal server event, not successful HTTP send.
  delivery_attempt_id := v_preparation.delivery_attempt_id;
  response_prepared_at := v_preparation.response_prepared_at;
  return next;
end;
$$;

create function public.internal_ack_reader_delivery_transport_v1(
  p_delivery_attempt_id uuid,
  p_subject_id uuid,
  p_challenge_hmac text
) returns table (client_acknowledged_at timestamptz)
language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare
  v_preparation public.commerce_reader_delivery_preparations_v1%rowtype;
  v_ack public.commerce_reader_delivery_client_acks_v1%rowtype;
begin
  select * into v_preparation
    from public.commerce_reader_delivery_preparations_v1 d
   where d.delivery_attempt_id=p_delivery_attempt_id for update;
  if not found or p_subject_id is distinct from v_preparation.subject_id
     or p_challenge_hmac is distinct from v_preparation.ack_challenge_hmac then
    raise exception 'reader delivery client acknowledgment unavailable' using errcode='23514';
  end if;
  -- An ACK received after the exact purchased Reader grant was revoked
  -- cannot be newly recorded as current access.
  if not exists (
    select 1 from public.standard_reading_reader_access_grants a
    join public.entitlement_grants g on g.id=a.entitlement_grant_id
      and g.subject_id=a.subject_id
    where a.purchase_intent_id=v_preparation.purchase_intent_id
      and a.subject_id=v_preparation.subject_id
      and a.entitlement_grant_id=v_preparation.entitlement_grant_id
      and a.official_reading_id=v_preparation.official_reading_id
      and a.reader_character_id=v_preparation.reader_character_id
      and a.reader_content_bundle_id=v_preparation.reader_content_bundle_id
      and g.status='active' and g.valid_from <= clock_timestamp()
      and (g.valid_until is null or g.valid_until > clock_timestamp())
  ) then
    raise exception 'reader delivery entitlement no longer active' using errcode='23514';
  end if;
  insert into public.commerce_reader_delivery_client_acks_v1(delivery_attempt_id,subject_id)
  values (p_delivery_attempt_id,p_subject_id)
  on conflict (delivery_attempt_id) do nothing;
  select * into v_ack from public.commerce_reader_delivery_client_acks_v1 a
    where a.delivery_attempt_id=p_delivery_attempt_id;
  if not found or v_ack.subject_id is distinct from p_subject_id then
    raise exception 'reader delivery acknowledgment replay mismatch' using errcode='23514';
  end if;
  client_acknowledged_at := v_ack.client_acknowledged_at;
  return next;
end;
$$;

revoke all on table public.commerce_reader_delivery_preparations_v1 from public;
revoke all on table public.commerce_reader_delivery_client_acks_v1 from public;
revoke all on function public.internal_prepare_reader_delivery_transport_v1(
  uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text) from public;
revoke all on function public.internal_ack_reader_delivery_transport_v1(
  uuid,uuid,text) from public;
do $$
declare v_role text;
begin
  foreach v_role in array array['anon','authenticated','service_role',
    'myeongha_api_executor','myeongha_worker_runtime',
    'myeongha_commerce_internal_executor'] loop
    if exists(select 1 from pg_catalog.pg_roles where rolname=v_role) then
      execute pg_catalog.format(
        'revoke all on table public.commerce_reader_delivery_preparations_v1 from %I',v_role);
      execute pg_catalog.format(
        'revoke all on table public.commerce_reader_delivery_client_acks_v1 from %I',v_role);
      execute pg_catalog.format(
        'revoke all on function public.internal_prepare_reader_delivery_transport_v1(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text) from %I',v_role);
      execute pg_catalog.format(
        'revoke all on function public.internal_ack_reader_delivery_transport_v1(uuid,uuid,text) from %I',v_role);
    end if;
  end loop;
end $$;
commit;
