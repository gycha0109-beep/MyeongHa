-- Watchtower-Track: security
-- SOURCE CANDIDATE ONLY: section 61 S5/G3 7 G2 locators + original client Turn key.
-- Does not modify the existing reviewed 4-argument migration. No deployment,
-- EXECUTE grants, SRC-25 approval, paid Provider or public first Reveal.
-- Watchtower-Track: security
-- S5/G3 production-schema source code: strictly first committed Se-yeon turn
-- backed by ONE immutable original Memory/Grant positive G1 Pin.
-- NO API EXECUTE, NO route, NO Fetch/proxy permission, NO positive deployment.
-- The caller MUST own a direct Node HTTP ServerResponse socket and retain
-- this exact PostgreSQL transaction until that socket's finish or rollback.
begin;

do $preflight$
begin
  if current_user <> 'postgres'
     or pg_catalog.to_regprocedure(
       'public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.cmd_commit_seyeon_positive_chat_turn_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text)'
     ) is null then
    raise exception 'First positive Reveal requires the existing PostgreSQL owner and deployed G1/G2 authority';
  end if;
end
$preflight$;

-- postgres is a restricted managed owner, not a superuser. Delegate the
-- registry row lock to its existing NOLOGIN owner without granting the API
-- or postgres direct registry access or broad inherited owner authority.
grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema seyeon_private to myeongha_seyeon_chat_runtime_owner;
create function seyeon_private.lock_positive_source_registry_v1(
  p_record_type text,p_schema_version text,p_projector_version text
) returns boolean language plpgsql security definer
set search_path=pg_catalog,public
as $registry_lock$
begin
  perform 1 from public.seyeon_positive_source_type_registry_v1 reg
  where reg.record_kind='memory' and reg.enabled
    and reg.record_type=p_record_type and reg.schema_version=p_schema_version
    and reg.projector_version=p_projector_version for share of reg;
  return found;
end
$registry_lock$;
alter function seyeon_private.lock_positive_source_registry_v1(text,text,text)
  owner to myeongha_seyeon_chat_runtime_owner;
revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;
revoke all on function seyeon_private.lock_positive_source_registry_v1(text,text,text)
  from public,anon,authenticated,service_role,myeongha_api_executor;
grant execute on function seyeon_private.lock_positive_source_registry_v1(text,text,text),
  public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid) to postgres;
revoke myeongha_seyeon_chat_runtime_owner from current_user;

-- Receipt metadata lives on the existing Attempt, preserving the deletion graph.
alter table public.chat_turn_attempts
  add column seyeon_positive_delivery_receipt_hash bytea,
  add column seyeon_positive_delivery_issued_at timestamptz,
  add column seyeon_positive_delivery_received_at timestamptz,
  add constraint seyeon_positive_delivery_receipt_shape check (
    (seyeon_positive_delivery_receipt_hash is null
     and seyeon_positive_delivery_issued_at is null
     and seyeon_positive_delivery_received_at is null)
    or (seyeon_positive_delivery_receipt_hash is not null
        and octet_length(seyeon_positive_delivery_receipt_hash)=32
        and seyeon_positive_delivery_issued_at is not null
        and (seyeon_positive_delivery_received_at is null
             or seyeon_positive_delivery_received_at>=seyeon_positive_delivery_issued_at))
  );

-- One source/Grant/Outbox authority shared by direct Node and receipt-based HTTP.
create function seyeon_private.lock_positive_first_memory_reply_v1(
  p_subject_id uuid, p_thread_id uuid, p_turn_id uuid, p_attempt_id uuid,
  p_expected_user_message_id uuid, p_expected_assistant_message_id uuid,
  p_expected_post_turn_outbox_event_id uuid, p_expected_client_turn_id text,
  p_delivery_receipt_hash bytea
) returns table (assistant_text text)
language plpgsql security definer
set search_path=pg_catalog,public
set row_security=off
as $positive_reveal$
declare
  v_pin jsonb;
  v_original record;
  v_message text;
  v_memory_digest text;
  v_receipt_proof text;
  v_recent jsonb;
  v_recent_source jsonb;
  v_recent_user record;
