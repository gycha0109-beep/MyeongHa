-- C09 isolated reviewed-original writer, PROPOSAL ONLY, NOT APPLIED.
-- Depends on seyeon_c09_original_review_authority_PROPOSAL_NOT_APPLIED.sql.
-- No trusted review-issuer worker/credential is provisioned by this proposal.
-- The issuer role is NOLOGIN, cannot bypass RLS, and is never granted to
-- existing HTTP/API roles. Separate verified reviewer evidence is mandatory.
begin;

do $$
begin
  if not exists(select 1 from pg_roles where rolname='c09_original_review_writer') then
    create role c09_original_review_writer
      nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end
$$;

grant usage on schema myeongha_internal to c09_original_review_writer;
grant execute on function public.current_myeongha_subject_id()
  to c09_original_review_writer;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to c09_original_review_writer;

grant select(id,subject_id,sender_type,content_hash,created_at,redacted_at)
  on public.conversation_messages to c09_original_review_writer;
-- PostgreSQL FOR SHARE requires UPDATE privileges on at least one column.
-- Direct UPDATE is denied by WITH CHECK(false) and the guard triggers below.
grant update(redacted_at) on public.conversation_messages
  to c09_original_review_writer;
grant select on myeongha_internal.character_knowledge_topics_v1
  to c09_original_review_writer;
grant update(revoked_at) on myeongha_internal.character_knowledge_topics_v1
  to c09_original_review_writer;
grant select,insert on myeongha_internal.character_learning_original_reviews_v1
  to c09_original_review_writer;

create policy c09_review_writer_original_read
  on public.conversation_messages for select to c09_original_review_writer
  using (subject_id=public.current_myeongha_subject_id());
create policy c09_review_writer_original_lock
  on public.conversation_messages for update to c09_original_review_writer
  using (subject_id=public.current_myeongha_subject_id())
  with check (false);

create policy c09_review_writer_topic_read
  on myeongha_internal.character_knowledge_topics_v1
  for select to c09_original_review_writer
  using (character_id='seyeon' and published_at is not null and revoked_at is null);
create policy c09_review_writer_topic_lock
  on myeongha_internal.character_knowledge_topics_v1
  for update to c09_original_review_writer
  using (character_id='seyeon' and published_at is not null and revoked_at is null)
  with check (false);

create policy c09_review_writer_review_read
  on myeongha_internal.character_learning_original_reviews_v1
  for select to c09_original_review_writer
  using (owner_subject_id=public.current_myeongha_subject_id()
    and character_id='seyeon' and visibility='user_private');
create policy c09_review_writer_review_insert
  on myeongha_internal.character_learning_original_reviews_v1
  for insert to c09_original_review_writer
  with check (owner_subject_id=public.current_myeongha_subject_id()
    and character_id='seyeon' and visibility='user_private'
    and state='approved' and revoked_at is null);

-- Redundant defense: direct row modifications by this reviewer role must
-- never be allowed merely because FOR SHARE needs a limited UPDATE grant.
create function myeongha_internal.c09_review_writer_mutation_guard_v1()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,myeongha_internal,public
as $$
begin
  if current_user='c09_original_review_writer' then
    raise exception 'C09_REVIEW_WRITER_DIRECT_MUTATION_DENIED' using errcode='42501';
  end if;
  return new;
end
$$;
create trigger c09_review_writer_no_message_update_v1
before update on public.conversation_messages
for each row execute function myeongha_internal.c09_review_writer_mutation_guard_v1();
create trigger c09_review_writer_no_topic_update_v1
before update on myeongha_internal.character_knowledge_topics_v1
for each row execute function myeongha_internal.c09_review_writer_mutation_guard_v1();

create function myeongha_internal.c09_issue_original_review_shadow_v1(
  p_subject_id uuid,
  p_original_message_id uuid,
  p_expected_hash text,
  p_review_ref text,
  p_topic_key text,
  p_awareness text,
  p_reviewer_ref text,
  p_review_policy_ref text,
  p_learned_at timestamptz,
  p_valid_at timestamptz
) returns text
language plpgsql security invoker
set search_path=pg_catalog,myeongha_internal,public
as $$
declare
  v_msg record;
  v_topic record;
  v_prior record;
  v_now timestamptz := clock_timestamp();
  v_inserted text;
