\set ON_ERROR_STOP on

-- RR-03 dormant provenance schema/security regression.
-- This test deliberately DOES NOT fabricate a committed Saju Assistant message.
-- A SQL shape, model-generated Unit ref, or existing AI grounding UUID must not
-- create a current DB-validated follow-up anchor.

do $verify$
declare
  v_table oid;
  v_rls record;
  v_role text;
begin
  v_table := pg_catalog.to_regclass(
    'public.official_reader_assistant_saju_provenance'
  );
  if v_table is null then
    raise exception 'Official Reader Assistant provenance sidecar is absent';
  end if;

  select c.relrowsecurity, c.relforcerowsecurity
  into strict v_rls
  from pg_catalog.pg_class c
  where c.oid = v_table;

  if not v_rls.relrowsecurity or not v_rls.relforcerowsecurity then
    raise exception 'Official Reader Assistant provenance sidecar must FORCE RLS';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename='official_reader_assistant_saju_provenance'
  ) then
    raise exception 'RR-03 dormant sidecar must not expose a runtime policy';
  end if;

  for v_role in
    select r.rolname from pg_catalog.pg_roles r
    where r.rolname in (
      'anon','authenticated','service_role','myeongha_api_executor'
    )
  loop
    if pg_catalog.has_table_privilege(
      v_role::name, v_table, 'SELECT'
    ) or pg_catalog.has_table_privilege(
      v_role::name, v_table, 'INSERT'
    ) or pg_catalog.has_table_privilege(
      v_role::name, v_table, 'UPDATE'
    ) or pg_catalog.has_table_privilege(
      v_role::name, v_table, 'DELETE'
    ) then
      raise exception 'Unauthorized role % has Reader provenance table access', v_role;
    end if;
  end loop;

  if (select count(*) from public.official_reader_assistant_saju_provenance)
      <> 0 then
    raise exception 'Dormant Reader provenance table must start with no rows';
  end if;

  if pg_catalog.to_regprocedure(
    'public.qry_official_reader_followup_anchor_runtime_v1(uuid,uuid,text,uuid)'
  ) is not null then
    raise exception 'An unreviewed Reader follow-up read function must not be exposed';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = v_table
      and t.tgname = 'tr_official_reader_provenance_immutable_v1'
      and not t.tgisinternal
  ) then
    raise exception 'Reader provenance mutation trigger missing';
  end if;

  raise notice 'PASS RR-03 dormant sidecar has FKs, forced RLS, no runtime ACL or writer/query';
end
$verify$;

do $verify_refs$
declare
  v_unit text := 'grounding_unit_0123456789abcdef01234567';
  v_other text := 'grounding_unit_abcdef0123456789abcdef01';
begin
  if not public.internal_official_reader_source_refs_valid_v1(
    array[v_unit, v_other], 'unit'
  ) then
    raise exception 'Valid source-bound Unit pair rejected';
  end if;

  if public.internal_official_reader_source_refs_valid_v1(
    array[v_unit, v_unit], 'unit'
  ) or public.internal_official_reader_source_refs_valid_v1(
    array['00000000-0000-0000-0000-000000000000'], 'unit'
  ) or public.internal_official_reader_source_refs_valid_v1(
    array['grounding_unit_NOT_TRUSTED'], 'unit'
  ) or public.internal_official_reader_source_refs_valid_v1(
    array[]::text[], 'unit'
  ) or public.internal_official_reader_source_refs_valid_v1(
    array[v_unit, null], 'unit'
  ) then
    raise exception 'Untrusted, empty, malformed or duplicate Unit refs admitted';
  end if;

  if not public.internal_official_reader_source_refs_valid_v1(
    array[]::text[], 'disclosure'
  ) or public.internal_official_reader_source_refs_valid_v1(
    array['explicit','explicit'], 'disclosure'
  ) then
    raise exception 'Disclosure refs empty-or-distinct contract broken';
  end if;

  raise notice 'PASS RR-03 source Unit syntax excludes legacy AI UUID and duplicates';
