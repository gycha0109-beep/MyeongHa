-- Watchtower-Track: character-memory
-- R1 test-only source-set parent/edge; no Production migration/DDL or AI.
-- Runs AFTER seyeon_positive_grant_attempt_bound_candidate_v1.sql, in the
-- same named disposable database. S0 schema and 1/N shape are synthetic only.
\set ON_ERROR_STOP on
begin;

do $guard$
begin
  if current_database() <> 'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer < 150000 then
    raise exception 'refusing non-disposable or unsupported R1 candidate database';
  end if;
end $guard$;

create table seyeon_positive_candidate.source_sets_r1 (
  attempt_id uuid primary key references public.chat_turn_attempts(id),
  subject_id uuid not null references public.subjects(id),
  thread_id uuid not null references public.conversation_threads(id),
  turn_id uuid not null references public.chat_turns(id),
  character_id text not null default 'seyeon' check (character_id = 'seyeon'),
  schema_version text not null
    check (schema_version = 'offline-source-set-parent-edge-v1'),
  source_count integer not null check (source_count between 1 and 2),
  selected_sources_digest text not null
    check (selected_sources_digest ~ '^sha256:v1:[a-f0-9]{64}$'),
  pinned_at timestamptz not null default clock_timestamp()
);

create table seyeon_positive_candidate.source_edges_r1 (
  attempt_id uuid not null references seyeon_positive_candidate.source_sets_r1(attempt_id),
  ordinal integer not null check (ordinal between 0 and 1),
  record_kind text not null check (record_kind = 'memory'),
  memory_id uuid not null references public.memory_items(id),
  original_grant_id uuid not null references public.record_access_grants(id),
  record_type text not null,
  schema_version text not null,
  original_granted_at timestamptz not null,
  pg_payload_digest text not null
    check (pg_payload_digest ~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'),
  primary key (attempt_id, ordinal),
  unique (attempt_id, memory_id),
  unique (attempt_id, original_grant_id)
);

-- Test Owner tables cannot silently alter source ancestry after Pin.
create function seyeon_positive_candidate.reject_r1_source_rewrite()
returns trigger language plpgsql
set search_path = pg_catalog,seyeon_positive_candidate
as $$
begin
  raise exception using errcode = '23514',
    constraint = 'offline_source_set_immutable',
    message = 'offline R1 source-set provenance is immutable';
end $$;

create trigger immutable_source_sets_r1
before update or delete on seyeon_positive_candidate.source_sets_r1
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();
create trigger immutable_source_edges_r1
before update or delete on seyeon_positive_candidate.source_edges_r1
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();

-- This *synthetic* executor-side Port accepts locator claims, never proof:
-- it always resolves exact active original Grants/Record rows in PostgreSQL.
-- A digest passed from Node is merely an untrusted grouping marker.
create function seyeon_positive_candidate.pin_source_set_r1(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,
  p_sources jsonb,p_selection_digest text
)
returns boolean language plpgsql security definer
set search_path = pg_catalog,public,seyeon_positive_candidate
as $pin$
declare
  v_count integer;
  v_attempt record;
  v_edge record;
  v_memory record;
  v_existing seyeon_positive_candidate.source_sets_r1%rowtype;
  v_prior seyeon_positive_candidate.source_edges_r1%rowtype;
  v_memory_id uuid;
  v_grant_id uuid;
  v_digest text;
  v_seen_memories uuid[] := '{}'::uuid[];
  v_seen_grants uuid[] := '{}'::uuid[];
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);

  -- This candidate is deliberately restricted to the existing synthetic
  -- fixture schema. It does NOT approve SRC-25 for real Personal Memories.
  if p_subject is null or p_thread is null or p_turn is null or p_attempt is null
    or jsonb_typeof(p_sources) is distinct from 'array'
    or p_selection_digest is null
    or p_selection_digest !~ '^sha256:v1:[a-f0-9]{64}$' then
    return false;
  end if;
  v_count := jsonb_array_length(p_sources);
  if v_count < 1 or v_count > 2 then return false; end if;

  perform 1
  from public.subjects s
  where s.id = p_subject and s.status = 'active'
    and s.merged_into_subject_id is null
  for share;
  if not found then return false; end if;

  select a.id,a.state as attempt_state,a.planner_version,
         a.seyeon_personal_source_pin_jsonb as existing_zero_pin,
         t.state as turn_state
    into v_attempt
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.turn_id = t.id and a.subject_id = t.subject_id
  join public.conversation_threads th
    on th.id = t.thread_id and th.subject_id = t.subject_id
  where a.id = p_attempt and t.id = p_turn
    and t.thread_id = p_thread and t.subject_id = p_subject
    and th.status = 'active'
  for share of t,a,th;
  if not found or v_attempt.attempt_state is distinct from 'running'
    or v_attempt.turn_state is distinct from 'planned'
    or v_attempt.planner_version is distinct from 'seyeon-production-chat-planner-v1'
    or v_attempt.existing_zero_pin is not null then
    return false;
  end if;

  select * into v_existing
  from seyeon_positive_candidate.source_sets_r1
  where attempt_id = p_attempt
  for share;
  if found and (
    v_existing.subject_id is distinct from p_subject
    or v_existing.thread_id is distinct from p_thread
    or v_existing.turn_id is distinct from p_turn
    or v_existing.source_count is distinct from v_count
    or v_existing.selected_sources_digest is distinct from p_selection_digest
  ) then
    return false;
  end if;

  -- Check EVERY source before any new Parent/Edge write. Rows remain
  -- FOR SHARE locked until the caller transaction commits.
  for v_edge in
    select value, (ordinality - 1)::int as position
    from jsonb_array_elements(p_sources) with ordinality as src(value,ordinality)
  loop
    if jsonb_typeof(v_edge.value) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(v_edge.value)) <> 2
      or nullif(v_edge.value ->> 'recordId','') is null
      or nullif(v_edge.value ->> 'grantId','') is null then
      return false;
    end if;

    -- Invalid UUID casts fail closed and roll back the single statement.
    v_memory_id := (v_edge.value ->> 'recordId')::uuid;
    v_grant_id := (v_edge.value ->> 'grantId')::uuid;
    if v_memory_id = any(v_seen_memories)
      or v_grant_id = any(v_seen_grants) then
      return false;
    end if;
    v_seen_memories := array_append(v_seen_memories,v_memory_id);
    v_seen_grants := array_append(v_seen_grants,v_grant_id);

    select m.memory_type,m.schema_version,m.content_jsonb,g.granted_at
      into v_memory
    from public.record_access_grants g
    join public.memory_items m
      on m.id = g.memory_item_id and m.subject_id = g.subject_id
    where g.id = v_grant_id and g.subject_id = p_subject
      and g.memory_item_id = v_memory_id
      and g.grantee_character_id = 'seyeon' and g.revoked_at is null
      and m.revoked_at is null and m.source_kind = 'user_approved'
      and m.memory_type = 'shared_detail' and m.schema_version = 'memory-v1'
    for share of g,m;
    if not found then return false; end if;

    v_digest := 'sha256:pg-jsonb:v1:'||
       encode(sha256(convert_to(v_memory.content_jsonb::text,'UTF8')),'hex');

    if v_existing.attempt_id is not null then
      select * into v_prior
      from seyeon_positive_candidate.source_edges_r1 e
      where e.attempt_id = p_attempt and e.ordinal = v_edge.position
      for share;
      if not found
        or v_prior.memory_id is distinct from v_memory_id
        or v_prior.original_grant_id is distinct from v_grant_id
        or v_prior.record_type is distinct from v_memory.memory_type
        or v_prior.schema_version is distinct from v_memory.schema_version
        or v_prior.original_granted_at is distinct from v_memory.granted_at
        or v_prior.pg_payload_digest is distinct from v_digest then
        return false;
      end if;
    end if;
  end loop;

  if v_existing.attempt_id is not null then
    if (select count(*) from seyeon_positive_candidate.source_edges_r1 e
        where e.attempt_id = p_attempt) <> v_count then
      return false;
    end if;
    return true; -- Retry does NOT authorize a new Provider/Reveal request.
  end if;

  insert into seyeon_positive_candidate.source_sets_r1(
    attempt_id,subject_id,thread_id,turn_id,character_id,
    schema_version,source_count,selected_sources_digest
  ) values (
    p_attempt,p_subject,p_thread,p_turn,'seyeon',
    'offline-source-set-parent-edge-v1',v_count,p_selection_digest
  );
  for v_edge in
    select value, (ordinality - 1)::int as position
    from jsonb_array_elements(p_sources) with ordinality as src(value,ordinality)
  loop
    v_memory_id := (v_edge.value ->> 'recordId')::uuid;
    v_grant_id := (v_edge.value ->> 'grantId')::uuid;
    select m.memory_type,m.schema_version,m.content_jsonb,g.granted_at
      into strict v_memory
    from public.record_access_grants g
    join public.memory_items m
      on m.id = g.memory_item_id and m.subject_id = g.subject_id
    where g.id = v_grant_id and g.subject_id = p_subject
      and g.memory_item_id = v_memory_id
    for share of g,m;
    insert into seyeon_positive_candidate.source_edges_r1(
      attempt_id,ordinal,record_kind,memory_id,original_grant_id,
      record_type,schema_version,original_granted_at,pg_payload_digest
    ) values (
      p_attempt,v_edge.position,'memory',v_memory_id,v_grant_id,
      v_memory.memory_type,v_memory.schema_version,v_memory.granted_at,
      'sha256:pg-jsonb:v1:'||
         encode(sha256(convert_to(v_memory.content_jsonb::text,'UTF8')),'hex')
    );
  end loop;
  if (select count(*) from seyeon_positive_candidate.source_edges_r1
      where attempt_id = p_attempt) <> v_count then
    raise exception 'offline source-set child cardinality mismatch';
  end if;
  return true;
