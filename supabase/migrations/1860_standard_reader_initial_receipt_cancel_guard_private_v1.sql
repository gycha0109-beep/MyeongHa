-- CAP-B2/R2 no-Grant event-first cancellation gate. PRIVATE staged issuance
-- wrapper; original 1830/Commerce Writer unchanged.
-- Watchtower-Track: applizing
-- This is NOT an operational PortOne webhook/issuer activation.
-- Verification ingress MUST join initial-scope lock protocol for linearization.

create function public.internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1(
  p_receipt_id uuid,
  p_capability_item_keys text[],
  p_effective_ats timestamptz[],
  p_target_valid_froms timestamptz[],
  p_target_valid_untils timestamptz[],
  p_reason_codes text[]
)
returns table (
  result_item_key text,
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
as $r2_issuer$
declare
  v_source record;
  v_after record;
  v_previous_context text := current_setting('myeongha.subject_id',true);
begin
  if p_receipt_id is null then
    raise exception using errcode='23514',
      constraint='b2_r2_receipt_required',
      message='Verified first purchase Receipt required';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='b2_r2_receipt_read_committed',
      message='Initial receipt cancellation guard requires READ COMMITTED';
  end if;

  select * into strict v_source
  from public.internal_qry_b2_r1_verified_receipt_initial_scope_v1(p_receipt_id);
  -- The immutable pin, NOT today's Birth pointer or enabled Product, decides
  -- this lock key; it is identical to S3/1810 and the R2 effect.
  perform pg_advisory_xact_lock(
    hashtextextended(v_source.scope_identity,1830::bigint)
  );
  select * into strict v_after
  from public.internal_qry_b2_r1_verified_receipt_initial_scope_v1(p_receipt_id);
  if to_jsonb(v_after) is distinct from to_jsonb(v_source) then
    raise exception using errcode='40001',
      constraint='b2_r2_receipt_scope_drift',
      message='Purchase pin drifted during receipt lock';
  end if;
  if v_previous_context is not null and btrim(v_previous_context)<>'' and
    v_previous_context is distinct from v_source.subject_id::text then
    raise exception using errcode='42501',
      constraint='b2_r2_issuer_subject_mismatch',
      message='Initial purchase cannot override another Subject context';
  end if;
  perform set_config('myeongha.subject_id',v_source.subject_id::text,true);
  begin
    if exists (
      select 1
      from public.commerce_provider_events pe
      join public.commerce_receipts cr
        on cr.id=pe.resolved_receipt_id and cr.subject_id=pe.resolved_subject_id
        and cr.provider=pe.provider
      where cr.id=p_receipt_id and pe.status in ('verified','processed')
        and pe.environment='production'
        and pe.resolution_source_type='receipt'
        and pe.event_type='payment.cancelled'
        and (pe.external_transaction_id is null or
             pe.external_transaction_id=cr.external_transaction_id)
    ) then
      raise exception using errcode='P0001',
        constraint='b2_r2_cancelled_receipt_issuance_denied',
        message='Verified cancelled initial purchase cannot issue a new Grant';
    end if;
    -- Original Commerce writer remains owner of Grant identity, CAS and
    -- fulfillment. The preceding lock serializes with 1850 only if ALL
    -- provider event verification paths adopt the same lock.
    return query
    select * from public.internal_apply_initial_official_reader_receipt_locked_v1(
      p_receipt_id,p_capability_item_keys,p_effective_ats,
      p_target_valid_froms,p_target_valid_untils,p_reason_codes
    );
    -- Race-aware post-condition; a future ingress MUST lock this same scope
    -- before marking event verified. Without that, no live guarantee.
    if exists (
      select 1
      from public.commerce_provider_events pe
      join public.commerce_receipts cr
        on cr.id=pe.resolved_receipt_id and cr.subject_id=pe.resolved_subject_id
        and cr.provider=pe.provider
      where cr.id=p_receipt_id and pe.status in ('verified','processed')
        and pe.environment='production'
        and pe.resolution_source_type='receipt'
        and pe.event_type='payment.cancelled'
        and (pe.external_transaction_id is null or
             pe.external_transaction_id=cr.external_transaction_id)
    ) then
      raise exception using errcode='40001',
        constraint='b2_r2_issuance_cancelled_during_effect',
        message='Cancellation superseded first purchase issuance';
    end if;
  exception when others then
    perform set_config('myeongha.subject_id',coalesce(v_previous_context,''),true);
    raise;
  end;
  perform set_config('myeongha.subject_id',coalesce(v_previous_context,''),true);
end
$r2_issuer$;

revoke all on function public.internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1(
 uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]
) from public;
do $r2_issuer_acl$
declare r text;
begin
 for r in select rolname from pg_roles
 where rolname in ('anon','authenticated','service_role',
 'myeongha_api_executor','myeongha_commerce_internal_executor',
 'myeongha_seyeon_chat_runtime_owner')
 loop
  execute format(
   'revoke all on function public.internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]) from %I',r);
 end loop;
end
$r2_issuer_acl$;

comment on function public.internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1(
 uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]
) is 'PRIVATE R2 first Receipt issuer cancellation gate, including no-Grant verified event-first case. No operational ingress; 1830 original untouched. Strong guarantee requires provider verification event writer same scope lock and Privacy signoff.';
