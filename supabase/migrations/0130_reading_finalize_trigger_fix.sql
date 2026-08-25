-- PostgreSQL 15 compatibility fix for reading finalization validation.
-- UUID has no built-in max(uuid) aggregate; reading_refs is one row per reading_id.

create or replace function public.ct_validate_reading_finalize()
returns trigger
language plpgsql
as $$
declare
  rid uuid;
  reading_status text;
  committed_attempt uuid;
  session_id uuid;
  owner_id uuid;
  ref_count bigint;
  ref_attempt uuid;
  ref_engine_key text;
  ref_engine_version text;
  ref_source_hash text;
  ref_target_hash text;
  exec_state text;
  exec_engine_key text;
  exec_engine_version text;
  expected_source_hash text;
  expected_target_hash text;
begin
  if tg_table_name = 'reading_refs' then
    rid := case when tg_op = 'DELETE' then old.reading_id else new.reading_id end;
  elsif tg_table_name = 'reading_execution_attempts' then
    rid := case when tg_op = 'DELETE' then old.reading_id else new.reading_id end;
  else
    rid := case when tg_op = 'DELETE' then old.id else new.id end;
  end if;

  select execution_status, committed_execution_attempt_id, reading_session_id, subject_id
    into reading_status, committed_attempt, session_id, owner_id
  from public.readings
  where id = rid;

  if reading_status is null then
    return null;
  end if;

  select count(*)
    into ref_count
  from public.reading_refs
  where reading_id = rid;

  if ref_count = 1 then
    select execution_attempt_id, saju_engine_key, saju_engine_version,
           source_birth_input_hash, target_birth_input_hash
      into ref_attempt, ref_engine_key, ref_engine_version,
           ref_source_hash, ref_target_hash
    from public.reading_refs
    where reading_id = rid;
  end if;

  if reading_status = 'succeeded' then
    if ref_count <> 1 or committed_attempt is null or ref_attempt is distinct from committed_attempt then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_finalize',
        message = 'succeeded reading requires exactly one ref for the committed execution attempt';
    end if;

    select state, saju_engine_key, resolved_engine_version
      into exec_state, exec_engine_key, exec_engine_version
    from public.reading_execution_attempts
    where id = committed_attempt
      and reading_id = rid
      and subject_id = owner_id;

    if exec_state is distinct from 'succeeded'
       or exec_engine_key is distinct from ref_engine_key
       or exec_engine_version is distinct from ref_engine_version then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_finalize',
        message = 'reading ref engine provenance must equal the successful committed execution attempt';
    end if;

    select src.input_hash, tgt.input_hash
      into expected_source_hash, expected_target_hash
    from public.reading_sessions rs
    join public.birth_profile_revisions src
      on src.id = rs.source_birth_revision_id
     and src.subject_id = rs.subject_id
    left join public.birth_profile_revisions tgt
      on tgt.id = rs.target_birth_revision_id
     and tgt.subject_id = rs.subject_id
    where rs.id = session_id
      and rs.subject_id = owner_id;

    if ref_source_hash is distinct from expected_source_hash
       or ref_target_hash is distinct from expected_target_hash then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_finalize',
        message = 'reading ref birth input hashes must equal the revisions pinned by the session';
    end if;
  elsif ref_count <> 0 then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reading_finalize',
      message = 'non-succeeded reading cannot own a ProductReadingResponse ref';
  end if;

  return null;
end;
$$;
