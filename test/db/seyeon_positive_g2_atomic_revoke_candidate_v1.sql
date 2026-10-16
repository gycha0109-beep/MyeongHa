-- Watchtower-Track: character-memory
-- G2 revocation/commit ordering: synthetic receipt ONLY, disposable DB.
-- NEVER a substitute for cmd_commit_seyeon_chat_turn_runtime_v2 or 1640.
\set ON_ERROR_STOP on
begin;

do $guard$
begin
  if current_database() <> 'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer < 150000 then
    raise exception 'refusing non-disposable G2 candidate database';
  end if;
end $guard$;

create function seyeon_positive_candidate.commit_original_grant_locked_r2(
  p_subject uuid,p_attempt uuid,p_text text
)
returns boolean language plpgsql security definer
set search_path = pg_catalog,public,seyeon_positive_candidate
as $commit$
declare
  v_pin seyeon_positive_candidate.attempt_source_pins%rowtype;
  v_set seyeon_positive_candidate.source_sets_r1%rowtype;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_record record;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if p_subject is null or p_attempt is null or p_text is null
    or char_length(p_text) not between 1 and 8000 then return false; end if;

  -- Production Memory revoke uses Subject FOR UPDATE first. Acquire the
  -- Subject SHARE lock FIRST; retain all locks through COMMIT, not just RPC.
  perform 1 from public.subjects s
  where s.id=p_subject and s.status='active'
    and s.merged_into_subject_id is null
  for share;
  if not found then return false; end if;

  -- Same original Attempt, no client-provided ancestry or replaceable Grant.
  perform 1 from public.chat_turn_attempts a
  where a.id=p_attempt and a.subject_id=p_subject and a.state='running'
  for update;
  if not found then return false; end if;

  select * into v_pin
  from seyeon_positive_candidate.attempt_source_pins p
  where p.attempt_id=p_attempt and p.subject_id=p_subject
    and p.state='pinned' and p.original_record_kind='memory'
  for update;
  if not found then return false; end if;

  select * into v_set
  from seyeon_positive_candidate.source_sets_r1 s
  where s.attempt_id=p_attempt and s.subject_id=p_subject
    and s.turn_id=v_pin.turn_id and s.thread_id=v_pin.thread_id
    and s.source_count=1
  for share;
  if not found then return false; end if;
  if (select count(*) from seyeon_positive_candidate.source_edges_r1
      where attempt_id=p_attempt) <> 1 then return false; end if;

  select * into v_edge
  from seyeon_positive_candidate.source_edges_r1 e
  where e.attempt_id=p_attempt and e.ordinal=0
    and e.record_kind='memory'
    and e.memory_id=v_pin.original_memory_id
    and e.original_grant_id=v_pin.original_grant_id
    and e.record_type=v_pin.original_record_type
    and e.schema_version=v_pin.original_schema_version
    and e.pg_payload_digest=v_pin.original_raw_digest
  for share;
  if not found then return false; end if;

  select m.memory_type,m.schema_version,m.content_jsonb,g.granted_at
  into v_record
  from public.record_access_grants g
  join public.memory_items m on m.id=g.memory_item_id
    and m.subject_id=g.subject_id
  where g.id=v_pin.original_grant_id
    and g.subject_id=p_subject and g.memory_item_id=v_pin.original_memory_id
    and g.grantee_character_id='seyeon'
    and g.revoked_at is null
    and m.revoked_at is null and m.source_kind='user_approved'
  for share of g,m;
  if not found or v_record.memory_type is distinct from v_edge.record_type
    or v_record.schema_version is distinct from v_edge.schema_version
    or v_record.granted_at is distinct from v_edge.original_granted_at
    or v_edge.pg_payload_digest is distinct from
      'sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_record.content_jsonb::text,'UTF8')),'hex')
  then return false; end if;

  -- The artificial output stays in disposable test sidecar only. These
  -- permissions must never be interpreted as production Chat Commit/Reveal.
  update seyeon_positive_candidate.attempt_source_pins
  set state='committed', synthetic_assistant_text=p_text
  where attempt_id=p_attempt and subject_id=p_subject and state='pinned';
  return found;
end $commit$;

revoke all on function seyeon_positive_candidate.commit_original_grant_locked_r2(
  uuid,uuid,text
) from public,anon,authenticated,service_role;
grant execute on function seyeon_positive_candidate.commit_original_grant_locked_r2(
  uuid,uuid,text
) to myeongha_api_executor;

do $acl$
begin
  if has_function_privilege('public',
    'seyeon_positive_candidate.commit_original_grant_locked_r2(uuid,uuid,text)',
    'EXECUTE')
  then raise exception 'test-only G2 candidate leaked public EXECUTE'; end if;
end $acl$;
commit;
\echo 'PASS: disposable G2 Subject-first same-transaction original Grant-lock synthetic Commit candidate installed'
