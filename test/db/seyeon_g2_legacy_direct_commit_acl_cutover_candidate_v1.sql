-- Watchtower-Track: character-memory
-- G2 experimental minimum-permission cutover: DISPOSABLE DB ONLY.
-- Owner approval / Production migration / public route remain HOLD.
-- Runs AFTER the read-only catalog baseline, never alters 1490/1500/1640.
\set ON_ERROR_STOP on
begin;

do $guard$
declare
  v_direct regprocedure := to_regprocedure(
    'public.cmd_commit_seyeon_chat_turn_runtime_v1(uuid,uuid,uuid,uuid,uuid,uuid)');
  v_v2 regprocedure := to_regprocedure(
    'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)');
  v_core regprocedure := to_regprocedure(
    'public.cmd_commit_chat_turn_v1(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb)');
  v_legacy regprocedure := to_regprocedure(
    'public.cmd_commit_chat_turn_legacy_v1(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb)');
  v_direct_owner oid;
  v_v2_owner oid;
begin
  if current_database() <> 'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer < 150000 then
    raise exception 'refusing direct-v1 cutover on a non-disposable DB';
  end if;
  if v_direct is null or v_v2 is null or v_core is null or v_legacy is null then
    raise exception 'G2 direct-call permission inventory is incomplete';
  end if;
  if not has_function_privilege('myeongha_api_executor',v_direct::oid,'EXECUTE')
    or not has_function_privilege('myeongha_api_executor',v_v2::oid,'EXECUTE')
    or has_function_privilege('myeongha_api_executor',v_core::oid,'EXECUTE')
    or has_function_privilege('myeongha_api_executor',v_legacy::oid,'EXECUTE') then
    raise exception 'reviewed G2 legacy EXECUTE baseline changed; refuse cutover';
  end if;
  select proowner into strict v_direct_owner from pg_proc where oid=v_direct::oid;
  select proowner into strict v_v2_owner from pg_proc where oid=v_v2::oid;
  if v_direct_owner is distinct from v_v2_owner
    or v_direct_owner <> 'myeongha_seyeon_chat_runtime_owner'::regrole::oid then
    raise exception 'v2 does not have the same narrow SECURITY DEFINER owner as v1';
  end if;
  if not exists(select 1 from pg_proc where oid=v_direct::oid and prosecdef)
    or not exists(select 1 from pg_proc where oid=v_v2::oid and prosecdef) then
    raise exception 'G2 v1/v2 no longer share definer execution protection';
  end if;
  if not has_schema_privilege('myeongha_api_executor','public','USAGE') then
    raise exception 'API role public schema usage has changed';
  end if;
end $guard$;

-- Only the app-login DIRECT v1 capability changes. The v2 definer OWNER is
-- still the owner of v1, so its internal call contract is left untouched.
revoke execute on function public.cmd_commit_seyeon_chat_turn_runtime_v1(
  uuid,uuid,uuid,uuid,uuid,uuid
) from myeongha_api_executor;

do $roles$
declare
  v_v1 regprocedure := to_regprocedure(
    'public.cmd_commit_seyeon_chat_turn_runtime_v1(uuid,uuid,uuid,uuid,uuid,uuid)');
  v_v2 regprocedure := to_regprocedure(
    'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)');
begin
  if has_function_privilege('myeongha_api_executor',v_v1::oid,'EXECUTE')
    or not has_function_privilege('myeongha_api_executor',v_v2::oid,'EXECUTE')
    or has_function_privilege('anon',v_v1::oid,'EXECUTE')
    or has_function_privilege('authenticated',v_v1::oid,'EXECUTE')
    or has_function_privilege('service_role',v_v1::oid,'EXECUTE') then
    raise exception 'G2 v1 direct bypass still reachable or v2 lost access';
  end if;
end $roles$;

set local role myeongha_api_executor;
set local myeongha.subject_id = 'd2000000-0000-4000-8000-000000000001';

do $real_calls$
declare
  v_msg text;
  v_constraint text;
  v_direct_denied boolean := false;
  v_v2_reached boolean := false;
  v_context text;
  v_sqlstate text;
