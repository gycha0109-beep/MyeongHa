-- S4 private paid Reader material must not cross into ordinary derived
-- Chat/Memory/Life Fact/Outbox pipelines.
--
-- This migration protects the EXACT safe marker from 1960 by sender+hash.
-- It never reads ciphertext/private key refs or attempts to infer whether
-- arbitrary user-authored prose "looks like" a paid interpretation.
-- Ordinary character conversation, granted Memory, Search/summary inputs,
-- and the original Chat stream remain otherwise unchanged.
--
-- Protected source turns/messages are NOT valid origins for an ordinary
-- Memory Item, Memory Proposal, Life Fact, or downstream Chat Outbox event.
-- Historical data deletion/redaction is still permitted. The last published
-- protected ciphertext is governed by S4 off-primary tombstone/erase, not
-- by ordinary Memory revocation.
--
-- Owner/Privacy/Production approval remains HOLD. No public/runtime grants,
-- new roles, new LLM requests, or active release flags.
-- Watchtower-Track: db-authority-core

-- This is the exact invariant content hash persisted for the S5 safe system
-- message, NOT a hash of the private paid answer or of its Source Proof.
create or replace function public.internal_guard_official_reader_safe_chat_marker_v1()
returns trigger
language plpgsql
volatile security definer
set search_path=pg_catalog,public
as $reader_safe_marker_immutability$
declare
  v_safe_hash constant text :=
    'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63';
  v_marker_write boolean:=false;
begin
  -- NEW is available on INSERT/UPDATE, but OLD is not assigned on INSERT.
  -- Keep the distinction explicit to avoid touching a missing OLD record.
  if tg_op='INSERT' then
    v_marker_write:=(new.content_hash=v_safe_hash);
  elsif tg_op='UPDATE' then
    v_marker_write:=(
      old.content_hash=v_safe_hash or new.content_hash=v_safe_hash
    );
  end if;

  -- Never treat a normal user sentence as S5 provenance. Only an exact
  -- S5-derived system marker with the authoritative fixed marker hash.
  if v_marker_write then

    if new.content_hash is distinct from v_safe_hash
       or new.sender_type is distinct from 'system'
       or new.message_payload_jsonb is not null
       or new.message_schema_version is not null
       or new.turn_id is null
       or (new.redacted_at is null
         and new.body_text is distinct from '유료 해설 기록이 있습니다.')
       or (new.redacted_at is not null
         and new.body_text is not null
         and new.body_text is distinct from '유료 해설 기록이 있습니다.')
    then
      raise exception using errcode='23514',
        constraint='official_reader_safe_marker_content_boundary',
        message='Protected Reader safe marker cannot contain or become paid content';
    end if;

    if tg_op='UPDATE' then
      if old.content_hash is distinct from v_safe_hash
         or new.id is distinct from old.id
         or new.subject_id is distinct from old.subject_id
         or new.thread_id is distinct from old.thread_id
         or new.turn_id is distinct from old.turn_id
         or new.sequence_no is distinct from old.sequence_no
         or new.sender_type is distinct from old.sender_type
         or new.thread_character_id is distinct from old.thread_character_id
         or new.character_content_bundle_id is distinct from old.character_content_bundle_id
         or new.created_at is distinct from old.created_at
         or (old.redacted_at is not null and new.redacted_at is null)
         or (new.body_text is distinct from old.body_text
             and not (new.redacted_at is not null and new.body_text is null))
      then
        raise exception using errcode='23514',
          constraint='official_reader_safe_marker_origin_immutable',
          message='Protected Reader safe message identity cannot be rewritten';
      end if;
    end if;
  end if;

  return new;
end
$reader_safe_marker_immutability$;

revoke all on function public.internal_guard_official_reader_safe_chat_marker_v1()
  from public;

create trigger official_reader_s4_safe_marker_write_guard_v1
before insert or update on public.conversation_messages
for each row execute function public.internal_guard_official_reader_safe_chat_marker_v1();

