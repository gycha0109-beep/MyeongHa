-- Forward-only Reader cancellation display correction of 2160.
-- Current inactive state is NOT equivalent to proof that the latest exact
-- purchase right was revoked by a verified original full-cancel source.
-- Private Commerce/Records display evidence, NOT a refund or Grant writer.
-- No new role, external PSP calls, public route or production DB rollout.
-- Watchtower-Track: commerce
-- A denied/missing Reader thread is not by itself a verified cancellation.
-- This helper reports a provider-confirmed original Receipt/Grant revocation
-- ONLY after the current exact Subject x official Reading x Reader scope has
-- zero surviving independent verified purchase Grants.
--
-- Uses the S1 shared advisory lock before the CURRENT access + lineage read.
-- S6/T2 separately re-check Grant/Bundle/Revision after any user navigation.
-- Existing 1770/1780 is the ONLY issuer of verified cancellation facts.
-- No app/API EXECUTE, public Reader route, new runtime role, PSP call or
-- production DDL application. P0-CM-03 and Privacy/Saju gates stay HOLD.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_qry_official_reader_verified_cancellation_status_v1(
  p_subject_id uuid,
  p_reading_id uuid,
  p_reader_character_id text
)
returns table (
  state text,
  current_verified_purchase_grant_count bigint
)
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $reader_cancellation_status$
declare
  v_current_count bigint;
  v_scope text;
  v_now timestamptz;
  v_cancelled boolean;
