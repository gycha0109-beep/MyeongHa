-- Watchtower-Track: security
-- Disposable PostgreSQL17 fixture. Builds an actual first Seyeon Member Turn
-- using real receive/attempt/pin/generate/validate/commit v2 DB commands.
-- Renderer/Output Guard evidence is synthetic DB-only; NO paid Provider call.
-- This fixture must NEVER be run against Production.
\set ON_ERROR_STOP on

BEGIN;
insert into auth.users(id) values ('a8100000-0000-4000-8000-000000000001');
insert into public.subjects(
 id,kind,auth_user_id,status,created_at,updated_at
) values (
 'a8110000-0000-4000-8000-000000000001','member',
 'a8100000-0000-4000-8000-000000000001','active',now(),now()
);
insert into public.content_bundles(
 id,content_version,content_hash,artifact_ref,artifact_schema_version,
 min_client_capability,asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at
) values (
 'a8120000-0000-4000-8000-000000000001',
 'first-zero-test-v1','sha256:v1:'||repeat('a',64),
 'fixture:first-zero-only','v1','web-v1',
 'sha256:v1:'||repeat('b',64),'v1','{}'::jsonb,now()
);
insert into public.content_releases(
 id,release_key,content_bundle_id,status,is_default,rollout_policy_version,
 rollout_seed,activated_at,created_at
) values (
 'a8130000-0000-4000-8000-000000000001',
 'first-zero-test-release','a8120000-0000-4000-8000-000000000001',
 'active',false,'v1','disposable',now(),now()
);
insert into public.characters(character_id,created_at)
values ('seyeon',now()) on conflict do nothing;
insert into public.character_runtime_catalog(
 character_id,content_bundle_id,availability,enabled,published_at
) values (
 'seyeon','a8120000-0000-4000-8000-000000000001',
 'available',true,now()
);
insert into public.conversation_threads(
 id,subject_id,thread_type,status,title,active_content_release_id,
 active_content_bundle_id,content_revision,next_sequence_no,created_at,updated_at
) values (
 'a8140000-0000-4000-8000-000000000001',
 'a8110000-0000-4000-8000-000000000001',
 'single_character','active','First zero disposable',
 'a8130000-0000-4000-8000-000000000001',
 'a8120000-0000-4000-8000-000000000001',
 0,1,now(),now()
);
insert into public.conversation_thread_characters(
 id,thread_id,character_id,content_bundle_id,role,joined_at
) values (
 'a8150000-0000-4000-8000-000000000001',
 'a8140000-0000-4000-8000-000000000001',
 'seyeon','a8120000-0000-4000-8000-000000000001',
 'primary',now()-interval '1 minute'
);
COMMIT;

BEGIN;
set local myeongha.subject_id='a8110000-0000-4000-8000-000000000001';
select * from public.cmd_receive_chat_turn_v1(
 'a8110000-0000-4000-8000-000000000001',
 'a8140000-0000-4000-8000-000000000001',
 'first-zero-disposable-v1','sha256:v1:'||repeat('c',64),
 'chat-request-v1','{"text":"synthetic hello"}'::jsonb,
 'a8130000-0000-4000-8000-000000000001',
 'a8120000-0000-4000-8000-000000000001',
 'a8160000-0000-4000-8000-000000000001',
 'a8180000-0000-4000-8000-000000000001',
 'Synthetic first hello',null,'sha256:v1:'||repeat('d',64)
);
select * from public.cmd_allocate_chat_turn_attempt_v1(
 'a8110000-0000-4000-8000-000000000001',
 'a8160000-0000-4000-8000-000000000001',
 'a8170000-0000-4000-8000-000000000001',
 'seyeon-production-chat-planner-v1'
);
COMMIT;

BEGIN;
set local role myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1(
 'a8100000-0000-4000-8000-000000000001'
);
select public.cmd_mark_seyeon_chat_context_ready_pinned_v1(
 'a8110000-0000-4000-8000-000000000001',
 'a8160000-0000-4000-8000-000000000001',
 'a8170000-0000-4000-8000-000000000001',
 jsonb_build_object(
   'zeroProof',jsonb_build_object(
     'schemaVersion','seyeon-attempt-zero-personal-proof-v1',
     'source','server-composed-context',
     'subjectId','a8110000-0000-4000-8000-000000000001',
     'threadId','a8140000-0000-4000-8000-000000000001',
     'turnId','a8160000-0000-4000-8000-000000000001',
     'attemptId','a8170000-0000-4000-8000-000000000001',
     'characterId','seyeon','recordState','explicit_zero_admitted',
     'recordCount',0,'records','[]'::jsonb,'unsupportedSchemaCount',0,
     'proofDigest','sha256:v1:'||repeat('e',64),
     'permitsAtomicPersonalRecordCommit',false,'permitsHttpReveal',false
   ),
   'exactModelSourceSelection',jsonb_build_object(
     'version','seyeon-exact-model-personal-source-selection-v1',
     'selectedMemoryCount',0,'selectedPersonalRecordCount',0,
     'selectedSources','[]'::jsonb,
     'selectedSourcesDigest','sha256:v1:'||repeat('f',64),
     'persistedBeforeModel',false,'permitsAtomicCommit',false,
     'permitsHttpReveal',false
   )
 )
);
COMMIT;

