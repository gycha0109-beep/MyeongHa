-- Watchtower-Track: security
-- First real, atomic private-only acceptance of a user-approved
-- Character conversation Memory proposal on existing public tables.
-- This is NOT a generic positive SRC-25 registry or character Grant creator.
-- SOURCE-ONLY Draft: NO EXECUTE for application users, NO enabled type, no
-- Production deployment. Public/user grant creation remains unavailable.
begin;

-- Existing production NOLOGIN owner executes this fixed-scope command. It
-- gains only column-scoped source read/update and output-row insert privileges.
-- The ordinary API executor gets no direct DML or RPC access.
grant select (id,subject_id,character_id,proposal_kind,record_type,
  schema_version,proposed_value_jsonb,source_turn_id,source_message_id,
  status,accepted_memory_item_id)
  on public.memory_proposals to myeongha_seyeon_chat_runtime_owner;
grant update (status,accepted_memory_item_id,resolved_at)
  on public.memory_proposals to myeongha_seyeon_chat_runtime_owner;
grant insert (id,subject_id,memory_type,schema_version,content_jsonb,
  source_kind,source_turn_id,source_message_id,created_by_character_id,
  revoked_at,created_at)
  on public.memory_items to myeongha_seyeon_chat_runtime_owner;

create policy seyeon_private_memory_proposal_select_v1
  on public.memory_proposals for select
  to myeongha_seyeon_chat_runtime_owner
  using (subject_id=public.current_myeongha_subject_id());
create policy seyeon_private_memory_proposal_update_v1
  on public.memory_proposals for update
  to myeongha_seyeon_chat_runtime_owner
  using (subject_id=public.current_myeongha_subject_id())
  with check (subject_id=public.current_myeongha_subject_id());
create policy seyeon_private_memory_insert_v1
  on public.memory_items for insert
  to myeongha_seyeon_chat_runtime_owner
  with check (subject_id=public.current_myeongha_subject_id());

grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema public to myeongha_seyeon_chat_runtime_owner;

