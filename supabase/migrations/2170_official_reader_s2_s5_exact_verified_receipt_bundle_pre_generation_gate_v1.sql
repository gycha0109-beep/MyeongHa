-- OFFICIAL READER S2/S5: private exact Grant+Receipt pre-generation guard.
-- The existing Reader A2 access query (1270) checks active purchase Grant
-- but NOT whether the original Commerce Receipt was later revoked. The
-- existing 2160 private read distinguishes verified PortOne cancellation,
-- but must not be used alone to authorize one particular content Bundle.
--
-- Enforce the SAME shared S1 lock as 1740/1750/1770/1960/1970, then require
-- (1) one CURRENT pinned Bundle, (2) an independently verified production
-- Receipt, and (3) a live purchase Grant bound to the exact official
-- Subject x Reading x Reader x Bundle.
-- This gate is read-only and exposes NO plaintext, Receipt IDs, new role,
-- application EXECUTE grant, new LLM call, or public entitlement.
-- The future T1 caller uses it before invoking the private generator and
-- the S5 T2 caller invokes it in the final writing transaction.
-- Watchtower-Track: db-authority-core
--
-- This is off-production implementation only; Saju/Privacy/DB Owner
-- acceptance, Source Proof and current S5 SQL HOLD remain mandatory.

create or replace function public.internal_assert_official_reader_current_verified_purchase_bundle_v1(
  p_subject_id uuid,
  p_reading_id uuid,
  p_reader_character_id text,
  p_reader_content_bundle_id uuid
)
returns void
language plpgsql
volatile security definer
set search_path=pg_catalog,public
as $reader_exact_verified_purchase_bundle$
declare
  v_scope_state text;
  v_current_bundle uuid;
  v_bundle_count bigint;
  v_now timestamptz;
begin
  if p_subject_id is null or p_reading_id is null
     or p_reader_content_bundle_id is null
     or p_reader_character_id is null
     or pg_catalog.length(p_reader_character_id) not between 1 and 128
     or p_reader_character_id is distinct from
       pg_catalog.btrim(p_reader_character_id)
     or pg_catalog.current_setting('transaction_isolation')<>'read committed'
  then
    raise exception using errcode='23514',
      constraint='official_reader_exact_verified_purchase_input_invalid',
      message='Reader current verified purchase scope is unavailable';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- S1 linearization point, before checking any Receipt or Grant state.
  select q.scope_state,q.current_bundle_id,q.active_bundle_count
    into v_scope_state,v_current_bundle,v_bundle_count
  from public.internal_qry_official_reader_locked_bundle_scope_v1(
    p_subject_id,p_reading_id,p_reader_character_id
  ) q;
  if not found
     or v_scope_state is distinct from 'one_current_bundle'
     or v_bundle_count<>1
     or v_current_bundle is distinct from p_reader_content_bundle_id
  then
    raise exception using errcode='P0001',
      constraint='official_reader_exact_verified_purchase_current_bundle_denied',
      message='Reader current verified purchase scope is unavailable';
  end if;

  v_now:=pg_catalog.clock_timestamp();
  if not exists (
    select 1
    from public.standard_reading_reader_access_grants access
    join public.entitlement_grants grant_row
      on grant_row.id=access.entitlement_grant_id
     and grant_row.subject_id=access.subject_id
    join public.commerce_receipts receipt
      on receipt.id=grant_row.source_receipt_id
     and receipt.subject_id=grant_row.subject_id
    where access.subject_id=p_subject_id
      and access.official_reading_id=p_reading_id
      and access.reader_character_id=p_reader_character_id
      and access.reader_content_bundle_id=p_reader_content_bundle_id
      and grant_row.grant_source_type='purchase'
      and grant_row.status='active'
      and grant_row.valid_from<=v_now
      and (grant_row.valid_until is null or v_now<grant_row.valid_until)
      and receipt.verification_status='verified'
      and receipt.environment='production'
      and receipt.purchase_intent_id is not null
  ) then
    raise exception using errcode='P0001',
      constraint='official_reader_exact_verified_purchase_receipt_denied',
      message='Reader current verified purchase scope is unavailable';
  end if;
end
$reader_exact_verified_purchase_bundle$;

revoke all on function public.internal_assert_official_reader_current_verified_purchase_bundle_v1(
  uuid,uuid,text,uuid
) from public;

do $reader_exact_verified_purchase_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_commerce_internal_executor',
      'myeongha_system_executor','myeongha_seyeon_chat_runtime_owner'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_assert_official_reader_current_verified_purchase_bundle_v1(uuid,uuid,text,uuid) from %I',
      v_role
    );
  end loop;
end
$reader_exact_verified_purchase_acl$;

comment on function public.internal_assert_official_reader_current_verified_purchase_bundle_v1(
  uuid,uuid,text,uuid
)
is 'S1-locked exact Reader generation/T2 precommit purchase check requiring a live active Grant from a currently verified production Receipt of the same official Reading, Reader and Bundle. Sibling verified same-Bundle purchase allowed; revoked original Receipt cannot grant access. Private SQL ungranted to runtimes, Source Owner and P0-CM-03 HOLD.';
