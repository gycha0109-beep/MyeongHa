-- C09 private approved source capture, PROPOSAL ONLY, not a migration.
-- Requires original conversation_messages + C09 production read-gated schema.
-- No production GRANT, no runtime endpoint, no user-action capture adapter.
-- A pre-existing, independently issued user opt-in receipt is mandatory.
begin;

create table myeongha_internal.character_learning_private_optin_receipts_v1 (
  action_ref text primary key,
  subject_id uuid not null,
  original_message_id uuid not null,
  original_content_hash text not null,
  state text not null check (state in ('approved','withdrawn')),
  verified_at timestamptz not null,
  withdrawn_at timestamptz,
  unique (subject_id, original_message_id),
  foreign key (original_message_id, subject_id)
    references public.conversation_messages(id, subject_id),
  constraint c09_private_action_scope check
    (length(btrim(action_ref)) > 0 and
     length(btrim(original_content_hash)) > 0 and
     ((state='approved' and withdrawn_at is null) or
      (state='withdrawn' and withdrawn_at >= verified_at)))
);

create table myeongha_internal.character_learning_source_capture_audit_v1 (
  event_ref text primary key,
  source_ref text not null unique
    references myeongha_internal.character_learning_source_approvals_v1(source_ref),
  action_ref text not null unique
    references myeongha_internal.character_learning_private_optin_receipts_v1(action_ref),
  owner_subject_id uuid not null,
  original_message_id uuid not null,
  original_content_hash text not null,
  event_type text not null default 'PRIVATE_APPROVED_SOURCE_CAPTURE'
    check (event_type='PRIVATE_APPROVED_SOURCE_CAPTURE'),
  captured_at timestamptz not null default clock_timestamp(),
  constraint c09_audit_nonempty check (length(btrim(event_ref)) > 0)
);

alter table myeongha_internal.character_learning_private_optin_receipts_v1 enable row level security;
alter table myeongha_internal.character_learning_private_optin_receipts_v1 force row level security;
alter table myeongha_internal.character_learning_source_capture_audit_v1 enable row level security;
alter table myeongha_internal.character_learning_source_capture_audit_v1 force row level security;

revoke all on myeongha_internal.character_learning_private_optin_receipts_v1
  from public, anon, authenticated;
revoke all on myeongha_internal.character_learning_source_capture_audit_v1
  from public, anon, authenticated;

-- Must be invoked in a separately authorised, canonical-subject-bound DB scope.
-- Never expose the SQL function to clients. p_subject_id is NOT authentication.
-- A user message by itself is NOT opt-in: action receipt is independent input.
create function myeongha_internal.c09_capture_private_approved_source_shadow_v1(
  p_source_ref text,
  p_subject_id uuid,
  p_message_id uuid,
  p_action_ref text,
  p_topic_key text,
  p_awareness text,
  p_learned_at timestamptz,
  p_valid_at timestamptz
) returns text
language plpgsql security invoker
set search_path = pg_catalog, myeongha_internal, public
as $$
declare
  msg public.conversation_messages%rowtype;
  action myeongha_internal.character_learning_private_optin_receipts_v1%rowtype;
  topic myeongha_internal.character_knowledge_topics_v1%rowtype;
  now_at timestamptz := clock_timestamp();
  expected_ref text;
