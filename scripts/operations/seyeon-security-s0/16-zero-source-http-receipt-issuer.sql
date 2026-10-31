-- Watchtower-Track: security
-- Zero-personal-source HTTP receipt issuer; separate from positive Memory G3.
-- No route is activated by installing this owner-owned function.
-- Reuses the existing first-zero original DB lock and the already installed
-- receipt ACK. The caller never supplies assistant bytes.
begin;
do $preflight$
begin
  if current_user<>'postgres'
     or to_regprocedure('public.qry_seyeon_locked_first_zero_source_reveal_v1(uuid,uuid,uuid,uuid)') is null
     or to_regprocedure('seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)') is null
     or to_regprocedure('public.cmd_issue_seyeon_positive_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)') is null
  then raise exception 'Zero-source receipt requires existing first-zero DB lock and protected ACK'; end if;
end
$preflight$;

create function public.cmd_issue_seyeon_zero_source_first_reply_v1(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_expected_user_message_id uuid,p_expected_assistant_message_id uuid,
  p_expected_post_turn_outbox_event_id uuid,p_expected_client_turn_id text,
  p_delivery_receipt_hash bytea
) returns table(assistant_text text)
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp set row_security=off
as $zero_issue$
declare
  v_message text;
  v_receipt_proof text;
begin
  if p_subject_id is null or p_thread_id is null or p_turn_id is null or
     p_attempt_id is null or p_expected_user_message_id is null or
     p_expected_assistant_message_id is null or
     p_expected_post_turn_outbox_event_id is null or
     p_expected_client_turn_id is null or
     length(p_expected_client_turn_id)=0 or
     p_delivery_receipt_hash is null or
     octet_length(p_delivery_receipt_hash)<>32 then return; end if;

  -- This SECURITY DEFINER independently proves current original zero-source
  -- authority, locks Subject/Thread/Attempt, rejects every previous or
  -- derived relationship source, and returns exactly one first-turn body.
  select locked.assistant_text into v_message
  from public.qry_seyeon_locked_first_zero_source_reveal_v1(
    p_subject_id,p_thread_id,p_turn_id,p_attempt_id
  ) locked;
  if not found or v_message is null or length(btrim(v_message))=0
     or octet_length(convert_to(v_message,'UTF8'))>65536 then return; end if;

  -- Independently bind all caller-supplied Commit locators to the original
  -- durable G2 Outbox; never let a model/client choose an arbitrary message.
  perform 1
  from public.chat_turns t
  join public.chat_turn_attempts a on a.id=p_attempt_id
   and a.turn_id=t.id and a.subject_id=t.subject_id
  join public.conversation_messages original_user
    on original_user.id=p_expected_user_message_id
   and original_user.subject_id=t.subject_id
   and original_user.thread_id=t.thread_id
   and original_user.turn_id=t.id
   and original_user.sender_type='user'
   and original_user.redacted_at is null
  join public.outbox_events oe
    on oe.id=p_expected_post_turn_outbox_event_id
   and oe.aggregate_type='chat_turn'
   and oe.aggregate_id=t.id::text
   and oe.event_type='SEYEON_POST_TURN_ANALYSIS_REQUESTED'
   and oe.event_schema_version='v1'
   and oe.dedupe_key='seyeon-post-turn-v1'
   and oe.payload_jsonb->>'schemaVersion'='seyeon-post-turn-analysis-request-v1'
   and oe.payload_jsonb->>'subjectId'=t.subject_id::text
   and oe.payload_jsonb->>'characterId'='seyeon'
   and oe.payload_jsonb->>'turnId'=t.id::text
   and oe.payload_jsonb->>'attemptId'=a.id::text
   and oe.payload_jsonb->>'userMessageId'=original_user.id::text
   and oe.payload_jsonb->>'assistantMessageId'=p_expected_assistant_message_id::text
   and oe.payload_jsonb->'snapshot'->>'schemaVersion'='seyeon-post-turn-analysis-snapshot-v1'
   and oe.payload_jsonb->'snapshot'->>'turnId'=t.id::text
   and oe.payload_jsonb->'snapshot'->>'userMessageId'=original_user.id::text
   and oe.payload_jsonb->'snapshot'->>'assistantMessageId'=p_expected_assistant_message_id::text
   and oe.payload_jsonb->>'snapshotHash' ~ '^sha256:v1:[a-f0-9]{64}$'
  where t.id=p_turn_id and t.subject_id=p_subject_id
    and t.thread_id=p_thread_id
    and t.client_turn_id=p_expected_client_turn_id
    and t.state='committed'
    and t.committed_attempt_id=a.id
    and a.state='committed'
    and a.committed_message_id=p_expected_assistant_message_id
    and a.seyeon_positive_delivery_issued_at is null
    and a.seyeon_positive_delivery_received_at is null
    and a.seyeon_positive_delivery_receipt_hash is null
  for share of t,a,original_user,oe;
  if not found then return; end if;

  if (select count(*) from public.outbox_events oe
      where oe.aggregate_type='chat_turn' and oe.aggregate_id=p_turn_id::text
        and oe.event_type='SEYEON_POST_TURN_ANALYSIS_REQUESTED'
        and oe.dedupe_key='seyeon-post-turn-v1')<>1 then return; end if;

  -- Same domain-separated receipt algorithm as Positive S0. Neither the
  -- reply text nor the secret browser challenge is stored in the receipt
  -- column; only the hash of the exact body-bound proof is retained.
  v_receipt_proof:=encode(sha256(convert_to(
    'seyeon-positive-http-receipt-v1'||chr(10)||octet_length(convert_to(v_message,'UTF8'))::text||':'||
    v_message||':'||encode(p_delivery_receipt_hash,'hex'),'UTF8')),'hex');
  update public.chat_turn_attempts a
    set seyeon_positive_delivery_receipt_hash=sha256(convert_to(v_receipt_proof,'UTF8')),
        seyeon_positive_delivery_issued_at=clock_timestamp()
    where a.id=p_attempt_id and a.subject_id=p_subject_id
      and a.turn_id=p_turn_id
      and a.state='committed'
      and a.seyeon_positive_delivery_issued_at is null
      and a.seyeon_positive_delivery_receipt_hash is null
      and a.seyeon_positive_delivery_received_at is null;
  if not found then return; end if;
  return query select v_message;
end
$zero_issue$;

revoke all on function public.cmd_issue_seyeon_zero_source_first_reply_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea
) from public,anon,authenticated,service_role;
grant execute on function public.cmd_issue_seyeon_zero_source_first_reply_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea
) to myeongha_api_executor;
comment on function public.cmd_issue_seyeon_zero_source_first_reply_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea
) is 'First zero-personal-source original assistant only; DB-locked and receipt-proven, no historical/replay or positive memory admission';
commit;
