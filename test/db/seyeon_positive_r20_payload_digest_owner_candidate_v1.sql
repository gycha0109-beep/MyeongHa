-- Watchtower-Track: security
-- R20 OWNER-CANDIDATE ONLY in a named, isolated disposable database.
-- This function returns only synthetic fixture payloads to an already
-- subject-bound restricted executor, within an existing pre-model TX.
-- Production type/Codec and positive Source authorities remain OFF.
\set ON_ERROR_STOP on
begin;
do $r20_guard$
begin
  if current_database() <> 'myeongha_seyeon_positive_pin_candidate_test'
     or current_setting('server_version_num')::int < 150000 then
    raise exception 'R20 refuses anything except named disposable PG';
  end if;
end $r20_guard$;

create function seyeon_positive_candidate.inspect_pinned_raw_source_r20(
  p_subject uuid, p_thread uuid, p_turn uuid, p_attempt uuid
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $r20$
declare
  v_set seyeon_positive_candidate.source_sets_r1%rowtype;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_record record;
  v_sources jsonb := '[]'::jsonb;
  v_pg_digest text;
begin
  if current_database() <> 'myeongha_seyeon_positive_pin_candidate_test'
     or p_subject is null or p_thread is null
     or p_turn is null or p_attempt is null then
    return null;
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject);
  -- Same order as R1 positive Pin/revocation: Subject -> Turn/Attempt
  -- -> original Grants/Records. R20 is invoked AFTER R1 in SAME TX.
  perform 1 from public.subjects s
  where s.id=p_subject and s.kind='member' and s.status='active'
    and s.merged_into_subject_id is null
  for share;
  if not found then return null; end if;
  -- Read-only original SourceSet inspection: R20 pre-model state or R23
  -- post-validation, pre-Commit state; neither allows a new Pin or Reveal.
  perform 1
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.turn_id=t.id and a.subject_id=t.subject_id
  join public.conversation_threads th
    on th.id=t.thread_id and th.subject_id=t.subject_id
  where t.id=p_turn and t.subject_id=p_subject and t.thread_id=p_thread
    and a.id=p_attempt
    and ((t.state='planned' and a.state='running')
      or (t.state='validated' and a.state='validated'))
    and a.planner_version='seyeon-production-chat-planner-v1'
    and a.seyeon_personal_source_pin_jsonb is null
    and th.status='active'
  for share of t,a,th;
  if not found then return null; end if;

  select * into v_set
  from seyeon_positive_candidate.source_sets_r1 s
  where s.attempt_id=p_attempt and s.subject_id=p_subject
    and s.thread_id=p_thread and s.turn_id=p_turn
    and s.character_id='seyeon'
    and s.schema_version='offline-source-set-parent-edge-v1'
    and s.source_count between 1 and 2
  for share;
  if not found then return null; end if;

  for v_edge in
    select * from seyeon_positive_candidate.source_edges_r1
    where attempt_id=p_attempt order by ordinal
  loop
    if v_edge.ordinal <> jsonb_array_length(v_sources)
      or v_edge.record_kind <> 'memory'
      or v_edge.record_type <> 'shared_detail'
      or v_edge.schema_version <> 'memory-v1' then
      return null;
    end if;
    select m.content_jsonb,m.memory_type,m.schema_version,g.granted_at
      into v_record
    from public.record_access_grants g
    join public.memory_items m
      on m.id=g.memory_item_id and m.subject_id=g.subject_id
    where g.id=v_edge.original_grant_id
      and g.subject_id=p_subject
      and g.memory_item_id=v_edge.memory_id
      and g.grantee_character_id='seyeon'
      and g.revoked_at is null
      and m.revoked_at is null
      and m.source_kind='user_approved'
    for share of g,m;
    if not found
      or v_record.memory_type is distinct from v_edge.record_type
      or v_record.schema_version is distinct from v_edge.schema_version
      or v_record.granted_at is distinct from v_edge.original_granted_at then
      return null;
    end if;
    v_pg_digest := 'sha256:pg-jsonb:v1:'||
       encode(sha256(convert_to(v_record.content_jsonb::text,'UTF8')),'hex');
    if v_pg_digest is distinct from v_edge.pg_payload_digest then
      return null;
    end if;
    v_sources := v_sources || jsonb_build_array(jsonb_build_object(
      'ordinal',v_edge.ordinal,
      'recordKind','memory',
      'recordId',v_edge.memory_id,
      'grantId',v_edge.original_grant_id,
      'recordType',v_edge.record_type,
      'schemaVersion',v_edge.schema_version,
      'payload',v_record.content_jsonb,
      'pgPayloadDigest',v_pg_digest
    ));
  end loop;
  if jsonb_array_length(v_sources) <> v_set.source_count then return null; end if;
  return jsonb_build_object(
    'selectedSourcesDigest',v_set.selected_sources_digest,
    'sourceCount',v_set.source_count,
    'sources',v_sources
  );
end $r20$;

revoke all on function seyeon_positive_candidate.inspect_pinned_raw_source_r20(
  uuid,uuid,uuid,uuid
) from public,anon,authenticated,service_role;
grant execute on function seyeon_positive_candidate.inspect_pinned_raw_source_r20(
  uuid,uuid,uuid,uuid
) to myeongha_api_executor;

do $r20_acl$
begin
 if has_function_privilege('public',
    'seyeon_positive_candidate.inspect_pinned_raw_source_r20(uuid,uuid,uuid,uuid)',
    'EXECUTE')
 or has_function_privilege('anon',
    'seyeon_positive_candidate.inspect_pinned_raw_source_r20(uuid,uuid,uuid,uuid)',
    'EXECUTE')
 or has_function_privilege('authenticated',
    'seyeon_positive_candidate.inspect_pinned_raw_source_r20(uuid,uuid,uuid,uuid)',
    'EXECUTE')
 or has_function_privilege('service_role',
    'seyeon_positive_candidate.inspect_pinned_raw_source_r20(uuid,uuid,uuid,uuid)',
    'EXECUTE')
 or not has_function_privilege('myeongha_api_executor',
    'seyeon_positive_candidate.inspect_pinned_raw_source_r20(uuid,uuid,uuid,uuid)',
    'EXECUTE')
 then raise exception 'R20 disposable function ACL unacceptable'; end if;
end $r20_acl$;
commit;
\echo 'PASS: R20 isolated original raw payload Owner inspect installed (Production G1 HOLD)'
