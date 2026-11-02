-- S4: offline-only restore isolation for ordinary AI/Memory derivatives.
-- Existing off-primary encrypted account/refund tombstones are authoritative.
-- A DB backup may resurrect ordinary data derived from the S5 protected
-- system marker even after ciphertext/keys have been erased independently.
-- A restore MUST remain QUARANTINED until no such derived record survives.
--
-- This is intentionally *not* a new deletion or privacy-approval path:
-- exposing, revoking or destroying a historical ordinary Memory/Fact/Outbox
-- belongs to the existing Privacy/DB Owner lifecycle. We fail closed without
-- mutating owner-approved personal data or retained Commerce evidence.
-- The immutable safe marker survives S4 protected-body deletion and reveals
-- exact provenance even when ciphertext is already gone. Check all markers
-- for this Subject, not only the revoked body IDs: subsequent Reader purchases
-- in the same Subject must not accidentally become approved derived sources.
-- No public grant, new executor role, runtime activation or test/deploy.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(
  p_subject_id uuid
)
returns void
language plpgsql volatile security definer
set search_path=pg_catalog,public
set row_security=off
as $reader_restored_derived_absent$
begin
  if p_subject_id is null
     or pg_catalog.current_setting('transaction_isolation')<>'read committed'
     or pg_catalog.current_setting('myeongha.reader_restore_quarantine',true)
       is distinct from 'on'
  then
    raise exception using errcode='23514',
      constraint='reader_restored_ordinary_derived_quarantine_required',
      message='Reader ordinary-derived restore requires isolated quarantine';
  end if;

  -- Marker is the exact server-owned S5 SYSTEM hash, independent of any
  -- current purchase, a restored Grant or an already-destroyed DEK.
  if exists (
    select 1
    from public.conversation_messages marker
    where marker.subject_id=p_subject_id
      and marker.sender_type='system'
      and marker.content_hash=
        'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
      and (
        exists (
          select 1 from public.memory_items memory
          where memory.subject_id=marker.subject_id
            and (
              memory.source_turn_id=marker.turn_id
              or memory.source_message_id=marker.id
            )
        )
        or exists (
          select 1 from public.memory_proposals proposal
          where proposal.subject_id=marker.subject_id
            and (
              proposal.source_turn_id=marker.turn_id
              or proposal.source_message_id=marker.id
            )
        )
        or exists (
          select 1 from public.life_facts fact
          where fact.subject_id=marker.subject_id
            and fact.source_message_id=marker.id
        )
        or exists (
          select 1 from public.outbox_events event
          where (
            (event.aggregate_type='chat_turn'
              and event.aggregate_id=marker.turn_id::text)
            or (event.aggregate_type='conversation_message'
              and event.aggregate_id=marker.id::text)
          )
        )
      )
  ) then
    raise exception using errcode='P0001',
      constraint='reader_restored_ordinary_derived_data_quarantined',
      message='Restored paid Reader provenance remains in ordinary personal or outbox data';
  end if;
end
$reader_restored_derived_absent$;

revoke all on function public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(uuid)
  from public;
do $reader_restored_derived_acl$
declare r text;
begin
  for r in select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_system_executor',
      'myeongha_seyeon_chat_runtime_owner','myeongha_seyeon_post_turn_owner'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(uuid) from %I',r
    );
  end loop;
end
$reader_restored_derived_acl$;

comment on function public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(uuid)
is 'PRIVATE offline restore-only S4 fail-closed check against resurrected Memory/Proposal/Life Fact/Chat Outbox linked to an S5 safe system marker; called by already authorized restore functions only, not granted to app or worker.';

-- Recreate ONLY the function bodies, preserving every prior role EXECUTE,
-- SQL signature, existing isolated-quarantine guard and original exact-body
-- deletion/sibling purchase behavior. Their respective SECURITY DEFINER
-- owners retain their original permissions; there are NO new grants.

