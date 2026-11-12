-- Isolated candidate. Install in one transaction after the approved paid
-- scope and existing Reader protection migrations. No login membership or
-- public route is installed by this candidate.
alter table commerce_saju_private.approved_component_reading_v1
  add constraint approved_component_paid_answer_identity_unique
  unique (purchase_intent_id,component,reading_id,subject_id,entitlement_grant_id),
  add constraint approved_component_paid_answer_reading_subject_unique unique (reading_id,subject_id);

-- Preserve the retained original Grant FK for both paths and the existing
-- Reading, interpretation and product FKs for legacy rows.
alter table public.official_reader_paid_answer_bodies
  add column approved_purchase_intent_id uuid,
  add column approved_component text,
  add column legacy_reading_id uuid generated always as
    (case when approved_purchase_intent_id is null then official_reading_id end) stored,
  add column legacy_product_id uuid generated always as
    (case when approved_purchase_intent_id is null then product_id end) stored,
  add constraint approved_saju_paid_answer_route_shape check (
    (approved_purchase_intent_id is null and approved_component is null
      and product_spec_version<>'approved-saju-2026-11-06')
    or (approved_purchase_intent_id is not null and approved_component is not null
      and product_spec_version='approved-saju-2026-11-06')
  ),
  drop constraint official_reader_paid_answer_official_fk,
  drop constraint official_reader_paid_answer_interpretation_fk,
  drop constraint official_reader_paid_answer_product_fk;

alter table public.official_reader_paid_answer_bodies
  add constraint official_reader_paid_answer_official_fk
    foreign key (legacy_reading_id,subject_id)
    references public.standard_reading_official_bindings(reading_id,subject_id),
  add constraint official_reader_paid_answer_interpretation_fk
    foreign key (legacy_reading_id,reader_character_id)
    references public.standard_reading_reader_interpretations(official_reading_id,reader_character_id),
  add constraint official_reader_paid_answer_product_fk
    foreign key (legacy_product_id) references public.standard_reading_product_specs(product_id),
  add constraint approved_saju_paid_answer_binding_fk
    foreign key (approved_purchase_intent_id,approved_component,official_reading_id,subject_id,originating_entitlement_grant_id)
    references commerce_saju_private.approved_component_reading_v1(
      purchase_intent_id,component,reading_id,subject_id,entitlement_grant_id
    ),
  add constraint approved_saju_paid_answer_product_fk
    foreign key (product_id) references public.products(id);

-- The retained-body refund trigger already enqueues the exact Reading and
-- Reader. Preserve legacy validation and attach approved jobs to their own
-- Reading binding. Existing workers stay fenced until approved cleanup is wired.
alter table public.official_reader_paid_answer_purge_jobs_v1
  add column approved_reading_id uuid,
  add column legacy_reading_id uuid generated always as
    (case when approved_reading_id is null then official_reading_id end) stored,
  add constraint approved_saju_purge_reading_identity check (
    approved_reading_id is null or approved_reading_id=official_reading_id
  ),
  drop constraint reader_paid_answer_purge_job_reading_fk;

alter table public.official_reader_paid_answer_purge_jobs_v1
  add constraint reader_paid_answer_purge_job_reading_fk
    foreign key (legacy_reading_id,subject_id)
    references public.standard_reading_official_bindings(reading_id,subject_id) on delete cascade,
  add constraint approved_saju_purge_job_reading_fk
    foreign key (approved_reading_id,subject_id)
    references commerce_saju_private.approved_component_reading_v1(reading_id,subject_id) on delete cascade;

create function commerce_saju_private.classify_approved_paid_answer_purge_v1()
returns trigger
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
begin
  new.approved_reading_id := null;
  if exists (
    select 1 from public.official_reader_paid_answer_bodies body
    where body.subject_id=new.subject_id and body.official_reading_id=new.official_reading_id
      and body.reader_character_id=new.reader_character_id and body.approved_purchase_intent_id is not null
  ) then
    new.approved_reading_id := new.official_reading_id;
  end if;
  return new;
