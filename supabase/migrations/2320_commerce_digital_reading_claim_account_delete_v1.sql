-- Commerce: exact private digital Reading claim service evidence (P0-PR-01 DELETE).
-- Forward-only from candidate, preserving latest 2010 Reader S4 off-primary fence.
-- No rollout/PSP/API route activated by this migration alone.

create table public.digital_reading_withdrawal_claims_private_v1 (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id),
  purchase_intent_id uuid null,
  unit_id uuid null,
  reason_code text not null,
  idempotency_hmac text not null,
  request_hash text not null,
  contract_version text not null default 'digital-reading-withdrawal-claim-v1',
  state text not null default 'received',
  received_at timestamptz not null default clock_timestamp(),
  constraint digital_reading_withdrawal_claim_scope_shape_check
    check ((purchase_intent_id is null)=(unit_id is null)),
  constraint digital_reading_withdrawal_claim_owner_fk
    foreign key (purchase_intent_id, subject_id)
    references public.purchase_intents(id, subject_id),
  constraint digital_reading_withdrawal_claim_idempotency_unique
    unique (subject_id, idempotency_hmac),
  constraint digital_reading_withdrawal_claim_reason_check
    check (reason_code in (
      'change_of_mind', 'not_provided', 'delivery_failed', 'not_as_described',
      'defect', 'duplicate_charge', 'unprovided_separable_part', 'other'
    )),
  constraint digital_reading_withdrawal_claim_hmac_check
    check (idempotency_hmac ~ '^hmac-sha256:k1:[0-9a-f]{64}$'),
  constraint digital_reading_withdrawal_claim_hash_check
    check (request_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint digital_reading_withdrawal_claim_contract_check
    check (contract_version = 'digital-reading-withdrawal-claim-v1'),
  constraint digital_reading_withdrawal_claim_state_check
    check (state = 'received')
);

comment on table public.digital_reading_withdrawal_claims_private_v1 is
'Private, immutable claim-received evidence only. No legal disposition, refund, delivery, entitlement effect, or public intake authorization. P0-PR-01 DECIDED; claim table deletion graph integration NOT DONE.';

create function public.tr_digital_reading_withdrawal_claim_private_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  -- Exception only for the existing approved P0-PR-01 DB-finalization
  -- transaction and its exact Subject. Ordinary DELETE stays forbidden.
  if tg_op = 'DELETE' and
    current_user = (
      select pg_catalog.pg_get_userbyid(proc.proowner)
      from pg_catalog.pg_proc proc
      where proc.oid = pg_catalog.to_regprocedure(
        'public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)'
      )
    ) and coalesce(
      nullif(pg_catalog.current_setting(
        'myeongha.account_deletion_finalizer_subject_id', true
      ), '')::uuid = old.subject_id, false
    ) then
    return old;
  end if;

  if tg_op <> 'INSERT' then
    raise exception using errcode='23514',
      constraint='digital_reading_withdrawal_claim_private_immutable',
      message='Private withdrawal claim evidence is append-only';
  end if;
  new.received_at := clock_timestamp();
  return new;
end;
$$;

create trigger tr_digital_reading_withdrawal_claim_private_v1
before insert or update or delete on public.digital_reading_withdrawal_claims_private_v1
for each row execute function public.tr_digital_reading_withdrawal_claim_private_v1();

alter table public.digital_reading_withdrawal_claims_private_v1 enable row level security;

revoke all on table public.digital_reading_withdrawal_claims_private_v1 from public;
revoke all on function public.tr_digital_reading_withdrawal_claim_private_v1() from public;

do $$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_worker_runtime','myeongha_commerce_internal_executor'
    )
  loop
    execute pg_catalog.format(
      'revoke all on table public.digital_reading_withdrawal_claims_private_v1 from %I',
      v_role
    );
  end loop;
end;
$$;

-- No INSERT/SELECT function granted and no owner claim is recorded.

