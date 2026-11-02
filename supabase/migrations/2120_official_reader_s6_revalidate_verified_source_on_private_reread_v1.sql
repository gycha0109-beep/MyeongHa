-- S3/S6 PRIVATE source-authority-consistent Reader paid answer re-read.
-- Uses the unchanged S1 Grant scope lock and protected-column projection
-- from migration 1970; adds a separate verified Saju Production proof join.
-- Current Saju #2410 source issuer and S5 DB gate remain HOLD.
-- No public paid-read, table SELECT grant, or Production application.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_qry_official_reader_paid_answer_ciphertext_v1(
  p_subject_id uuid,
  p_body_id uuid
)
returns table (
  body_id uuid,
  thread_id uuid,
  turn_id uuid,
  attempt_id uuid,
  safe_message_id uuid,
  official_reading_id uuid,
  reader_character_id text,
  reader_content_bundle_id uuid,
  content_release_id uuid,
  originating_entitlement_grant_id uuid,
  product_id uuid,
  source_response_hash text,
  encryption_scheme_version text,
  encryption_key_ref text,
  encryption_iv bytea,
  encryption_auth_tag bytea,
  encrypted_body bytea,
  committed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $reader_paid_ciphertext$
declare
  v_reading uuid;
  v_reader text;
  v_bundle uuid;
  v_scope_state text;
  v_bundle_count bigint;
  v_current_bundle uuid;
begin
  if p_subject_id is null or p_body_id is null then
    raise exception using errcode='23514',
      constraint='official_reader_s6_current_read_ids_required',
      message='Protected Reader re-read requires exact owner and answer identity';
  end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='official_reader_s6_read_committed_required',
      message='Protected Reader re-read requires READ COMMITTED';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- Only locate the advisory-lock key BEFORE locking. This lookup is not
  -- authorization, and returned ciphertext is never loaded at this step.
  select b.official_reading_id,b.reader_character_id,b.reader_content_bundle_id
    into v_reading,v_reader,v_bundle
  from public.official_reader_paid_answer_bodies b
  where b.id=p_body_id and b.subject_id=p_subject_id;
  if not found then return; end if;

  -- Same scope lock/order used for Reader purchase issuance and revocation.
  -- Re-read entitlement AFTER acquiring the lock, not from a stale snapshot.
  select q.scope_state,q.active_bundle_count,q.current_bundle_id
    into v_scope_state,v_bundle_count,v_current_bundle
  from public.internal_qry_official_reader_locked_bundle_scope_v1(
    p_subject_id,v_reading,v_reader
  ) q;

  if v_scope_state is distinct from 'one_current_bundle'
     or v_bundle_count<>1
     or v_current_bundle is distinct from v_bundle then
    return;
  end if;

  -- Fresh current verified payment authority, not the historical Grant
  -- that originally generated the answer. A separate valid sibling Grant
  -- for the SAME Reader+Reading+Bundle may keep viewing available; any
  -- different active Bundle is rejected by the scope query above.
  if not exists (
    select 1
    from public.standard_reading_reader_access_grants a
    join public.entitlement_grants g
      on g.id=a.entitlement_grant_id and g.subject_id=a.subject_id
    join public.commerce_receipts cr
      on cr.id=g.source_receipt_id and cr.subject_id=g.subject_id
    where a.subject_id=p_subject_id
      and a.official_reading_id=v_reading
      and a.reader_character_id=v_reader
      and a.reader_content_bundle_id=v_bundle
      and g.grant_source_type='purchase'
      and g.status='active'
      and g.valid_from<=pg_catalog.clock_timestamp()
      and (g.valid_until is null or pg_catalog.clock_timestamp()<g.valid_until)
      and cr.verification_status='verified'
      and cr.environment='production'
  ) then
    return;
  end if;

  -- No plaintext is exposed by SQL. The private app later decrypts only
  -- with an approved key authority and fresh, separate reveal permission.
  return query
  select
    b.id,b.thread_id,b.turn_id,b.attempt_id,b.safe_message_id,
    b.official_reading_id,b.reader_character_id,
    b.reader_content_bundle_id,b.content_release_id,
    b.originating_entitlement_grant_id,b.product_id,
    b.source_response_hash,b.encryption_scheme_version,
    b.encryption_key_ref,b.encryption_iv,b.encryption_auth_tag,
    b.encrypted_body,b.committed_at
  from public.official_reader_paid_answer_bodies b
  -- Current source legitimacy is separate from historical Entitlement.
  -- Re-reading an already encrypted answer MUST fail on withdrawn Saju
  -- Production source proof, even when a sibling purchase remains active.
  join public.official_reader_s3_source_authority_receipts_v1 src
    on src.source_attestation_ref=b.source_attestation_ref
   and src.subject_id=b.subject_id
   and src.official_reading_id=b.official_reading_id
   and src.reader_character_id=b.reader_character_id
   and src.reader_content_bundle_id=b.reader_content_bundle_id
   and src.content_release_id=b.content_release_id
   and src.product_id=b.product_id
   and src.product_spec_version=b.product_spec_version
   and src.official_artifact_response_hash=b.official_artifact_response_hash
   and src.source_response_hash=b.source_response_hash
   and src.semantic_guard_version=b.semantic_guard_version
   and src.output_guard_version=b.output_guard_version
   and src.attestation_contract_version=
     'official-reader-saju-production-source-proof-v1'
   and src.production_interpretation_authority='verified'
   and src.source_coverage_authority='complete'
   and src.revoked_at is null
  -- A signed historical receipt by itself does not prove that the CURRENT
  -- Official Reading still points to the exact original committed Saju
  -- execution. Refuse re-read after artifact replacement or product drift.
  join public.standard_reading_official_bindings official
    on official.reading_id=b.official_reading_id
   and official.subject_id=b.subject_id
   and official.product_id=b.product_id
   and official.product_spec_version=b.product_spec_version
  join public.readings reading
    on reading.id=official.reading_id
   and reading.subject_id=official.subject_id
   and reading.reading_session_id=official.reading_session_id
   and reading.execution_status='succeeded'
   and reading.committed_execution_attempt_id is not null
  join public.reading_refs source
    on source.reading_id=reading.id
   and source.subject_id=reading.subject_id
   and source.execution_attempt_id=reading.committed_execution_attempt_id
   and source.response_hash=b.official_artifact_response_hash
  join public.subjects s
    on s.id=b.subject_id and s.status='active'
   and s.merged_into_subject_id is null
  join public.conversation_threads ct
    on ct.id=b.thread_id and ct.subject_id=b.subject_id
   and ct.status='active' and ct.thread_type='single_character'
   and ct.active_content_release_id=b.content_release_id
   and ct.active_content_bundle_id=b.reader_content_bundle_id
  join public.conversation_thread_characters c
    on c.id=b.thread_character_id and c.thread_id=b.thread_id
   and c.character_id=b.reader_character_id
   and c.content_bundle_id=b.reader_content_bundle_id
   and c.left_at is null
  join public.chat_turns t
    on t.id=b.turn_id and t.thread_id=b.thread_id
   and t.subject_id=b.subject_id and t.committed_attempt_id=b.attempt_id
   and t.state in ('committed','delivered')
  join public.chat_turn_attempts a
    on a.id=b.attempt_id and a.turn_id=b.turn_id
   and a.subject_id=b.subject_id and a.state='committed'
  join public.conversation_messages m
    on m.id=b.safe_message_id and m.thread_id=b.thread_id
   and m.subject_id=b.subject_id and m.turn_id=b.turn_id
   and m.sender_type='system'
   and m.body_text='유료 해설 기록이 있습니다.'
   and m.message_payload_jsonb is null and m.redacted_at is null
  where b.id=p_body_id and b.subject_id=p_subject_id
    and b.official_reading_id=v_reading
    and b.reader_character_id=v_reader
    and b.reader_content_bundle_id=v_bundle;
end
$reader_paid_ciphertext$;

revoke all on function public.internal_qry_official_reader_paid_answer_ciphertext_v1(
  uuid,uuid
) from public;

do $reader_paid_ciphertext_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner',
      'myeongha_system_executor'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_qry_official_reader_paid_answer_ciphertext_v1(uuid,uuid) from %I',
      v_role
    );
  end loop;
end
$reader_paid_ciphertext_acl$;

comment on function public.internal_qry_official_reader_paid_answer_ciphertext_v1(
  uuid,uuid
) is
'S6 private ciphertext retrieval under shared S1 current Grant scope; same-bundle sibling purchase rights allowed, revoked/ambiguous denied. No app EXECUTE, no backup-fence clearance, no public reveal before Saju/Privacy/DB owner approval.';