end
$function$;
revoke all on function commerce_saju_private.classify_approved_paid_answer_purge_v1()
  from public,anon,authenticated,service_role,myeongha_api_executor,myeongha_commerce_internal_executor;
create trigger classify_approved_paid_answer_purge_v1
before insert on public.official_reader_paid_answer_purge_jobs_v1
for each row execute function commerce_saju_private.classify_approved_paid_answer_purge_v1();

create function commerce_saju_private.fence_approved_paid_answer_purge_v1()
returns trigger
language plpgsql volatile security invoker set search_path=pg_catalog
as $function$
begin
  if old.approved_reading_id is distinct from new.approved_reading_id
    or (old.approved_reading_id is not null and new.status<>'pending')
  then raise exception using errcode='23514',message='Approved Saju cleanup is not enabled'; end if;
  return new;
end
$function$;
revoke all on function commerce_saju_private.fence_approved_paid_answer_purge_v1()
  from public,anon,authenticated,service_role,myeongha_api_executor,myeongha_commerce_internal_executor;
create trigger fence_approved_paid_answer_purge_v1
before update on public.official_reader_paid_answer_purge_jobs_v1
for each row execute function commerce_saju_private.fence_approved_paid_answer_purge_v1();

create or replace function public.internal_list_official_reader_paid_answer_purge_jobs_v1(p_limit integer)
returns table(job_id uuid)
language plpgsql volatile security definer set search_path=pg_catalog,public
as $function$
begin
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception using errcode='23514',constraint='reader_paid_purge_batch_limit_invalid',
      message='Protected Reader cleanup batch limit is invalid';
  end if;
  return query select job.id
  from public.official_reader_paid_answer_purge_jobs_v1 job
  where job.approved_reading_id is null and job.status in ('pending','claimed','db_erased')
    and job.available_at<=clock_timestamp() and (job.lock_owner is null or job.lease_expires_at<clock_timestamp())
  order by job.available_at,job.id limit p_limit;
end
$function$;

-- The original grant/marker and source checks still run for all legacy rows.
drop trigger official_reader_paid_answer_origin_insert on public.official_reader_paid_answer_bodies;
create trigger official_reader_paid_answer_origin_insert
before insert or update on public.official_reader_paid_answer_bodies
for each row when (new.approved_purchase_intent_id is null)
execute function public.internal_assert_official_reader_paid_answer_origin_v1();

drop trigger official_reader_paid_answer_s3_source_proof_guard_v1 on public.official_reader_paid_answer_bodies;
create trigger official_reader_paid_answer_s3_source_proof_guard_v1
before insert or update of
  source_attestation_ref,source_response_hash,
  official_artifact_response_hash,official_reading_id,subject_id,
  reader_character_id,reader_content_bundle_id,content_release_id,
  product_id,product_spec_version,semantic_guard_version,output_guard_version
on public.official_reader_paid_answer_bodies
for each row when (new.approved_purchase_intent_id is null)
execute function public.internal_assert_official_reader_s3_source_receipt_v1();

create function commerce_saju_private.guard_approved_paid_answer_row_v1()
returns trigger
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
declare
  scope record;
begin
  if tg_op='UPDATE' then
    if new.approved_purchase_intent_id is distinct from old.approved_purchase_intent_id
      or new.approved_component is distinct from old.approved_component
      or (old.approved_purchase_intent_id is not null and new is distinct from old)
    then raise exception using errcode='23514',message='Protected answer purchase lineage is immutable'; end if;
    return new;
  end if;
  if new.approved_purchase_intent_id is null then return new; end if;

  select * into scope from commerce_saju_private.lock_approved_paid_answer_scope_v1(
    new.subject_id,new.official_reading_id,new.reader_character_id,new.reader_content_bundle_id
  );
  if not found
    or new.approved_purchase_intent_id is distinct from scope.purchase_intent_id
    or new.approved_component is distinct from scope.component
    or new.originating_entitlement_grant_id is distinct from scope.entitlement_grant_id
    or new.product_id is distinct from scope.product_id
    or new.official_artifact_response_hash is distinct from scope.stored_response_hash
    or new.source_response_hash is distinct from scope.native_source_response_hash
    or new.source_attestation_ref is distinct from ('approved-saju-issue:' || scope.source_attempt_id::text)
  then raise exception using errcode='23514',message='Approved Saju protected answer has no current exact source'; end if;
  return new;