-- Guard only source-provenance from S5. A user's independent ordinary
-- statement is NEVER claimed to be protected Reader content from its text.
-- The source turn remains recognizable even after ciphertext/key erasure,
-- because the S4 safe Chat marker is retained under the Chat policy.
create or replace function public.internal_reject_official_reader_derivation_source_v1()
returns trigger
language plpgsql
volatile security definer
set search_path=pg_catalog,public
as $reader_derived_source_guard$
declare
  v_subject uuid;
  v_message uuid;
  v_turn uuid;
  v_record jsonb;
  v_protected boolean;
begin
  v_record:=pg_catalog.to_jsonb(new);
  v_subject:=(v_record->>'subject_id')::uuid;
  v_message:=(v_record->>'source_message_id')::uuid;
  v_turn:=(v_record->>'source_turn_id')::uuid;

  -- Corrective revocation/rejection of already existing rows must remain
  -- possible without approving a new derived text/value.
  if tg_op='UPDATE' and tg_table_name='memory_proposals' then
    -- Other records (memory_items/life_facts) do not have proposal-only
    -- fields. Inspect the JSONB record only inside this specific branch.
    if v_record->>'status' in ('rejected','expired')
       and (v_record->'proposed_value_jsonb') is not distinct from
           (pg_catalog.to_jsonb(old)->'proposed_value_jsonb')
       and (v_record->>'source_message_id') is not distinct from
           (pg_catalog.to_jsonb(old)->>'source_message_id')
       and (v_record->>'source_turn_id') is not distinct from
           (pg_catalog.to_jsonb(old)->>'source_turn_id') then
      return new;
    end if;
  end if;

  if v_subject is null or (v_message is null and v_turn is null) then
    return new;
  end if;

  select exists (
    select 1
    from public.conversation_messages marker
    where marker.subject_id=v_subject
      and marker.sender_type='system'
      and marker.content_hash=
        'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
      and (
        (v_message is not null and marker.id=v_message)
        or (v_turn is not null and marker.turn_id=v_turn)
      )
  ) into v_protected;

  if v_protected then
    raise exception using errcode='23514',
      constraint='official_reader_s4_paid_turn_not_ordinary_memory_source',
      message='A protected Reader Chat turn cannot become ordinary stored Memory or Life Fact';
  end if;
  return new;
end
$reader_derived_source_guard$;

revoke all on function public.internal_reject_official_reader_derivation_source_v1()
  from public;

-- Updates that only revoke an existing Memory or Life Fact are unaffected.
-- Updates to an accepted proposal are checked, so a legacy proposal cannot
-- be promoted to ordinary Memory after a protected Reader turn is identified.
create trigger official_reader_s4_memory_item_source_guard_v1
before insert or update of source_turn_id,source_message_id,content_jsonb
on public.memory_items
for each row execute function public.internal_reject_official_reader_derivation_source_v1();

create trigger official_reader_s4_memory_proposal_source_guard_v1
before insert or update of source_turn_id,source_message_id,
  proposed_value_jsonb,status
on public.memory_proposals
for each row execute function public.internal_reject_official_reader_derivation_source_v1();

create trigger official_reader_s4_life_fact_source_guard_v1
before insert or update of source_message_id,value_jsonb
on public.life_facts
for each row execute function public.internal_reject_official_reader_derivation_source_v1();

-- No S5 paid-answer turn may become a generic analysis, summary, Search,
-- notification or downstream publisher Outbox source. S5 writes ONLY the
-- system safe marker + encrypted private row. The S4 Privacy deletion queue
-- is separate and is not an ordinary chat_turn Outbox event.
create or replace function public.internal_reject_official_reader_chat_outbox_v1()
returns trigger
language plpgsql
volatile security definer
set search_path=pg_catalog,public
as $reader_chat_outbox_guard$
declare
  v_aggregate uuid;