create or replace function public.internal_replay_offprimary_reader_account_deletion_v1(
  p_subject_id uuid,
  p_deletion_job_id uuid,
  p_external_fence_id text,
  p_original_body_ids uuid[]
)
returns table (
  erased_row_count bigint,
  remaining_subject_row_count bigint
)
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $reader_offprimary_restore$
declare
  v_expected_count bigint;
  v_erased_count bigint;
  v_remaining_count bigint;
begin
  if p_subject_id is null or p_deletion_job_id is null
     or p_external_fence_id is null
     or pg_catalog.length(p_external_fence_id) not between 1 and 256
     or p_external_fence_id<>pg_catalog.btrim(p_external_fence_id)
     or p_original_body_ids is null
     or pg_catalog.array_length(p_original_body_ids,1) not between 1 and 50000
     or pg_catalog.array_ndims(p_original_body_ids) is distinct from 1
     or pg_catalog.array_position(p_original_body_ids,null) is not null
     or pg_catalog.current_setting('transaction_isolation')<>'read committed'
     or pg_catalog.current_setting('myeongha.reader_restore_quarantine',true)
        is distinct from 'on' then
    raise exception using errcode='23514',
      constraint='reader_offprimary_restore_not_authorized',
      message='Reader off-primary tombstone replay requires offline restore quarantine';
  end if;

  select pg_catalog.count(distinct id)::bigint into v_expected_count
  from pg_catalog.unnest(p_original_body_ids) as body(id);
  if v_expected_count<>pg_catalog.array_length(p_original_body_ids,1) then
    raise exception using errcode='23514',
      constraint='reader_offprimary_restore_duplicate_body',
      message='Reader restore manifest contains repeated body IDs';
  end if;

  -- Exact subject can be ACTIVE in the old restored backup. Its state is NOT
  -- trusted here; the independent tombstone captured after backup wins.
  -- Lock the restored Subject before selecting personal child rows.
  perform 1 from public.subjects s
  where s.id=p_subject_id for update;

  -- Fail closed if the backup contains new or unexpected Reader bodies
  -- absent from the durable external deletion manifest. No partial cleanup.
  if exists (
    select 1 from public.official_reader_paid_answer_bodies b
    where b.subject_id=p_subject_id
      and not (b.id=any(p_original_body_ids))
  ) then
    raise exception using errcode='23514',
      constraint='reader_offprimary_restore_unlisted_body',
      message='Reader restored personal data exceeds its external deletion manifest';
  end if;

  delete from public.official_reader_paid_answer_bodies b
  where b.subject_id=p_subject_id
    and b.id=any(p_original_body_ids);

  get diagnostics v_erased_count=row_count;

  select pg_catalog.count(*)::bigint into v_remaining_count
  from public.official_reader_paid_answer_bodies b
  where b.subject_id=p_subject_id;
  if v_remaining_count<>0 then
    raise exception using errcode='23514',
      constraint='reader_offprimary_restore_protected_row_remains',
      message='Reader restored deletion is incomplete';
  end if;

  -- Never reinterpret restored Receipt/Grant as newly purchased entitlement.
  -- Other account-level privacy replay from the established DR plan remains
  -- mandatory, independently of this child-level physical purge.
  -- S4 isolation restore fence: an off-primary tombstone cannot certify a
  -- clean restore if ordinary Memory/Fact/Outbox has already derived from
  -- ANY protected S5 system marker of the same canonical Subject.
  -- Check in the SAME transaction after DB erasure and BEFORE commit; if
  -- any derivative remains, roll back and retain offline quarantine.
  perform public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(
    p_subject_id
  );
  return query select v_erased_count,v_remaining_count;
end
$reader_offprimary_restore$;

create or replace function public.internal_replay_offprimary_reader_refund_purge_v1(
  p_job_id uuid,
  p_subject_id uuid,
  p_official_reading_id uuid,
  p_reader_character_id text,
  p_external_fence_id uuid,
  p_original_body_ids uuid[]
)
returns table (erased_row_count bigint,remaining_tombstoned_row_count bigint)
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_refund_restore$
declare
  v_erased bigint;
  v_left bigint;