end $pin$;

revoke all on seyeon_positive_candidate.source_sets_r1,
              seyeon_positive_candidate.source_edges_r1
  from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function seyeon_positive_candidate.pin_source_set_r1(
  uuid,uuid,uuid,uuid,jsonb,text
) from public,anon,authenticated,service_role;
grant execute on function seyeon_positive_candidate.pin_source_set_r1(
  uuid,uuid,uuid,uuid,jsonb,text
) to myeongha_api_executor;

do $acl$
begin
  if has_table_privilege('myeongha_api_executor',
        'seyeon_positive_candidate.source_sets_r1','INSERT')
    or has_table_privilege('myeongha_api_executor',
        'seyeon_positive_candidate.source_edges_r1','UPDATE')
    or has_function_privilege('public',
        'seyeon_positive_candidate.pin_source_set_r1(uuid,uuid,uuid,uuid,jsonb,text)',
        'EXECUTE') then
    raise exception 'R1 candidate accidentally grants direct/public access';
  end if;
end $acl$;

set local role myeongha_api_executor;
set local myeongha.subject_id = 'd2000000-0000-4000-8000-000000000001';
do $tests$
declare
  v_subject uuid := 'd2000000-0000-4000-8000-000000000001';
  v_thread uuid := 'd4000000-0000-4000-8000-000000000001';
  v_turn uuid := 'd7000000-0000-4000-8000-000000000001';
  v_attempt uuid := 'd7200000-0000-4000-8000-000000000001';
  v_m1 uuid := 'd5000000-0000-4000-8000-000000000001';
  v_g1 uuid := 'd6000000-0000-4000-8000-000000000001';
  v_m2 uuid := 'd5000000-0000-4000-8000-000000000002';
  v_g2 uuid := 'd6000000-0000-4000-8000-000000000002';
  v_one jsonb;
  v_two jsonb;
  v_marker text := 'sha256:v1:'||repeat('a',64);
  v_count integer;
