-- Watchtower-Track: security
-- W42: DB-keyed HMAC for a *local public synthetic guard fixture* only.
-- An HMAC proves possession of this disposable DB's key, NOT real OpenAI
-- transport origin, a valid user reply, or G2 / HTTP disclosure permission.
\set ON_ERROR_STOP on
begin;
do $prerequisite$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer<150000
    or to_regclass('seyeon_positive_candidate.local_guard_fixture_lineage_r41') is null
    or to_regclass('seyeon_positive_candidate.local_guard_fixture_manifest_r41') is null
  then raise exception 'R42 only installs in the named isolated R41 database';
  end if;
end $prerequisite$;
create extension if not exists pgcrypto with schema public;
do $crypto$
begin
  if to_regprocedure('public.hmac(bytea,bytea,text)') is null then
    raise exception 'R42 requires pgcrypto HMAC in the isolated database';
  end if;
end $crypto$;

-- No API role, even via SET ROLE, may read the HMAC key or rewrite the seal.
create table seyeon_positive_candidate.local_guard_seal_key_r42(
  key_id text primary key
    check(key_id='local-public-synthetic-fixture-r42'),
  secret bytea not null check(octet_length(secret)=32),
  created_at timestamptz not null default clock_timestamp()
);
insert into seyeon_positive_candidate.local_guard_seal_key_r42(
  key_id,secret
) values ('local-public-synthetic-fixture-r42',gen_random_bytes(32));
create trigger immutable_local_guard_seal_key_r42
before update or delete on seyeon_positive_candidate.local_guard_seal_key_r42
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();

