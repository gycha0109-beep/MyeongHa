-- CAP-B2/S5 DB-verified initial purchase refund / Grant revocation.
-- Watchtower-Track: applizing
-- PRIVATE ONLY: no PortOne live callback, worker, public/API or T2 EXECUTE.
-- S3 initial lock from purchase-time immutable pin; optional bound Reader
-- scopes acquired after the initial lock, before original Commerce row locks.
-- Unlike S2 already-bound-only Provider bridge, an unbound initial purchase
-- may be cancelled without inventing a Reading or Reader entitlement.

create or replace function public.internal_execute_standard_reader_initial_verified_revoke_v1(
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
as $s5_initial_provider_revoke$
declare
  v_subject uuid;
  v_receipt uuid;
  v_intent uuid;
  v_pin public.standard_reader_initial_purchase_scope_pins_v1%rowtype;
  v_after public.standard_reader_initial_purchase_scope_pins_v1%rowtype;
  v_prev_subject text := pg_catalog.current_setting('myeongha.subject_id',true);
  v_reader_scope record;
  v_before_scopes jsonb;
  v_after_scopes jsonb;
begin
  if p_provider_event_id is null or p_grant_id is null
     or p_expected_revision is null or p_effective_at is null
     or p_target_valid_from is null then
    raise exception using errcode='23514',
      constraint='standard_s5_provider_revoke_input_required',
      message='Verified initial Reader Provider revoke and Grant CAS are required';
  end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='standard_s5_provider_revoke_read_committed_required',
      message='Verified initial Reader Provider revoke requires READ COMMITTED';
  end if;

  -- Resolve only exact provider-verified production event -> Receipt -> Grant.
  -- No purchase/Grant/Receipt row locks before transaction scope lock.
  select cr.subject_id,cr.id,cr.purchase_intent_id
    into v_subject,v_receipt,v_intent
  from public.commerce_provider_events pe
  join public.commerce_receipts cr
    on cr.id=pe.resolved_receipt_id
   and cr.subject_id=pe.resolved_subject_id
   and cr.environment='production'
   and cr.verification_status in ('verified','revoked')
   and cr.provider=pe.provider
  join public.entitlement_grants g
    on g.id=p_grant_id and g.subject_id=cr.subject_id
   and g.source_receipt_id=cr.id
   and g.grant_source_type='purchase'
  where pe.id=p_provider_event_id
    and pe.environment='production'
    and pe.status in ('verified','processed')
    and pe.event_type='payment.cancelled'
    and pe.resolution_source_type='receipt'
    and (pe.external_transaction_id is null
         or pe.external_transaction_id=cr.external_transaction_id);
  if v_subject is null or v_receipt is null or v_intent is null then
    raise exception using errcode='P0001',
      constraint='standard_s5_provider_verified_lineage_required',
      message='Exact verified cancellation Receipt and initial purchase Grant required';
  end if;
  if v_prev_subject is not null and pg_catalog.btrim(v_prev_subject)<>''
     and v_prev_subject is distinct from v_subject::text then
    raise exception using errcode='42501',
      constraint='standard_s5_provider_context_mismatch',
      message='Provider refund cannot override another canonical Subject';
  end if;
  select pin.* into strict v_pin
  from public.standard_reader_initial_purchase_scope_pins_v1 pin
  where pin.purchase_intent_id=v_intent
    and pin.subject_id=v_subject
    and pin.source_receipt_id=v_receipt;
  -- Saved purchase-time identity works even after current Birth/Offer retire.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_pin.initial_scope_identity,1830::bigint)
  );
  -- Set only a scoped verified Subject identity for original Commerce writer.
  perform pg_catalog.set_config('myeongha.subject_id',v_subject::text,true);
  begin
    select pin.* into strict v_after
    from public.standard_reader_initial_purchase_scope_pins_v1 pin
    where pin.purchase_intent_id=v_intent
      and pin.subject_id=v_subject
      and pin.source_receipt_id=v_receipt;
    if v_after.initial_scope_identity is distinct from v_pin.initial_scope_identity
       or v_after.product_id is distinct from v_pin.product_id
       or v_after.source_birth_revision_id is distinct from v_pin.source_birth_revision_id
       or not exists (
         select 1 from public.entitlement_grants g
         where g.id=p_grant_id and g.subject_id=v_subject
           and g.source_receipt_id=v_receipt
           and g.grant_source_type='purchase'
       ) then
      raise exception using errcode='40001',
        constraint='standard_s5_provider_pin_or_grant_drift',
        message='Immutable initial Reader receipt/Grant scope drifted while locking';
    end if;

    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(a.official_reading_id::text,a.reader_character_id)
      order by a.official_reading_id,a.reader_character_id
    ),'[]'::jsonb) into v_before_scopes
    from (
      select distinct a.official_reading_id,a.reader_character_id
      from public.standard_reading_reader_access_grants a
      where a.entitlement_grant_id=p_grant_id
        and a.subject_id=v_subject
        and a.official_reading_id is not null
        and a.reader_character_id is not null
    ) a;
    -- If bound, lock T2 current Reader scope as well; if unbound, there is no
    -- Reader ID to invent. Initial lock serializes against initial binding.
    for v_reader_scope in
      select distinct a.official_reading_id,a.reader_character_id
      from public.standard_reading_reader_access_grants a
      where a.entitlement_grant_id=p_grant_id
        and a.subject_id=v_subject
      order by a.official_reading_id,a.reader_character_id
    loop
      perform public.internal_acquire_official_reader_scope_lock_v1(
        v_subject,v_reader_scope.official_reading_id,v_reader_scope.reader_character_id
      );
    end loop;

    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(a.official_reading_id::text,a.reader_character_id)
      order by a.official_reading_id,a.reader_character_id
    ),'[]'::jsonb) into v_after_scopes
    from (
      select distinct a.official_reading_id,a.reader_character_id
      from public.standard_reading_reader_access_grants a
      where a.entitlement_grant_id=p_grant_id and a.subject_id=v_subject
        and a.official_reading_id is not null
        and a.reader_character_id is not null
    ) a;
    if v_after_scopes is distinct from v_before_scopes then
      raise exception using errcode='40001',
        constraint='standard_s5_provider_bound_reader_scope_changed',
        message='Bound initial Reader scope changed before Provider revoke';
    end if;

    -- Original Commerce writer alone owns CAS/entitlement event/outbox and
    -- refund state. Do not mutate Grant or receipt directly.
    return query select * from public.internal_apply_entitlement_effect_v1(
      'provider_event',p_provider_event_id,p_grant_id,null,
      p_expected_revision,p_expected_last_provider_ordering_key,
      'revoked',p_effective_at,'revoked',
      p_target_valid_from,p_target_valid_until,p_reason_code
    );
  exception when others then
    perform pg_catalog.set_config(
      'myeongha.subject_id',coalesce(v_prev_subject,''),true
    );
    raise;
  end;
  perform pg_catalog.set_config(
    'myeongha.subject_id',coalesce(v_prev_subject,''),true
  );
end
$s5_initial_provider_revoke$;

revoke all on function public.internal_execute_standard_reader_initial_verified_revoke_v1(
 uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text
) from public;

do $s5_provider_acl$
declare r text;
begin
 for r in select rolname from pg_catalog.pg_roles where rolname in
 ('anon','authenticated','service_role','myeongha_api_executor',
  'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
 loop
  execute pg_catalog.format(
   'revoke all on function public.internal_execute_standard_reader_initial_verified_revoke_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text) from %I',r
  );
 end loop;
end
$s5_provider_acl$;

comment on function public.internal_execute_standard_reader_initial_verified_revoke_v1(
 uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text
) is 'S5 PRIVATE verified initial Reader payment.cancelled -> immutable pinned initial scope -> optional bound Reader T2 scope -> original Commerce CAS effect. NO provider ingress runtime EXECUTE.';
