-- Provider-originated composition of provider-neutral Commerce payment verification context.
--
-- Provider ingress/reconciliation must not impersonate a user subject merely to reuse
-- the ordinary subject-bound Commerce executor. This migration introduces a dedicated
-- internal Commerce execution role and a narrow SECURITY DEFINER resolver that derives
-- one verification context only from persisted provider identity and Purchase Intent v2
-- authority.
--
-- This migration performs no provider I/O and creates no Receipt, Provider Event,
-- Entitlement Grant/Event, or effective Entitlement.

DO $$
DECLARE
  v_role record;
  v_role_oid oid;
  v_role_marker text;
  v_expected_marker constant text := 'myeongha:commerce-internal-executor:v1';
BEGIN
  SELECT
    oid,
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolinherit,
    rolreplication,
    rolbypassrls
  INTO v_role
  FROM pg_catalog.pg_roles
  WHERE rolname = 'myeongha_commerce_internal_executor';

  IF NOT FOUND THEN
    CREATE ROLE myeongha_commerce_internal_executor
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;

    COMMENT ON ROLE myeongha_commerce_internal_executor IS
      'myeongha:commerce-internal-executor:v1';
  ELSE
    v_role_oid := v_role.oid;
    v_role_marker := pg_catalog.shobj_description(v_role_oid, 'pg_authid');

    IF v_role_marker IS DISTINCT FROM v_expected_marker THEN
      RAISE EXCEPTION 'myeongha_commerce_internal_executor exists without the managed Commerce execution marker';
    END IF;

    IF v_role.rolcanlogin
       OR v_role.rolsuper
       OR v_role.rolcreatedb
       OR v_role.rolcreaterole
       OR v_role.rolinherit
       OR v_role.rolreplication
       OR v_role.rolbypassrls THEN
      RAISE EXCEPTION 'myeongha_commerce_internal_executor does not satisfy the internal Commerce execution-role contract';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'myeongha_runtime'
  ) THEN
    RAISE EXCEPTION 'myeongha_runtime must exist before provisioning internal Commerce execution';
  END IF;

  GRANT myeongha_commerce_internal_executor TO myeongha_runtime;

  IF NOT pg_catalog.pg_has_role(
    'myeongha_runtime',
    'myeongha_commerce_internal_executor',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'myeongha_runtime cannot enter myeongha_commerce_internal_executor';
  END IF;
END
$$;

create or replace function public.qry_commerce_provider_payment_verification_context_v1(
  p_provider text,
  p_environment text,
  p_provider_request_id text,
  p_provider_transaction_id text
)
returns table (
  payment_attempt_id uuid,
  resolved_subject_id uuid,
  purchase_intent_id uuid,
  provider text,
  platform text,
  environment text,
  provider_request_id text,
  expected_provider_transaction_id text,
  expected_external_product_id text,
  expected_amount_minor bigint,
  expected_currency text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_lookup_provider text;
  v_lookup_environment text;
  v_lookup_provider_request_id text;
  v_lookup_provider_transaction_id text;
  v_payment_attempt_id uuid;
  v_subject_id uuid;
  v_purchase_intent_id uuid;
  v_attempt_offer_id uuid;
  v_intent_offer_id uuid;
  v_provider text;
  v_platform text;
  v_environment text;
  v_provider_request_id text;
  v_provider_transaction_id text;
  v_attempt_status text;
  v_offer_snapshot jsonb;
  v_snapshot_offer_id text;
  v_snapshot_product_id text;
  v_snapshot_provider text;
  v_snapshot_external_product_id text;
  v_expected_amount_minor bigint;
  v_expected_currency text;
  v_charge_terms_version text;
begin
  if p_provider is null or btrim(p_provider) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_provider_payment_verification_context_provider_required',
      message = 'provider identity is required';
  end if;

  if p_environment not in ('sandbox', 'production') then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_provider_payment_verification_context_environment_invalid',
      message = 'provider environment must be sandbox or production';
  end if;

  if p_provider_request_id is not null and btrim(p_provider_request_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_provider_payment_verification_context_request_invalid',
      message = 'provider request identity cannot be blank';
  end if;

  if p_provider_transaction_id is not null and btrim(p_provider_transaction_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_provider_payment_verification_context_transaction_invalid',
      message = 'provider transaction identity cannot be blank';
  end if;

  if p_provider_request_id is null and p_provider_transaction_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_provider_payment_verification_context_identity_required',
      message = 'provider request or transaction identity is required';
  end if;

  v_lookup_provider := btrim(p_provider);
  v_lookup_environment := p_environment;
  v_lookup_provider_request_id := case
    when p_provider_request_id is null then null
    else btrim(p_provider_request_id)
  end;
  v_lookup_provider_transaction_id := case
    when p_provider_transaction_id is null then null
    else btrim(p_provider_transaction_id)
  end;

  select cpa.id,
         cpa.subject_id,
         cpa.purchase_intent_id,
         cpa.product_offer_id,
         pi.product_offer_id,
         cpa.provider,
         cpa.environment,
         cpa.provider_request_id,
         cpa.provider_transaction_id,
         cpa.status,
         pi.offer_snapshot_jsonb,
         pi.expected_amount_minor,
         pi.expected_currency,
         pi.charge_terms_version
    into v_payment_attempt_id,
         v_subject_id,
         v_purchase_intent_id,
         v_attempt_offer_id,
         v_intent_offer_id,
         v_provider,
         v_environment,
         v_provider_request_id,
         v_provider_transaction_id,
         v_attempt_status,
         v_offer_snapshot,
         v_expected_amount_minor,
         v_expected_currency,
         v_charge_terms_version
  from public.commerce_payment_attempts cpa
  join public.purchase_intents pi
    on pi.id = cpa.purchase_intent_id
   and pi.subject_id = cpa.subject_id
  where cpa.provider = v_lookup_provider
    and cpa.environment = v_lookup_environment
    and (
      v_lookup_provider_request_id is null
      or cpa.provider_request_id = v_lookup_provider_request_id
    )
    and (
      v_lookup_provider_transaction_id is null
      or cpa.provider_transaction_id = v_lookup_provider_transaction_id
    );

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_commerce_provider_payment_verification_context_unavailable',
      message = 'provider payment verification context is unavailable';
  end if;

  if v_attempt_status not in ('handed_off', 'response_received') then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_commerce_provider_payment_verification_context_state_ineligible',
      message = 'payment attempt has not reached a verification-eligible handoff state';
  end if;

  if v_attempt_offer_id is distinct from v_intent_offer_id then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_provider_payment_verification_context_offer_mismatch',
      message = 'payment attempt and Purchase Intent offer authority diverged';
  end if;

  if v_subject_id is null
     or v_provider is null or btrim(v_provider) = ''
     or v_environment not in ('sandbox', 'production')
     or v_provider_request_id is null or btrim(v_provider_request_id) = ''
     or (v_provider_transaction_id is not null and btrim(v_provider_transaction_id) = '') then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_provider_payment_verification_context_attempt_invalid',
      message = 'resolved payment attempt verification identity is malformed';
  end if;

  if v_expected_amount_minor is null
     or v_expected_amount_minor <= 0
     or v_expected_amount_minor > 9007199254740991
     or v_expected_currency is null
     or v_expected_currency !~ '^[A-Z]{3}$'
     or v_charge_terms_version is null
     or btrim(v_charge_terms_version) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_provider_payment_verification_context_charge_authority_invalid',
      message = 'Purchase Intent pinned charge authority is missing or malformed';
  end if;

  if v_offer_snapshot is null
     or pg_catalog.jsonb_typeof(v_offer_snapshot) is distinct from 'object'
     or not (v_offer_snapshot ?& array[
       'productOfferId',
       'productId',
       'platform',
       'provider',
       'externalProductId'
     ]::text[])
     or (v_offer_snapshot - array[
       'productOfferId',
       'productId',
       'platform',
       'provider',
       'externalProductId'
     ]::text[]) <> '{}'::jsonb then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_provider_payment_verification_context_snapshot_invalid',
      message = 'Purchase Intent offer snapshot is not the canonical v2 shape';
  end if;

  if pg_catalog.jsonb_typeof(v_offer_snapshot -> 'productOfferId') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_offer_snapshot -> 'productId') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_offer_snapshot -> 'platform') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_offer_snapshot -> 'provider') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_offer_snapshot -> 'externalProductId') is distinct from 'string' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_provider_payment_verification_context_snapshot_invalid',
      message = 'Purchase Intent offer snapshot fields must be canonical strings';
  end if;

  v_snapshot_offer_id := btrim(v_offer_snapshot ->> 'productOfferId');
  v_snapshot_product_id := btrim(v_offer_snapshot ->> 'productId');
  v_platform := btrim(v_offer_snapshot ->> 'platform');
  v_snapshot_provider := btrim(v_offer_snapshot ->> 'provider');
  v_snapshot_external_product_id := btrim(v_offer_snapshot ->> 'externalProductId');

  if v_snapshot_offer_id is distinct from v_attempt_offer_id::text
     or v_snapshot_product_id = ''
     or v_snapshot_provider is distinct from v_provider
     or v_platform not in ('web', 'ios', 'android')
     or v_snapshot_external_product_id = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_provider_payment_verification_context_snapshot_mismatch',
      message = 'Purchase Intent offer snapshot does not match persisted payment authority';
  end if;

  return query
  select v_payment_attempt_id,
         v_subject_id,
         v_purchase_intent_id,
         v_provider,
         v_platform,
         v_environment,
         v_provider_request_id,
         v_provider_transaction_id,
         v_snapshot_external_product_id,
         v_expected_amount_minor,
         v_expected_currency;
end;
$$;

comment on function public.qry_commerce_provider_payment_verification_context_v1(text, text, text, text) is
  'Internal provider-identity projection of persisted Payment Attempt + Purchase Intent v2 authority into provider-neutral verification context. Never payment success authority.';

revoke all on function public.qry_commerce_provider_payment_verification_context_v1(text, text, text, text)
  from public, anon, authenticated, service_role, myeongha_api_executor;
grant execute on function public.qry_commerce_provider_payment_verification_context_v1(text, text, text, text)
  to myeongha_commerce_internal_executor;