begin
  if current_user<>'c09_original_review_writer' then
    raise exception 'C09_REVIEW_WRITER_REQUIRED' using errcode='42501';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_expected_hash is null or length(btrim(p_expected_hash))=0 or
     p_review_ref is null or length(btrim(p_review_ref))=0 or
     p_reviewer_ref is null or length(btrim(p_reviewer_ref))=0 or
     p_review_policy_ref is null or length(btrim(p_review_policy_ref))=0 or
     p_topic_key is null or p_topic_key !~ '^[a-z][a-z0-9_.-]{0,127}$' or
     p_awareness not in ('heard_of','basic','practiced','proficient') or
     p_learned_at is null or p_valid_at is null or
     p_learned_at>p_valid_at or p_valid_at>v_now then
    raise exception 'C09_REVIEW_INVALID_INPUT' using errcode='22023';
  end if;

  select m.id,m.subject_id,m.sender_type,m.content_hash,m.created_at,m.redacted_at
    into v_msg from public.conversation_messages m
    where m.id=p_original_message_id and m.subject_id=p_subject_id
    for share;
  if not found or v_msg.sender_type<>'user' or
     v_msg.redacted_at is not null or
     v_msg.content_hash<>p_expected_hash or
     v_msg.created_at>p_learned_at or v_msg.created_at>v_now then
    raise exception 'C09_REVIEW_ORIGINAL_NOT_CURRENT' using errcode='42501';
  end if;

  select t.topic_key,t.published_at,t.revoked_at into v_topic
    from myeongha_internal.character_knowledge_topics_v1 t
    where t.character_id='seyeon' and t.topic_key=p_topic_key
    for share;
  if not found or v_topic.published_at is null or
     v_topic.published_at>v_now or v_topic.revoked_at is not null then
    raise exception 'C09_REVIEW_TOPIC_UNPUBLISHED' using errcode='42501';
  end if;

  insert into myeongha_internal.character_learning_original_reviews_v1(
    review_ref,owner_subject_id,original_message_id,original_content_hash,
    character_id,topic_key,awareness,visibility,state,
    reviewer_ref,review_policy_ref,learned_at,valid_at,reviewed_at
  ) values (
    p_review_ref,p_subject_id,p_original_message_id,p_expected_hash,
    'seyeon',p_topic_key,p_awareness,'user_private','approved',
    p_reviewer_ref,p_review_policy_ref,p_learned_at,p_valid_at,v_now
  )
  on conflict (owner_subject_id,original_message_id) do nothing
  returning review_ref into v_inserted;

  -- A concurrent/replayed decision is admissible only if the exact reviewed
  -- facts are identical and it was not rejected or revoked.
  select r.* into v_prior
    from myeongha_internal.character_learning_original_reviews_v1 r
    where r.owner_subject_id=p_subject_id and r.original_message_id=p_original_message_id;
  if not found or v_prior.review_ref<>coalesce(v_inserted,p_review_ref) or
     v_prior.original_content_hash<>p_expected_hash or
     v_prior.character_id<>'seyeon' or v_prior.visibility<>'user_private' or
     v_prior.state<>'approved' or v_prior.revoked_at is not null or
     v_prior.topic_key<>p_topic_key or v_prior.awareness<>p_awareness or
     v_prior.reviewer_ref<>p_reviewer_ref or
     v_prior.review_policy_ref<>p_review_policy_ref or
     v_prior.learned_at<>p_learned_at or v_prior.valid_at<>p_valid_at then
    raise exception 'C09_REVIEW_REPLAY_CONFLICT' using errcode='23505';
  end if;
  return v_prior.review_ref;
end;
$$;

revoke all on function myeongha_internal.c09_issue_original_review_shadow_v1(
  uuid,uuid,text,text,text,text,text,text,timestamptz,timestamptz
) from public,anon,authenticated,myeongha_api_executor;
grant execute on function myeongha_internal.c09_issue_original_review_shadow_v1(
  uuid,uuid,text,text,text,text,text,text,timestamptz,timestamptz
) to c09_original_review_writer;

-- No membership grant to any LOGIN role. The trusted reviewer verifier,
-- worker connection, signed review provenance and audit trail are not
-- implemented here; this is not an executable production activation.
commit;