begin
  -- A REAL former API-executable v1 call must now fail at PostgreSQL ACL,
  -- regardless of attacker-supplied records, before any DB side effect.
  begin
    perform *
    from public.cmd_commit_seyeon_chat_turn_runtime_v1(
      'd2000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000001',
      'd7000000-0000-4000-8000-000000000001',
      'd7200000-0000-4000-8000-000000000001',
      'd9900000-0000-4000-8000-000000000001',
      'd9910000-0000-4000-8000-000000000001'
    );
    raise exception 'unexpected direct v1 call completed';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = MESSAGE_TEXT;
    if position('cmd_commit_seyeon_chat_turn_runtime_v1' in v_msg)=0 then
      raise exception 'unexpected privilege failure instead of v1 ACL: %',v_msg;
    end if;
    v_direct_denied := true;
  end;
  if not v_direct_denied then
    raise exception 'direct v1 bypass not denied';
  end if;

  -- The SAME API executor must still enter the authorized v2 entrypoint.
  -- Invalid snapshot deliberately stops before any write or v1/internal
  -- call. This is a non-mutating entrypoint/ACL smoke test, NOT proof of
  -- a complete v2 positive/zero successful Chat Commit.
  begin
    perform *
    from public.cmd_commit_seyeon_chat_turn_runtime_v2(
      'd2000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000001',
      'd7000000-0000-4000-8000-000000000001',
      'd7200000-0000-4000-8000-000000000001',
      'd9900000-0000-4000-8000-000000000001',
      'd9910000-0000-4000-8000-000000000001',
      null::uuid,
      null::jsonb,
      null::text
    );
    raise exception 'invalid v2 snapshot was accepted';
  exception when check_violation then
    get stacked diagnostics v_constraint = CONSTRAINT_NAME;
    if v_constraint <> 'seyeon_post_turn_snapshot_invalid' then
      raise exception 'v2 returned a different SQL constraint: %',v_constraint;
    end if;
    v_v2_reached := true;
  end;
  if not v_v2_reached then
    raise exception 'authorized v2 entrypoint could not be reached';
  end if;

  -- Follow an ACTUAL valid-shape v2 snapshot far enough to reach its
  -- SECURITY DEFINER v1 wrapper and underlying core. The pinned positive
  -- Attempt is still RUNNING, so core must HOLD without inserting anything.
  -- This also proves removing API-direct v1 EXECUTE did not break the
  -- v2-owned internal v1 call. No fake zero Proof or bypass is provided.
  begin
    perform *
    from public.cmd_commit_seyeon_chat_turn_runtime_v2(
      'd2000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000001',
      'd7000000-0000-4000-8000-000000000001',
      'd7200000-0000-4000-8000-000000000001',
      'd9900000-0000-4000-8000-000000000001',
      'd9910000-0000-4000-8000-000000000001',
      'd9920000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'schemaVersion','seyeon-post-turn-analysis-snapshot-v1',
        'turnId','d7000000-0000-4000-8000-000000000001',
        'assistantMessageId','d9900000-0000-4000-8000-000000000001',
        'userMessageId','d7100000-0000-4000-8000-000000000001'
      ),
      'sha256:v1:synthetic-never-committed'
    );
    raise exception 'G2 v2 accepted an unvalidated positive Attempt';
  exception when others then
    get stacked diagnostics v_context = PG_EXCEPTION_CONTEXT,
      v_sqlstate = RETURNED_SQLSTATE;
    if v_sqlstate = '42501' or
       position('cmd_commit_seyeon_chat_turn_runtime_v1' in v_context)=0
    then
      raise exception
        'v2 could not execute its real v1/core path after direct v1 ACL cutover (SQLSTATE=%)',
        v_sqlstate;
    end if;
  end;
end $real_calls$;
reset role;

-- The test-only SourceSet/Grant authority and v2 entrypoint are unchanged,
-- and a failed direct v1 call has not committed any real conversation turn.
do $verify$
begin
  if not exists (
    select 1 from public.chat_turn_attempts a
    where a.id='d7200000-0000-4000-8000-000000000001'
      and a.state='running'
      and a.seyeon_personal_source_pin_jsonb is null
  ) then
    raise exception 'G2 ACL probe unexpectedly changed the actual Chat Attempt';
  end if;
end $verify$;
commit;
\echo 'PASS: test-only revoke of direct v1 EXECUTE; API real v1 call denied, v2 entrypoint still reachable, zero-only 1640 unchanged'
