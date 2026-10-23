\set ON_ERROR_STOP on
-- Disposable-only S7 historical delivery fixture: genuine table FK and S4
-- origin/safe marker triggers, synthetic non-user content, no S5 authorization.
do $s7$
declare
 s constant uuid:='11390000-0000-0000-0000-000000000001';
 b constant uuid:='11391000-0000-0000-0000-000000000001';
 r constant uuid:='12103100-0000-0000-0000-000000000001';
 t constant uuid:='f7010000-0000-4000-8000-000000000001';
 c constant uuid:='f7020000-0000-4000-8000-000000000001';
 u constant uuid:='f7030000-0000-4000-8000-000000000001';
 a constant uuid:='f7040000-0000-4000-8000-000000000001';
 m constant uuid:='f7050000-0000-4000-8000-000000000001';
 g1 constant uuid:='f7060000-0000-4000-8000-000000000001';
 g2 constant uuid:='f7070000-0000-4000-8000-000000000001';
 body constant uuid:='f7080000-0000-4000-8000-000000000001';
 release_id uuid;
 original_grant uuid;
 original_spec_version text;
 original_artifact_hash text;
 instant timestamptz:=clock_timestamp();
begin
 -- The original B2/B3 entitlement fixture intentionally has no Chat release.
 -- Create ONE synthetic active non-default release for the existing published
 -- B2 content bundle. This is isolated test data, NOT an S5/public release.
 insert into public.content_releases(
   id,release_key,content_bundle_id,status,is_default,
   rollout_policy_version,rollout_seed,activated_at,created_at
 ) values (
   'f70b0000-0000-4000-8000-000000000001'::uuid,
   'official-reader-s7-original-ledger-fixture-only',
   b,'active',false,'s7-isolated-fixture-v1','s7-test-only',instant,instant
 );
 select id into release_id from public.content_releases
 where id='f70b0000-0000-4000-8000-000000000001'::uuid
   and content_bundle_id=b;
 -- Exact source/provenance pins must come from the existing canonical
 -- Reading and product ledger; never copy synthetic caller-provided values.
 select o.product_spec_version into original_spec_version
 from public.standard_reading_official_bindings o
 where o.reading_id=r and o.subject_id=s;
 select rr.response_hash into original_artifact_hash
 from public.readings reading
 join public.reading_refs rr
   on rr.reading_id=reading.id
  and rr.subject_id=reading.subject_id
  and rr.execution_attempt_id=reading.committed_execution_attempt_id
 where reading.id=r and reading.subject_id=s
   and reading.execution_status='succeeded';
 select id into original_grant from public.entitlement_grants
 where source_receipt_id='12192000-0000-0000-0000-000000000002'::uuid
   and grant_source_type='purchase' order by id limit 1;
 if release_id is null or original_grant is null
   or original_spec_version is null or original_artifact_hash is null
   or not exists (
   select 1 from public.standard_reading_reader_access_grants x
   where x.entitlement_grant_id=original_grant and x.subject_id=s
     and x.official_reading_id=r and x.reader_character_id='test-unlockable-reader'
     and x.reader_content_bundle_id=b
 ) then raise exception 'Original B2 Reader Grant/Reading/Bundle fixture unavailable'; end if;
 -- Prior canonical purchase fixture intentionally finishes with revoked B2+B3.
 -- Only this disposable DB clone re-arms two independent fixture purchases.
 update public.entitlement_grants set status='active',revision=revision+1,
   last_effective_at=instant-interval '5 minutes',updated_at=instant
 where source_receipt_id in (
   '12192000-0000-0000-0000-000000000002'::uuid,
   '12192000-0000-0000-0000-000000000003'::uuid);
 if (select count(*) from public.entitlement_grants where status='active'
     and source_receipt_id in (
       '12192000-0000-0000-0000-000000000002'::uuid,
       '12192000-0000-0000-0000-000000000003'::uuid))<>2
 then raise exception 'Expected two independent active Reader Grants'; end if;
 insert into public.conversation_threads(
  id,subject_id,thread_type,status,active_content_release_id,
  active_content_bundle_id,content_revision,next_sequence_no,created_at,updated_at
 ) values(t,s,'single_character','active',release_id,b,0,1,instant,instant);
 insert into public.conversation_thread_characters(
  id,thread_id,character_id,content_bundle_id,role,joined_at
 ) values(c,t,'test-unlockable-reader',b,'primary',instant);
 insert into public.chat_turns(
  id,thread_id,subject_id,client_turn_id,request_hash,request_contract_version,
  request_snapshot_jsonb,resolved_content_release_id,resolved_content_bundle_id,
  state,revision,next_attempt_no,created_at,updated_at
 ) values(u,t,s,'s7-test-only','sha256:v1:s7-fixture-only','s7-fixture-v1',
   '{"testOnly":true}'::jsonb,release_id,b,'received',0,2,instant,instant);
 insert into public.chat_turn_attempts(
  id,turn_id,subject_id,attempt_no,state,planner_version,started_at
 ) values(a,u,s,1,'running','fixture-only',instant);
 insert into public.ai_execution_logs(
  id,subject_id,turn_id,turn_attempt_id,stage,provider,model,prompt_version,
  content_release_id,content_bundle_id,character_id,
  input_ref_jsonb,output_ref_jsonb,status,created_at
 ) values
 (g1,s,u,a,'renderer','fixture','none','synthetic',release_id,b,
  'test-unlockable-reader','{}'::jsonb,'{}'::jsonb,'success',instant),
 (g2,s,u,a,'output_guard','fixture','none','synthetic',release_id,b,
  'test-unlockable-reader','{}'::jsonb,'{}'::jsonb,'success',instant);
 insert into public.conversation_messages(
  id,thread_id,subject_id,turn_id,sequence_no,sender_type,body_text,
  message_payload_jsonb,message_schema_version,content_hash,created_at
 ) values(m,t,s,u,1,'system','유료 해설 기록이 있습니다.',null,null,
 'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63',instant);
 update public.conversation_threads set next_sequence_no=2 where id=t;
 update public.chat_turn_attempts set state='generated',finished_at=instant,
  renderer_version='fixture-only',generation_ai_execution_log_id=g1,
  generated_thread_character_id=c,generated_character_content_bundle_id=b,
  generated_message_payload_jsonb='{"testOnly":true}'::jsonb,
  generated_message_schema_version='fixture-v1',
  generated_content_hash='sha256:v1:fixture-no-prose',
  grounding_refs_jsonb='[]'::jsonb,generated_at=instant
 where id=a;
 update public.chat_turn_attempts set state='validated',
  validation_ai_execution_log_id=g2,
  validation_result_jsonb='{"testOnly":true,"passed":true}'::jsonb,
  validated_at=instant,output_guard_version='fixture-only' where id=a;
 update public.chat_turn_attempts set state='committed',committed_message_id=m where id=a;
 update public.chat_turns set state='committed',committed_attempt_id=a,
  committed_at=instant,updated_at=instant,revision=revision+1 where id=u;
 -- CI ONLY: the private 2110 source-proof guard intentionally blocks any
 -- protected body without a matching Saju Production authority receipt.
 -- The actual Saju issuer is not implemented/approved (#2410). Insert one
 -- isolated privileged TEST receipt with synthetic identifiers to verify
 -- that the 2110 cross-table match remains enforced. This never executes a
 -- Production issuer and DOES NOT approve S3/S5 storage, reveal or payment.
 insert into public.official_reader_s3_source_authority_receipts_v1(
   id,subject_id,official_reading_id,reader_character_id,
   reader_content_bundle_id,content_release_id,product_id,
   product_spec_version,official_artifact_response_hash,
   source_response_hash,source_attestation_ref,issuer_id,issuer_key_id,
   source_proof_fingerprint,attestation_contract_version,
   production_interpretation_authority,source_coverage_authority,
   semantic_guard_version,output_guard_version,source_verified_at
 ) values (
   'f70c0000-0000-4000-8000-000000000001'::uuid,
   s,r,'test-unlockable-reader',b,release_id,
   '11392000-0000-0000-0000-000000000001'::uuid,
   original_spec_version,original_artifact_hash,
   'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   'fixture:no-saju-authority','ci-isolated-fixture','fixture-only-key',
   'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
   'official-reader-saju-production-source-proof-v1',
   'verified','complete','fixture-no-approval',
   'fixture-no-approval',instant
 );
 -- Genuine 1950 origin and 2110 S3 binding triggers are NOT disabled:
 -- they validate the exact B2 Grant, Reader, safe Chat marker and isolated
 -- source receipt. The test does NOT exercise a Production Saju issuer.
 insert into public.official_reader_paid_answer_bodies(
  id,subject_id,thread_id,turn_id,attempt_id,safe_message_id,
  thread_character_id,official_reading_id,reader_character_id,
  reader_content_bundle_id,content_release_id,
  originating_entitlement_grant_id,product_id,product_spec_version,
  official_artifact_response_hash,source_attestation_ref,source_response_hash,
  semantic_guard_version,output_guard_version,encryption_scheme_version,
  encryption_key_ref,encryption_iv,encryption_auth_tag,encrypted_body,committed_at
 ) values(body,s,t,u,a,m,c,r,'test-unlockable-reader',b,release_id,
  original_grant,'11392000-0000-0000-0000-000000000001'::uuid,
  original_spec_version,original_artifact_hash,
  'fixture:no-saju-authority',
  'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'fixture-no-approval','fixture-no-approval','aes-256-gcm-v1','fixture-no-key',
  decode('00112233445566778899aabb','hex'),
  decode('00112233445566778899aabbccddeeff','hex'),
  decode('12345678','hex'),instant);
 -- Genuine 2140 private S7 history: TWO prepared records, ONE ACK.
 insert into public.official_reader_paid_delivery_attempts_v1(
  id,subject_id,body_id,thread_id,safe_message_id,delivery_request_id,
  acknowledgement_token_hash,response_prepared_at,acknowledgement_deadline,
  client_acknowledged_at,retention_until
 ) values
 ('f7090000-0000-4000-8000-000000000001',s,body,t,m,
  'f70a0000-0000-4000-8000-000000000001',
  'sha256:v1:1111111111111111111111111111111111111111111111111111111111111111',
  instant-interval '2 minutes',instant+interval '1 hour',null,instant+interval '1 day'),
 ('f7090000-0000-4000-8000-000000000002',s,body,t,m,
  'f70a0000-0000-4000-8000-000000000002',
  'sha256:v1:2222222222222222222222222222222222222222222222222222222222222222',
  instant-interval '1 minute',instant+interval '1 hour',
  instant-interval '10 seconds',instant+interval '1 day');
end
$s7$;