create or replace function public.internal_finalize_account_deletion_db_v1(
  p_subject_id uuid,
  p_deletion_job_id uuid,
  p_lock_owner text
)
returns table (
  finalized boolean,
  replayed boolean,
  auth_mapping_present boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $account_finalizer$
declare
  v_kind text;
  v_status text;
  v_auth_user_id uuid;
  v_job_scope text;
  v_job_status text;
  v_policy_version text;
  v_db_finalized_at timestamptz;
  v_ready boolean;
  v_reader_protected_count bigint;
  v_reader_external_fence_id text;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null or p_deletion_job_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_ids_required',
      message = 'subject and deletion job ids are required';
  end if;

  if p_lock_owner is null or btrim(p_lock_owner) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_lock_owner_required',
      message = 'exact outbox lock owner is required';
  end if;

  select s.kind, s.status, s.auth_user_id
    into v_kind, v_status, v_auth_user_id
  from public.subjects s
  where s.id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'account_deletion_finalizer_subject_not_found',
      message = 'account deletion Subject was not found';
  end if;

  select dj.scope, dj.status, dj.finalization_policy_version, dj.db_finalized_at
    into v_job_scope, v_job_status, v_policy_version, v_db_finalized_at
  from public.data_deletion_jobs dj
  where dj.id = p_deletion_job_id
    and dj.subject_id = p_subject_id
  for update;

  if not found or v_job_scope is distinct from 'account' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_job_mismatch',
      message = 'account deletion finalizer requires the exact account deletion job';
  end if;

  -- Restored personal claim after account deletion is a privacy replay failure.
  if v_status='deleted' and exists(
    select 1 from public.digital_reading_withdrawal_claims_private_v1 c
    where c.subject_id=p_subject_id
  ) then
    raise exception 'Withdrawal claim resurrected after account deletion'
      using errcode='23514';
  end if;

  if v_status = 'deleted' then
    if v_job_status is distinct from 'running'
       or v_policy_version is distinct from 'account-deletion-finalization-v1'
       or v_db_finalized_at is null then
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_finalizer_deleted_state_unproven',
        message = 'deleted Subject is missing exact DB-finalization provenance';
    end if;

    perform 1
    from public.outbox_events oe
    where oe.aggregate_type = 'data_deletion_job'
      and oe.aggregate_id = p_deletion_job_id::text
      and oe.event_type = 'ACCOUNT_DELETION_STARTED'
      and oe.status = 'processing'
      and oe.lock_owner = btrim(p_lock_owner)
      and oe.lease_expires_at > clock_timestamp()
    for update;

    if not found then
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_finalizer_replay_lease_mismatch',
        message = 'DB-finalizer replay requires the current ACCOUNT_DELETION_STARTED lease owner';
    end if;

    return query
    select true, true, (v_auth_user_id is not null);
    return;
  end if;

  if v_kind is distinct from 'member'
     or v_status is distinct from 'deletion_pending'
     or v_job_status is distinct from 'running'
     or v_policy_version is not null
     or v_db_finalized_at is not null then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_state_mismatch',
      message = 'account deletion DB finalizer requires an unfinalized deletion_pending Member';
  end if;

  -- Serialize the exact worker lease row across the destructive DB transaction.
  perform 1
  from public.outbox_events oe
  where oe.aggregate_type = 'data_deletion_job'
    and oe.aggregate_id = p_deletion_job_id::text
    and oe.event_type = 'ACCOUNT_DELETION_STARTED'
  for update;

  select pf.db_preconditions_met
    into v_ready
  from public.internal_account_deletion_finalization_preflight_v1(
    p_subject_id,
    p_deletion_job_id,
    p_lock_owner
  ) pf;

  if v_ready is distinct from true then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_preflight_failed',
      message = 'account deletion DB finalizer preflight failed closed';
  end if;

  -- Transaction-local trigger context. It is reset before returning and rolls back on any
  -- error. Ordinary trigger behavior remains unchanged outside this function.
  perform pg_catalog.set_config(
    'myeongha.account_deletion_finalizer_subject_id',
    p_subject_id::text,
    true
  );

  set constraints all deferred;

  -- Break FK cycles while the target Subject is still locked and the finalizer context is active.
  update public.birth_profiles
  set current_revision_id = null,
      updated_at = v_now
  where subject_id = p_subject_id
    and current_revision_id is not null;

  update public.reading_sessions
  set current_reading_id = null,
      state = case when state = 'active' then 'cancelled' else state end,
      updated_at = v_now
  where subject_id = p_subject_id;

  update public.readings
  set parent_reading_id = null,
      committed_execution_attempt_id = null,
      execution_status = 'failed',
      completed_at = coalesce(completed_at, v_now)
  where subject_id = p_subject_id;

  update public.chat_turn_attempts
  set state = 'failed_final',
      generation_ai_execution_log_id = null,
      validation_ai_execution_log_id = null,
      generated_thread_character_id = null,
      generated_character_content_bundle_id = null,
      committed_message_id = null,
      finished_at = coalesce(finished_at, v_now),
      error_code = coalesce(error_code, 'account_deleted')
  where subject_id = p_subject_id;

  update public.chat_turns
  set state = 'failed_final',
      committed_attempt_id = null,
      error_code = coalesce(error_code, 'account_deleted'),
      updated_at = v_now
  where subject_id = p_subject_id;

  update public.life_facts
  set supersedes_fact_id = null
  where subject_id = p_subject_id
    and supersedes_fact_id is not null;

  -- S4 (new protected child): physically erase encrypted paid Reader bodies
  -- before deleting any source purchase access, assistant marker, attempt,
  -- Thread or official Reading parent. A cascading FK is NOT a substitute:
  -- keep this graph edge explicit and inside the existing claimed lease TX.
  -- This does not claim backup/KMS key purge or external Privacy Ledger ACK.
  select pg_catalog.count(*) into v_reader_protected_count
  from public.official_reader_paid_answer_bodies b
  where b.subject_id=p_subject_id;

  if v_reader_protected_count>0 then
    v_reader_external_fence_id :=
      pg_catalog.current_setting('myeongha.reader_privacy_fence_receipt_id',true);
    if v_reader_external_fence_id is null
       or pg_catalog.length(v_reader_external_fence_id) not between 1 and 256 then
      raise exception using errcode='23514',
        constraint='account_deletion_reader_durable_receipt_required',
        message='Protected Reader deletion requires an external ledger receipt';
    end if;
  end if;

  if v_reader_protected_count>0 and (
    pg_catalog.current_setting('myeongha.reader_privacy_fence_subject_id', true)
      is distinct from p_subject_id::text
    or pg_catalog.current_setting('myeongha.reader_privacy_fence_deletion_job_id', true)
      is distinct from p_deletion_job_id::text
  ) then
    raise exception using errcode='23514',
      constraint='account_deletion_reader_external_privacy_fence_required',
      message='Protected Reader deletion requires a durable off-primary tombstone before physical deletion';
  end if;

  if v_reader_protected_count>0 then
    insert into public.official_reader_account_deletion_privacy_status_v1(
      deletion_job_id,subject_id,external_fence_id,protected_row_count
    ) values (
      p_deletion_job_id,p_subject_id,v_reader_external_fence_id,
      v_reader_protected_count
    )
    on conflict (deletion_job_id) do nothing;

    if not exists (
      select 1
      from public.official_reader_account_deletion_privacy_status_v1 p
      where p.deletion_job_id=p_deletion_job_id
        and p.subject_id=p_subject_id
        and p.external_fence_id=v_reader_external_fence_id
        and p.protected_row_count=v_reader_protected_count
        and p.keys_erased_at is null
    ) then
      raise exception using errcode='23514',
        constraint='account_deletion_reader_durable_fence_conflict',
        message='Protected Reader deletion manifest changed during account finalization';
    end if;
  end if;

  delete from public.official_reader_paid_answer_bodies b
  where b.subject_id = p_subject_id;

  if exists (
    select 1 from public.official_reader_paid_answer_bodies b
    where b.subject_id = p_subject_id
  ) then
    raise exception using errcode = '23514',
      constraint = 'account_deletion_finalizer_protected_reader_child_remaining',
      message = 'Protected Reader content must be physically removed before parent deletion';
  end if;

  -- Delete approved DELETE-class rows in FK-safe child-before-parent order.
  -- Standard Reading access/interpretation rows reference retained Purchase/Entitlement
  -- evidence plus personal Birth/Reading rows, so remove every Reader-access child before
  -- official Reading provenance and the underlying Reading/Birth rows.
  -- P0-PR-01 DELETE of service claim before official Reading cleanup.
  delete from public.digital_reading_withdrawal_claims_private_v1
    where subject_id=p_subject_id;

  delete from public.standard_reading_reader_access_grants where subject_id = p_subject_id;
  delete from public.standard_reading_reader_interpretations where subject_id = p_subject_id;
  delete from public.standard_reading_official_bindings where subject_id = p_subject_id;
  delete from public.standard_reading_unit_bindings where subject_id = p_subject_id;
  delete from public.episode_progress_events where subject_id = p_subject_id;
  delete from public.user_episode_progress where subject_id = p_subject_id;

  -- Production relationship history is append-only for ordinary callers, but its immutable
  -- trigger explicitly admits this SECURITY DEFINER finalizer for the exact transaction-local
  -- Subject. Delete children before their event/history parents, then remove the state rows.
  delete from public.relationship_event_adjustments where subject_id = p_subject_id;
  delete from public.relationship_event_links where subject_id = p_subject_id;
  delete from public.relationship_event_provenance_refs where subject_id = p_subject_id;
  delete from public.relationship_event_records where subject_id = p_subject_id;
  delete from public.relationship_state_snapshots where subject_id = p_subject_id;
  delete from public.relationship_history_entries where subject_id = p_subject_id;
  delete from public.relationship_events where subject_id = p_subject_id;
  delete from public.user_character_states where subject_id = p_subject_id;

  delete from public.notification_delivery_attempts where subject_id = p_subject_id;
  delete from public.notification_deliveries where subject_id = p_subject_id;
  delete from public.notification_settings where subject_id = p_subject_id;
  delete from public.notification_preferences where subject_id = p_subject_id;
  delete from public.device_installations where subject_id = p_subject_id;
  delete from public.notifications where subject_id = p_subject_id;
  delete from public.character_unlocks where subject_id = p_subject_id;
  delete from public.world_events where subject_id = p_subject_id;

  delete from public.share_artifacts where subject_id = p_subject_id;
  delete from public.ai_execution_groundings where subject_id = p_subject_id;
  delete from public.reading_groundings where subject_id = p_subject_id;
  delete from public.reading_refs where subject_id = p_subject_id;
  delete from public.reading_execution_attempts where subject_id = p_subject_id;
  delete from public.readings where subject_id = p_subject_id;
  delete from public.reading_sessions where subject_id = p_subject_id;

  delete from public.record_access_grants where subject_id = p_subject_id;
  delete from public.memory_proposals where subject_id = p_subject_id;
  delete from public.memory_items where subject_id = p_subject_id;
  delete from public.life_facts where subject_id = p_subject_id;

  delete from public.ai_execution_logs where subject_id = p_subject_id;
  delete from public.conversation_messages where subject_id = p_subject_id;
  delete from public.chat_turn_attempts where subject_id = p_subject_id;
  delete from public.chat_turns where subject_id = p_subject_id;
  delete from public.conversation_thread_content_transitions where subject_id = p_subject_id;
  delete from public.conversation_thread_characters ctc
  using public.conversation_threads ct
  where ctc.thread_id = ct.id
    and ct.subject_id = p_subject_id;
  delete from public.conversation_threads where subject_id = p_subject_id;

  delete from public.target_person_profiles where subject_id = p_subject_id;
  delete from public.birth_profile_revisions where subject_id = p_subject_id;
  delete from public.birth_profiles where subject_id = p_subject_id;
  delete from public.profiles where subject_id = p_subject_id;

  -- RETAIN Commerce evidence but revoke live provider-account authority. This preserves
  -- the approved P5Y evidence row while preventing a deleted Subject from remaining
  -- attached to an active provider account.
  update public.commerce_account_links
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, v_now)
  where subject_id = p_subject_id
    and status = 'active';

  -- ANONYMIZE merge provenance before deleting any guest session reachable through either
  -- Subject FK. Keep categorical audit semantics while removing resource identifiers,
  -- conflict payloads, and dedupe material.
  update public.subject_merge_actions sma
  set action_dedupe_key = 'anonymized:' || sma.id::text,
      source_resource_id = 'anonymized',
      target_resource_id = case
        when sma.target_resource_id is null then null
        else 'anonymized'
      end
  where sma.merge_job_id in (
    select smj.id
    from public.subject_merge_jobs smj
    where smj.guest_subject_id = p_subject_id
       or smj.member_subject_id = p_subject_id
       or smj.guest_session_id in (
         select gs.id
         from public.guest_sessions gs
         where gs.subject_id = p_subject_id
            or gs.claimed_by_subject_id = p_subject_id
       )
  );

  update public.subject_merge_jobs smj
  set guest_session_id = null,
      conflicts_jsonb = '{}'::jsonb,
      resolution_jsonb = null,
      idempotency_key = 'anonymized:' || smj.id::text
  where smj.guest_subject_id = p_subject_id
     or smj.member_subject_id = p_subject_id
     or smj.guest_session_id in (
       select gs.id
       from public.guest_sessions gs
       where gs.subject_id = p_subject_id
          or gs.claimed_by_subject_id = p_subject_id
     );

  delete from public.guest_sessions
  where subject_id = p_subject_id
     or claimed_by_subject_id = p_subject_id;

  -- ANONYMIZE every deletion-job tombstone for this Subject without changing lifecycle
  -- status. The active account job remains running until hosted Auth cleanup is acknowledged.
  update public.data_deletion_jobs dj
  set target_resource_type = case when dj.scope = 'account' then null else 'anonymized' end,
      target_resource_id = case when dj.scope = 'account' then null else 'anonymized:' || dj.id::text end,
      request_dedupe_key = 'anonymized:' || dj.id::text,
      retention_exceptions_jsonb = null,
      error_code = null
  where dj.subject_id = p_subject_id;

  update public.data_deletion_jobs
  set finalization_policy_version = 'account-deletion-finalization-v1',
      db_finalized_at = v_now
  where id = p_deletion_job_id
    and subject_id = p_subject_id;

  if exists(
    select 1 from public.digital_reading_withdrawal_claims_private_v1 c
    where c.subject_id=p_subject_id
  ) then
    raise exception 'Withdrawal claim remains after account finalization'
      using errcode='23514';
  end if;

  -- Subject is the retained anonymized tombstone required by retained Commerce FKs.
  -- auth_user_id intentionally remains until hosted Auth deletion succeeds.
  update public.subjects
  set status = 'deleted',
      merged_into_subject_id = null,
      updated_at = v_now
  where id = p_subject_id;

  -- Validate all deferred FK/constraint triggers before the function returns and restore
  -- the caller-visible constraint mode to IMMEDIATE.
  set constraints all immediate;

  perform pg_catalog.set_config(
    'myeongha.account_deletion_finalizer_subject_id',
    '',
    true
  );

  return query
  select true, false, (v_auth_user_id is not null);