BEGIN;
set local myeongha.subject_id='a8110000-0000-4000-8000-000000000001';
insert into public.ai_execution_logs(
 id,subject_id,turn_id,turn_attempt_id,stage,provider,model,prompt_version,
 content_release_id,content_bundle_id,character_id,input_ref_jsonb,
 output_ref_jsonb,status,created_at
) values (
 'a8200000-0000-4000-8000-000000000001',
 'a8110000-0000-4000-8000-000000000001',
 'a8160000-0000-4000-8000-000000000001',
 'a8170000-0000-4000-8000-000000000001',
 'renderer','synthetic','offline','synthetic-v1',
 'a8130000-0000-4000-8000-000000000001',
 'a8120000-0000-4000-8000-000000000001',
 'seyeon','{}'::jsonb,'{}'::jsonb,'success',now()
);
select public.cmd_mark_chat_turn_generated_v1(
 'a8110000-0000-4000-8000-000000000001',
 'a8160000-0000-4000-8000-000000000001',
 'a8170000-0000-4000-8000-000000000001',
 'a8200000-0000-4000-8000-000000000001',
 'synthetic-v1',
 'a8150000-0000-4000-8000-000000000001',
 'DB_LOCKED_ZERO_SOURCE_SYNTHETIC_OK',
 '{"text":"DB_LOCKED_ZERO_SOURCE_SYNTHETIC_OK"}'::jsonb,
 'v1','sha256:v1:'||repeat('1',64),'[]'::jsonb
);
insert into public.ai_execution_logs(
 id,subject_id,turn_id,turn_attempt_id,stage,provider,model,prompt_version,
 content_release_id,content_bundle_id,character_id,input_ref_jsonb,
 output_ref_jsonb,status,created_at
) values (
 'a8210000-0000-4000-8000-000000000001',
 'a8110000-0000-4000-8000-000000000001',
 'a8160000-0000-4000-8000-000000000001',
 'a8170000-0000-4000-8000-000000000001',
 'output_guard','synthetic','offline','synthetic-v1',
 'a8130000-0000-4000-8000-000000000001',
 'a8120000-0000-4000-8000-000000000001',
 'seyeon','{}'::jsonb,
 jsonb_build_object('generatedContentHash','sha256:v1:'||repeat('1',64)),
 'success',now()
);
select public.cmd_validate_chat_turn_attempt_v1(
 'a8110000-0000-4000-8000-000000000001',
 'a8160000-0000-4000-8000-000000000001',
 'a8170000-0000-4000-8000-000000000001',
 'a8210000-0000-4000-8000-000000000001',
 'synthetic-output-guard-v1',
 jsonb_build_object(
   'passed',true,
   'personalRecordProvenance',(
     select seyeon_personal_source_pin_jsonb->'zeroProof'
     from public.chat_turn_attempts
     where id='a8170000-0000-4000-8000-000000000001'
   )
 ),
 true,'failed_final'
);
select turn_id,assistant_message_id,replayed from
 public.cmd_commit_seyeon_chat_turn_runtime_v2(
 'a8110000-0000-4000-8000-000000000001',
 'a8140000-0000-4000-8000-000000000001',
 'a8160000-0000-4000-8000-000000000001',
 'a8170000-0000-4000-8000-000000000001',
 'a8190000-0000-4000-8000-000000000001',
 'a8220000-0000-4000-8000-000000000001',
 'a8230000-0000-4000-8000-000000000001',
 jsonb_build_object(
   'schemaVersion','seyeon-post-turn-analysis-snapshot-v1',
   'turnId','a8160000-0000-4000-8000-000000000001',
   'userMessageId','a8180000-0000-4000-8000-000000000001',
   'assistantMessageId','a8190000-0000-4000-8000-000000000001'
 ),
 'sha256:v1:'||repeat('2',64)
);
COMMIT;