end
$verify_refs$;

-- P0-PR-01 delete finalizer removes Reader interpretations before Chat messages.
-- Every Subject-reachable Reader provenance FK must cascade, including the
-- interpretation FK, or an approved account deletion deadlocks/fails.
do $rr03_cascade_contract$
declare
  v_expected text[] := array[
    'official_reader_provenance_thread_subject_fk',
    'official_reader_provenance_attempt_turn_subject_fk',
    'official_reader_provenance_turn_thread_subject_fk',
    'official_reader_provenance_message_turn_subject_fk',
    'official_reader_provenance_reading_subject_fk',
    'official_reader_provenance_interpretation_fk'
  ];
  v_actual text[];
begin
  select array_agg(con.conname order by con.conname) into v_actual
  from pg_catalog.pg_constraint con
  where con.conrelid = 'public.official_reader_assistant_saju_provenance'::regclass
    and con.contype = 'f'
    and con.conname = any(v_expected)
    and con.confdeltype = 'c';
  if v_actual is distinct from (
    select array_agg(name order by name) from unnest(v_expected) as e(name)
  ) then
    raise exception 'RR-03 approved DELETE graph must have all six FK cascades; actual=%', v_actual;
  end if;
  raise notice 'PASS RR-03 six subject-reachable FKs cascade on account deletion';
end $rr03_cascade_contract$;


-- RR-04 private candidate must be present but inaccessible to every exposed
-- runtime role. It is NOT the eventual public qry_* contract.
do $rr04_private_catalog$
declare
  v_function oid := pg_catalog.to_regprocedure(
    'public.internal_qry_official_reader_followup_candidate_v1(uuid,uuid,text,uuid)'
  );
  v_role text;
begin
  if v_function is null then
    raise exception 'RR-04 private candidate function missing';
  end if;
  if exists (select 1 from pg_catalog.pg_proc where oid=v_function and prosecdef) then
    raise exception 'RR-04 candidate must not bypass RLS as SECURITY DEFINER';
  end if;
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
                      'myeongha_api_executor','myeongha_seyeon_chat_runtime_owner')
  loop
    if pg_catalog.has_function_privilege(
      v_role, v_function, 'EXECUTE'
    ) then
      raise exception 'RR-04 unapproved role % can execute private candidate', v_role;
    end if;
  end loop;
  if pg_catalog.has_function_privilege('public', v_function, 'EXECUTE') then
    raise exception 'RR-04 PRIVATE candidate inherited PUBLIC EXECUTE';
  end if;
  if pg_catalog.to_regprocedure(
    'public.qry_official_reader_followup_anchor_runtime_v1(uuid,uuid,text,uuid)'
  ) is not null then
    raise exception 'RR-04 public adapter function must remain absent';
  end if;
  raise notice 'PASS RR-04 PRIVATE candidate is invoker and ungranted';
end $rr04_private_catalog$;

-- Private synthetic row smoke (isolated PostgreSQL only; NOT an authorized
-- semantic proof/Writer). Exercises real parent-message FK cascade and guarded
-- immutable child deletion before any Production Reader Chat activation.
-- Fixture is already populated by official_standard_reading_reader_interpretation.sql.
do $rr03_populated_cleanup$
declare
  v_subject uuid := '11390000-0000-0000-0000-000000000001';
  v_reading uuid := '12103100-0000-0000-0000-000000000001';
  v_release uuid := 'fc000000-0000-0000-0000-000000000001';
  v_thread uuid := 'fc100000-0000-0000-0000-000000000001';
  v_participant uuid := 'fc110000-0000-0000-0000-000000000001';
  v_turn uuid := 'fc200000-0000-0000-0000-000000000001';
  v_attempt uuid := 'fc300000-0000-0000-0000-000000000001';
  v_assistant uuid := 'fc400000-0000-0000-0000-000000000001';
  v_bundle uuid := '11391000-0000-0000-0000-000000000001';
  v_error text;
  v_owner text;
