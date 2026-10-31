-- Watchtower-Track: security
-- S0 disposable-only: replay one already delivered first Se-yeon Assistant.
-- Never mount on production, Fetch proxy, or general chat-history route.
begin;

-- The restricted Owner of this SQL must be postgres in the disposable DB.
-- Never grant underlying private table SELECT to a general API role.
do $s0_replay_owner$
begin
  if current_user <> 'postgres' then
    raise exception 'S0 original replay requires the isolated PostgreSQL owner';
  end if;
end
$s0_replay_owner$;

create function seyeon_private.qry_seyeon_first_original_assistant_replay_s0_v1(
  p_subject_id uuid,p_thread_id uuid,p_assistant_message_id uuid
) returns table(assistant_text text)
language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $replay$
declare
  v_text text;
  v_pin jsonb;
  v_turn uuid;
  v_attempt uuid;
  v_original record;
  v_record uuid;
  v_grant uuid;
  v_pg_digest text;
begin
  if p_subject_id is null or p_thread_id is null
     or p_assistant_message_id is null then return; end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);

  -- Serialize the whole first-message scope with new turns and withdrawals.
  perform 1 from public.conversation_threads th
  where th.id=p_thread_id and th.subject_id=p_subject_id
    and th.thread_type='single_character'
    and th.status='active' and th.deleted_at is null
  for update of th;
  if not found then return; end if;

  -- Metadata comes exclusively from the committed database Attempt.
  select a.seyeon_personal_source_pin_jsonb->'positiveProof',t.id,a.id
    into v_pin,v_turn,v_attempt
  from public.conversation_messages msg
  join public.chat_turns t
    on t.id=msg.turn_id and t.subject_id=msg.subject_id
   and t.thread_id=msg.thread_id
  join public.chat_turn_attempts a
    on a.id=t.committed_attempt_id and a.turn_id=t.id
   and a.subject_id=t.subject_id
  join public.conversation_thread_characters c
    on c.id=msg.thread_character_id and c.thread_id=msg.thread_id
  where msg.id=p_assistant_message_id
    and msg.subject_id=p_subject_id and msg.thread_id=p_thread_id
    and msg.sender_type='character' and msg.redacted_at is null
    and t.state='delivered' and t.delivered_at is not null
    and t.committed_at is not null
    and a.state='committed' and a.committed_message_id=msg.id
    and a.seyeon_personal_source_pinned_at is not null
    and a.seyeon_personal_source_pin_jsonb=
      jsonb_build_object('positiveProof',a.seyeon_personal_source_pin_jsonb->'positiveProof')
    and a.validation_result_jsonb->'personalRecordProvenance'
      =a.seyeon_personal_source_pin_jsonb->'positiveProof'
    and a.seyeon_positive_delivery_issued_at is null
    and a.seyeon_positive_delivery_receipt_hash is null
    and c.character_id='seyeon' and c.role='primary'
    and c.left_at is null
  for share of msg,t,a,c;
  if not found then return; end if;

  -- G3 S0 first reply only. Later, mixed, and derived-history contexts HOLD.
  if (select count(*) from public.conversation_messages msg
      where msg.subject_id=p_subject_id and msg.thread_id=p_thread_id)<>2
     or (select count(*) from public.conversation_messages um
        where um.subject_id=p_subject_id and um.thread_id=p_thread_id
          and um.turn_id=v_turn
          and um.sender_type='user' and um.redacted_at is null)<>1
     or exists(select 1 from public.conversation_thread_characters c
        where c.thread_id=p_thread_id and c.left_at is null
          and c.character_id<>'seyeon')
     or exists(select 1 from public.relationship_events e
        where e.subject_id=p_subject_id and e.character_id='seyeon')
     or exists(select 1 from public.relationship_event_records e
        where e.subject_id=p_subject_id and e.character_id='seyeon')
     or exists(select 1 from public.relationship_history_entries e
        where e.subject_id=p_subject_id and e.character_id='seyeon')
  then return; end if;

  -- Exact immutable original proof: no client-provided Grant, text or digest.
  if jsonb_typeof(v_pin) is distinct from 'object'
     or v_pin->>'schemaVersion' is distinct from
       'seyeon-positive-original-memory-source-pin-v1'
     or v_pin->>'subjectId' is distinct from p_subject_id::text
     or v_pin->>'threadId' is distinct from p_thread_id::text
     or v_pin->>'turnId' is distinct from v_turn::text
     or v_pin->>'attemptId' is distinct from v_attempt::text
     or v_pin->>'characterId' is distinct from 'seyeon'
     or v_pin->>'recordKind' is distinct from 'memory'
     or v_pin->>'recordId' is null
     or v_pin->>'originalGrantId' is null
     or v_pin->>'originalGrantedAt' is null
     or v_pin->>'originalPgJsonbDigest'
        !~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'
     or v_pin->>'selectedSourcesDigest'
        !~ '^sha256:v1:[a-f0-9]{64}$'
     or v_pin->>'projectedMemoryDigest'
        !~ '^sha256:v1:[a-f0-9]{64}$'
     or v_pin->>'finalModelContextDigest'
        !~ '^sha256:v1:[a-f0-9]{64}$'
  then return; end if;

  if not seyeon_private.lock_positive_source_registry_v1(
    v_pin->>'recordType',v_pin->>'recordSchemaVersion',
    v_pin->>'projectorVersion'
  ) then return; end if;

  -- Recheck the SAME original Grant and Record. New Grant cannot resurrect
  -- an old Attempt. Keep SHARE locks until direct Node 'finish'.
  v_record:=(v_pin->>'recordId')::uuid;
  v_grant:=(v_pin->>'originalGrantId')::uuid;
  select g.granted_at,m.content_jsonb into v_original
  from public.record_access_grants g
  join public.memory_items m
    on m.id=g.memory_item_id and m.subject_id=g.subject_id
  where g.id=v_grant and g.subject_id=p_subject_id
    and g.memory_item_id=v_record and g.life_fact_id is null
    and g.grantee_character_id='seyeon'
    and g.grant_reason='user_choice'
    and g.revoked_at is null and g.seyeon_revoke_requested_at is null
    and m.revoked_at is null and m.source_kind='user_approved'
    and m.memory_type=v_pin->>'recordType'
    and m.schema_version=v_pin->>'recordSchemaVersion'
  for share of g,m;
  if not found then return; end if;

  v_pg_digest:='sha256:pg-jsonb:v1:'||
    encode(sha256(convert_to(v_original.content_jsonb::text,'UTF8')),'hex');
  if v_original.granted_at::text is distinct from
       (v_pin->>'originalGrantedAt')::timestamptz::text
     or v_pg_digest is distinct from v_pin->>'originalPgJsonbDigest'
  then return; end if;

  -- Read private body ONLY AFTER all original rights are locked and current.
  select msg.body_text into v_text
  from public.conversation_messages msg
  join public.chat_turn_attempts a
    on a.id=v_attempt and a.subject_id=msg.subject_id
   and a.turn_id=msg.turn_id
  where msg.id=p_assistant_message_id
    and msg.subject_id=p_subject_id and msg.thread_id=p_thread_id
    and msg.sender_type='character' and msg.redacted_at is null
    and msg.body_text is not null and length(btrim(msg.body_text))>0
    and msg.body_text=a.generated_body_text
    and a.committed_message_id=msg.id and a.state='committed'
  for share of msg,a;
  if not found then return; end if;

  return query select v_text;
end
$replay$;

-- The API user receives no EXECUTE in the install plan; the disposable
-- PostgreSQL17 fixture grants it only for the offline protected Node test.
revoke all on function
  seyeon_private.qry_seyeon_first_original_assistant_replay_s0_v1(uuid,uuid,uuid)
from public,anon,authenticated,service_role,myeongha_api_executor;

commit;
