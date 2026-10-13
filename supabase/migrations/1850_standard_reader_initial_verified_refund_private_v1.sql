-- CAP-B2/R2: staged verified cancellation -> initial scope -> original Commerce
-- entitlement CAS. PRIVATE ONLY, no callback/worker/runtime/paid Reader activation.
-- Watchtower-Track: applizing
-- Dependency: 1840 immutable first-purchase pin. Existing 1080, 1220,
-- 1770, 1780 and 1830 writer implementations remain unchanged.
--
-- The same 1810 initial-scope advisory lock is acquired before ANY provider
-- event or Grant row is locked. Bound grants delegate to existing S2 Reader
-- scope lock; unbound grants apply the original Commerce effect directly.
-- A verified cancellation with NO GRANT cannot be settled via 1080; it must
-- be gated from issuance by the Commerce owner before live activation.

create function public.internal_execute_b2_r2_initial_verified_cancel_effect_private_v1(
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
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $r2_revoke$
declare
  v_subject_id uuid;
  v_previous_context text := current_setting('myeongha.subject_id',true);
  v_scope record;
  v_bound_count bigint;
begin
  if p_provider_event_id is null or p_grant_id is null
     or p_expected_revision is null or p_effective_at is null
     or p_target_valid_from is null then
    raise exception using errcode='23514',
      constraint='b2_r2_verified_cancel_input_required',
      message='Verified cancellation requires exact event, Grant and CAS inputs';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='b2_r2_verified_cancel_read_committed',
      message='Initial cancellation requires READ COMMITTED';
  end if;

  -- Read-only authoritative lineage; no Receipt/Grant row lock yet.
  select pe.resolved_subject_id into v_subject_id
  from public.commerce_provider_events pe
  join public.commerce_receipts cr
    on cr.id=pe.resolved_receipt_id
   and cr.subject_id=pe.resolved_subject_id
   and cr.provider=pe.provider
   and cr.environment='production'
   and cr.verification_status in ('verified','revoked')
  join public.entitlement_grants g
    on g.id=p_grant_id and g.subject_id=cr.subject_id
   and g.source_receipt_id=cr.id and g.grant_source_type='purchase'
  join public.internal_qry_b2_r1_verified_receipt_initial_scope_v1(cr.id) pin
    on pin.subject_id=cr.subject_id
  where pe.id=p_provider_event_id
    and pe.status in ('verified','processed')
    and pe.environment='production'
    and pe.resolution_source_type='receipt'
    and pe.event_type='payment.cancelled'
    and (pe.external_transaction_id is null
      or pe.external_transaction_id=cr.external_transaction_id);
  if v_subject_id is null then
    raise exception using errcode='P0001',
      constraint='b2_r2_verified_purchase_event_unavailable',
      message='Exact verified initial cancellation purchase lineage is required';
  end if;
  if v_previous_context is not null and btrim(v_previous_context) <> ''
    and v_previous_context is distinct from v_subject_id::text then
    raise exception using errcode='42501',
      constraint='b2_r2_context_mismatch',
      message='Cancellation cannot override a different canonical Subject';
  end if;

  perform set_config('myeongha.subject_id',v_subject_id::text,true);
  begin
    -- 1840 acquires the identical 1810 initial-scope key and revalidates
    -- the complete immutable Receipt/Event/Grant lineage after waiting.
    select * into strict v_scope
    from public.internal_acquire_b2_r1_verified_cancel_initial_scope_lock_v1(
      p_provider_event_id,p_grant_id
    );
    if v_scope.subject_id is distinct from v_subject_id then
      raise exception using errcode='40001',
        constraint='b2_r2_scope_subject_drift',
        message='Verified initial cancellation Subject drifted';
    end if;

    -- Only the 1770 implementation owns existing Reader scope locking.
    -- The no-Access branch must NOT reject: first bind might never occur.
    select count(*) into v_bound_count
    from public.standard_reading_reader_access_grants a
    where a.entitlement_grant_id=p_grant_id
      and a.subject_id=v_subject_id;

    if v_bound_count=0 then
      return query select * from public.internal_apply_entitlement_effect_v1(
        'provider_event',p_provider_event_id,p_grant_id,null,
        p_expected_revision,p_expected_last_provider_ordering_key,
        'revoked',p_effective_at,'revoked',
        p_target_valid_from,p_target_valid_until,p_reason_code
      );
    else
      return query select * from public.internal_apply_official_reader_provider_revoke_locked_v1(
        p_provider_event_id,p_grant_id,
        p_expected_revision,p_expected_last_provider_ordering_key,
        'revoked',p_effective_at,'revoked',
        p_target_valid_from,p_target_valid_until,p_reason_code
      );
    end if;
  exception when others then
    perform set_config('myeongha.subject_id',coalesce(v_previous_context,''),true);
    raise;
  end;
  perform set_config('myeongha.subject_id',coalesce(v_previous_context,''),true);
end
$r2_revoke$;

revoke all on function public.internal_execute_b2_r2_initial_verified_cancel_effect_private_v1(
 uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text
) from public;

do $r2_acl$
declare r text;
begin
 for r in select rolname from pg_roles
 where rolname in ('anon','authenticated','service_role',
 'myeongha_api_executor','myeongha_commerce_internal_executor',
 'myeongha_seyeon_chat_runtime_owner')
 loop
  execute format(
   'revoke all on function public.internal_execute_b2_r2_initial_verified_cancel_effect_private_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text) from %I',r
  );
 end loop;
end
$r2_acl$;

comment on function public.internal_execute_b2_r2_initial_verified_cancel_effect_private_v1(
 uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text
) is 'CAP-B2/R2 PRIVATE verified first-purchase cancellation with existing independent Grant: immutable initial scope then existing bound-Reader locking (if any) then original Commerce CAS/ledger/projection; NO operational ingress, zero-Grant cancellation still HOLD.';