begin
  if not exists (
    select 1 from public.standard_reading_reader_interpretations
    where official_reading_id = v_reading
      and reader_character_id = 'test-standard-reader'
  ) then
    raise exception 'RR-03 populated cascade missing official Reader interpretation fixture';
  end if;

  insert into public.content_releases(
    id,release_key,content_bundle_id,status,is_default,
    rollout_policy_version,rollout_seed,activated_at,created_at
  ) values (
    v_release,'rr03-private-cascade-test',v_bundle,'active',false,
    'rr03-test-v1','rr03-test',clock_timestamp(),clock_timestamp()
  );
  insert into public.conversation_threads(
    id,subject_id,thread_type,status,title,active_content_release_id,
    active_content_bundle_id,content_revision,next_sequence_no,created_at,updated_at
  ) values (
    v_thread,v_subject,'single_character','active','rr03-synthetic-not-public',
    v_release,v_bundle,0,3,clock_timestamp(),clock_timestamp()
  );
  insert into public.conversation_thread_characters(
    id,thread_id,character_id,content_bundle_id,role,joined_at
  ) values (
    v_participant,v_thread,'test-standard-reader',v_bundle,'primary',clock_timestamp()
  );
  insert into public.chat_turns(
    id,thread_id,subject_id,client_turn_id,request_hash,request_contract_version,
    request_snapshot_jsonb,resolved_content_release_id,resolved_content_bundle_id,
    state,revision,next_attempt_no,created_at,updated_at
  ) values (
    v_turn,v_thread,v_subject,'rr03-synthetic','sha256:v1:rr03-request',
    'rr03-test-v1','{}'::jsonb,v_release,v_bundle,'received',0,2,
    clock_timestamp(),clock_timestamp()
  );
  insert into public.chat_turn_attempts(
    id,turn_id,subject_id,attempt_no,state,started_at
  ) values (
    v_attempt,v_turn,v_subject,1,'running',clock_timestamp()
  );
  insert into public.conversation_messages(
    id,thread_id,subject_id,turn_id,sequence_no,sender_type,
    thread_character_id,character_content_bundle_id,
    body_text,content_hash,created_at
  ) values (
    v_assistant,v_thread,v_subject,v_turn,2,'character',
    v_participant,v_bundle,'synthetic-delete-test-only',
    'sha256:v1:rr03-synthetic-message',clock_timestamp()
  );
  insert into public.official_reader_assistant_saju_provenance(
    assistant_message_id,subject_id,thread_id,turn_id,attempt_id,
    reading_ref,reader_character_id,content_release_id,reader_content_bundle_id,
    content_revision,product_id,product_spec_version,product_rule_version,
    approved_policy_revision,official_artifact_response_hash,grounding_hash,
    scope_hash,selection_hash,source_identity_hash,utterance_hash,
    source_unit_refs,focused_unit_ref,required_disclosure_refs,
    required_ambiguity_refs,semantic_guard_version,output_guard_version,
    provenance_state
  ) values (
    v_assistant,v_subject,v_thread,v_turn,v_attempt,
    v_reading,'test-standard-reader',v_release,v_bundle,
    0,'11300000-0000-0000-0000-000000000001',
    'v1','test-v1','test-v1',
    'sha256:v1:' || repeat('a',64),repeat('b',64),
    'sha256:v1:' || repeat('c',64),
    'sha256:v1:' || repeat('d',64),
    'sha256:v1:' || repeat('e',64),
    'sha256:v1:' || repeat('f',64),
    array['grounding_unit_0123456789abcdef01234567'],
    'grounding_unit_0123456789abcdef01234567',
    array[]::text[],array[]::text[],
    'synthetic-semantic-v1','synthetic-output-v1',
    'semantic_and_output_guard_pass'
  );
  if (select count(*) from public.official_reader_assistant_saju_provenance
      where assistant_message_id = v_assistant) <> 1 then
    raise exception 'RR-03 synthetic proof row not persisted';
  end if;

  -- The candidate refuses a syntactically valid but UNCOMMITTED Assistant
  -- fixture: false positive must not become a Reader follow-up anchor.
  perform pg_catalog.set_config('myeongha.subject_id', v_subject::text, true);
  if exists (
    select 1
    from public.internal_qry_official_reader_followup_candidate_v1(
      v_subject,v_thread,'test-standard-reader',v_reading
    )
  ) then
    raise exception 'RR-04 promoted uncommitted synthetic provenance to an anchor';
  end if;
  -- Canonical execution Subject is required even for private/test invocations.
  begin
    perform 1 from public.internal_qry_official_reader_followup_candidate_v1(
      '11390000-0000-0000-0000-000000000099',v_thread,
      'test-standard-reader',v_reading
    );
    raise exception 'RR-04 accepted mismatched Subject context';
  exception when insufficient_privilege then
    null; -- expected SQLSTATE 42501 from assert_myeongha_subject_context_v1
  end;
  if exists (
    select 1 from public.internal_qry_official_reader_followup_candidate_v1(
      v_subject,v_thread,'wrong-reader',v_reading
    )
  ) then
    raise exception 'RR-04 accepted a wrong Reader candidate';
  end if;
  raise notice 'PASS RR-04 private candidate denies uncommitted and cross-Subject/Reader proofs';

  -- Ordinary update is never allowed, even for a session with direct table
  -- privileges. A rolled-back mutation must leave the proof intact.
  begin
    update public.official_reader_assistant_saju_provenance
    set grounding_hash = repeat('9',64)
    where assistant_message_id = v_assistant;
    raise exception 'RR-03 forbidden UPDATE succeeded';
  exception when check_violation then
    get stacked diagnostics v_error = constraint_name;
    if v_error <> 'tr_official_reader_provenance_immutable_v1' then
      raise exception 'RR-03 wrong immutable UPDATE error: %', v_error;
    end if;
  end;

  -- A custom deletion GUC is NOT itself authorization: an unrelated subject
  -- must not permit private provenance deletion.
  perform pg_catalog.set_config(
    'myeongha.account_deletion_finalizer_subject_id',
    '11390000-0000-0000-0000-000000000099',true
  );
  begin
    delete from public.conversation_messages where id = v_assistant;
    raise exception 'RR-03 wrong-subject GUC bypassed FK cascade delete';
  exception when check_violation then
    get stacked diagnostics v_error = constraint_name;
    if v_error <> 'tr_official_reader_provenance_immutable_v1' then
      raise exception 'RR-03 wrong denial for mismatched finalizer Subject: %', v_error;
    end if;
  end;
  if (select count(*) from public.official_reader_assistant_saju_provenance
      where assistant_message_id = v_assistant) <> 1 then
    raise exception 'RR-03 wrong-subject deletion removed private proof';
  end if;

  -- This local-only simulation verifies the exact Subject GUC and *actual*
  -- execution owner used by the production finalizer, not an API allowance.
  select pg_catalog.pg_get_userbyid(proowner) into v_owner
  from pg_catalog.pg_proc
  where oid=pg_catalog.to_regprocedure(
    'public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)'
  );
  if v_owner is distinct from current_user then
    raise exception 'RR-03 synthetic SQL fixture must run under finalizer owner';
  end if;
  perform pg_catalog.set_config(
    'myeongha.account_deletion_finalizer_subject_id', v_subject::text,true
  );
  delete from public.conversation_messages where id = v_assistant;
  if exists (
    select 1 from public.official_reader_assistant_saju_provenance
    where assistant_message_id = v_assistant
  ) then
    raise exception 'RR-03 populated provenance survived approved parent cascade';
  end if;
  raise notice 'PASS RR-03 populated synthetic proof: immutable guard + Subject-bound FK cascade';
end $rr03_populated_cleanup$;
