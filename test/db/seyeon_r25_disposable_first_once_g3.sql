-- Watchtower-Track: security
-- R25 S5/G3: REAL PostgreSQL two-session single-use first Reveal semantics
-- in the existing disposable DB ONLY. Never copy this function to Production.
-- Reuses R5's original Grant/Memory + committed Attempt/Assistant owner check,
-- then consumes the original Turn before the same Node socket handoff COMMIT.
\set ON_ERROR_STOP on
begin;
do $guard$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
     or current_setting('server_version_num')::integer<150000
     or to_regprocedure('seyeon_positive_candidate.reveal_http_r5(uuid,uuid,uuid,uuid,uuid)') is null
     or to_regprocedure('public.cmd_revoke_memory_character_grant_v1(uuid,uuid,text)') is null
  then
    raise exception 'R25 refuses non-disposable PostgreSQL or missing R5 owner baseline';
  end if;
end
$guard$;

create function seyeon_positive_candidate.reveal_first_once_r25(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,
  p_assistant_message uuid,p_client_turn_id text
) returns text
language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
set row_security=off
as $first_once$
declare
  v_state text;
  v_reply text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if p_subject is null or p_thread is null or p_turn is null
     or p_attempt is null or p_assistant_message is null
     or p_client_turn_id is null then
    return null;
  end if;

  -- Real locked Turn is the one-shot serialization point for A vs B.
  -- Verify original client idempotency key, committed Attempt and timestamp;
  -- an already-delivered Turn can NEVER acquire a second first-send permit.
  select t.state into v_state
  from public.chat_turns t
  where t.id=p_turn and t.thread_id=p_thread and t.subject_id=p_subject
    and t.client_turn_id=p_client_turn_id
    and t.committed_attempt_id=p_attempt
    and t.state='committed'
    and t.committed_at is not null
    and t.delivered_at is null
  for update;
  if not found or v_state is distinct from 'committed' then return null; end if;

  -- Preserve R5's ACTUAL original Memory/Grant/Attempt/Message checks.
  -- R5 locks Subject+original Grant/Record until the surrounding transaction
  -- owns the Node direct socket's 'finish'; no stale read-then-disclose.
  select seyeon_positive_candidate.reveal_http_r5(
    p_subject,p_thread,p_turn,p_attempt,p_assistant_message
  ) into v_reply;
  if v_reply is null or length(btrim(v_reply))=0 then return null; end if;

  update public.chat_turns t
  set state='delivered',
      delivered_at=clock_timestamp(),
      updated_at=clock_timestamp(),
      revision=t.revision+1
  where t.id=p_turn and t.thread_id=p_thread and t.subject_id=p_subject
    and t.client_turn_id=p_client_turn_id
    and t.committed_attempt_id=p_attempt
    and t.state='committed' and t.delivered_at is null
  returning t.state into v_state;
  if not found or v_state is distinct from 'delivered' then return null; end if;
  -- State is still UNCOMMITTED: socket exception/abort => entire Tx ROLLBACK.
  -- Delivered means Node OS-buffer finish only, NEVER Edge/client S/ACK.
  return v_reply;
end
$first_once$;

revoke all on function seyeon_positive_candidate.reveal_first_once_r25(
  uuid,uuid,uuid,uuid,uuid,text
) from public;
grant execute on function seyeon_positive_candidate.reveal_first_once_r25(
  uuid,uuid,uuid,uuid,uuid,text
) to myeongha_api_executor;
commit;
\echo 'R25 disposable PG first-once atomic delivery installed; production OFF'
