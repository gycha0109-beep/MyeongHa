-- #647 bounded authenticated collection reads.
--
-- The repository-owned resource policy v1 fixes a default/max page size of 50
-- and requires the bound to be applied before PostgreSQL returns the collection.
-- Each function below returns at most p_page_size + 1 rows so the API can derive
-- hasMore without materializing the remaining owner collection.

create index if not exists conversation_messages_thread_subject_sequence_idx
  on public.conversation_messages(thread_id, subject_id, sequence_no asc);

create index if not exists life_facts_subject_confirmed_created_id_idx
  on public.life_facts(subject_id, confirmed_at desc, created_at desc, id asc);

create index if not exists memory_items_subject_active_created_id_idx
  on public.memory_items(subject_id, created_at desc, id desc)
  where revoked_at is null;

create index if not exists readings_subject_succeeded_completed_created_id_idx
  on public.readings(subject_id, completed_at desc, created_at desc, id desc)
  where execution_status = 'succeeded'
    and committed_execution_attempt_id is not null
    and completed_at is not null;

create or replace function public.qry_chat_thread_stream_v2(
  p_subject_id uuid,
  p_thread_id uuid,
  p_after_sequence_no bigint,
  p_page_size integer
)
returns table (
  message_id uuid,
  sequence_no bigint,
  sender_type text,
  character_id text,
  body_text text,
  message_payload_jsonb jsonb,
  message_schema_version text,
  created_at timestamptz,
  redacted boolean,
  redacted_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_chat_thread_stream_v2_subject_required',
      message = 'chat stream subject is required';
  end if;

  if p_thread_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_chat_thread_stream_v2_thread_required',
      message = 'chat stream thread is required';
  end if;

  if p_after_sequence_no is null or p_after_sequence_no < 0 then
    raise exception using
      errcode = '23514',
      constraint = 'qry_chat_thread_stream_v2_cursor_valid',
      message = 'chat stream cursor must be a non-negative sequence number';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception using
      errcode = '23514',
      constraint = 'qry_chat_thread_stream_v2_page_size_valid',
      message = 'chat stream page size must be between 1 and 50';
  end if;

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.status = 'active'
      and s.merged_into_subject_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_chat_thread_stream_v2_subject_ineligible',
      message = 'chat stream read requires an active canonical subject';
  end if;

  if not exists (
    select 1
    from public.conversation_threads t
    where t.id = p_thread_id
      and t.subject_id = p_subject_id
      and t.status in ('active', 'archived')
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_chat_thread_stream_v2_thread_unavailable',
      message = 'chat thread is unavailable for this subject';
  end if;

  return query
  select
    m.id,
    m.sequence_no,
    m.sender_type,
    tc.character_id,
    case when m.redacted_at is null then m.body_text else null end,
    case when m.redacted_at is null then m.message_payload_jsonb else null end,
    m.message_schema_version,
    m.created_at,
    (m.redacted_at is not null),
    m.redacted_at
  from public.conversation_messages m
  left join public.conversation_thread_characters tc
    on tc.id = m.thread_character_id
   and tc.thread_id = m.thread_id
  where m.thread_id = p_thread_id
    and m.subject_id = p_subject_id
    and m.sequence_no > p_after_sequence_no
  order by m.sequence_no asc
  limit (p_page_size + 1);
end;
$$;

create or replace function public.qry_life_record_ledger_v2(
  p_subject_id uuid,
  p_after_confirmed_at timestamptz,
  p_after_created_at timestamptz,
  p_after_id uuid,
  p_page_size integer
)
returns table (
  life_fact_id uuid,
  fact_type text,
  schema_version text,
  value_jsonb jsonb,
  valid_from timestamptz,
  valid_to timestamptz,
  source_kind text,
  source_message_id uuid,
  source_merge_action_id uuid,
  supersedes_fact_id uuid,
  confirmed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_life_record_ledger_v2_subject_required',
      message = 'life record subject is required';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception using
      errcode = '23514',
      constraint = 'qry_life_record_ledger_v2_page_size_valid',
      message = 'life record page size must be between 1 and 50';
  end if;

  if (
    (p_after_confirmed_at is null and (p_after_created_at is not null or p_after_id is not null))
    or (p_after_created_at is null and (p_after_confirmed_at is not null or p_after_id is not null))
    or (p_after_id is null and (p_after_confirmed_at is not null or p_after_created_at is not null))
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'qry_life_record_ledger_v2_cursor_valid',
      message = 'life record cursor must be fully specified or absent';
  end if;

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.status = 'active'
      and s.merged_into_subject_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_life_record_ledger_v2_subject_ineligible',
      message = 'life record read requires an active canonical subject';
  end if;

  return query
  select
    lf.id,
    lf.fact_type,
    lf.schema_version,
    lf.value_jsonb,
    lf.valid_from,
    lf.valid_to,
    lf.source_kind,
    lf.source_message_id,
    lf.source_merge_action_id,
    lf.supersedes_fact_id,
    lf.confirmed_at,
    lf.revoked_at,
    lf.created_at
  from public.life_facts lf
  where lf.subject_id = p_subject_id
    and (
      p_after_confirmed_at is null
      or lf.confirmed_at < p_after_confirmed_at
      or (
        lf.confirmed_at = p_after_confirmed_at
        and lf.created_at < p_after_created_at
      )
      or (
        lf.confirmed_at = p_after_confirmed_at
        and lf.created_at = p_after_created_at
        and lf.id > p_after_id
      )
    )
  order by lf.confirmed_at desc, lf.created_at desc, lf.id asc
  limit (p_page_size + 1);
end;
$$;

create or replace function public.qry_memory_items_v2(
  p_subject_id uuid,
  p_after_created_at timestamptz,
  p_after_id uuid,
  p_page_size integer
)
returns table (
  memory_item_id uuid,
  memory_type text,
  schema_version text,
  content_jsonb jsonb,
  created_by_character_id text,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_memory_items_v2_subject_required',
      message = 'memory list subject is required';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception using
      errcode = '23514',
      constraint = 'qry_memory_items_v2_page_size_valid',
      message = 'memory list page size must be between 1 and 50';
  end if;

  if (
    (p_after_created_at is null and p_after_id is not null)
    or (p_after_created_at is not null and p_after_id is null)
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'qry_memory_items_v2_cursor_valid',
      message = 'memory cursor must be fully specified or absent';
  end if;

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.status = 'active'
      and s.merged_into_subject_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_memory_items_v2_subject_ineligible',
      message = 'memory list requires an active canonical subject';
  end if;

  return query
  select
    mi.id,
    mi.memory_type,
    mi.schema_version,
    mi.content_jsonb,
    mi.created_by_character_id,
    mi.created_at
  from public.memory_items mi
  where mi.subject_id = p_subject_id
    and mi.revoked_at is null
    and (
      p_after_created_at is null
      or mi.created_at < p_after_created_at
      or (mi.created_at = p_after_created_at and mi.id < p_after_id)
    )
  order by mi.created_at desc, mi.id desc
  limit (p_page_size + 1);
end;
$$;

create or replace function public.qry_reading_history_v3(
  p_subject_id uuid,
  p_after_completed_at timestamptz,
  p_after_created_at timestamptz,
  p_after_id uuid,
  p_page_size integer
)
returns table (
  reading_id uuid,
  reading_session_id uuid,
  saju_domain text,
  reading_contract_version text,
  product_response_state text,
  reader_character_ids text[],
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reading_history_v3_subject_required',
      message = 'Reading History subject is required.';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reading_history_v3_page_size_valid',
      message = 'Reading History page size must be between 1 and 50.';
  end if;

  if (
    (p_after_completed_at is null and (p_after_created_at is not null or p_after_id is not null))
    or (p_after_created_at is null and (p_after_completed_at is not null or p_after_id is not null))
    or (p_after_id is null and (p_after_completed_at is not null or p_after_created_at is not null))
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reading_history_v3_cursor_valid',
      message = 'Reading History cursor must be fully specified or absent.';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    r.id,
    r.reading_session_id,
    r.saju_domain,
    rr.reading_contract_version,
    rr.product_response_state,
    coalesce(
      (
        select pg_catalog.array_agg(provenance.reader_character_id order by provenance.reader_character_id)
        from (
          select distinct sri.reader_character_id
          from public.standard_reading_reader_interpretations sri
          where sri.official_reading_id = r.id
            and sri.subject_id = p_subject_id
        ) provenance
      ),
      array[]::text[]
    ),
    r.created_at,
    r.completed_at
  from public.readings r
  join public.reading_refs rr
    on rr.reading_id = r.id
   and rr.subject_id = r.subject_id
   and rr.execution_attempt_id = r.committed_execution_attempt_id
  where r.subject_id = p_subject_id
    and r.execution_status = 'succeeded'
    and r.committed_execution_attempt_id is not null
    and r.completed_at is not null
    and (
      p_after_completed_at is null
      or r.completed_at < p_after_completed_at
      or (
        r.completed_at = p_after_completed_at
        and r.created_at < p_after_created_at
      )
      or (
        r.completed_at = p_after_completed_at
        and r.created_at = p_after_created_at
        and r.id < p_after_id
      )
    )
  order by r.completed_at desc, r.created_at desc, r.id desc
  limit (p_page_size + 1);
end;
$$;

comment on function public.qry_chat_thread_stream_v2(uuid, uuid, bigint, integer) is
'Owner-scoped bounded Chat stream page. Returns at most page_size + 1 rows for hasMore derivation.';
comment on function public.qry_life_record_ledger_v2(uuid, timestamptz, timestamptz, uuid, integer) is
'Owner-scoped bounded Life Record keyset page. Returns at most page_size + 1 rows.';
comment on function public.qry_memory_items_v2(uuid, timestamptz, uuid, integer) is
'Owner-scoped bounded current Memory page. Returns at most page_size + 1 rows.';
comment on function public.qry_reading_history_v3(uuid, timestamptz, timestamptz, uuid, integer) is
'Server-only bounded Reading History keyset page with Reader provenance. Returns at most page_size + 1 rows.';

revoke all on function public.qry_chat_thread_stream_v2(uuid, uuid, bigint, integer) from public;
revoke all on function public.qry_life_record_ledger_v2(uuid, timestamptz, timestamptz, uuid, integer) from public;
revoke all on function public.qry_memory_items_v2(uuid, timestamptz, uuid, integer) from public;
revoke all on function public.qry_reading_history_v3(uuid, timestamptz, timestamptz, uuid, integer) from public;

DO $$
DECLARE
  v_role text;
  v_signature text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    FOREACH v_signature IN ARRAY ARRAY[
      'public.qry_chat_thread_stream_v2(uuid,uuid,bigint,integer)',
      'public.qry_life_record_ledger_v2(uuid,timestamptz,timestamptz,uuid,integer)',
      'public.qry_memory_items_v2(uuid,timestamptz,uuid,integer)',
      'public.qry_reading_history_v3(uuid,timestamptz,timestamptz,uuid,integer)'
    ]
    LOOP
      EXECUTE pg_catalog.format('revoke all on function %s from %I', v_signature, v_role);
    END LOOP;
  END LOOP;
END
$$;

grant execute on function public.qry_chat_thread_stream_v2(uuid, uuid, bigint, integer)
  to myeongha_api_executor;
grant execute on function public.qry_life_record_ledger_v2(uuid, timestamptz, timestamptz, uuid, integer)
  to myeongha_api_executor;
grant execute on function public.qry_memory_items_v2(uuid, timestamptz, uuid, integer)
  to myeongha_api_executor;
grant execute on function public.qry_reading_history_v3(uuid, timestamptz, timestamptz, uuid, integer)
  to myeongha_api_executor;

DO $$
BEGIN
  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_chat_thread_stream_v2(uuid,uuid,bigint,integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_life_record_ledger_v2(uuid,timestamptz,timestamptz,uuid,integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_memory_items_v2(uuid,timestamptz,uuid,integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_reading_history_v3(uuid,timestamptz,timestamptz,uuid,integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor lost bounded collection read EXECUTE';
  END IF;

  IF pg_catalog.has_function_privilege(
    'anon',
    'public.qry_chat_thread_stream_v2(uuid,uuid,bigint,integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_life_record_ledger_v2(uuid,timestamptz,timestamptz,uuid,integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    'public.qry_reading_history_v3(uuid,timestamptz,timestamptz,uuid,integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Supabase API roles unexpectedly retain bounded collection read EXECUTE';
  END IF;
END
$$;