begin
  if p_subject_id is null or p_thread_id is null
     or p_turn_id is null or p_attempt_id is null
     or p_expected_user_message_id is null
     or p_expected_assistant_message_id is null
     or p_expected_post_turn_outbox_event_id is null
     or p_expected_client_turn_id is null
     or p_expected_client_turn_id <> btrim(p_expected_client_turn_id)
     or length(p_expected_client_turn_id) not between 1 and 256 then
    return;
  end if;
  if p_delivery_receipt_hash is not null and octet_length(p_delivery_receipt_hash)<>32 then
    return;
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform 1 from public.assert_seyeon_chat_thread_runtime_v1(
    p_subject_id,p_thread_id
  );

  -- Lock actual FK parents before checking for absent derived/history rows.
  -- Subject UPDATE also blocks new Subject-owned association rows; Thread
  -- UPDATE excludes concurrently inserted messages and participants.
  perform 1 from public.subjects s
  where s.id=p_subject_id and s.kind='member' and s.status='active'
    and s.merged_into_subject_id is null
  for update;
  if not found then return; end if;

  perform 1 from public.conversation_threads th
  where th.id=p_thread_id and th.subject_id=p_subject_id
    and th.thread_type='single_character'
    and th.status='active' and th.deleted_at is null
  for update;
  if not found then return; end if;

  perform 1 from public.user_character_states cs
  where cs.subject_id=p_subject_id and cs.character_id='seyeon'
  for update;

  -- The validated G1 Pin is irrevocably attached to this original committed
  -- Attempt. A replay receipt or an LLM-generated source reference has no
  -- Reveal authority. Lock both rows through the Node socket handoff.
  select a.seyeon_personal_source_pin_jsonb->'positiveProof',
    nullif(to_jsonb(a)->'seyeon_recent_source_pin_jsonb','null'::jsonb)
  into v_pin,v_recent
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.turn_id=t.id and a.subject_id=t.subject_id
  where t.id=p_turn_id and t.thread_id=p_thread_id
    and t.subject_id=p_subject_id
    -- Identical user text is not a substitute for this exact live receive.
    -- A different request with the same body must not inherit first Reveal.
    and t.client_turn_id=p_expected_client_turn_id
    -- A delivered Turn has ALREADY crossed the first-Reveal boundary.
    -- Never turn an old delivery into a second original-Grant disclosure.
    and t.state='committed'
    -- A synthetic state flip without a durable Commit timestamp is not
    -- G2 original-transaction evidence for a private first disclosure.
    and t.committed_at is not null
    and t.committed_attempt_id=p_attempt_id
    and a.id=p_attempt_id and a.state='committed'
    and a.seyeon_positive_delivery_issued_at is null
    and a.planner_version='seyeon-production-chat-planner-v1'
    and a.seyeon_personal_source_pinned_at is not null
    and a.seyeon_personal_source_pin_jsonb ? 'positiveProof'
    and (select count(*) from jsonb_object_keys(
          a.seyeon_personal_source_pin_jsonb
        ))=1
    and a.validation_result_jsonb->'personalRecordProvenance'
      =a.seyeon_personal_source_pin_jsonb->'positiveProof'
  -- One concurrent first sender at a time: serialise on the actual Turn
  -- before any original Grant/private assistant bytes may be consulted.
  for update of t
  for share of a;
  if not found or jsonb_typeof(v_pin) is distinct from 'object'
     or v_pin->>'schemaVersion' is distinct from
        'seyeon-positive-original-memory-source-pin-v1'
     or v_pin->>'subjectId' is distinct from p_subject_id::text
     or v_pin->>'threadId' is distinct from p_thread_id::text
     or v_pin->>'turnId' is distinct from p_turn_id::text
     or v_pin->>'attemptId' is distinct from p_attempt_id::text
     or v_pin->>'characterId' is distinct from 'seyeon'
     or v_pin->>'recordKind' is distinct from 'memory'
  then
    return;
  end if;

  -- If G1 persisted the selected model User certificate, G3 must recheck
  -- its exact original DB text inside the very same first-Reveal TX.
  -- Existing S0 attempts without this newer certificate retain their
  -- separately approved, original-memory-only S0 scope (not a new grant).
  if v_recent is not null then
    v_recent_source:=v_recent->'sources'->0;
    if jsonb_typeof(v_recent) is distinct from 'object'
      or v_recent->>'schemaVersion' is distinct from
        'seyeon-g1-recent-model-source-pin-v1'
      or v_recent->>'subjectId' is distinct from p_subject_id::text
      or v_recent->>'threadId' is distinct from p_thread_id::text
      or v_recent->>'turnId' is distinct from p_turn_id::text
      or v_recent->>'attemptId' is distinct from p_attempt_id::text
      or v_recent->>'selectedModelSourceCensusDigest'
          !~ '^sha256:v1:[a-f0-9]{64}$'
      or jsonb_typeof(v_recent->'sources') is distinct from 'array'
      or jsonb_array_length(v_recent->'sources')<>1
      or v_recent_source->>'messageId'
          is distinct from p_expected_user_message_id::text
      or v_recent_source->>'role' is distinct from 'user'
      or v_recent_source->>'selectedModelMessageDigest'
          !~ '^sha256:v1:[a-f0-9]{64}$'
      or v_recent_source->>'dbContentHash' is null
      or v_recent_source->>'dbBodySha256'
          !~ '^sha256:v1:[a-f0-9]{64}$'
    then return; end if;

    select m.body_text,m.content_hash into v_recent_user
    from public.conversation_messages m
    where m.id=p_expected_user_message_id
      and m.subject_id=p_subject_id
      and m.thread_id=p_thread_id
      and m.turn_id=p_turn_id
      and m.sender_type='user'
      and m.redacted_at is null
      and m.body_text is not null
    for share of m;
    if not found
      or v_recent_user.content_hash is distinct from
         v_recent_source->>'dbContentHash'
      or 'sha256:v1:' || encode(
           sha256(convert_to(v_recent_user.body_text,'UTF8')),'hex')
         is distinct from v_recent_source->>'dbBodySha256'
    then return; end if;
  end if;

  -- No SRC-25 registered model-inference permission => absolutely no Reveal.
  if not seyeon_private.lock_positive_source_registry_v1(
    v_pin->>'recordType',v_pin->>'recordSchemaVersion',v_pin->>'projectorVersion'
  ) then return; end if;

  -- Same original Grant ID, not any newer regrant for the Memory.
  -- SHARE locks are kept until the caller finishes its controlled direct
  -- Node HTTP response. A revoke/update FOR UPDATE must then wait.
  select g.granted_at,m.content_jsonb into v_original
  from public.record_access_grants g
  join public.memory_items m
    on m.id=g.memory_item_id and m.subject_id=g.subject_id
  where g.id=(v_pin->>'originalGrantId')::uuid
    and g.subject_id=p_subject_id
    and g.memory_item_id=(v_pin->>'recordId')::uuid
    and g.life_fact_id is null
    and g.grantee_character_id='seyeon'
    and g.grant_reason='user_choice' and g.revoked_at is null
    and g.seyeon_revoke_requested_at is null
    and m.revoked_at is null and m.source_kind='user_approved'
    and m.memory_type=v_pin->>'recordType'
    and m.schema_version=v_pin->>'recordSchemaVersion'
  for share of g,m;
  if not found then return; end if;

  v_memory_digest:='sha256:pg-jsonb:v1:' ||
    encode(sha256(convert_to(v_original.content_jsonb::text,'UTF8')),'hex');
  if v_original.granted_at::text is distinct from
       (v_pin->>'originalGrantedAt')::timestamptz::text
     or v_memory_digest is distinct from v_pin->>'originalPgJsonbDigest'
     or v_pin->>'selectedSourcesDigest' !~ '^sha256:v1:[a-f0-9]{64}$'
     or v_pin->>'projectedMemoryDigest' !~ '^sha256:v1:[a-f0-9]{64}$'
     or v_pin->>'finalModelContextDigest' !~ '^sha256:v1:[a-f0-9]{64}$'
  then
    return;
  end if;

  -- Scope strictly to the first user+assistant Turn and zero unpinned
  -- derived/history sources. This NEVER reveals historical/replayed turns
  -- or any second Memory. The original Pin itself identifies one Memory.
  if not exists (
      select 1 from public.conversation_thread_characters sc
      where sc.thread_id=p_thread_id
        and sc.character_id='seyeon' and sc.role='primary'
        and sc.left_at is null
    )
    or exists (
      select 1 from public.conversation_thread_characters other_sc
      where other_sc.thread_id=p_thread_id and other_sc.left_at is null
        and other_sc.character_id<>'seyeon'
    )
    or (select count(*) from public.conversation_messages msg
        where msg.subject_id=p_subject_id
          and msg.thread_id=p_thread_id)<>2
    or (select count(*) from public.conversation_messages own_message
        where own_message.subject_id=p_subject_id
          and own_message.thread_id=p_thread_id
          and own_message.turn_id=p_turn_id
          and own_message.sender_type='user'
          and own_message.redacted_at is null)<>1
    or exists (
      select 1 from public.conversation_messages other_message
      where other_message.subject_id=p_subject_id
        and other_message.thread_id=p_thread_id
        and other_message.turn_id is distinct from p_turn_id
    )
    or exists (
      select 1 from public.relationship_events r
      where r.subject_id=p_subject_id and r.character_id='seyeon'
    )
    or exists (
      select 1 from public.relationship_event_records r
      where r.subject_id=p_subject_id and r.character_id='seyeon'
    )
    or exists (
      select 1 from public.relationship_history_entries r
      where r.subject_id=p_subject_id and r.character_id='seyeon'
    )
  then return; end if;

  -- section 61: DB independently binds the exact G2 Commit receipt locators
  -- (User, Assistant and durable post-turn Outbox) supplied by this Node
  -- attempt. The original Grant, registry and Subject/Thread locks remain
  -- held across this read and the direct Node socket handoff.
  perform 1
  from public.outbox_events oe
  join public.conversation_messages original_user
    on original_user.id=p_expected_user_message_id
   and original_user.subject_id=p_subject_id
   and original_user.thread_id=p_thread_id
   and original_user.turn_id=p_turn_id
   and original_user.sender_type='user'
   and original_user.redacted_at is null
  join public.chat_turn_attempts original_attempt
    on original_attempt.id=p_attempt_id
   and original_attempt.subject_id=p_subject_id
   and original_attempt.turn_id=p_turn_id
   and original_attempt.state='committed'
   and original_attempt.committed_message_id=p_expected_assistant_message_id
  where oe.id=p_expected_post_turn_outbox_event_id
    and oe.aggregate_type='chat_turn'
    and oe.aggregate_id=p_turn_id::text
    and oe.event_type='SEYEON_POST_TURN_ANALYSIS_REQUESTED'
    and oe.event_schema_version='v1'
    and oe.dedupe_key='seyeon-post-turn-v1'
    and oe.payload_jsonb->>'schemaVersion'
      = 'seyeon-post-turn-analysis-request-v1'
    and oe.payload_jsonb->>'subjectId'=p_subject_id::text
    and oe.payload_jsonb->>'characterId'='seyeon'
    and oe.payload_jsonb->>'turnId'=p_turn_id::text
    and oe.payload_jsonb->>'attemptId'=p_attempt_id::text
    and oe.payload_jsonb->>'userMessageId'
      = p_expected_user_message_id::text
    and oe.payload_jsonb->>'assistantMessageId'
      = p_expected_assistant_message_id::text
    and oe.payload_jsonb->'snapshot'->>'schemaVersion'
      = 'seyeon-post-turn-analysis-snapshot-v1'
    and oe.payload_jsonb->'snapshot'->>'turnId'=p_turn_id::text
    and oe.payload_jsonb->'snapshot'->>'userMessageId'
      = p_expected_user_message_id::text
    and oe.payload_jsonb->'snapshot'->>'assistantMessageId'
      = p_expected_assistant_message_id::text
    and oe.payload_jsonb->>'snapshotHash'
      ~ '^sha256:v1:[a-f0-9]{64}$'
  for share of oe,original_user,original_attempt;
  if not found then return; end if;
  if (select count(*) from public.outbox_events other_post
      where other_post.aggregate_type='chat_turn'
        and other_post.aggregate_id=p_turn_id::text
        and other_post.event_type='SEYEON_POST_TURN_ANALYSIS_REQUESTED'
        and other_post.dedupe_key='seyeon-post-turn-v1')<>1 then
    return;
  end if;

  select msg.body_text into v_message
  from public.chat_turn_attempts a
  join public.conversation_messages msg
    on msg.id=a.committed_message_id
   and msg.subject_id=a.subject_id and msg.turn_id=a.turn_id
  where a.id=p_attempt_id and a.turn_id=p_turn_id
    and a.subject_id=p_subject_id and a.state='committed'
    and a.committed_message_id=p_expected_assistant_message_id
    and msg.thread_id=p_thread_id and msg.sender_type='character'
    and msg.redacted_at is null
    and msg.body_text is not null and length(btrim(msg.body_text))>0
    and msg.body_text=a.generated_body_text
  for share of a,msg;
  if not found or v_message is null then return; end if;

  -- HTTP issuance is durable BEFORE Response construction. A pending receipt
  -- prevents any revoke/invalidating write from completing, including after
  -- Worker crash or DB COMMIT ambiguity. It NEVER expires into permission.
  if p_delivery_receipt_hash is not null then
    -- Bind receipt to the exact protected UTF-8 body AND the fresh challenge.
    -- The DB sees only the challenge hash, never the bearer challenge itself.
    v_receipt_proof:=encode(sha256(convert_to(
      'seyeon-positive-http-receipt-v1'||chr(10)||octet_length(v_message)::text||':'||
      v_message||':'||encode(p_delivery_receipt_hash,'hex'),'UTF8')),'hex');
    update public.chat_turn_attempts
    set seyeon_positive_delivery_receipt_hash=sha256(convert_to(v_receipt_proof,'UTF8')),
        seyeon_positive_delivery_issued_at=clock_timestamp()
    where id=p_attempt_id and subject_id=p_subject_id
      and seyeon_positive_delivery_issued_at is null;
    if not found then return; end if;
    return query select v_message;
    return;
  end if;

  -- Consume THIS first-send right before handing bytes to direct Node.
  -- This UPDATE is still UNCOMMITTED while Node holds this SAME owner
  -- transaction throughout ServerResponse 'finish'. On disconnect, timeout,
  -- or handoff failure the whole transaction rolls back (including delivery).
  -- Concurrent request B waits on the original Turn FOR UPDATE, then sees
  -- state='delivered' and receives NO private assistant text.
  -- 'delivered' records local Node OS-buffer handoff, NOT browser/Edge ACK.
  update public.chat_turns delivered_turn
  set state='delivered',
      delivered_at=clock_timestamp(),
      revision=delivered_turn.revision+1,
      updated_at=clock_timestamp()
  where delivered_turn.id=p_turn_id
    and delivered_turn.thread_id=p_thread_id
    and delivered_turn.subject_id=p_subject_id
    and delivered_turn.client_turn_id=p_expected_client_turn_id
    and delivered_turn.state='committed'
    and delivered_turn.delivered_at is null
    and delivered_turn.committed_at is not null
    and delivered_turn.committed_attempt_id=p_attempt_id;
  if not found then return; end if;

  return query select v_message;