begin
  if new.aggregate_type in ('chat_turn','conversation_message')
     and new.aggregate_id ~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    v_aggregate:=new.aggregate_id::uuid;

    if exists (
      select 1
      from public.conversation_messages marker
      where marker.sender_type='system'
        and marker.content_hash=
          'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
        and (
          (new.aggregate_type='chat_turn' and marker.turn_id=v_aggregate)
          or (new.aggregate_type='conversation_message' and marker.id=v_aggregate)
        )
    ) then
      raise exception using errcode='23514',
        constraint='official_reader_s4_paid_turn_not_generic_outbox_source',
        message='Protected Reader source cannot enter ordinary downstream Outbox';
    end if;
  end if;
  return new;
end
$reader_chat_outbox_guard$;

revoke all on function public.internal_reject_official_reader_chat_outbox_v1()
  from public;

create trigger official_reader_s4_outbox_source_guard_v1
before insert or update of aggregate_type,aggregate_id,payload_jsonb,event_type
on public.outbox_events
for each row execute function public.internal_reject_official_reader_chat_outbox_v1();

comment on function public.internal_reject_official_reader_derivation_source_v1()
is 'S4 fail-closed on exact S5 protected Chat turn/message provenance for Memory Items, Memory Proposals and Life Facts, while allowing ordinary Chat and privacy revocation. No text fingerprint guesses.';
comment on function public.internal_reject_official_reader_chat_outbox_v1()
is 'S4 prohibits generic Chat-turn/Message Outbox events whose source is the exact S5 protected paid Reader safe marker. No new Search, notification or Memory delivery authority.';


-- S5 writes the safe marker after the Chat Turn has been staged. Prevent a
-- TOCTOU reverse-order escape where an ordinary Memory/Analysis derivation
-- already refers to that turn BEFORE the protected marker is inserted.
-- All such S5 writes fail atomically rather than leaving an ordinary
-- derived copy; existing non-paid Chat writes are untouched.
create or replace function public.internal_guard_official_reader_prior_ordinary_derivation_v1()
returns trigger
language plpgsql
volatile security definer
set search_path=pg_catalog,public
as $reader_prior_derivation$
begin
  if new.sender_type='system'
     and new.content_hash=
       'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
     and (
       exists (
         select 1 from public.memory_items item
         where item.subject_id=new.subject_id
           and item.revoked_at is null
           and (item.source_turn_id=new.turn_id or item.source_message_id=new.id)
       )
       or exists (
         select 1 from public.memory_proposals proposal
         where proposal.subject_id=new.subject_id
           and proposal.status in ('pending','accepted')
           and (proposal.source_turn_id=new.turn_id or proposal.source_message_id=new.id)
       )
       or exists (
         select 1 from public.life_facts fact
         where fact.subject_id=new.subject_id
           and fact.revoked_at is null
           and fact.source_message_id=new.id
       )
       or exists (
         select 1 from public.outbox_events event
         where (
           (event.aggregate_type='chat_turn' and event.aggregate_id=new.turn_id::text)
           or (event.aggregate_type='conversation_message'
             and event.aggregate_id=new.id::text)
         )
       )
     )
  then
    raise exception using errcode='23514',
      constraint='official_reader_s4_safe_marker_prior_derivation_exists',
      message='Protected Reader commit cannot follow ordinary Memory/Outbox derivation';
  end if;
  return new;
end
$reader_prior_derivation$;

revoke all on function public.internal_guard_official_reader_prior_ordinary_derivation_v1()
  from public;

create trigger official_reader_s4_safe_marker_prior_derivation_guard_v1
after insert on public.conversation_messages
for each row execute function
  public.internal_guard_official_reader_prior_ordinary_derivation_v1();

comment on function public.internal_guard_official_reader_prior_ordinary_derivation_v1()
is 'S4 reverse-order fence at S5 safe marker insertion. Abort the paid-answer transaction if a committed ordinary Memory/Proposal/Life Fact or Chat Outbox already depends on its turn. Safe marker does not authorize search, summary or AI Memory derivation.';