begin
  v_one := jsonb_build_array(jsonb_build_object('recordId',v_m1,'grantId',v_g1));
  v_two := v_one || jsonb_build_array(
    jsonb_build_object('recordId',v_m2,'grantId',v_g2));

  if seyeon_positive_candidate.pin_source_set_r1(
      v_subject,v_thread,v_turn,v_attempt,'[]'::jsonb,v_marker) then
    raise exception 'R1 falsely accepted zero-size positive source set';
  end if;
  if seyeon_positive_candidate.pin_source_set_r1(
      v_subject,v_thread,v_turn,v_attempt,v_one||v_one,v_marker) then
    raise exception 'R1 admitted duplicate Record/Grant';
  end if;
  if seyeon_positive_candidate.pin_source_set_r1(
      v_subject,v_thread,v_turn,v_attempt,
      jsonb_build_array(jsonb_build_object('recordId',v_m1,'grantId',v_g2)),
      v_marker) then
    raise exception 'R1 admitted wrong exact Original Grant';
  end if;
  if seyeon_positive_candidate.pin_source_set_r1(
      v_subject,v_thread,v_turn,v_attempt,v_one,'bad-digest') then
    raise exception 'R1 accepted malformed selector digest';
  end if;
  if seyeon_positive_candidate.pin_source_set_r1(
      v_subject,v_thread,v_turn,'d7200000-0000-4000-8000-000000000099',
      v_one,v_marker) then
    raise exception 'R1 accepted absent Attempt';
  end if;
  if seyeon_positive_candidate.pin_source_set_r1(
      v_subject,v_thread,'d7000000-0000-4000-8000-000000000099',
      v_attempt,v_one,v_marker) then
    raise exception 'R1 admitted cross-Turn';
  end if;

  -- One-source positive is structurally valid. Roll back only the deliberate
  -- synthetic savepoint, then test N=2 with the SAME real running Attempt.
  begin
    if not seyeon_positive_candidate.pin_source_set_r1(
        v_subject,v_thread,v_turn,v_attempt,v_one,v_marker) then
      raise exception 'R1 valid single-Record source set was rejected';
    end if;
    raise exception using errcode='ZX101',message='rollback one-source R1 probe';
  exception when sqlstate 'ZX101' then null;
  end;

  if not seyeon_positive_candidate.pin_source_set_r1(
      v_subject,v_thread,v_turn,v_attempt,v_two,v_marker) then
    raise exception 'R1 valid two-source set refused';
  end if;
  if not seyeon_positive_candidate.pin_source_set_r1(
      v_subject,v_thread,v_turn,v_attempt,v_two,v_marker) then
    raise exception 'R1 same Original Grant set retry refused';
  end if;
  if seyeon_positive_candidate.pin_source_set_r1(
      v_subject,v_thread,v_turn,v_attempt,v_one,v_marker)
    or seyeon_positive_candidate.pin_source_set_r1(
      v_subject,v_thread,v_turn,v_attempt,v_two,
      'sha256:v1:'||repeat('b',64))
    or seyeon_positive_candidate.pin_source_set_r1(
      v_subject,v_thread,v_turn,v_attempt,
      jsonb_build_array(jsonb_build_object('recordId',v_m2,'grantId',v_g2))||
      jsonb_build_array(jsonb_build_object('recordId',v_m1,'grantId',v_g1)),
      v_marker) then
    raise exception 'R1 same Attempt accepted changed vector/order/digest';
  end if;

  begin
    update seyeon_positive_candidate.source_edges_r1
    set original_grant_id=v_g2
    where attempt_id=v_attempt and ordinal=0;
    raise exception 'API runtime overwrote source edge';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from seyeon_positive_candidate.source_sets_r1 where attempt_id=v_attempt;
    raise exception 'API runtime deleted source set';
  exception when insufficient_privilege then null;
  end;