end
$function$;

revoke all on function commerce_saju_private.guard_approved_paid_answer_row_v1()
  from public,anon,authenticated,service_role,myeongha_api_executor,myeongha_commerce_internal_executor;
create trigger approved_saju_paid_answer_scope_guard_v1
before insert or update on public.official_reader_paid_answer_bodies
for each row execute function commerce_saju_private.guard_approved_paid_answer_row_v1();

-- An ordinary committed attempt requires generated text/payload and AI logs.
-- A protected attempt leaves those fields empty and commits only its safe
-- marker. The trigger verifies the exact encrypted row before allowing it.
alter table public.chat_turn_attempts
  add column approved_reader_protected_commit boolean not null default false,
  drop constraint chat_turn_attempts_generated_shape_check,
  drop constraint chat_turn_attempts_validated_shape_check,
  add constraint chat_turn_attempts_generated_shape_check check (
    state not in ('generated','validated','committed') or approved_reader_protected_commit or (
      generation_ai_execution_log_id is not null and generated_thread_character_id is not null
      and generated_character_content_bundle_id is not null
      and (generated_body_text is not null or generated_message_payload_jsonb is not null)
      and generated_content_hash is not null and grounding_refs_jsonb is not null
      and jsonb_typeof(grounding_refs_jsonb)='array' and generated_at is not null
    )
  ),
  add constraint chat_turn_attempts_validated_shape_check check (
    state not in ('validated','committed') or approved_reader_protected_commit or (
      validation_ai_execution_log_id is not null and validation_result_jsonb is not null and validated_at is not null
    )
  ),
  add constraint approved_reader_protected_commit_shape check (
    not approved_reader_protected_commit or (
      state='committed' and finished_at is not null
      and generation_ai_execution_log_id is null and validation_ai_execution_log_id is null
      and generated_thread_character_id is null and generated_character_content_bundle_id is null
      and generated_body_text is null and generated_message_payload_jsonb is null
      and generated_message_schema_version is null and generated_content_hash is null
      and grounding_refs_jsonb is null and validation_result_jsonb is null
      and generated_at is null and validated_at is null
      and seyeon_personal_source_pin_jsonb is null and seyeon_personal_source_pinned_at is null
    )
  );

create function commerce_saju_private.guard_approved_reader_attempt_commit_v1()
returns trigger
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
declare
  mutable_fields constant text[] := array[
    'approved_reader_protected_commit','state','finished_at','output_guard_version','committed_message_id'
  ];
begin
  if tg_op='INSERT' then
    if not new.approved_reader_protected_commit then return new; end if;
  elsif not old.approved_reader_protected_commit and new.approved_reader_protected_commit
    and old.state='running' and old.finished_at is null and old.committed_message_id is null
    and (old.output_guard_version is null or old.output_guard_version=new.output_guard_version)
    and to_jsonb(new)-mutable_fields=to_jsonb(old)-mutable_fields
    and exists (
      select 1 from public.official_reader_paid_answer_bodies body
      where body.subject_id=new.subject_id and body.turn_id=new.turn_id and body.attempt_id=new.id
        and body.safe_message_id=new.committed_message_id and body.approved_purchase_intent_id is not null
        and body.output_guard_version=new.output_guard_version and body.committed_at=new.finished_at
    )
  then return new;
  elsif new.approved_reader_protected_commit=old.approved_reader_protected_commit then
    return new;
  end if;
  raise exception using errcode='23514',message='Protected Reader attempt has no matching encrypted commitment';
end
$function$;
revoke all on function commerce_saju_private.guard_approved_reader_attempt_commit_v1()
  from public,anon,authenticated,service_role,myeongha_api_executor,myeongha_commerce_internal_executor;
create trigger guard_approved_reader_attempt_commit_v1
before insert or update of approved_reader_protected_commit on public.chat_turn_attempts
for each row execute function commerce_saju_private.guard_approved_reader_attempt_commit_v1();