end
$positive_reveal$;

revoke all on function seyeon_private.lock_positive_first_memory_reply_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea
) from public,anon,authenticated,service_role,myeongha_api_executor;

create function public.qry_seyeon_positive_first_memory_locked_reveal_v3(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_expected_user_message_id uuid,p_expected_assistant_message_id uuid,
  p_expected_post_turn_outbox_event_id uuid,p_expected_client_turn_id text
) returns table(assistant_text text)
language sql security definer set search_path=pg_catalog,public set row_security=off
as $node_reveal$
  select * from seyeon_private.lock_positive_first_memory_reply_v1(
    p_subject_id,p_thread_id,p_turn_id,p_attempt_id,p_expected_user_message_id,
    p_expected_assistant_message_id,p_expected_post_turn_outbox_event_id,
    p_expected_client_turn_id,null::bytea);
$node_reveal$;

create function public.cmd_issue_seyeon_positive_first_reply_v1(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_expected_user_message_id uuid,p_expected_assistant_message_id uuid,
  p_expected_post_turn_outbox_event_id uuid,p_expected_client_turn_id text,
  p_delivery_receipt_hash bytea
) returns table(assistant_text text)
language plpgsql security definer set search_path=pg_catalog,public set row_security=off
as $http_issue$
begin
  if p_delivery_receipt_hash is null or octet_length(p_delivery_receipt_hash)<>32 then return; end if;
  return query select * from seyeon_private.lock_positive_first_memory_reply_v1(
    p_subject_id,p_thread_id,p_turn_id,p_attempt_id,p_expected_user_message_id,
    p_expected_assistant_message_id,p_expected_post_turn_outbox_event_id,
    p_expected_client_turn_id,p_delivery_receipt_hash);
end
$http_issue$;
revoke all on function public.cmd_issue_seyeon_positive_first_reply_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea
) from public,anon,authenticated,service_role,myeongha_api_executor;

-- Restrict to the function owner only. No PUBLIC, authenticated, service,
-- or myeongha_api_executor EXECUTE and NO route registration.
revoke all on function public.qry_seyeon_positive_first_memory_locked_reveal_v3(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text
) from public;
do $revoke_direct$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
      where rolname in ('anon','authenticated','service_role') loop
    execute format(
      'revoke all on function public.qry_seyeon_positive_first_memory_locked_reveal_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text) from %I',
      v_role
    );
  end loop;
end
$revoke_direct$;

comment on function public.qry_seyeon_positive_first_memory_locked_reveal_v3(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text
) is 'G3 first single-Memory original-rights locked positive Reveal SOURCE ONLY; no API EXECUTE, no route or external proxy ACK approval';

commit;