end;
$account_finalizer$;

-- Existing finalizer grants are preserved; no new EXECUTE privilege added.
revoke all on function public.internal_finalize_account_deletion_db_v1(uuid,uuid,text) from public;

-- Exact authenticated member claim submission. The API executor has no
-- direct table privileges, and the definer validates the trusted Subject.
-- A valid claim is NOT a refund decision, a provider cancel or Grant revoke.
create function public.cmd_receive_digital_reading_withdrawal_claim_v1(
  p_subject_id uuid,p_purchase_intent_id uuid,p_unit_id uuid,
  p_reason_code text,p_idempotency_hmac text,p_request_hash text
)
returns table(claim_id uuid,received_at timestamptz,replayed boolean)
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_claim_receive$
declare
  v_claim public.digital_reading_withdrawal_claims_private_v1%rowtype;
  v_purchase_count bigint;
begin
  if p_subject_id is null
    or ((p_purchase_intent_id is null)<>(p_unit_id is null))
    or p_reason_code not in ('change_of_mind','not_provided','delivery_failed',
      'not_as_described','defect','duplicate_charge','unprovided_separable_part','other')
    or p_idempotency_hmac !~ '^hmac-sha256:k1:[0-9a-f]{64}$'
    or p_request_hash !~ '^sha256:v1:[0-9a-f]{64}$' then
    raise exception 'Withdrawal claim has invalid fields' using errcode='23514';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  -- Serialize with the account finalizer's Subject FOR UPDATE.
  -- No claim may be inserted after the finalizer deleted service children.
  perform 1 from public.subjects s
    where s.id=p_subject_id and s.kind='member'
      and s.status in ('active','deletion_pending')
    for share;
  if not found then
    raise exception 'Verified member unavailable' using errcode='42501';
  end if;

  -- The same immutable exact purchased Unit authority as the previously
  -- reviewed read-only private claim preflight. The server never trusts a
  -- browser purchase flag, customer-selected Reader or payment amount.
  if p_purchase_intent_id is not null then
  select count(*) into v_purchase_count
  from public.purchase_intents pi
  join public.product_offers offer on offer.id=pi.product_offer_id
  join public.standard_reading_product_specs spec
    on spec.product_id=offer.product_id and spec.purchase_unit_mode='topic_reader_reading'
  join public.purchase_intent_reader_selections sel
    on sel.purchase_intent_id=pi.id and sel.product_id=offer.product_id
  join public.digital_reading_checkout_notice_presentations_v1 pres
    on pres.purchase_intent_id=pi.id and pres.subject_id=pi.subject_id
    and pres.product_id=offer.product_id
    and pres.product_spec_version=spec.spec_version
    and pres.reader_character_id=sel.reader_character_id
    and pres.reader_content_bundle_id=sel.reader_content_bundle_id
  join public.commerce_receipts cr
    on cr.purchase_intent_id=pi.id and cr.subject_id=pi.subject_id
    and cr.product_offer_id=pi.product_offer_id
    and cr.provider='portone_v2' and cr.platform='web'
    and cr.environment='production'
    and cr.verification_status in ('verified','revoked')
    and cr.verified_at is not null
    and cr.verified_at>pres.server_presented_at
    and cr.verified_amount_minor=pi.expected_amount_minor
    and cr.verified_currency=pi.expected_currency
  where pi.id=p_purchase_intent_id and pi.subject_id=p_subject_id
    and pres.unit_id=p_unit_id
    and pi.expected_amount_minor>0 and pi.expected_currency is not null
    and pi.status='verified';
  if v_purchase_count<>1 then
    raise exception 'Exact verified purchased Reading unit not proven'
      using errcode='23514';
  end if;
  end if;

  -- No purchase identity is deliberately an unlinked customer complaint.
  -- It is NOT evidence of a paid transaction, provider refund or ownership.
  insert into public.digital_reading_withdrawal_claims_private_v1(
    subject_id,purchase_intent_id,unit_id,reason_code,
    idempotency_hmac,request_hash
  ) values (
    p_subject_id,p_purchase_intent_id,p_unit_id,p_reason_code,
    p_idempotency_hmac,p_request_hash
  ) on conflict (subject_id,idempotency_hmac) do nothing
  returning * into v_claim;
  if found then
    claim_id:=v_claim.id;
    received_at:=v_claim.received_at;
    replayed:=false;
    return next;
    return;
  end if;
  select * into strict v_claim
  from public.digital_reading_withdrawal_claims_private_v1 c
  where c.subject_id=p_subject_id
    and c.idempotency_hmac=p_idempotency_hmac
  for share;
  if v_claim.purchase_intent_id is distinct from p_purchase_intent_id
    or v_claim.unit_id is distinct from p_unit_id
    or v_claim.reason_code is distinct from p_reason_code
    or v_claim.request_hash is distinct from p_request_hash
    or v_claim.contract_version is distinct from 'digital-reading-withdrawal-claim-v1'
    then
    raise exception 'Withdrawal claim replay conflicts with original request'
      using errcode='23514';
  end if;
  claim_id:=v_claim.id;
  received_at:=v_claim.received_at;
  replayed:=true;
  return next;