end $tests$;
reset role;

-- Test-runner Owner can inspect fixture parent/children. The API executor
-- above deliberately cannot SELECT either source table (least privilege).
do $owner_verify$
begin
  if (select source_count
      from seyeon_positive_candidate.source_sets_r1
      where attempt_id='d7200000-0000-4000-8000-000000000001') <> 2
    or (select count(*)
        from seyeon_positive_candidate.source_edges_r1
        where attempt_id='d7200000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'R1 immutable SourceSet parent/edge cardinality mismatch';
  end if;
end $owner_verify$;

-- Single-disposable-transaction negative fixture: Owner revokes original
-- Grant, reissues a *different ID*, then rolls the experiment back.
do $revoke_tests$
declare
  v_subject uuid := 'd2000000-0000-4000-8000-000000000001';
  v_thread uuid := 'd4000000-0000-4000-8000-000000000001';
  v_turn uuid := 'd7000000-0000-4000-8000-000000000001';
  v_attempt uuid := 'd7200000-0000-4000-8000-000000000001';
  v_m1 uuid := 'd5000000-0000-4000-8000-000000000001';
  v_g1 uuid := 'd6000000-0000-4000-8000-000000000001';
  v_m2 uuid := 'd5000000-0000-4000-8000-000000000002';
  v_g2 uuid := 'd6000000-0000-4000-8000-000000000002';
  v_g3 uuid := 'd6000000-0000-4000-8000-000000000003';
  v_two jsonb;
  v_marker text := 'sha256:v1:'||repeat('a',64);
begin
  v_two := jsonb_build_array(
    jsonb_build_object('recordId',v_m1,'grantId',v_g1),
    jsonb_build_object('recordId',v_m2,'grantId',v_g2));
  begin
    update public.record_access_grants set revoked_at=clock_timestamp()
    where id=v_g1;
    -- Existing original candidate SQL tests use g3 before revoking it; this
    -- new R1 probe uses a fresh synthetic Grant ID instead.
    insert into public.record_access_grants(
      id,subject_id,life_fact_id,memory_item_id,grantee_character_id,
      grant_reason,granted_at,revoked_at
    ) values (
      'd6000000-0000-4000-8000-000000000004',
      v_subject,null,v_m1,'seyeon','user_choice',clock_timestamp(),null
    );
    perform set_config('role','myeongha_api_executor',true);
    perform set_config('myeongha.subject_id',v_subject::text,true);
    if seyeon_positive_candidate.pin_source_set_r1(
        v_subject,v_thread,v_turn,v_attempt,v_two,v_marker) then
      raise exception 'revoked Original Grant replayed through new Grant';
    end if;
    if seyeon_positive_candidate.pin_source_set_r1(
        v_subject,v_thread,v_turn,v_attempt,
        jsonb_build_array(
          jsonb_build_object('recordId',v_m1,
            'grantId','d6000000-0000-4000-8000-000000000004'))||
        jsonb_build_array(jsonb_build_object('recordId',v_m2,'grantId',v_g2)),
        v_marker) then
      raise exception 'replacement Grant revived old Attempt source set';
    end if;
    perform set_config('role','none',true);
    raise exception using errcode='ZX102',message='rollback revoked Grant probe';
  exception when sqlstate 'ZX102' then null;
  end;

  begin
    update public.memory_items
    set content_jsonb='{"tampered":true}'::jsonb
    where id=v_m1;
    perform set_config('role','myeongha_api_executor',true);
    perform set_config('myeongha.subject_id',v_subject::text,true);
    if seyeon_positive_candidate.pin_source_set_r1(
      v_subject,v_thread,v_turn,v_attempt,v_two,v_marker) then
      raise exception 'mutated Memory payload passed current hash recheck';
    end if;
    perform set_config('role','none',true);
    raise exception using errcode='ZX103',message='rollback payload tamper probe';
  exception when sqlstate 'ZX103' then null;
  end;
end $revoke_tests$;

-- A privileged test-only attempt update gives the original 1640 zero
-- sidecar a value; the RPC must reject simultaneous positive pin.
do $xor$
declare
  v_subject uuid := 'd2000000-0000-4000-8000-000000000001';
  v_thread uuid := 'd4000000-0000-4000-8000-000000000001';
  v_turn uuid := 'd7000000-0000-4000-8000-000000000001';
  v_attempt uuid := 'd7200000-0000-4000-8000-000000000001';
  v_two jsonb;
begin
  v_two := jsonb_build_array(
    jsonb_build_object('recordId','d5000000-0000-4000-8000-000000000001',
      'grantId','d6000000-0000-4000-8000-000000000001'),
    jsonb_build_object('recordId','d5000000-0000-4000-8000-000000000002',
      'grantId','d6000000-0000-4000-8000-000000000002'));
  begin
    update public.chat_turn_attempts
    set seyeon_personal_source_pin_jsonb='{"fixture":"zero-pin-XOR-probe"}'::jsonb,
        seyeon_personal_source_pinned_at=clock_timestamp()
    where id=v_attempt;
    perform set_config('role','myeongha_api_executor',true);
    perform set_config('myeongha.subject_id',v_subject::text,true);
    if seyeon_positive_candidate.pin_source_set_r1(
       v_subject,v_thread,v_turn,v_attempt,v_two,
       'sha256:v1:'||repeat('a',64)) then
      raise exception 'R1 accepted simultaneous zero and positive source pins';
    end if;
    perform set_config('role','none',true);
    raise exception using errcode='ZX104',message='rollback XOR probe';
  exception when sqlstate 'ZX104' then null;
  end;
end $xor$;

commit;
\echo 'PASS R1 isolated owner-candidate SourceSet/Edges 0/1/N, exact original Grants, immutable ACL, regrant/content tamper and 1640 zero XOR; no Production authorizations'