drop trigger tr_chat_turn_attempt_progression_guard on public.chat_turn_attempts;
create trigger tr_chat_turn_attempt_progression_guard before update on public.chat_turn_attempts
for each row when (old.approved_reader_protected_commit or not new.approved_reader_protected_commit)
execute function public.tr_chat_turn_attempt_progression_guard();

-- The ciphertext is inserted before the attempt transition. Recheck the
-- exact committed turn, protected attempt and marker before transaction end.
create function commerce_saju_private.assert_approved_paid_answer_chat_commit_v1()
returns trigger
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
begin
  if not exists (
    select 1 from public.chat_turns turn
    join public.chat_turn_attempts attempt on attempt.id=new.attempt_id
      and attempt.turn_id=turn.id and attempt.subject_id=turn.subject_id
      and attempt.state='committed' and attempt.approved_reader_protected_commit
      and attempt.committed_message_id=new.safe_message_id
    join public.conversation_messages marker on marker.id=new.safe_message_id
      and marker.turn_id=turn.id and marker.subject_id=turn.subject_id and marker.thread_id=turn.thread_id
      and marker.sender_type='system' and marker.body_text='유료 해설 기록이 있습니다.'
      and marker.message_payload_jsonb is null and marker.redacted_at is null
      and marker.content_hash='sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
    where turn.id=new.turn_id and turn.subject_id=new.subject_id and turn.thread_id=new.thread_id
      and turn.committed_attempt_id=new.attempt_id and turn.state in ('committed','delivered')
      and turn.resolved_content_release_id=new.content_release_id
      and turn.resolved_content_bundle_id=new.reader_content_bundle_id
  ) then raise exception using errcode='23514',message='Protected Reader answer requires an exact committed safe marker'; end if;
  return new;
end
$function$;
revoke all on function commerce_saju_private.assert_approved_paid_answer_chat_commit_v1()
  from public,anon,authenticated,service_role,myeongha_api_executor,myeongha_commerce_internal_executor;
create constraint trigger assert_approved_paid_answer_chat_commit_v1
after insert on public.official_reader_paid_answer_bodies
deferrable initially deferred
for each row when (new.approved_purchase_intent_id is not null)
execute function commerce_saju_private.assert_approved_paid_answer_chat_commit_v1();

-- Dedicated functions for the protected app runtime. The ordinary Chat/API
-- connection receives neither this execution role nor the ciphertext table.
create role myeongha_approved_saju_paid_answer_executor nologin noinherit
  nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

create function public.cmd_commit_approved_saju_paid_answer_v1(
  p_request jsonb,p_iv bytea,p_tag bytea,p_ciphertext bytea
)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
declare
  v_subject uuid := (p_request->>'subjectId')::uuid;
  v_reading uuid := (p_request->>'readingId')::uuid;
  v_reader text := p_request->>'readerCharacterId';
  v_bundle uuid := (p_request->>'readerContentBundleId')::uuid;
  v_release uuid := (p_request->>'contentReleaseId')::uuid;
  v_thread uuid := (p_request->>'threadId')::uuid;
  v_turn uuid := (p_request->>'turnId')::uuid;
  v_attempt uuid := (p_request->>'attemptId')::uuid;
  v_body uuid := (p_request->>'bodyId')::uuid;
  v_message uuid := (p_request->>'safeMessageId')::uuid;
  v_sequence bigint;
  v_participant uuid;
  v_now timestamptz;
  scope record;
  existing public.official_reader_paid_answer_bodies%rowtype;