create function public.cmd_accept_seyeon_private_conversation_recall_proposal_v1(
  p_subject_id uuid,
  p_proposal_id uuid,
  p_memory_item_id uuid
)
returns table (
  memory_item_id uuid,
  grant_count integer,
  replayed boolean
)
language plpgsql
security definer
set search_path=pg_catalog, public
as $accept$
declare
  v_proposal record;
  v_source_turn_id uuid;
  v_summary text;
  v_created_at timestamptz;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_subject_id is null or p_proposal_id is null
     or p_memory_item_id is null
  then
    raise exception using errcode='23514',
      constraint='seyeon_private_memory_accept_invalid_input',
      message='Private Memory acceptance requires exact original server identifiers';
  end if;

  -- Deliberately disabled until normative S0 source registry has an
  -- approved writable entry. This migration never inserts such a row.
  perform 1 from public.seyeon_positive_source_type_registry_v1 reg
  where reg.record_kind='memory'
    and reg.record_type='conversation_recall'
    and reg.schema_version='v1'
    and reg.projector_version='seyeon-conversation-recall-projector-v1'
    and reg.writable_enabled;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_private_memory_accept_type_unapproved',
      message='Conversation Memory type has not been approved for persistence';
  end if;

  -- Canonical order: Subject -> committed source Turn -> original Proposal.
  -- A first read of source_turn_id is not authority: it only selects the
  -- lock to acquire. The locked Proposal must still reference exactly
  -- that same Turn, so mutation/races never authorize a different origin.
  perform 1 from public.subjects s
  where s.id=p_subject_id and s.kind='member' and s.status='active'
    and s.merged_into_subject_id is null
  for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_private_memory_accept_subject_invalid',
      message='Private Memory acceptance requires canonical active Member';
  end if;

  select p.source_turn_id into v_source_turn_id
  from public.memory_proposals p
  where p.id=p_proposal_id and p.subject_id=p_subject_id;
  if v_source_turn_id is null then
    raise exception using errcode='23514',
      constraint='seyeon_private_memory_accept_source_missing',
      message='Original Memory Proposal source Turn is unavailable';
  end if;

  -- Only an actually completed original single-Character Se-yeon Turn
  -- may be promoted into a durable approved conversation recall.
  perform 1
  from public.chat_turns t
  join public.conversation_threads th
    on th.id=t.thread_id and th.subject_id=t.subject_id
  where t.id=v_source_turn_id and t.subject_id=p_subject_id
    and t.state in ('committed','delivered')
    and t.committed_at is not null
    and th.thread_type='single_character'
    and th.status in ('active','archived')
    and exists (
      select 1 from public.conversation_thread_characters tc
      where tc.thread_id=t.thread_id
        and tc.character_id='seyeon'
        and tc.role='primary'
        and tc.joined_at<=t.committed_at
        and (tc.left_at is null or tc.left_at>=t.committed_at)
    )
  for share of t;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_private_memory_accept_source_turn_uncommitted',
      message='Original Se-yeon source Turn is not durably committed';
  end if;

  -- The only authoritative payload and schema read is inside this DB Owner.
  -- No caller/raw API SELECT and no caller-provided digest. FOR UPDATE
  -- holds the original Proposal against double acceptance and edits.
  select p.character_id,p.proposal_kind,p.record_type,p.schema_version,
         p.proposed_value_jsonb,p.source_turn_id,p.source_message_id,
         p.status,p.accepted_memory_item_id
    into v_proposal
  from public.memory_proposals p
  where p.id=p_proposal_id and p.subject_id=p_subject_id
    and p.source_turn_id=v_source_turn_id
  for update;
  if not found
     or v_proposal.character_id is distinct from 'seyeon'
     or v_proposal.proposal_kind is distinct from 'memory'
     or v_proposal.record_type is distinct from 'conversation_recall'
     or v_proposal.schema_version is distinct from 'v1'
     or v_proposal.status is distinct from 'pending'
     or v_proposal.accepted_memory_item_id is not null then
    raise exception using errcode='23514',
      constraint='seyeon_private_memory_accept_proposal_not_pending',
      message='Original Se-yeon Memory Proposal is not pending';
  end if;

  -- A specified origin Message must still exist in this exact committed
  -- Turn and must not already have been redacted. Character messages must
  -- belong to Se-yeon; a user message can legitimately be the source.
  if v_proposal.source_message_id is not null then
    perform 1
    from public.conversation_messages m
    left join public.conversation_thread_characters tc
      on tc.id=m.thread_character_id and tc.thread_id=m.thread_id
    where m.id=v_proposal.source_message_id
      and m.subject_id=p_subject_id
      and m.turn_id=v_source_turn_id
      and m.redacted_at is null
      and (m.sender_type='user'
           or (m.sender_type='character' and tc.character_id='seyeon'))
    for share of m;
    if not found then
      raise exception using errcode='23514',
        constraint='seyeon_private_memory_accept_source_message_invalid',
        message='Original Memory source Message is unavailable or redacted';
    end if;
  end if;

  -- Explicit, versioned v1 codec: exactly one JSON string field. Do not
  -- trust arbitrary raw JSON or let a model establish memory provenance.
  if jsonb_typeof(v_proposal.proposed_value_jsonb) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(v_proposal.proposed_value_jsonb))<>1
     or not (v_proposal.proposed_value_jsonb ? 'summary')
     or jsonb_typeof(v_proposal.proposed_value_jsonb->'summary')
        is distinct from 'string' then
    raise exception using errcode='23514',
      constraint='seyeon_private_memory_accept_payload_invalid',
      message='Memory content does not match the registered schema';
  end if;
  v_summary:=v_proposal.proposed_value_jsonb->>'summary';
  if v_summary is null or length(v_summary) not between 1 and 4000
     or v_summary is distinct from btrim(v_summary)
     or v_summary ~ '[[:cntrl:]]'
     or position(chr(127) in v_summary)<>0 then
    raise exception using errcode='23514',
      constraint='seyeon_private_memory_accept_summary_invalid',
      message='Memory content does not match the registered schema';
  end if;

  v_created_at:=clock_timestamp();
  -- NO record_access_grants INSERT: this is the explicitly private (0 grants)
  -- user choice, never character_only or current_characters.
  insert into public.memory_items (
    id,subject_id,memory_type,schema_version,content_jsonb,source_kind,
    source_turn_id,source_message_id,created_by_character_id,
    revoked_at,created_at
  ) values (
    p_memory_item_id,p_subject_id,'conversation_recall','v1',
    v_proposal.proposed_value_jsonb,'user_approved',
    v_proposal.source_turn_id,v_proposal.source_message_id,'seyeon',
    null,v_created_at
  );

  update public.memory_proposals p
  set status='accepted',accepted_memory_item_id=p_memory_item_id,
      resolved_at=v_created_at
  where p.id=p_proposal_id and p.subject_id=p_subject_id
    and p.status='pending';

  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_private_memory_accept_transition_failed',
      message='Proposal acceptance state transition failed';
  end if;

  return query select p_memory_item_id,0::integer,false;
end
$accept$;

alter function public.cmd_accept_seyeon_private_conversation_recall_proposal_v1(
  uuid,uuid,uuid
) owner to myeongha_seyeon_chat_runtime_owner;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
revoke all on function public.cmd_accept_seyeon_private_conversation_recall_proposal_v1(
  uuid,uuid,uuid
) from public,anon,authenticated,service_role;

-- No GRANT EXECUTE to myeongha_api_executor, no HTTP registration, no
-- positive registry row or character Grant creation, no Production DB writes.
commit;