begin
  if p_source_ref is null or length(btrim(p_source_ref))=0 or
     p_subject_id is null or p_message_id is null or
     p_action_ref is null or length(btrim(p_action_ref))=0 or
     p_topic_key is null or p_awareness not in ('heard_of','basic','practiced','proficient') or
     p_learned_at is null or p_valid_at is null or
     p_learned_at > p_valid_at or p_valid_at > now_at then
    raise exception 'C09_PRIVATE_CAPTURE_INVALID_INPUT' using errcode='P0001';
  end if;

  -- Subject-specific role must already be established by trusted server.
  -- Deliberately refuses to interpret client-supplied Subject as identity.
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select * into strict msg from public.conversation_messages
  where id=p_message_id and subject_id=p_subject_id
  for share;
  if msg.sender_type <> 'user' or msg.redacted_at is not null or
     msg.content_hash is null or length(btrim(msg.content_hash))=0 or
     msg.created_at > now_at then
    raise exception 'C09_PRIVATE_ORIGINAL_NOT_CURRENT' using errcode='P0001';
  end if;

  select * into strict action
  from myeongha_internal.character_learning_private_optin_receipts_v1
  where action_ref=p_action_ref and subject_id=p_subject_id
  for share;
  if action.state <> 'approved' or action.withdrawn_at is not null or
     action.verified_at > now_at or
     action.verified_at < msg.created_at or
     action.original_message_id <> p_message_id or
     action.original_content_hash <> msg.content_hash then
    raise exception 'C09_PRIVATE_OPTIN_NOT_VERIFIED' using errcode='P0001';
  end if;

  select * into strict topic
  from myeongha_internal.character_knowledge_topics_v1
  where character_id='seyeon' and topic_key=p_topic_key
  for share;
  if topic.published_at is null or topic.published_at > now_at or
     topic.revoked_at is not null then
    raise exception 'C09_PRIVATE_TOPIC_NOT_APPROVED' using errcode='P0001';
  end if;

  expected_ref := 'c09:conversation:' || p_message_id::text;
  if p_source_ref <> expected_ref then
    raise exception 'C09_PRIVATE_SOURCE_REF_NOT_CANONICAL' using errcode='P0001';
  end if;

  insert into myeongha_internal.character_learning_source_approvals_v1(
    source_ref,owner_subject_id,character_id,topic_key,source_kind,
    awareness,visibility,approval_ref,approved_at,source_verification_ref,
    verified_at,learned_at,valid_at,sharing_consent_ref,deidentified_for_sharing
  ) values (
    p_source_ref,p_subject_id,'seyeon',p_topic_key,'user_taught_verified',
    p_awareness,'user_private',p_action_ref,now_at,
    'conversation:' || p_message_id::text || ':sha:' || msg.content_hash,
    action.verified_at,p_learned_at,p_valid_at,null,false
  );

  insert into myeongha_internal.character_learning_source_capture_audit_v1(
    event_ref,source_ref,action_ref,owner_subject_id,
    original_message_id,original_content_hash,event_type
  ) values (
    'c09:private-capture:' || p_action_ref,
    p_source_ref,p_action_ref,p_subject_id,
    p_message_id,msg.content_hash,'PRIVATE_APPROVED_SOURCE_CAPTURE'
  );

  return p_source_ref;
end;
$$;

-- Re-evaluate CURRENT source, action and audit rather than trusting a
-- historical approval row. This guard must run before any later Issue.
create function myeongha_internal.c09_verify_private_source_current_shadow_v1(
  p_subject_id uuid,
  p_source_ref text
) returns boolean
language plpgsql security invoker stable
set search_path = pg_catalog, myeongha_internal, public
as $$
declare
  matched boolean;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  select exists (
    select 1
    from myeongha_internal.character_learning_source_approvals_v1 s
    join myeongha_internal.character_learning_source_capture_audit_v1 audit
      on audit.source_ref=s.source_ref and audit.owner_subject_id=s.owner_subject_id
       and audit.action_ref=s.approval_ref
    join myeongha_internal.character_learning_private_optin_receipts_v1 action
      on action.action_ref=audit.action_ref and action.subject_id=s.owner_subject_id
       and action.original_message_id=audit.original_message_id
    join public.conversation_messages msg
      on msg.id=audit.original_message_id and msg.subject_id=s.owner_subject_id
    join myeongha_internal.character_knowledge_topics_v1 topic
      on topic.character_id=s.character_id and topic.topic_key=s.topic_key
    where s.source_ref=p_source_ref and s.owner_subject_id=p_subject_id
      and s.character_id='seyeon' and s.source_kind='user_taught_verified'
      and s.visibility='user_private' and s.revoked_at is null
      and s.approved_at<=clock_timestamp() and s.valid_at<=clock_timestamp()
      and action.state='approved' and action.withdrawn_at is null
      and action.verified_at<=clock_timestamp()
      and action.original_content_hash=msg.content_hash
      and audit.original_content_hash=msg.content_hash
      and msg.sender_type='user' and msg.redacted_at is null
      and s.source_verification_ref =
        'conversation:' || msg.id::text || ':sha:' || msg.content_hash
      and topic.published_at is not null and topic.published_at<=clock_timestamp()
      and topic.revoked_at is null
  ) into matched;
  return coalesce(matched,false);
end;
$$;

revoke all on function myeongha_internal.c09_capture_private_approved_source_shadow_v1(
  text,uuid,uuid,text,text,text,timestamptz,timestamptz
) from public, anon, authenticated;
revoke all on function myeongha_internal.c09_verify_private_source_current_shadow_v1(
  uuid,text
) from public, anon, authenticated;

-- No production writer grants, RLS policies, or opt-in issuance authority.
-- Production remains read-only; approvals must NOT be synthesized.
commit;