create table seyeon_positive_candidate.local_guard_seals_r42(
  attempt_id uuid primary key
    references seyeon_positive_candidate.local_guard_fixture_lineage_r41(attempt_id)
    on delete cascade,
  selected_sources_digest text not null
    check(selected_sources_digest ~ '^sha256:v1:[a-f0-9]{64}$'),
  interpretation_call_id uuid not null,
  renderer_call_id uuid not null,
  semantic_review_call_id uuid not null,
  guarded_envelope_digest text not null
    check(guarded_envelope_digest ~ '^sha256:v1:[a-f0-9]{64}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  nonce uuid not null unique,
  hmac_sha256 text not null
    check(hmac_sha256 ~ '^[a-f0-9]{64}$'),
  origin_kind text not null default 'db_sealed_local_fixture_no_provider'
    check(origin_kind='db_sealed_local_fixture_no_provider'),
  provider_output_verified boolean not null default false
    check(provider_output_verified=false),
  output_guard_verified boolean not null default false
    check(output_guard_verified=false),
  check(expires_at>issued_at and expires_at<=issued_at+interval '1 hour')
);
create trigger immutable_local_guard_seals_r42
before update on seyeon_positive_candidate.local_guard_seals_r42
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();

-- Canonical payload is constructed ONLY from server-owned DB values.
-- Stable field names and timestamptz epoch units prevent cast differences.
create function seyeon_positive_candidate.local_guard_seal_payload_r42(
  p_attempt uuid,p_source text,p_i uuid,p_r uuid,p_s uuid,
  p_envelope text,p_issued timestamptz,p_expires timestamptz,p_nonce uuid
) returns jsonb language sql immutable security invoker
set search_path=pg_catalog,public,seyeon_positive_candidate
as $payload$
  select jsonb_build_object(
    'schemaVersion','seyeon-db-keyed-local-fixture-seal-r42',
    'originKind','db_sealed_local_fixture_no_provider',
    'attemptId',p_attempt::text,'selectedSourcesDigest',p_source,
    'interpretationCallId',p_i::text,'rendererCallId',p_r::text,
    'semanticReviewCallId',p_s::text,
    'guardedEnvelopeDigest',p_envelope,
    'issuedAtEpochMicros',(extract(epoch from p_issued)*1000000)::bigint,
    'expiresAtEpochMicros',(extract(epoch from p_expires)*1000000)::bigint,
    'nonce',p_nonce::text,
    'providerOutputVerified',false,
    'outputGuardVerified',false,
    'permitsAtomicCommit',false,
    'permitsHttpReveal',false
  )
$payload$;

-- Both issuance and verification use one server-owned secret; the client
-- submits NO digest, validator bool, prompt, response text or identity key.
create function seyeon_positive_candidate.issue_local_guard_seal_r42(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $issue$
declare
  v_witness seyeon_positive_candidate.local_guard_fixture_lineage_r41%rowtype;
  v_manifest seyeon_positive_candidate.local_guard_fixture_manifest_r41%rowtype;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_current record;
  v_source_hash text;
  v_count integer:=0;
  v_key bytea;
  v_i smallint;
  v_stage seyeon_positive_candidate.native_stage_lineage_r30%rowtype;
  v_output seyeon_positive_candidate.unverified_transport_lineage_r40%rowtype;
  v_cost public.seyeon_ai_call_cost_events%rowtype;
  v_queue public.seyeon_ai_provider_receipt_queue_v1%rowtype;
  v_call uuid;
  v_expected_output text;
  v_nonce uuid:=gen_random_uuid();
  v_issued timestamptz:=clock_timestamp();
  v_expires timestamptz;
  v_mac text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
  then raise exception using errcode='23514',
    constraint='seyeon_r42_disposable_only'; end if;
  v_expires:=v_issued+interval '1 hour';
  perform 1 from public.subjects s where s.id=p_subject
    and s.status='active' and s.merged_into_subject_id is null for share;
  if not found then raise exception using errcode='23514',
    constraint='seyeon_r42_subject_inactive'; end if;
  perform 1 from public.conversation_threads t where t.id=p_thread
    and t.subject_id=p_subject and t.status='active' for share;
  if not found then raise exception using errcode='23514',
    constraint='seyeon_r42_thread_inactive'; end if;
  perform 1 from public.chat_turns t where t.id=p_turn
    and t.subject_id=p_subject and t.thread_id=p_thread
    and t.state='context_ready' for share;
  if not found then raise exception using errcode='23514',
    constraint='seyeon_r42_turn_not_context_ready'; end if;
  perform 1 from public.chat_turn_attempts a where a.id=p_attempt
    and a.subject_id=p_subject and a.turn_id=p_turn and a.state='running'
    for share;
  if not found then raise exception using errcode='23514',
    constraint='seyeon_r42_attempt_not_running'; end if;
  for v_edge in
    select * from seyeon_positive_candidate.source_edges_r1
    where attempt_id=p_attempt order by ordinal for share
  loop
    if v_count>=2 or v_edge.ordinal<>v_count
      or v_edge.record_kind<>'memory'
      or v_edge.record_type<>'shared_detail'
      or v_edge.schema_version<>'memory-v1' then
      raise exception using errcode='23514',
        constraint='seyeon_r42_original_source_invalid';
    end if;
    select g.granted_at,m.content_jsonb into v_current
    from public.record_access_grants g
    join public.memory_items m on m.id=g.memory_item_id
      and m.subject_id=g.subject_id
    where g.id=v_edge.original_grant_id and g.subject_id=p_subject
      and g.memory_item_id=v_edge.memory_id
      and g.grantee_character_id='seyeon'
      and g.revoked_at is null and m.revoked_at is null
      and m.source_kind='user_approved'
      and m.memory_type='shared_detail' and m.schema_version='memory-v1'
    for share of g,m;
    if not found then raise exception using errcode='23514',
      constraint='seyeon_r42_original_grant_revoked'; end if;
    v_source_hash:='sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_current.content_jsonb::text,'UTF8')),'hex');
    if v_current.granted_at is distinct from v_edge.original_granted_at
      or v_source_hash is distinct from v_edge.pg_payload_digest then
      raise exception using errcode='23514',
        constraint='seyeon_r42_original_payload_changed'; end if;
    v_count:=v_count+1;
  end loop;
  if v_count<>2 then raise exception using errcode='23514',
    constraint='seyeon_r42_original_count_invalid'; end if;
  select * into v_witness
  from seyeon_positive_candidate.local_guard_fixture_lineage_r41
  where attempt_id=p_attempt for share;
  select * into v_manifest
  from seyeon_positive_candidate.local_guard_fixture_manifest_r41
  where manifest_id='seyeon-r41-code-derived-public-guard-v1' for share;
  if v_witness.attempt_id is null or v_manifest.manifest_id is null
    or v_witness.guarded_envelope_digest is distinct from
      v_manifest.guarded_envelope_digest
    or v_witness.origin_kind is distinct from
      'code_authored_local_fixture_no_provider'
    or v_witness.provider_dispatched is distinct from false
    or v_witness.provider_output_verified is distinct from false
    or v_witness.output_guard_verified is distinct from false then
    raise exception using errcode='23514',
      constraint='seyeon_r42_untrusted_local_fixture';
  end if;
  for v_i in 2..4 loop
    v_call:=case v_i when 2 then v_witness.interpretation_call_id
      when 3 then v_witness.renderer_call_id
      else v_witness.semantic_review_call_id end;
    v_expected_output:=case v_i
      when 2 then v_manifest.interpretation_output_digest
      when 3 then v_manifest.renderer_output_digest
      else v_manifest.semantic_review_output_digest end;
    select * into v_stage
    from seyeon_positive_candidate.native_stage_lineage_r30
    where attempt_id=p_attempt and stage_index=v_i for share;
    select * into v_output
    from seyeon_positive_candidate.unverified_transport_lineage_r40
    where attempt_id=p_attempt and stage_index=v_i for share;
    if v_stage.call_id is distinct from v_call
      or v_stage.selected_sources_digest is distinct from
        v_witness.selected_sources_digest
      or v_output.call_id is distinct from v_call
      or v_output.native_wire_digest is distinct from v_stage.native_wire_digest
      or v_output.structured_output_digest is distinct from v_expected_output
      or v_output.origin_kind is distinct from 'local_stub_transport_unverified'
      or v_output.provider_output_verified is distinct from false
      or v_output.output_guard_verified is distinct from false then
      raise exception using errcode='23514',
        constraint='seyeon_r42_stage_output_unbound'; end if;
    select * into v_cost from public.seyeon_ai_call_cost_events
    where call_id=v_call and subject_id=p_subject and turn_id=p_turn
      and attempt_id=p_attempt and phase='chat'
      and purpose=v_stage.purpose for share;
    select * into v_queue from public.seyeon_ai_provider_receipt_queue_v1
    where call_id=v_call and subject_id=p_subject and turn_id=p_turn
      and attempt_id=p_attempt and phase='chat' for share;
    if v_cost.call_id is null or v_cost.lifecycle_state is distinct from 'settled'
      or v_cost.outcome is distinct from 'response_received'
      or v_cost.cost_status is distinct from 'estimated'
      or v_cost.governor_receipt_pinned_at is null
      or v_queue.call_id is null or v_queue.acked_at is null
      or v_queue.provider_event is distinct from v_cost.event_jsonb then
      raise exception using errcode='23514',
        constraint='seyeon_r42_cost_not_settled'; end if;
  end loop;
  select secret into strict v_key
  from seyeon_positive_candidate.local_guard_seal_key_r42
  where key_id='local-public-synthetic-fixture-r42' for share;
  v_mac:=encode(public.hmac(convert_to(
    seyeon_positive_candidate.local_guard_seal_payload_r42(
      p_attempt,v_witness.selected_sources_digest,
      v_witness.interpretation_call_id,v_witness.renderer_call_id,
      v_witness.semantic_review_call_id,v_witness.guarded_envelope_digest,
      v_issued,v_expires,v_nonce
    )::text,'UTF8'
  ),v_key,'sha256'),'hex');
  insert into seyeon_positive_candidate.local_guard_seals_r42(
    attempt_id,selected_sources_digest,interpretation_call_id,
    renderer_call_id,semantic_review_call_id,guarded_envelope_digest,
    issued_at,expires_at,nonce,hmac_sha256
  ) values(
    p_attempt,v_witness.selected_sources_digest,
    v_witness.interpretation_call_id,v_witness.renderer_call_id,
    v_witness.semantic_review_call_id,v_witness.guarded_envelope_digest,
    v_issued,v_expires,v_nonce,v_mac
  );
  return jsonb_build_object(
    'status','isolated_db_issued_local_fixture_seal_no_provider',
    'attemptId',p_attempt::text,
    'selectedSourcesDigest',v_witness.selected_sources_digest,
    'guardedEnvelopeDigest',v_witness.guarded_envelope_digest,
    'sealFingerprint','sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_mac,'UTF8')),'hex'),
    'providerOutputVerified',false,'outputGuardVerified',false,
    'permitsProvider',false,'permitsAtomicCommit',false,
    'permitsHttpReveal',false
  );
end $issue$;

-- Called ONLY after existing G2 independently checks all 5 stage/cost/Grant
-- chains. Never exposes the secret nor accepts a client-provided signature.
create function seyeon_positive_candidate.verify_local_guard_seal_r42(
  p_subject uuid,p_attempt uuid
) returns boolean language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $verify$
declare
  v_seal seyeon_positive_candidate.local_guard_seals_r42%rowtype;
  v_witness seyeon_positive_candidate.local_guard_fixture_lineage_r41%rowtype;
  v_key bytea;
  v_mac text;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_current record;
  v_original_digest text;
  v_count integer:=0;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or not exists (
      select 1 from public.chat_turn_attempts a
      where a.id=p_attempt and a.subject_id=p_subject
    )
  then return false; end if;
  select * into v_seal from
    seyeon_positive_candidate.local_guard_seals_r42
    where attempt_id=p_attempt;
  select * into v_witness from
    seyeon_positive_candidate.local_guard_fixture_lineage_r41
    where attempt_id=p_attempt;
  select secret into v_key from
    seyeon_positive_candidate.local_guard_seal_key_r42
    where key_id='local-public-synthetic-fixture-r42';
  if v_seal.attempt_id is null or v_witness.attempt_id is null
    or v_key is null or v_seal.expires_at<=clock_timestamp()
    or v_seal.issued_at>clock_timestamp()+interval '5 seconds'
    or v_seal.selected_sources_digest is distinct from
       v_witness.selected_sources_digest
    or v_seal.interpretation_call_id is distinct from
       v_witness.interpretation_call_id
    or v_seal.renderer_call_id is distinct from v_witness.renderer_call_id
    or v_seal.semantic_review_call_id is distinct from
       v_witness.semantic_review_call_id
    or v_seal.guarded_envelope_digest is distinct from
       v_witness.guarded_envelope_digest
    or v_seal.origin_kind is distinct from
       'db_sealed_local_fixture_no_provider'
    or v_seal.provider_output_verified is distinct from false
    or v_seal.output_guard_verified is distinct from false
  then return false; end if;
  -- The signature alone can outlive an Original Grant. Its only valid
  -- use is while BOTH exact originally pinned Memory/Grant pairs remain
  -- current. Re-grant with a new ID cannot resurrect the sealed fixture.
  for v_edge in
    select * from seyeon_positive_candidate.source_edges_r1
    where attempt_id=p_attempt order by ordinal for share
  loop
    if v_count>=2 or v_edge.ordinal<>v_count
      or v_edge.record_kind<>'memory'
      or v_edge.record_type<>'shared_detail'
      or v_edge.schema_version<>'memory-v1'
    then return false; end if;
    select g.granted_at,m.content_jsonb into v_current
    from public.record_access_grants g
    join public.memory_items m on m.id=g.memory_item_id
      and m.subject_id=g.subject_id
    where g.id=v_edge.original_grant_id and g.subject_id=p_subject
      and g.memory_item_id=v_edge.memory_id
      and g.grantee_character_id='seyeon'
      and g.revoked_at is null and m.revoked_at is null
      and m.source_kind='user_approved' and m.memory_type='shared_detail'
      and m.schema_version='memory-v1'
    for share of g,m;
    if not found then return false; end if;
    v_original_digest:='sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_current.content_jsonb::text,'UTF8')),'hex');
    if v_current.granted_at is distinct from v_edge.original_granted_at
      or v_original_digest is distinct from v_edge.pg_payload_digest
    then return false; end if;
    v_count:=v_count+1;
  end loop;
  if v_count<>2 then return false; end if;
  v_mac:=encode(public.hmac(convert_to(
    seyeon_positive_candidate.local_guard_seal_payload_r42(
      v_seal.attempt_id,v_seal.selected_sources_digest,
      v_seal.interpretation_call_id,v_seal.renderer_call_id,
      v_seal.semantic_review_call_id,v_seal.guarded_envelope_digest,
      v_seal.issued_at,v_seal.expires_at,v_seal.nonce
    )::text,'UTF8'),v_key,'sha256'),'hex');
  return v_mac=v_seal.hmac_sha256;
end $verify$;

revoke all on seyeon_positive_candidate.local_guard_seal_key_r42,
  seyeon_positive_candidate.local_guard_seals_r42
  from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function
  seyeon_positive_candidate.local_guard_seal_payload_r42(
    uuid,text,uuid,uuid,uuid,text,timestamptz,timestamptz,uuid
  ) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function
  seyeon_positive_candidate.issue_local_guard_seal_r42(
    uuid,uuid,uuid,uuid
  ) from public,anon,authenticated,service_role;
revoke all on function
  seyeon_positive_candidate.verify_local_guard_seal_r42(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function
  seyeon_positive_candidate.issue_local_guard_seal_r42(uuid,uuid,uuid,uuid)
  to myeongha_api_executor;
grant execute on function
  seyeon_positive_candidate.verify_local_guard_seal_r42(uuid,uuid)
  to myeongha_api_executor;
do $acl$
begin
  if has_table_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.local_guard_seal_key_r42','SELECT')
    or has_table_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.local_guard_seals_r42','INSERT')
    or has_table_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.local_guard_seals_r42','SELECT')
    or has_function_privilege('public',
       'seyeon_positive_candidate.issue_local_guard_seal_r42(uuid,uuid,uuid,uuid)','EXECUTE')
    or has_function_privilege('public',
       'seyeon_positive_candidate.verify_local_guard_seal_r42(uuid,uuid)','EXECUTE')
    or not has_function_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.issue_local_guard_seal_r42(uuid,uuid,uuid,uuid)','EXECUTE')
  then raise exception 'R42 untrusted secret or seal role exposure'; end if;
end $acl$;
commit;
\echo 'PASS R42 DB-owned keyed local synthetic proof, no real Provider and G2/Reveal HOLD'
