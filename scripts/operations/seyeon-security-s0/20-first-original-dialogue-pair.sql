-- Watchtower-Track: security
-- G0/G3 S0: a single first Member User + Assistant history pair, protected by
-- the exact STILL-CURRENT original Memory Grant. Never general History.
-- Only the disposable PostgreSQL owner can install this source.
begin;

do $owner$
begin
  if current_user <> 'postgres' then
    raise exception 'S0 original dialogue pair requires the isolated PostgreSQL owner';
  end if;
end
$owner$;

create function seyeon_private.qry_seyeon_first_original_dialogue_pair_s0_v1(
  p_subject_id uuid,p_thread_id uuid,p_assistant_message_id uuid
) returns table(
  user_message_id uuid,user_text text,
  assistant_message_id uuid,assistant_text text
)
language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $dialogue$
declare
  v_user_message_id uuid;
  v_user_text text;
  v_assistant_text text;
begin
  if p_subject_id is null or p_thread_id is null
     or p_assistant_message_id is null then return; end if;

  -- The existing first-Assistant authority checks exact pinned Grant/Record,
  -- current withdrawal, hash, immutable Attempt and two-message first turn.
  -- It also locks the original Grant and Thread for the entire caller TX.
  select original.assistant_text into v_assistant_text
  from seyeon_private.qry_seyeon_first_original_assistant_replay_s0_v1(
    p_subject_id,p_thread_id,p_assistant_message_id
  ) original;
  if not found or v_assistant_text is null then return; end if;

  -- Add exact DB-original Member User provenance, not just sender='user'.
  -- The confirmed committed/delivered Turn binds both messages; an injected
  -- system/other-thread/copied record cannot satisfy this original source.
  select um.id,um.body_text into v_user_message_id,v_user_text
  from public.conversation_messages am
  join public.chat_turns t
    on t.id=am.turn_id and t.subject_id=am.subject_id
   and t.thread_id=am.thread_id
  join public.conversation_messages um
    on um.turn_id=t.id and um.subject_id=t.subject_id
   and um.thread_id=t.thread_id
  where am.id=p_assistant_message_id
    and am.subject_id=p_subject_id and am.thread_id=p_thread_id
    and am.sender_type='character' and am.redacted_at is null
    and t.state='delivered' and t.committed_at is not null
    and t.committed_attempt_id is not null
    and nullif(btrim(t.client_turn_id),'') is not null
    and nullif(btrim(t.request_hash),'') is not null
    and nullif(btrim(t.request_contract_version),'') is not null
    and jsonb_typeof(t.request_snapshot_jsonb)='object'
    and um.sender_type='user' and um.thread_character_id is null
    and um.character_content_bundle_id is null
    and um.redacted_at is null and um.body_text is not null
    and length(btrim(um.body_text))>0
    and nullif(btrim(um.content_hash),'') is not null
  for share of am,t,um;
  if not found or v_user_message_id is null then return; end if;

  return query select
    v_user_message_id,v_user_text,p_assistant_message_id,v_assistant_text;
end
$dialogue$;

revoke all on function
  seyeon_private.qry_seyeon_first_original_dialogue_pair_s0_v1(uuid,uuid,uuid)
from public,anon,authenticated,service_role,myeongha_api_executor;

commit;