begin
  if jsonb_typeof(p_request) is distinct from 'object'
    or p_request-array['subjectId','readingId','readerCharacterId','readerContentBundleId','contentReleaseId',
      'contentRevision','threadId','turnId','clientTurnId','requestHash','attemptId','bodyId','safeMessageId','originatingGrantId','productId',
      'archiveResponseHash','nativeSourceResponseHash','sourceAttemptId','semanticGuardVersion','outputGuardVersion',
      'encryptionKeyRef']<>'{}'::jsonb
    or v_body is null or v_message is null
    or coalesce(length(btrim(p_request->>'clientTurnId')),0) not between 1 and 256
    or not coalesce(p_request->>'requestHash' ~ '^sha256:v1:[a-f0-9]{64}$',false)
    or octet_length(p_iv) is distinct from 12 or octet_length(p_tag) is distinct from 16
    or coalesce(octet_length(p_ciphertext),0) not between 1 and 262144
    or coalesce(length(btrim(p_request->>'encryptionKeyRef')),0) not between 1 and 256
    or coalesce(length(btrim(p_request->>'semanticGuardVersion')),0) not between 1 and 256
    or p_request->>'outputGuardVersion' is distinct from 'myeongha-character-output-guard-v1'
  then raise exception using errcode='23514',message='Invalid approved Saju protected answer'; end if;

  select * into scope from commerce_saju_private.lock_approved_paid_answer_scope_v1(v_subject,v_reading,v_reader,v_bundle);
  if not found or scope.stored_response_hash is distinct from p_request->>'archiveResponseHash'
    or scope.native_source_response_hash is distinct from p_request->>'nativeSourceResponseHash'
    or scope.source_attempt_id::text is distinct from p_request->>'sourceAttemptId'
    or scope.entitlement_grant_id::text is distinct from p_request->>'originatingGrantId'
    or scope.product_id::text is distinct from p_request->>'productId'
  then raise exception using errcode='P0001',message='Approved Saju paid answer scope is unavailable'; end if;

  select thread.next_sequence_no into v_sequence from public.conversation_threads thread
  where thread.id=v_thread and thread.subject_id=v_subject
    and thread.status='active' and thread.thread_type='single_character'
    and thread.active_content_release_id=v_release and thread.active_content_bundle_id=v_bundle
    and thread.content_revision=(p_request->>'contentRevision')::bigint
  for update;
  if not found then raise exception using errcode='P0001',message='Approved Saju Reader thread is unavailable'; end if;
  select participant.id into v_participant from public.conversation_thread_characters participant
  where participant.thread_id=v_thread and participant.character_id=v_reader
    and participant.content_bundle_id=v_bundle and participant.role='primary' and participant.left_at is null;
  if not found then raise exception using errcode='P0001',message='Approved Saju Reader is unavailable'; end if;

  select body.* into existing from public.official_reader_paid_answer_bodies body
  where body.subject_id=v_subject and body.turn_id=v_turn and body.attempt_id=v_attempt;
  if found then
    if existing.id is distinct from v_body or existing.safe_message_id is distinct from v_message
      or existing.thread_id is distinct from v_thread or existing.official_reading_id is distinct from v_reading
      or existing.reader_character_id is distinct from v_reader or existing.reader_content_bundle_id is distinct from v_bundle
      or existing.content_release_id is distinct from v_release
      or existing.originating_entitlement_grant_id is distinct from scope.entitlement_grant_id
      or existing.approved_purchase_intent_id is distinct from scope.purchase_intent_id
      or existing.approved_component is distinct from scope.component
      or existing.product_id is distinct from scope.product_id
      or existing.official_artifact_response_hash is distinct from scope.stored_response_hash
      or existing.source_attestation_ref is distinct from ('approved-saju-issue:' || scope.source_attempt_id::text)
      or existing.source_response_hash is distinct from scope.native_source_response_hash
      or existing.semantic_guard_version is distinct from p_request->>'semanticGuardVersion'
      or existing.output_guard_version is distinct from p_request->>'outputGuardVersion'
      or existing.encryption_key_ref is distinct from p_request->>'encryptionKeyRef'
      or not exists (
        select 1 from public.chat_turns turn
        where turn.id=v_turn and turn.thread_id=v_thread and turn.subject_id=v_subject
          and turn.client_turn_id=p_request->>'clientTurnId' and turn.request_hash=p_request->>'requestHash'
      )
      or not exists (
        select 1 from public.qry_approved_saju_paid_answer_ciphertext_v1(v_subject,v_thread,v_message) body
        where body.body_id=existing.id
      )
    then raise exception using errcode='23505',message='Approved Saju protected answer replay has a different scope'; end if;
    return jsonb_build_object('bodyId',v_body,'safeMessageId',v_message,'committedAt',existing.committed_at,'replayed',true);
  end if;

  perform 1 from public.chat_turns turn
  where turn.id=v_turn and turn.thread_id=v_thread and turn.subject_id=v_subject
    and turn.client_turn_id=p_request->>'clientTurnId' and turn.request_hash=p_request->>'requestHash'
    and turn.state in ('received','planned','context_ready') and turn.committed_attempt_id is null
    and turn.resolved_content_release_id=v_release and turn.resolved_content_bundle_id=v_bundle
  for update;
  if not found then raise exception using errcode='P0001',message='Approved Saju Reader turn is unavailable'; end if;
  perform 1 from public.chat_turn_attempts attempt
  where attempt.id=v_attempt and attempt.turn_id=v_turn and attempt.subject_id=v_subject and attempt.state='running'
  for update;
  if not found then raise exception using errcode='P0001',message='Approved Saju Reader attempt is unavailable'; end if;
  v_now := clock_timestamp();
  insert into public.conversation_messages(
    id,thread_id,subject_id,turn_id,sequence_no,sender_type,body_text,message_payload_jsonb,content_hash,created_at
  ) values(v_message,v_thread,v_subject,v_turn,v_sequence,'system','유료 해설 기록이 있습니다.',null,
    'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63',v_now);
  insert into public.official_reader_paid_answer_bodies(
    id,subject_id,thread_id,turn_id,attempt_id,safe_message_id,thread_character_id,
    official_reading_id,reader_character_id,reader_content_bundle_id,content_release_id,
    originating_entitlement_grant_id,product_id,product_spec_version,approved_purchase_intent_id,approved_component,
    official_artifact_response_hash,source_attestation_ref,source_response_hash,semantic_guard_version,output_guard_version,
    encryption_scheme_version,encryption_key_ref,encryption_iv,encryption_auth_tag,encrypted_body,committed_at
  ) values(v_body,v_subject,v_thread,v_turn,v_attempt,v_message,v_participant,
    v_reading,v_reader,v_bundle,v_release,scope.entitlement_grant_id,scope.product_id,'approved-saju-2026-11-06',
    scope.purchase_intent_id,scope.component,scope.stored_response_hash,'approved-saju-issue:' || scope.source_attempt_id::text,
    scope.native_source_response_hash,p_request->>'semanticGuardVersion',p_request->>'outputGuardVersion',
    'aes-256-gcm-v1',p_request->>'encryptionKeyRef',p_iv,p_tag,p_ciphertext,v_now);
  update public.chat_turn_attempts
  set state='committed',finished_at=v_now,output_guard_version=p_request->>'outputGuardVersion',
    committed_message_id=v_message,approved_reader_protected_commit=true
  where id=v_attempt and turn_id=v_turn and subject_id=v_subject and state='running';
  if not found then raise exception using errcode='40001',message='Approved Saju Reader attempt changed'; end if;
  update public.conversation_threads set next_sequence_no=v_sequence+1,updated_at=v_now
    where id=v_thread and subject_id=v_subject and next_sequence_no=v_sequence;
  if not found then raise exception using errcode='40001',message='Approved Saju Reader sequence changed'; end if;
  update public.chat_turns set state='committed',committed_attempt_id=v_attempt,
    committed_at=v_now,updated_at=v_now,revision=revision+1
    where id=v_turn and subject_id=v_subject and thread_id=v_thread;
  return jsonb_build_object('bodyId',v_body,'safeMessageId',v_message,'committedAt',v_now,'replayed',false);
