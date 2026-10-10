-- Offline real PostgreSQL role/state/immutability proof.
-- Reuses prior chat_attempt_commit_concurrency seed; every mutation rolls back.
-- Watchtower-Track: security
begin;

-- Create a synthetic Se-yeon single-character thread without user data.
insert into public.characters(character_id,created_at)
values ('seyeon',now()) on conflict do nothing;

insert into public.character_runtime_catalog(
  character_id, content_bundle_id, availability, enabled, published_at
) values (
  'seyeon','a1000000-0000-0000-0000-000000000001',
  'available',true,now()
) on conflict do nothing;

insert into public.conversation_threads(
  id, subject_id, thread_type, status, title,
  active_content_release_id, active_content_bundle_id,
  content_revision,next_sequence_no,created_at,updated_at
) values (
  'f1100000-0000-4000-8000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'single_character','active','zero-pin-synthetic',
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  0,1,now(),now()
);

insert into public.conversation_thread_characters(
  id,thread_id,character_id,content_bundle_id,role,joined_at
) values (
  'f1200000-0000-4000-8000-000000000001',
  'f1100000-0000-4000-8000-000000000001',
  'seyeon','a1000000-0000-0000-0000-000000000001',
  'primary',now()-interval '1 minute'
);

select * from public.cmd_receive_chat_turn_v1(
  'a0000000-0000-0000-0000-000000000001',
  'f1100000-0000-4000-8000-000000000001',
  'seyeon-zero-pin-offline',
  'sha256:v1:synthetic-request',
  'chat-request-v1',
  '{"clientTurnId":"seyeon-zero-pin-offline","text":"synthetic question","clientCapability":"0.0.1-dev"}'::jsonb,
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'f1300000-0000-4000-8000-000000000001',
  'f1400000-0000-4000-8000-000000000001',
  'synthetic question',null,'sha256:v1:synthetic-user'
);
select * from public.cmd_allocate_chat_turn_attempt_v1(
  'a0000000-0000-0000-0000-000000000001',
  'f1300000-0000-4000-8000-000000000001',
  'f1500000-0000-4000-8000-000000000001',
  'seyeon-production-chat-planner-v1'
);

do $acl$
begin
  if pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_mark_seyeon_chat_context_ready_runtime_v1(uuid,uuid,uuid)',
    'EXECUTE'
  ) or not pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) then raise exception 'Se-yeon context-ready runtime retained old unpinned API capability'; end if;
  if pg_catalog.has_function_privilege(
    'anon','public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)','EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated','public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)','EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role','public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)','EXECUTE'
  ) then raise exception 'Public API roles could call Se-yeon zero source pin'; end if;
  if (
    select p.proowner from pg_catalog.pg_proc p
    where p.oid='public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)'::regprocedure
  ) is distinct from 'myeongha_seyeon_chat_runtime_owner'::regrole::oid then
    raise exception 'Se-yeon zero source pin command owner drifted';
  end if;
end $acl$;

set local role myeongha_api_executor;
set local myeongha.subject_id='a0000000-0000-0000-0000-000000000001';

do $test$
declare
  v_proof jsonb;
  v_bad jsonb;
  v_replayed boolean;
  v_denied boolean;
  v_subject uuid := 'a0000000-0000-0000-0000-000000000001';
  v_turn uuid := 'f1300000-0000-4000-8000-000000000001';
  v_attempt uuid := 'f1500000-0000-4000-8000-000000000001';
begin
  v_proof := jsonb_build_object(
    'zeroProof',jsonb_build_object(
      'schemaVersion','seyeon-attempt-zero-personal-proof-v1',
      'source','server-composed-context',
      'subjectId',v_subject::text,
      'threadId','f1100000-0000-4000-8000-000000000001',
      'turnId',v_turn::text,
      'attemptId',v_attempt::text,
      'characterId','seyeon',
      'recordState','explicit_zero_admitted',
      'recordCount',0,
      'records','[]'::jsonb,
      'unsupportedSchemaCount',0,
      'proofDigest','sha256:v1:'||repeat('a',64),
      'permitsAtomicPersonalRecordCommit',false,
      'permitsHttpReveal',false
    ),
    'exactModelSourceSelection',jsonb_build_object(
      'version','seyeon-exact-model-personal-source-selection-v1',
      'selectedMemoryCount',0,'selectedPersonalRecordCount',0,
      'selectedSources','[]'::jsonb,
      'selectedSourcesDigest','sha256:v1:'||repeat('b',64),
      'persistedBeforeModel',false,
      'permitsAtomicCommit',false,'permitsHttpReveal',false
    )
  );

  v_denied:=false;
  begin
    perform public.cmd_mark_seyeon_chat_context_ready_pinned_v1(
      v_subject,v_turn,v_attempt,
      jsonb_set(v_proof,'{zeroProof,records}',
        jsonb_build_array(jsonb_build_object('kind','memory')))
    );
  exception when check_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Positive Personal Record pin admitted'; end if;

  v_denied:=false;
  begin
    perform public.cmd_mark_seyeon_chat_context_ready_pinned_v1(
      v_subject,v_turn,v_attempt,
      jsonb_set(v_proof,'{zeroProof,threadId}',to_jsonb('f1100000-0000-4000-8000-000000000099'::text))
    );
  exception when check_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Other-thread source pin admitted'; end if;

  select public.cmd_mark_seyeon_chat_context_ready_pinned_v1(
    v_subject,v_turn,v_attempt,v_proof
  ) into v_replayed;
  if v_replayed then raise exception 'First durable source pin marked replay'; end if;

  select public.cmd_mark_seyeon_chat_context_ready_pinned_v1(
    v_subject,v_turn,v_attempt,v_proof
  ) into v_replayed;
  if not v_replayed then raise exception 'Identical source pin not idempotent'; end if;

  v_denied:=false;
  begin
    perform public.cmd_mark_seyeon_chat_context_ready_pinned_v1(
      v_subject,v_turn,v_attempt,
      jsonb_set(v_proof,'{zeroProof,unsupportedSchemaCount}','1'::jsonb)
    );
  exception when unique_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Mutated source proof replay was admitted'; end if;
end $test$;

reset role;
do $check$
declare v_pin jsonb;
begin
  select a.seyeon_personal_source_pin_jsonb into strict v_pin
  from public.chat_turn_attempts a
  where a.id='f1500000-0000-4000-8000-000000000001'
    and a.state='running'
    and a.seyeon_personal_source_pinned_at is not null;
  if v_pin #>> '{zeroProof,recordState}' is distinct from 'explicit_zero_admitted' then
    raise exception 'Attempt did not durably retain the zero-source proof';
  end if;
  if (select state from public.chat_turns
    where id='f1300000-0000-4000-8000-000000000001') <>
      'context_ready' then
    raise exception 'Context ready and zero-source pin were not one transaction';
  end if;
  begin
    update public.chat_turn_attempts
    set seyeon_personal_source_pin_jsonb=null
    where id='f1500000-0000-4000-8000-000000000001';
    raise exception 'Durable source pin was mutable';
  exception when check_violation then null;
  end;
end $check$;
rollback;
