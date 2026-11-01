-- Private Commerce/Records display evidence, NOT a refund or Grant writer.
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
      and (provider_event.external_transaction_id is null
           or provider_event.external_transaction_id=
              original_receipt.external_transaction_id)
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
) is 'Private read-only original PortOne Receipt + verified provider full-cancellation + applied revoked Grant lineage, under current S1 shared scope lock. A sibling active verified purchase suppresses cancelled labels. No API EXECUTE; current checkout, S5/S6 and Saju Privacy production remain OFF.';