end;
$reader_claim_receive$;

create function public.qry_received_digital_reading_withdrawal_claim_v1(
  p_subject_id uuid,p_claim_id uuid
)
returns table(claim_id uuid,received_at timestamptz,request_state text)
language plpgsql stable security definer
set search_path=pg_catalog,public
as $reader_claim_status$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  return query
    select c.id,c.received_at,
      case
        when d.status='confirmed' then 'refund_confirmed'
        when d.status in ('dispatching','submitted') then 'refund_processing'
        when d.status='approved' then 'refund_decision_recorded'
        else 'received'
      end::text
    from public.digital_reading_withdrawal_claims_private_v1 c
    left join public.commerce_reader_full_refund_dispatches_v1 d
      on d.source_claim_fingerprint=
        'sha256:v1:'||pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to(c.id::text,'UTF8')),'hex')
      and exists(
        select 1 from public.commerce_receipts cr
        where cr.id=d.receipt_id and cr.subject_id=c.subject_id
      )
    where c.subject_id=p_subject_id and c.id=p_claim_id
      and c.contract_version='digital-reading-withdrawal-claim-v1'
    limit 1;
end;
$reader_claim_status$;

revoke all on function public.cmd_receive_digital_reading_withdrawal_claim_v1(
  uuid,uuid,uuid,text,text,text) from public;
revoke all on function public.qry_received_digital_reading_withdrawal_claim_v1(
  uuid,uuid) from public;
do $reader_claim_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role','myeongha_worker_runtime',
      'myeongha_commerce_internal_executor','myeongha_api_executor')
  loop
    execute pg_catalog.format(
      'revoke all on function public.cmd_receive_digital_reading_withdrawal_claim_v1(uuid,uuid,uuid,text,text,text) from %I',v_role);
    execute pg_catalog.format(
      'revoke all on function public.qry_received_digital_reading_withdrawal_claim_v1(uuid,uuid) from %I',v_role);
  end loop;
end;
$reader_claim_acl$;
grant execute on function public.cmd_receive_digital_reading_withdrawal_claim_v1(
  uuid,uuid,uuid,text,text,text) to myeongha_api_executor;
grant execute on function public.qry_received_digital_reading_withdrawal_claim_v1(
  uuid,uuid) to myeongha_api_executor;
