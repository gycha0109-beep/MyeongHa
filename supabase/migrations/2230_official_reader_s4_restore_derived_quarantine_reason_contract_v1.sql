-- Forward-only S4 restore quarantine reason contract.
-- The 2200 private offline restore check already aborts both authorized
-- account/refund tombstone replay functions in the SAME transaction when
-- ordinary data derived from a protected paid Reader message still exists.
-- Distinguish the remaining category for Privacy/DB Owner remediation,
-- without returning row contents, subjects, counts, key refs or source IDs.
-- No deletion, status reset, new owner, new runtime EXECUTE grant or release.
-- Public Reader, all paid S5/S6 and ordinary restore consumers remain OFF.
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

  -- Do not delete the S5 safe marker: its immutable system-only provenance
  -- survives encrypted body tombstones and remains an isolation authority.
  if exists (
    select 1
    from public.memory_items item
    join public.conversation_messages marker
      on marker.subject_id=item.subject_id
     and marker.sender_type='system'
     and marker.content_hash=
       'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
     and (item.source_turn_id=marker.turn_id
       or item.source_message_id=marker.id)
    where item.subject_id=p_subject_id
  ) then
    raise exception using errcode='P0001',
      constraint='reader_restored_memory_items_quarantined',
      message='Reader ordinary Memory derivation remains quarantined';
  end if;

  if exists (
    select 1
    from public.memory_proposals proposal
    join public.conversation_messages marker
      on marker.subject_id=proposal.subject_id
     and marker.sender_type='system'
     and marker.content_hash=
       'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
     and (proposal.source_turn_id=marker.turn_id
       or proposal.source_message_id=marker.id)
    where proposal.subject_id=p_subject_id
  ) then
    raise exception using errcode='P0001',
      constraint='reader_restored_memory_proposals_quarantined',
      message='Reader ordinary Memory proposal remains quarantined';
  end if;

  if exists (
    select 1
    from public.life_facts fact
    join public.conversation_messages marker
      on marker.subject_id=fact.subject_id
     and marker.sender_type='system'
     and marker.content_hash=
       'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
     and fact.source_message_id=marker.id
    where fact.subject_id=p_subject_id
  ) then
    raise exception using errcode='P0001',
      constraint='reader_restored_life_facts_quarantined',
      message='Reader ordinary Life Fact derivation remains quarantined';
  end if;

  if exists (
    select 1
    from public.conversation_messages marker
    join public.outbox_events event
      on (
        (event.aggregate_type='chat_turn'
          and event.aggregate_id=marker.turn_id::text)
        or
        (event.aggregate_type='conversation_message'
          and event.aggregate_id=marker.id::text)
      )
    where marker.subject_id=p_subject_id
      and marker.sender_type='system'
      and marker.content_hash=
        'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
  ) then
    raise exception using errcode='P0001',
      constraint='reader_restored_chat_outbox_quarantined',
      message='Reader ordinary Chat Outbox derivation remains quarantined';
  end if;
end
$reader_restored_derived_absent$;

-- CREATE OR REPLACE preserves the restrictive function ACL of migration
-- 2200. There must be NO direct API/Worker EXECUTE grant to this helper.
revoke all on function public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(uuid)
  from public;

comment on function public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(uuid)
is 'S4 offline-only categorical fail-closed restore gate for paid Reader system-marker derivatives: Memory Items, Proposals, Life Facts, Chat Outbox. Already authorized account/refund replay calls it within their existing isolated transaction; categorical constraint name only, no identifiers or destructive reconciliation.';
