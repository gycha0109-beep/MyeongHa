-- S2 restricted internal bridge: verified Provider cancellation -> private Reader
-- scope locking -> original Commerce entitlement effect, one short transaction.
-- Watchtower-Track: db-authority-core
--
-- Dormant SECURITY DEFINER function. NO EXECUTE grant to any runtime,
-- authenticated, API, service, or Commerce internal role. A safe trusted
-- Commerce callback/worker identity and verified provider normalization are
-- still required before installing a production caller.
--
-- Unlike the ordinary user role, provider ingress has no authenticated user
-- subject context. Resolve Subject ONLY from the DB-verified Provider Event /
-- production Receipt / exact purchase Grant, set a transaction-local context
-- for the private scope lock, and restore the previous value before return.
-- This does not rely on caller-supplied Subject / Reading / Reader identifiers.
--
-- Intentional narrow contract: only payment.cancelled -> revoked. Provider
-- timestamps, expected CAS state and historical Grant interval remain governed
-- by 1080's immutable Commerce entitlement effect writer.

create or replace function public.internal_execute_official_reader_verified_provider_revoke_v1(
  p_provider_event_id uuid,
  p_grant_id uuid,
  p_expected_revision bigint,
  p_expected_last_provider_ordering_key text,
  p_effective_at timestamptz,
  p_target_valid_from timestamptz,
  p_target_valid_until timestamptz,
  p_reason_code text
)
returns table (
  result_grant_id uuid,
  result_entitlement_event_id uuid,
  result_projection_id uuid,
  result_grant_revision bigint,
  result_projection_revision bigint,
  result_projection_changed boolean,
  result_outbox_event_id uuid,
  result_replayed boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $verified_reader_provider_bridge$
declare
  v_subject_id uuid;
  v_previous_context text := pg_catalog.current_setting('myeongha.subject_id', true);
begin
  if p_provider_event_id is null
     or p_grant_id is null
     or p_expected_revision is null
     or p_effective_at is null
     or p_target_valid_from is null then
    raise exception using
      errcode = '23514',
      constraint = 'reader_verified_provider_bridge_input_required',
      message = 'Verified Provider revocation identity and effect data are required';
  end if;

  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using
      errcode = '25001',
      constraint = 'reader_verified_provider_bridge_isolation_required',
      message = 'Verified Provider Reader revocation requires READ COMMITTED';
  end if;

  -- Read-only lineage validation here does not lock Receipt/Grant rows BEFORE
  -- 1770's scope lock: lock order must be scope -> Commerce Provider/Grant rows.
  select pe.resolved_subject_id
    into v_subject_id
  from public.commerce_provider_events pe
  join public.commerce_receipts cr
    on cr.id = pe.resolved_receipt_id
   and cr.subject_id = pe.resolved_subject_id
   and cr.environment = 'production'
   and cr.verification_status in ('verified','revoked')
   and cr.provider = pe.provider
  join public.entitlement_grants g
    on g.id = p_grant_id
   and g.subject_id = pe.resolved_subject_id
   and g.source_receipt_id = cr.id
   and g.grant_source_type = 'purchase'
  where pe.id = p_provider_event_id
    and pe.status in ('verified','processed')
    and pe.environment = 'production'
    and pe.resolution_source_type = 'receipt'
    and pe.event_type = 'payment.cancelled'
    and (pe.external_transaction_id is null
         or pe.external_transaction_id = cr.external_transaction_id);

  if v_subject_id is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'reader_verified_provider_bridge_lineage_unavailable',
      message = 'Verified cancellation Receipt and purchase Grant lineage is unavailable';
  end if;

  -- An existing, different canonical Subject context is never overwritten.
  -- A legitimate provider ingress has no subject context, unlike user flows.
  if v_previous_context is not null
     and pg_catalog.btrim(v_previous_context) <> ''
     and v_previous_context is distinct from v_subject_id::text then
    raise exception using
      errcode = '42501',
      constraint = 'reader_verified_provider_bridge_subject_mismatch',
      message = 'Provider revocation cannot override another Subject context';
  end if;

  perform pg_catalog.set_config('myeongha.subject_id', v_subject_id::text, true);
  begin
    return query
    select *
    from public.internal_apply_official_reader_provider_revoke_locked_v1(
      p_provider_event_id, p_grant_id,
      p_expected_revision, p_expected_last_provider_ordering_key,
      'revoked', p_effective_at, 'revoked',
      p_target_valid_from, p_target_valid_until, p_reason_code
    );
  exception when others then
    perform pg_catalog.set_config(
      'myeongha.subject_id', coalesce(v_previous_context, ''), true
    );
    raise;
  end;

  -- Explicitly restore even on success so another action in the same
  -- transaction cannot silently inherit the refunded purchaser's context.
  perform pg_catalog.set_config(
    'myeongha.subject_id', coalesce(v_previous_context, ''), true
  );
end
$verified_reader_provider_bridge$;

revoke all on function public.internal_execute_official_reader_verified_provider_revoke_v1(
  uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text
) from public;

do $reader_provider_bridge_acl$
declare
  v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_execute_official_reader_verified_provider_revoke_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text) from %I',
      v_role
    );
  end loop;
end
$reader_provider_bridge_acl$;

comment on function public.internal_execute_official_reader_verified_provider_revoke_v1(
  uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text
) is
'DORMANT DB-owner cancellation bridge. Server-derived Subject from verified production Provider Event/Receipt/Grant, transaction-local context restored. Calls 1770 scope-first revoke before original Commerce writer. No runtime or Commerce role EXECUTE, no live callback, no paid Reader T2 permission.';
