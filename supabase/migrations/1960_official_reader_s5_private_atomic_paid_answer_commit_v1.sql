-- S5 PRIVATE atomic protected paid-answer/Chat-marker commit implementation.
-- Owner source attestation, Privacy deletion/recovery acceptance and S5
-- release remain HOLD. This function is NOT executable by any application
-- role and MUST NOT be deployed to Production before migration recovery.
-- Reuses S1 lock-then-current-Grant gate from 1830; no paid prose enters Chat.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_commit_official_reader_paid_answer_v1(
  p_request jsonb,
  p_encryption_iv bytea,
  p_encryption_auth_tag bytea,
  p_encrypted_body bytea
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $official_paid_commit$
declare
  v_subject uuid;
  v_thread uuid;
  v_turn uuid;
  v_attempt uuid;
  v_body uuid;
  v_message uuid;
  v_reader text;
  v_reading uuid;
  v_bundle uuid;
  v_release uuid;
  v_content_revision bigint;
  v_grant uuid;
  v_product uuid;
  v_product_spec text;
  v_artifact_hash text;
  v_source_ref text;
  v_source_hash text;
  v_semantic_version text;
  v_output_version text;
  v_key_ref text;
  v_gate record;
  v_actual_artifact_hash text;
  v_current_bundle_count integer;
  v_current_grant_count integer;
  v_reader_participation uuid;
  v_thread_sequence bigint;
  v_turn_row public.chat_turns%rowtype;
  v_attempt_row public.chat_turn_attempts%rowtype;
  v_existing_body uuid;
  v_now timestamptz;
begin
  -- No access is granted to this private Writer while owner contracts are
  -- pending. Even the PostgreSQL owner cannot bypass the positive final S5
  -- gate without introducing a new, reviewed forward migration.
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='official_reader_s5_commit_read_committed_required',
      message='Official Reader protected commit requires READ COMMITTED';
  end if;

  if p_request is null or pg_catalog.jsonb_typeof(p_request)<>'object'
     or p_encryption_iv is null or pg_catalog.octet_length(p_encryption_iv)<>12
     or p_encryption_auth_tag is null
     or pg_catalog.octet_length(p_encryption_auth_tag)<>16
     or p_encrypted_body is null
     or pg_catalog.octet_length(p_encrypted_body) not between 1 and 262144
     or p_request->>'contractVersion' is distinct from
        'official-reader-s5-protected-answer-commit-v1'
     or exists(
       select 1 from pg_catalog.jsonb_object_keys(p_request) as supplied(k)
       where supplied.k <> all(array[
         'contractVersion','subjectId','threadId','turnId','attemptId',
         'bodyId','safeMessageId','officialReadingId','readerCharacterId',
         'readerContentBundleId','contentReleaseId','contentRevision',
         'originatingGrantId',
         'productId','productSpecVersion','officialArtifactResponseHash',
         'sourceAttestationRef','sourceResponseHash','semanticGuardVersion',
         'outputGuardVersion','encryptionKeyRef'
       ]::text[])
     ) then
    raise exception using errcode='23514',
      constraint='official_reader_s5_commit_contract_invalid',
      message='Official Reader protected commit request has invalid shape';
  end if;

  v_subject:=(p_request->>'subjectId')::uuid;
  v_thread:=(p_request->>'threadId')::uuid;
  v_turn:=(p_request->>'turnId')::uuid;
  v_attempt:=(p_request->>'attemptId')::uuid;
  v_body:=(p_request->>'bodyId')::uuid;
  v_message:=(p_request->>'safeMessageId')::uuid;
  v_reading:=(p_request->>'officialReadingId')::uuid;
  v_reader:=p_request->>'readerCharacterId';
  v_bundle:=(p_request->>'readerContentBundleId')::uuid;
  v_release:=(p_request->>'contentReleaseId')::uuid;
  v_content_revision:=(p_request->>'contentRevision')::bigint;
  v_grant:=(p_request->>'originatingGrantId')::uuid;
  v_product:=(p_request->>'productId')::uuid;
  v_product_spec:=p_request->>'productSpecVersion';
  v_artifact_hash:=p_request->>'officialArtifactResponseHash';
  v_source_ref:=p_request->>'sourceAttestationRef';
  v_source_hash:=p_request->>'sourceResponseHash';
  v_semantic_version:=p_request->>'semanticGuardVersion';
  v_output_version:=p_request->>'outputGuardVersion';
  v_key_ref:=p_request->>'encryptionKeyRef';

  if v_subject is null or v_thread is null or v_turn is null
     or v_attempt is null or v_body is null or v_message is null
     or v_reading is null or v_bundle is null or v_release is null
     or v_content_revision is null or v_content_revision<0
     or v_grant is null or v_product is null or v_reader is null
     or pg_catalog.btrim(v_reader)=''
     or v_product_spec is null or pg_catalog.btrim(v_product_spec)=''
     or v_artifact_hash is null or pg_catalog.btrim(v_artifact_hash)=''
     or v_source_ref is null or pg_catalog.btrim(v_source_ref)=''
     or v_source_hash is null or pg_catalog.btrim(v_source_hash)=''
     or v_semantic_version is null or pg_catalog.btrim(v_semantic_version)=''
     or v_output_version is null or pg_catalog.btrim(v_output_version)=''
     or v_key_ref is null or pg_catalog.btrim(v_key_ref)='' then
    raise exception using errcode='23514',
      constraint='official_reader_s5_commit_identity_missing',
      message='Official Reader protected commit requires complete source authority';
  end if;

  perform public.assert_myeongha_subject_context_v1(v_subject);

  -- FIRST: S1 advisory scope lock and current active Grant bundle.
  -- Never acquire Thread/Turn/Grant row locks before this shared scope.
  select gate_state,reason_code,can_persist,can_disclose
    into v_gate
  from public.internal_qry_official_reader_s5_precommit_held_scope_v1(
    v_subject,v_reading,v_reader,v_bundle
  );
  if not found or v_gate.gate_state is distinct from 'ready'
     or v_gate.can_persist is distinct from true then
    raise exception using errcode='P0001',
      constraint='official_reader_s5_commit_owner_gate_held',
      message='Official Reader paid answer persistence has not been authorized';
  end if;

  -- Saju Production attestation/semantic/output verification must be
  -- supplied by an Owner-issued, DB-recognized final gate. 1830 deliberately
  -- does NOT supply that positive result today. No client boolean is proof.
  -- When ownership is approved this branch can commit after the gate's
  -- independently versioned authority is installed.

  select rr.response_hash
    into v_actual_artifact_hash
  from public.standard_reading_official_bindings o
  join public.readings r
    on r.id=o.reading_id and r.subject_id=o.subject_id
   and r.reading_session_id=o.reading_session_id
   and r.execution_status='succeeded'
   and r.committed_execution_attempt_id is not null
  join public.reading_refs rr
    on rr.reading_id=r.id and rr.subject_id=r.subject_id
   and rr.execution_attempt_id=r.committed_execution_attempt_id
  join public.standard_reading_delivery_policies dp
    on dp.product_id=o.product_id and dp.retired_at is null
  where o.reading_id=v_reading and o.subject_id=v_subject
    and o.product_id=v_product
    and o.product_spec_version=v_product_spec;
  if not found or v_actual_artifact_hash is distinct from v_artifact_hash then
    raise exception using errcode='P0001',
      constraint='official_reader_s5_source_drift',
      message='Official Reader authoritative Saju reading changed';
  end if;

  -- Require the exact originating purchase-backed Grant, but do not treat
  -- it as the ONLY surviving right: the scope gate already resolved all
  -- independent current Grants and rejected conflicting bundles.
  select count(*)::integer into v_current_grant_count
  from public.standard_reading_reader_access_grants a
  join public.entitlement_grants g
    on g.id=a.entitlement_grant_id and g.subject_id=a.subject_id
  join public.commerce_receipts cr
    on cr.id=g.source_receipt_id and cr.subject_id=g.subject_id
  where a.entitlement_grant_id=v_grant
    and a.subject_id=v_subject
    and a.official_reading_id=v_reading
    and a.reader_character_id=v_reader
    and a.reader_content_bundle_id=v_bundle
    and g.grant_source_type='purchase'
    and g.status='active'
    and g.valid_from<=pg_catalog.clock_timestamp()
    and (g.valid_until is null or pg_catalog.clock_timestamp()<g.valid_until)
    and cr.verification_status='verified'
    and cr.environment='production';
  if v_current_grant_count<>1 then
    raise exception using errcode='P0001',
      constraint='official_reader_s5_origin_grant_not_current',
      message='Official Reader originating purchase Grant is unavailable';
  end if;

  -- Serialize the safe marker sequence against another Writer that takes
  -- this exact Thread row lock. The unique sequence constraint remains the
  -- ultimate conflict barrier: no partial payment content can commit.
  select ct.next_sequence_no into v_thread_sequence
  from public.conversation_threads ct
  where ct.id=v_thread and ct.subject_id=v_subject
    and ct.thread_type='single_character' and ct.status='active'
    and ct.active_content_release_id=v_release
    and ct.active_content_bundle_id=v_bundle
    and ct.content_revision=v_content_revision
  for update;
  if not found then
    raise exception using errcode='P0001',
      constraint='official_reader_s5_thread_unavailable',
      message='Official Reader general Chat Thread is unavailable';
  end if;

  select ctc.id into v_reader_participation
  from public.conversation_thread_characters ctc
  where ctc.thread_id=v_thread
    and ctc.character_id=v_reader
    and ctc.content_bundle_id=v_bundle
    and ctc.role='primary' and ctc.left_at is null;
  if not found then
    raise exception using errcode='P0001',
      constraint='official_reader_s5_reader_thread_mismatch',
      message='Official Reader has no active participation in this Chat Thread';
  end if;

  select t.* into v_turn_row
  from public.chat_turns t
  where t.id=v_turn and t.thread_id=v_thread and t.subject_id=v_subject
  for update;
  if not found
     or v_turn_row.state not in ('received','planned','context_ready')
     or v_turn_row.resolved_content_bundle_id is distinct from v_bundle
     or v_turn_row.resolved_content_release_id is distinct from v_release
     or v_turn_row.committed_attempt_id is not null then
    raise exception using errcode='P0001',
      constraint='official_reader_s5_turn_not_staged',
      message='Official Reader Chat Turn cannot be committed';
  end if;

  select a.* into v_attempt_row
  from public.chat_turn_attempts a
  where a.id=v_attempt and a.turn_id=v_turn and a.subject_id=v_subject
  for update;
  if not found or v_attempt_row.state<>'running' then
    raise exception using errcode='P0001',
      constraint='official_reader_s5_attempt_not_private',
      message='Official Reader private Attempt is not pending';
  end if;

  -- Private generation and semantic/output judgment happened OUTSIDE the
  -- DB. Only a staged Chat Turn and running Attempt may enter this T2;
  -- no generated/validated plaintext staging in ordinary Chat is accepted.
  -- One marker and one protected row commit in the SAME PostgreSQL
  -- transaction. No paid body or private hash enters Chat/Outbox/Memory.
  v_now:=pg_catalog.clock_timestamp();
  update public.conversation_threads ct
  set next_sequence_no=v_thread_sequence+1,updated_at=v_now
  where ct.id=v_thread and ct.subject_id=v_subject
    and ct.next_sequence_no=v_thread_sequence;
  if not found then
    raise exception using errcode='40001',
      constraint='official_reader_s5_thread_sequence_changed',
      message='Official Reader Chat Thread sequence moved during commit';
  end if;

  update public.chat_turn_attempts
  set state='committed',finished_at=coalesce(finished_at,v_now),
      output_guard_version=v_output_version
  where id=v_attempt and turn_id=v_turn and subject_id=v_subject
    and state='running';

  update public.chat_turns
  set state='committed',committed_attempt_id=v_attempt,
      committed_at=v_now,updated_at=v_now,revision=revision+1
  where id=v_turn and thread_id=v_thread and subject_id=v_subject
    and state in ('received','planned','context_ready');

  insert into public.conversation_messages(
    id,thread_id,subject_id,turn_id,sequence_no,sender_type,
    body_text,message_payload_jsonb,content_hash,created_at
  ) values (
    v_message,v_thread,v_subject,v_turn,v_thread_sequence,'system',
    '유료 해설 기록이 있습니다.',null,
    'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63',
    v_now
  );

  insert into public.official_reader_paid_answer_bodies(
    id,subject_id,thread_id,turn_id,attempt_id,safe_message_id,
    thread_character_id,official_reading_id,reader_character_id,
    reader_content_bundle_id,content_release_id,
    originating_entitlement_grant_id,product_id,product_spec_version,
    official_artifact_response_hash,source_attestation_ref,
    source_response_hash,semantic_guard_version,output_guard_version,
    encryption_scheme_version,encryption_key_ref,encryption_iv,
    encryption_auth_tag,encrypted_body,committed_at
  ) values (
    v_body,v_subject,v_thread,v_turn,v_attempt,v_message,
    v_reader_participation,v_reading,v_reader,v_bundle,v_release,
    v_grant,v_product,v_product_spec,v_artifact_hash,v_source_ref,
    v_source_hash,v_semantic_version,v_output_version,
    'aes-256-gcm-v1',v_key_ref,p_encryption_iv,p_encryption_auth_tag,
    p_encrypted_body,v_now
  );

  return pg_catalog.jsonb_build_object(
    'contractVersion','official-reader-s5-protected-answer-commit-v1',
    'bodyId',v_body::text,
    'safeMessageId',v_message::text,
    'turnId',v_turn::text,
    'attemptId',v_attempt::text,
    'committedAt',v_now::text,
    'replayed',false
  );
end
$official_paid_commit$;

revoke all on function public.internal_commit_official_reader_paid_answer_v1(
  jsonb,bytea,bytea,bytea
) from public;

do $official_paid_commit_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner','myeongha_system_executor'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_commit_official_reader_paid_answer_v1(jsonb,bytea,bytea,bytea) from %I',
      v_role
    );
  end loop;
end
$official_paid_commit_acl$;

comment on function public.internal_commit_official_reader_paid_answer_v1(
  jsonb,bytea,bytea,bytea
) is
'S5 private implementation of one-transaction Chat Turn/Attempt + safe system marker + encrypted paid body. Current S5 owner gate is HELD so no application or operator can persist production paid content. Pending Saju attestation, Privacy lifecycle and launch authorization.';
