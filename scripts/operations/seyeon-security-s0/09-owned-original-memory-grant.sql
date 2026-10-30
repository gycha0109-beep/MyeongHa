-- Watchtower-Track: security
-- S0 source-only candidate: explicit Member consent to grant one previously
-- accepted, provenance-backed conversation_recall/v1 Memory to Se-yeon.
-- NEVER install in Production until SRC-25/Grant authority/DR is approved.
-- Default CLOSED: no EXECUTE to API, no writable registry, no route, no model.
begin;

-- DB Owner is a NOLOGIN role. Only the owner command may INSERT a Grant.
-- A caller can never INSERT/UPDATE the grant table directly.
grant select (source_turn_id,source_message_id,created_by_character_id)
  on public.memory_items to myeongha_seyeon_chat_runtime_owner;
grant insert (id,subject_id,memory_item_id,grantee_character_id,grant_reason,granted_at)
  on public.record_access_grants to myeongha_seyeon_chat_runtime_owner;
create policy seyeon_owned_memory_explicit_grant_insert_v1
  on public.record_access_grants for insert
  to myeongha_seyeon_chat_runtime_owner
  with check (
    subject_id=public.current_myeongha_subject_id()
    and grantee_character_id='seyeon'
    and grant_reason='user_choice'
    and life_fact_id is null and revoked_at is null
  );

grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema public to myeongha_seyeon_chat_runtime_owner;

create function public.cmd_grant_seyeon_owned_conversation_recall_v1(
  p_subject_id uuid, p_memory_item_id uuid, p_new_grant_id uuid
)
returns table(memory_item_id uuid,grant_id uuid,character_id text,replayed boolean)
language plpgsql security definer
set search_path=pg_catalog,public
as $grant$
declare v_source_turn uuid; v_source_message uuid;
begin
  if p_subject_id is null or p_memory_item_id is null or p_new_grant_id is null then
    raise exception using errcode='23514',
      constraint='seyeon_owned_grant_input_required',
      message='Explicit grant requires canonical server identifiers';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);

  -- Independent source persistence authority: forward stop blocks all new
  -- Grant creation, even when the HTTP caller has previously consented.
  perform 1 from public.seyeon_positive_source_type_registry_v1 reg
    where reg.record_kind='memory'
      and reg.record_type='conversation_recall'
      and reg.schema_version='v1'
      and reg.projector_version='seyeon-conversation-recall-projector-v1'
      and reg.writable_enabled
    for share of reg;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_owned_grant_type_unapproved',
      message='S0 original grant writing is disabled';
  end if;

  -- Only the original DB-accepted proposal can authorize a new Grant.
  -- The API/Member never supplies the Memory payload, type or provenance.
  select m.source_turn_id,m.source_message_id
    into v_source_turn,v_source_message
  from public.memory_items m
  join public.memory_proposals p
    on p.accepted_memory_item_id=m.id and p.subject_id=m.subject_id
  where m.id=p_memory_item_id and m.subject_id=p_subject_id
    and m.revoked_at is null and m.source_kind='user_approved'
    and m.memory_type='conversation_recall' and m.schema_version='v1'
    and m.created_by_character_id='seyeon'
    and m.source_turn_id is not null
    and p.status='accepted' and p.proposal_kind='memory'
    and p.character_id='seyeon' and p.record_type='conversation_recall'
    and p.schema_version='v1'
    and p.source_turn_id=m.source_turn_id
    and p.source_message_id is not distinct from m.source_message_id
    and p.proposed_value_jsonb=m.content_jsonb
  for share of m,p;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_owned_grant_accepted_source_required',
      message='A current owner-accepted original Memory is required';
  end if;

  perform 1 from public.chat_turns t
    join public.conversation_threads th
      on th.id=t.thread_id and th.subject_id=t.subject_id
    where t.id=v_source_turn and t.subject_id=p_subject_id
      and t.state in ('committed','delivered') and t.committed_at is not null
      and th.thread_type='single_character'
      and th.status in ('active','archived')
      and exists (
        select 1 from public.conversation_thread_characters tc
        where tc.thread_id=t.thread_id and tc.character_id='seyeon'
          and tc.role='primary'
          and tc.joined_at<=t.committed_at
          and (tc.left_at is null or tc.left_at>=t.committed_at)
      )
  for share of t;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_owned_grant_original_turn_required',
      message='Original committed single-Character Turn is unavailable';
  end if;

  if v_source_message is not null then
    perform seyeon_private.lock_memory_source_message_v1(
      p_subject_id,v_source_turn,v_source_message
    );
  end if;

  -- Subject is already locked. A second concurrent consent cannot create
  -- another active Grant, and an in-progress withdrawal cannot be bypassed.
  perform 1 from public.record_access_grants g
    where g.subject_id=p_subject_id
      and g.memory_item_id=p_memory_item_id
      and g.grantee_character_id='seyeon'
      and g.revoked_at is null;
  if found then
    raise exception using errcode='23514',
      constraint='seyeon_owned_grant_active_exists',
      message='A current or withdrawing original Grant already exists';
  end if;

  insert into public.record_access_grants(
    id,subject_id,memory_item_id,grantee_character_id,grant_reason,granted_at
  ) values(
    p_new_grant_id,p_subject_id,p_memory_item_id,'seyeon',
    'user_choice',clock_timestamp()
  );
  return query select p_memory_item_id,p_new_grant_id,'seyeon'::text,false;
end
$grant$;

alter function public.cmd_grant_seyeon_owned_conversation_recall_v1(uuid,uuid,uuid)
  owner to myeongha_seyeon_chat_runtime_owner;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;
revoke all on function public.cmd_grant_seyeon_owned_conversation_recall_v1(uuid,uuid,uuid)
  from public,anon,authenticated,service_role,myeongha_api_executor;
revoke myeongha_seyeon_chat_runtime_owner from current_user;

-- No API EXECUTE, no source activation, no HTTP route, no initial Grant.
commit;