begin
  if p_job_id is null or p_subject_id is null or p_official_reading_id is null
     or p_external_fence_id is null or p_reader_character_id is null
     or pg_catalog.length(p_reader_character_id) not between 1 and 128
     or p_original_body_ids is null
     or pg_catalog.array_ndims(p_original_body_ids) is distinct from 1
     or pg_catalog.array_length(p_original_body_ids,1) not between 1 and 50000
     or pg_catalog.array_position(p_original_body_ids,null) is not null
     or pg_catalog.current_setting('transaction_isolation')<>'read committed'
     or pg_catalog.current_setting('myeongha.reader_restore_quarantine',true)
       is distinct from 'on' then
    raise exception using errcode='23514',
      constraint='reader_refund_restore_scope_invalid',
      message='Official Reader refund restore requires exact isolated tombstone authority';
  end if;

  if pg_catalog.array_length(p_original_body_ids,1) is distinct from
    (select pg_catalog.count(distinct body_id)::integer
     from pg_catalog.unnest(p_original_body_ids) as v(body_id)) then
    raise exception using errcode='23514',
      constraint='reader_refund_restore_duplicate_body',
      message='Official Reader refund restore has duplicate tombstoned body IDs';
  end if;

  -- No current Entitlement is trusted from an old backup. A duly erased
  -- body MUST stay erased, even if the restored purchase looks active.
  perform 1 from public.subjects s where s.id=p_subject_id for update;

  -- A later independent purchase can have new content in the SAME scope.
  -- Replay only the exact historical erased body IDs, not every body
  -- currently belonging to that scope. Reject an ID remapped to a different
  -- Subject/Reading/Reader: the external manifest is immutable.
  if exists (
    select 1 from public.official_reader_paid_answer_bodies b
    where b.id=any(p_original_body_ids)
      and (b.subject_id is distinct from p_subject_id
        or b.official_reading_id is distinct from p_official_reading_id
        or b.reader_character_id is distinct from p_reader_character_id)
  ) then
    raise exception using errcode='23514',
      constraint='reader_refund_restore_wrong_scope_body',
      message='Reader refund tombstone must not erase another scope';
  end if;

  delete from public.official_reader_paid_answer_bodies b
  where b.subject_id=p_subject_id
    and b.official_reading_id=p_official_reading_id
    and b.reader_character_id=p_reader_character_id
    and b.id=any(p_original_body_ids);
  get diagnostics v_erased=row_count;

  select pg_catalog.count(*) into v_left
  from public.official_reader_paid_answer_bodies b
  where b.id=any(p_original_body_ids);
  if v_left<>0 then
    raise exception using errcode='23514',
      constraint='reader_refund_restore_scope_leftover',
      message='Reader refund restore left tombstoned protected ciphertext';
  end if;
  -- S4 isolation restore fence: an off-primary tombstone cannot certify a
  -- clean restore if ordinary Memory/Fact/Outbox has already derived from
  -- ANY protected S5 system marker of the same canonical Subject.
  -- Check in the SAME transaction after DB erasure and BEFORE commit; if
  -- any derivative remains, roll back and retain offline quarantine.
  perform public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(
    p_subject_id
  );
  return query select v_erased,v_left;
end
$reader_refund_restore$;

comment on function public.internal_replay_offprimary_reader_account_deletion_v1(uuid,uuid,text,uuid[])
is 'S4 offline account deletion replay; exact off-primary manifest erasure followed by mandatory same-transaction ordinary-derived S5 provenance quarantine. No public API/restore release.';
comment on function public.internal_replay_offprimary_reader_refund_purge_v1(uuid,uuid,uuid,text,uuid,uuid[])
is 'S4 offline refund replay; exact original body IDs only; after deleting ciphertext refuse restored ordinary Memory/Outbox provenance before database commit. Other current Reader purchases unaffected.';
