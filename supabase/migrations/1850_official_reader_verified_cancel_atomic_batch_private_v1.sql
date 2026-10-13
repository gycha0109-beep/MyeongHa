-- D3c PRIVATE: all-or-nothing FULL Provider cancellation effects, after D3b
-- verified complete source-derived Product L0 -> Reading/Reader L1 lockset.
-- Watchtower-Track: db-authority-core
--
-- No operational worker call, no PortOne ingress, no partial cancellation,
-- no restore, and no runtime EXECUTE. No permission for providers or clients to
-- propose Products/Readings/Readers. This is a staging-only candidate.
--
-- The verified payment.cancelled rows MUST already represent approved FULL
-- cancellation as certified by a separate trusted commerce normalization and
-- policy layer. This database function does NOT prove a provider amount refund.
-- Therefore never wire it to a callback without that external proof/approval.

create or replace function public.internal_apply_official_reader_verified_cancel_batch_v1(
  p_subject_id uuid,
  p_provider_event_ids uuid[],
  p_grant_ids uuid[],
  p_expected_revisions bigint[],
  p_expected_provider_ordering_keys text[],
  p_effective_ats timestamptz[],
  p_target_valid_froms timestamptz[],
  p_target_valid_untils timestamptz[],
  p_reason_codes text[]
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
language plpgsql volatile security invoker
set search_path = pg_catalog, public
as $d3c_batch$
declare
  v_n integer;
  v_locked record;
  v_before jsonb;
  v_after jsonb;
  v_pre jsonb;
  v_post jsonb;
  v_item record;
  v_effect record;
  v_rows integer := 0;
  v_distinct_event_count integer;
begin
  if p_subject_id is null or p_provider_event_ids is null or p_grant_ids is null
     or p_expected_revisions is null or p_expected_provider_ordering_keys is null
     or p_effective_ats is null or p_target_valid_froms is null
     or p_target_valid_untils is null or p_reason_codes is null
     or pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='reader_d3c_input_or_isolation',
      message='D3c full cancellation batch requires exact inputs and READ COMMITTED';
  end if;
  v_n:=pg_catalog.cardinality(p_grant_ids);
  if pg_catalog.array_ndims(p_grant_ids) is distinct from 1
     or v_n not between 1 and 64
     or pg_catalog.array_ndims(p_provider_event_ids) is distinct from 1
     or pg_catalog.cardinality(p_provider_event_ids) <> v_n
     or pg_catalog.cardinality(p_expected_revisions) <> v_n
     or pg_catalog.cardinality(p_expected_provider_ordering_keys) <> v_n
     or pg_catalog.cardinality(p_effective_ats) <> v_n
     or pg_catalog.cardinality(p_target_valid_froms) <> v_n
     or pg_catalog.cardinality(p_target_valid_untils) <> v_n
     or pg_catalog.cardinality(p_reason_codes) <> v_n
     or (select count(distinct x.id) from pg_catalog.unnest(p_provider_event_ids) as x(id)) <> v_n
     or exists (
       select 1 from rows from (
         pg_catalog.unnest(p_grant_ids),pg_catalog.unnest(p_provider_event_ids),
         pg_catalog.unnest(p_expected_revisions),pg_catalog.unnest(p_effective_ats),
         pg_catalog.unnest(p_target_valid_froms),pg_catalog.unnest(p_reason_codes)
       ) as a(grant_id,event_id,rev,effective_at,valid_from,reason)
       where a.grant_id is null or a.event_id is null or a.rev is null
         or a.effective_at is null or a.valid_from is null
         or a.reason is null or pg_catalog.btrim(a.reason)=''
     ) then
    raise exception using errcode='23514',
      constraint='reader_d3c_input_incomplete',
      message='Exact 1-64 distinct verified Provider events and fully specified Grant effects required';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- Binds every source pair and obtains ALL ordered L0 before ALL L1.
  select * into strict v_locked
    from public.internal_acquire_official_reader_verified_cancel_impact_lockset_v1(
      p_subject_id,p_provider_event_ids,p_grant_ids);
  if pg_catalog.cardinality(v_locked.affected_grants) <> v_n then
    raise exception using errcode='40001',
      constraint='reader_d3c_locked_impact_incomplete',
      message='Verified cancellation lockset was incomplete';
  end if;

  -- Pin immovable authority proof separately from mutable Grant CAS fields.
  select q.authority_snapshot into strict v_before
  from public.internal_qry_official_reader_verified_cancel_impact_v1(
    p_subject_id,p_provider_event_ids,p_grant_ids) q;
  select coalesce(pg_catalog.jsonb_agg(x.obj
       - 'grantStatus' - 'revision' - 'grantOrder'),'[]'::jsonb) into v_pre
  from pg_catalog.jsonb_array_elements(v_before) as x(obj);

  -- Sort pairs by canonical Grant ID; never depend on caller array order.
  for v_item in
    select input.grant_id,input.event_id,input.expected_revision,
      input.expected_order,input.effective_at,input.valid_from,
      input.valid_until,input.reason_code
    from rows from (
      pg_catalog.unnest(p_grant_ids),pg_catalog.unnest(p_provider_event_ids),
      pg_catalog.unnest(p_expected_revisions),
      pg_catalog.unnest(p_expected_provider_ordering_keys),
      pg_catalog.unnest(p_effective_ats),
      pg_catalog.unnest(p_target_valid_froms),
      pg_catalog.unnest(p_target_valid_untils),
      pg_catalog.unnest(p_reason_codes)
    ) as input(grant_id,event_id,expected_revision,expected_order,
      effective_at,valid_from,valid_until,reason_code)
    order by input.grant_id
  loop
    -- Strict CAS from trusted expected values. No partial cancellation:
    -- a previously revoked/expired Grant cannot be silently marked success.
    if not exists (
      select 1 from public.entitlement_grants g
      where g.id=v_item.grant_id and g.subject_id=p_subject_id
        and g.status='active'
        and g.revision=v_item.expected_revision
        and g.last_provider_ordering_key is not distinct from v_item.expected_order
        and g.valid_from=v_item.valid_from
        and g.valid_until is not distinct from v_item.valid_until
    ) then
      raise exception using errcode='40001',
        constraint='reader_d3c_grant_cas_or_state',
        message='Full Provider cancellation Grant state and supplied CAS must match';
    end if;

    select * into strict v_effect
    from public.internal_apply_entitlement_effect_v1(
      'provider_event',v_item.event_id,v_item.grant_id,null,
      v_item.expected_revision,v_item.expected_order,
      'revoked',v_item.effective_at,'revoked',
      v_item.valid_from,v_item.valid_until,v_item.reason_code
    );

    if v_effect.result_grant_id is distinct from v_item.grant_id
       or v_effect.result_replayed
       or v_effect.result_entitlement_event_id is null then
      raise exception using errcode='40001',
        constraint='reader_d3c_noop_or_conflicting_effect',
        message='Full batch requires one new material revocation event per Grant';
    end if;
    v_rows:=v_rows+1;
    return query select
      v_effect.result_grant_id,v_effect.result_entitlement_event_id,
      v_effect.result_projection_id,v_effect.result_grant_revision,
      v_effect.result_projection_revision,v_effect.result_projection_changed,
      v_effect.result_outbox_event_id,v_effect.result_replayed;
  end loop;

  if v_rows <> v_n or (select count(*) from public.entitlement_grants g
    where g.id=any(p_grant_ids) and g.subject_id=p_subject_id and g.status='revoked') <> v_n
  then
    raise exception using errcode='40001',
      constraint='reader_d3c_batch_incomplete',
      message='All verified cancellation Grants must be revoked in the same statement';
  end if;
  -- Detect non-cooperative source/binding changes while applying the mutation.
  select q.authority_snapshot into strict v_after
  from public.internal_qry_official_reader_verified_cancel_impact_v1(
    p_subject_id,p_provider_event_ids,p_grant_ids) q;
  select coalesce(pg_catalog.jsonb_agg(x.obj
       - 'grantStatus' - 'revision' - 'grantOrder'),'[]'::jsonb) into v_post
  from pg_catalog.jsonb_array_elements(v_after) as x(obj);
  if v_post is distinct from v_pre then
    raise exception using errcode='40001',
      constraint='reader_d3c_post_effect_impact_drift',
      message='Source-backed Provider impact changed across atomic batch';
  end if;
end
$d3c_batch$;

revoke all on function public.internal_apply_official_reader_verified_cancel_batch_v1(
 uuid,uuid[],uuid[],bigint[],text[],timestamptz[],timestamptz[],timestamptz[],text[]
) from public;
do $d3c_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_apply_official_reader_verified_cancel_batch_v1(uuid,uuid[],uuid[],bigint[],text[],timestamptz[],timestamptz[],timestamptz[],text[]) from %I',
      v_role);
  end loop;
end
$d3c_acl$;

comment on function public.internal_apply_official_reader_verified_cancel_batch_v1(
 uuid,uuid[],uuid[],bigint[],text[],timestamptz[],timestamptz[],timestamptz[],text[]
) is 'D3c PRIVATE experimental full verified cancellation, ordered full L0/L1 then single PostgreSQL statement with original 1080 CAS/ledger/projection/outbox. No partial/restore, no operational provider normalization/EXECUTE.';