begin
  if p_subject_id is null or p_reading_id is null
     or p_reader_character_id is null
     or pg_catalog.btrim(p_reader_character_id)=''
     or pg_catalog.length(p_reader_character_id)>128 then
    raise exception using errcode='23514',
      constraint='reader_cancellation_status_invalid_selector',
      message='Exact Reader cancellation selector required';
  end if;
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',
      constraint='reader_cancellation_status_read_committed_required',
      message='Reader cancellation status requires a current transaction snapshot';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- This helper is intentionally unreadable outside the same canonical
  -- Subject transaction used for owner-scoped Records. Lock before reading
  -- either active sibling Grants or historical provider cancellation.
  select q.scope_state into v_scope
  from public.internal_qry_official_reader_locked_bundle_scope_v1(
    p_subject_id,p_reading_id,p_reader_character_id
  ) q;
  if not found or v_scope not in (
    'no_active_grant','one_current_bundle','ambiguous_bundles'
  ) then
    raise exception using errcode='P0001',
      constraint='reader_cancellation_scope_unavailable',
      message='Reader cancellation scope unavailable';
  end if;

  v_now:=pg_catalog.clock_timestamp();

  -- Count DISTINCT currently usable independent purchase Grants, not
  -- historical Issued Receipts or stale bound access rows. One surviving
  -- same-scope sibling prevents a "purchase right revoked" label.
  select count(distinct g.id) into v_current_count
  from public.standard_reading_reader_access_grants a
  join public.entitlement_grants g
    on g.id=a.entitlement_grant_id and g.subject_id=a.subject_id
  join public.commerce_receipts receipt
    on receipt.id=g.source_receipt_id and receipt.subject_id=g.subject_id
  where a.subject_id=p_subject_id
    and a.official_reading_id=p_reading_id
    and a.reader_character_id=p_reader_character_id
    and g.grant_source_type='purchase'
    and g.status='active'
    and g.valid_from<=v_now
    and (g.valid_until is null or v_now<g.valid_until)
    and receipt.verification_status='verified'
    and receipt.environment='production';

  if v_current_count>0 then
    return query select 'current_verified_purchase'::text,v_current_count;
    return;
  end if;

  -- Provider-confirmed and applied 1770 entitlement_effect only. The
  -- original PortOne cancellation record and Receipt must both be verified
  -- at the same canonical Subject/Receipt/Grant as the Reader binding.
  -- Cancellation webhook arrival alone or UI refund request is NOT enough.
  select exists (
    select 1
    from public.standard_reading_reader_access_grants access
    join public.entitlement_grants grant_row
      on grant_row.id=access.entitlement_grant_id
     and grant_row.subject_id=access.subject_id
    join public.entitlement_events ev
      on ev.grant_id=grant_row.id
     and ev.subject_id=grant_row.subject_id
    join public.commerce_provider_events provider_event
      on provider_event.id=ev.source_provider_event_id
     and provider_event.resolved_subject_id=ev.subject_id
    join public.commerce_receipts original_receipt
      on original_receipt.id=grant_row.source_receipt_id
     and original_receipt.subject_id=grant_row.subject_id
     and original_receipt.id=provider_event.resolved_receipt_id
     and original_receipt.provider=provider_event.provider
     and original_receipt.environment=provider_event.environment
    where access.subject_id=p_subject_id
      and access.official_reading_id=p_reading_id
      and access.reader_character_id=p_reader_character_id
      and grant_row.grant_source_type='purchase'
      and grant_row.status='revoked'
      and ev.event_type='revoked'
      and ev.source_type='provider_event'
      and original_receipt.verification_status='revoked'
      and original_receipt.environment='production'
      and provider_event.environment='production'
      and provider_event.provider='portone_v2'
      and provider_event.status in ('verified','processed')
      and provider_event.resolution_source_type='receipt'
      and provider_event.event_type='Transaction.Cancelled'
      and provider_event.provider_occurred_at is not null
      and provider_event.provider_occurred_at<=v_now
      -- A historical revoked Event is insufficient when a later lifecycle
      -- effect has changed the live Grant's last provider clock or order.
      and grant_row.last_effective_at=ev.effective_at
      and grant_row.last_provider_ordering_key is not distinct from
          ev.provider_ordering_key
      and ev.effective_at=provider_event.provider_occurred_at
      and ev.provider_ordering_key is not distinct from
          provider_event.provider_ordering_key
      and provider_event.provider_ordering_key=(
        'portone-v2-fullcancel:'||pg_catalog.to_char(
          provider_event.provider_occurred_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      )
      -- Original production receipt, provider GET verification, one
      -- original payment attempt, and the same succeeded full cancellation
      -- must resolve to this exact Grant rather than a signed webhook alone.
      and provider_event.external_transaction_id=
          original_receipt.external_transaction_id
      and provider_event.external_event_id=(
        'myeongha:portone-v2:full-cancel:v1:'||
        (provider_event.verified_payload_jsonb->>'cancellationId')
      )
      and provider_event.payload_fingerprint ~
          '^hmac-sha256:k1:[0-9a-f]{64}$'
      and provider_event.verified_payload_jsonb->>'schemaVersion'=
          'portone-full-cancel-verified-v1'
      and provider_event.verified_payload_jsonb->>'transactionId'=
          original_receipt.external_transaction_id
      and provider_event.verified_payload_jsonb->>'environment'='production'
      and provider_event.verified_payload_jsonb->>'verifiedAmountMinor'=
          original_receipt.verified_amount_minor::text
      and provider_event.verified_payload_jsonb->>'verifiedCurrency'=
          original_receipt.verified_currency
      and provider_event.verified_payload_jsonb->>'evidenceFingerprint'=
          provider_event.payload_fingerprint
      and provider_event.verified_payload_jsonb->>'verifierRevision'=
          provider_event.verifier_revision
      and (
        select count(*)
        from public.commerce_payment_attempts payment_attempt
        where payment_attempt.purchase_intent_id=
                original_receipt.purchase_intent_id
          and payment_attempt.subject_id=original_receipt.subject_id
          and payment_attempt.product_offer_id=
                original_receipt.product_offer_id
          and payment_attempt.provider=original_receipt.provider
          and payment_attempt.environment=original_receipt.environment
          and payment_attempt.provider_transaction_id=
                original_receipt.external_transaction_id
          and payment_attempt.provider_request_id=
                provider_event.verified_payload_jsonb->>'paymentId'
      )=1
  ) into v_cancelled;

  if v_cancelled then
    return query select 'verified_full_cancellation'::text,0::bigint;
    return;
  end if;

  return query select 'not_confirmed'::text,0::bigint;
end
$reader_cancellation_status$;

revoke all on function public.internal_qry_official_reader_verified_cancellation_status_v1(
  uuid,uuid,text
) from public;

do $reader_cancellation_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_system_executor',
      'myeongha_seyeon_chat_runtime_owner'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_qry_official_reader_verified_cancellation_status_v1(uuid,uuid,text) from %I',
      v_role
    );
  end loop;
end
$reader_cancellation_acl$;

comment on function public.internal_qry_official_reader_verified_cancellation_status_v1(
  uuid,uuid,text
) is 'Private S1-locked original PortOne GET full-cancellation status; current Grant clock/order and exact immutable revoked Effect must match the same original Receipt, attempt, cancellation and HMAC. A surviving sibling purchase supersedes cancelled labels. Read only; no customer grant, PSP call or LIVE activation.';
