-- Watchtower-Track: security
-- Private, canonical-subject lock commands. No content return or DML.
begin;
create function seyeon_private.lock_memory_subject_v1(p_subject_id uuid)
returns void language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $subject_lock$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform set_config('lock_timeout','5000ms',true);
  perform 1 from public.subjects s
    where s.id=p_subject_id and s.kind='member' and s.status='active'
      and s.merged_into_subject_id is null for update;
  if not found then raise exception using errcode='42501',
    constraint='seyeon_source_lock_member_required',
    message='Original Memory lock requires canonical active Member'; end if;
end
$subject_lock$;

create function seyeon_private.lock_original_memory_grant_v1(
  p_subject_id uuid,p_memory_id uuid,p_grant_id uuid
) returns void language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $grant_lock$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform 1 from public.record_access_grants g
    join public.memory_items m on m.id=g.memory_item_id and m.subject_id=g.subject_id
    where g.id=p_grant_id and g.subject_id=p_subject_id
      and g.memory_item_id=p_memory_id and g.life_fact_id is null
      and g.grantee_character_id='seyeon' and g.grant_reason='user_choice'
      and g.revoked_at is null and m.revoked_at is null
      and m.source_kind='user_approved' for share of g,m;
  if not found then raise exception using errcode='42501',
    constraint='seyeon_source_lock_original_grant_required',
    message='Current original Memory Grant is unavailable'; end if;
end
$grant_lock$;

create function seyeon_private.lock_memory_source_message_v1(
  p_subject_id uuid,p_turn_id uuid,p_message_id uuid
) returns void language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $message_lock$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform 1 from public.conversation_messages m
    where m.id=p_message_id and m.subject_id=p_subject_id
      and m.turn_id=p_turn_id and m.redacted_at is null for share;
  if not found then raise exception using errcode='42501',
    constraint='seyeon_source_lock_message_required',
    message='Original Memory source Message is unavailable'; end if;
end
$message_lock$;

revoke all on function seyeon_private.lock_memory_subject_v1(uuid),
  seyeon_private.lock_original_memory_grant_v1(uuid,uuid,uuid),
  seyeon_private.lock_memory_source_message_v1(uuid,uuid,uuid)
  from public,anon,authenticated,service_role,myeongha_api_executor;
grant usage on schema seyeon_private to myeongha_seyeon_chat_runtime_owner;
grant execute on function seyeon_private.lock_memory_subject_v1(uuid),
  seyeon_private.lock_original_memory_grant_v1(uuid,uuid,uuid),
  seyeon_private.lock_memory_source_message_v1(uuid,uuid,uuid)
  to myeongha_seyeon_chat_runtime_owner;
commit;