end
$function$;

revoke all on function public.cmd_commit_approved_saju_paid_answer_v1(jsonb,bytea,bytea,bytea)
  from public,anon,authenticated,service_role,myeongha_api_executor,myeongha_commerce_internal_executor,
    myeongha_approved_saju_issuer_executor;
grant execute on function public.begin_member_subject_context_v1(uuid),public.current_myeongha_subject_id(),
  public.assert_myeongha_subject_context_v1(uuid),
  public.cmd_commit_approved_saju_paid_answer_v1(jsonb,bytea,bytea,bytea)
  to myeongha_approved_saju_paid_answer_executor;

create function public.qry_approved_saju_paid_answer_ciphertext_v1(p_subject uuid,p_thread uuid,p_message uuid)
returns table(
  body_id uuid,thread_id uuid,turn_id uuid,attempt_id uuid,safe_message_id uuid,
  official_reading_id uuid,reader_character_id text,reader_content_bundle_id uuid,content_release_id uuid,
  originating_entitlement_grant_id uuid,product_id uuid,source_response_hash text,
  encryption_scheme_version text,encryption_key_ref text,encryption_iv bytea,encryption_auth_tag bytea,
  encrypted_body bytea,committed_at timestamptz
)
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
declare
  locator record;
  scope record;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  select body.id,body.official_reading_id,body.reader_character_id,body.reader_content_bundle_id into locator
  from public.official_reader_paid_answer_bodies body
  where body.subject_id=p_subject and body.thread_id=p_thread and body.safe_message_id=p_message
    and body.approved_purchase_intent_id is not null;
  if not found then return; end if;
  select * into scope from commerce_saju_private.lock_approved_paid_answer_scope_v1(
    p_subject,locator.official_reading_id,locator.reader_character_id,locator.reader_content_bundle_id
  );
  if not found then return; end if;

  return query select body.id,body.thread_id,body.turn_id,body.attempt_id,body.safe_message_id,
    body.official_reading_id,body.reader_character_id,body.reader_content_bundle_id,body.content_release_id,
    body.originating_entitlement_grant_id,body.product_id,body.source_response_hash,
    body.encryption_scheme_version,body.encryption_key_ref,body.encryption_iv,body.encryption_auth_tag,
    body.encrypted_body,body.committed_at
  from public.official_reader_paid_answer_bodies body
  join public.conversation_threads thread on thread.id=body.thread_id and thread.subject_id=body.subject_id
    and thread.status='active' and thread.thread_type='single_character'
    and thread.active_content_release_id=body.content_release_id and thread.active_content_bundle_id=body.reader_content_bundle_id
  join public.conversation_thread_characters participant on participant.id=body.thread_character_id
    and participant.thread_id=body.thread_id and participant.character_id=body.reader_character_id
    and participant.content_bundle_id=body.reader_content_bundle_id and participant.role='primary' and participant.left_at is null
  join public.chat_turns turn on turn.id=body.turn_id and turn.thread_id=body.thread_id and turn.subject_id=body.subject_id
    and turn.state in ('committed','delivered') and turn.committed_attempt_id=body.attempt_id
  join public.chat_turn_attempts attempt on attempt.id=body.attempt_id and attempt.turn_id=body.turn_id
    and attempt.subject_id=body.subject_id and attempt.state='committed' and attempt.approved_reader_protected_commit
    and attempt.committed_message_id=body.safe_message_id
  join public.conversation_messages marker on marker.id=body.safe_message_id and marker.thread_id=body.thread_id
    and marker.turn_id=body.turn_id and marker.subject_id=body.subject_id and marker.sender_type='system'
    and marker.body_text='유료 해설 기록이 있습니다.' and marker.message_payload_jsonb is null and marker.redacted_at is null
  where body.id=locator.id and body.subject_id=p_subject and body.thread_id=p_thread and body.safe_message_id=p_message
    and body.approved_purchase_intent_id=scope.purchase_intent_id and body.approved_component=scope.component
    and body.originating_entitlement_grant_id=scope.entitlement_grant_id and body.product_id=scope.product_id
    and body.official_artifact_response_hash=scope.stored_response_hash
    and body.source_response_hash=scope.native_source_response_hash
    and body.source_attestation_ref='approved-saju-issue:' || scope.source_attempt_id::text;
end
$function$;

revoke all on function public.qry_approved_saju_paid_answer_ciphertext_v1(uuid,uuid,uuid)
  from public,anon,authenticated,service_role,myeongha_api_executor,myeongha_commerce_internal_executor,
    myeongha_approved_saju_issuer_executor;
grant execute on function public.qry_approved_saju_paid_answer_ciphertext_v1(uuid,uuid,uuid)
  to myeongha_approved_saju_paid_answer_executor;
