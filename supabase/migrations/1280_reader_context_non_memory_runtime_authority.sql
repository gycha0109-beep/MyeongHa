-- Reader Interpretation Preview V1: non-Memory server context read authority.
--
-- This migration opens only owner-scoped, read-only PostgreSQL projections for
-- Reader-granted current Life Facts, relationship-event history, and
-- non-redacted conversation text. It intentionally does not choose any
-- Production "recent" window size or relationship rendering thresholds.
--
-- All functions execute under the transaction-local canonical subject already
-- established by the Production API runtime. Browser callers receive no direct
-- EXECUTE authority.

alter table public.life_facts enable row level security;
alter table public.relationship_events enable row level security;

drop policy if exists life_facts_api_current_select_v1 on public.life_facts;
create policy life_facts_api_current_select_v1
  on public.life_facts
  for select
  to myeongha_api_executor
  using (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_events_api_current_select_v1 on public.relationship_events;
create policy relationship_events_api_current_select_v1
  on public.relationship_events
  for select
  to myeongha_api_executor
  using (subject_id = public.current_myeongha_subject_id());

revoke select on public.life_facts from myeongha_api_executor;
grant select (
  id,
  subject_id,
  fact_type,
  schema_version,
  value_jsonb,
  supersedes_fact_id,
  revoked_at
) on public.life_facts to myeongha_api_executor;

revoke select on public.relationship_events from myeongha_api_executor;
grant select (
  subject_id,
  character_id,
  event_type,
  event_schema_version,
  policy_version,
  state_revision_after,
  applied_at
) on public.relationship_events to myeongha_api_executor;

create or replace function public.qry_reader_context_granted_life_facts_v1(
  p_subject_id uuid,
  p_character_id text
)
returns table (
  fact_id uuid,
  fact_type text,
  schema_version text,
  value_jsonb jsonb,
  grant_id uuid,
  grantee_character_id text
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null
     or p_character_id is null
     or btrim(p_character_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reader_context_life_facts_input_required',
      message = 'Reader Life Fact context requires subject and Character identities';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    lf.id,
    lf.fact_type,
    lf.schema_version,
    lf.value_jsonb,
    g.id,
    g.grantee_character_id
  from public.record_access_grants g
  join public.life_facts lf
    on lf.id = g.life_fact_id
   and lf.subject_id = g.subject_id
  where g.subject_id = p_subject_id
    and g.grantee_character_id = p_character_id
    and g.revoked_at is null
    and g.life_fact_id is not null
    and lf.revoked_at is null
    and not exists (
      select 1
      from public.life_facts successor
      where successor.subject_id = lf.subject_id
        and successor.supersedes_fact_id = lf.id
    )
  order by lf.id, g.id;
end;
$$;

comment on function public.qry_reader_context_granted_life_facts_v1(uuid, text) is
'Production server-only Reader Life Fact context projection. Returns only current non-revoked Life Facts with an explicit active grant to the Reader Character.';

create or replace function public.qry_reader_context_relationship_events_v1(
  p_subject_id uuid,
  p_character_id text,
  p_before_revision bigint,
  p_limit integer
)
returns table (
  event_type text,
  event_schema_version text,
  state_revision_after bigint,
  policy_version text,
  applied_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null
     or p_character_id is null
     or btrim(p_character_id) = ''
     or p_before_revision is null
     or p_before_revision < 0
     or p_limit is null
     or p_limit <= 0 then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reader_context_relationship_events_input_required',
      message = 'Reader relationship-event context requires subject, Character, revision, and positive server-owned limit';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    e.event_type,
    e.event_schema_version,
    e.state_revision_after,
    e.policy_version,
    e.applied_at
  from public.relationship_events e
  where e.subject_id = p_subject_id
    and e.character_id = p_character_id
    and e.state_revision_after <= p_before_revision
  order by e.state_revision_after desc, e.applied_at desc
  limit p_limit;
end;
$$;

comment on function public.qry_reader_context_relationship_events_v1(
  uuid, text, bigint, integer
) is
'Production server-only Reader relationship-event history projection. The caller must supply a separately approved server-owned context-window limit; this function does not define one.';

create or replace function public.qry_reader_context_recent_messages_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_limit integer
)
returns table (
  message_id uuid,
  sequence_no bigint,
  sender_type text,
  character_id text,
  body_text text,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null
     or p_thread_id is null
     or p_limit is null
     or p_limit <= 0 then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reader_context_recent_messages_input_required',
      message = 'Reader recent-message context requires subject, thread, and positive server-owned limit';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if not exists (
    select 1
    from public.conversation_threads t
    where t.id = p_thread_id
      and t.subject_id = p_subject_id
      and t.status in ('active', 'archived')
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_reader_context_recent_messages_thread_unavailable',
      message = 'Reader recent-message thread is unavailable for this subject';
  end if;

  return query
  select
    x.message_id,
    x.sequence_no,
    x.sender_type,
    x.character_id,
    x.body_text,
    x.created_at
  from (
    select
      m.id as message_id,
      m.sequence_no,
      m.sender_type,
      tc.character_id,
      m.body_text,
      m.created_at
    from public.conversation_messages m
    left join public.conversation_thread_characters tc
      on tc.id = m.thread_character_id
     and tc.thread_id = m.thread_id
    where m.subject_id = p_subject_id
      and m.thread_id = p_thread_id
      and m.redacted_at is null
      and m.body_text is not null
    order by m.sequence_no desc
    limit p_limit
  ) x
  order by x.sequence_no asc;
end;
$$;

comment on function public.qry_reader_context_recent_messages_v1(
  uuid, uuid, integer
) is
'Production server-only Reader recent-message projection. Redacted and payload-only messages are excluded; the caller supplies the separately approved server-owned context-window limit.';

revoke all on function public.qry_reader_context_granted_life_facts_v1(uuid, text) from public;
revoke all on function public.qry_reader_context_relationship_events_v1(
  uuid, text, bigint, integer
) from public;
revoke all on function public.qry_reader_context_recent_messages_v1(
  uuid, uuid, integer
) from public;

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
      'public.qry_reader_context_granted_life_facts_v1(uuid,text)',
      'public.qry_reader_context_relationship_events_v1(uuid,text,bigint,integer)',
      'public.qry_reader_context_recent_messages_v1(uuid,uuid,integer)'
    ]
    LOOP
      EXECUTE pg_catalog.format('revoke all on function %s from %I', v_signature, v_role);
    END LOOP;
  END LOOP;
END
$$;

grant execute on function public.qry_reader_context_granted_life_facts_v1(uuid, text)
  to myeongha_api_executor;
grant execute on function public.qry_reader_context_relationship_events_v1(
  uuid, text, bigint, integer
) to myeongha_api_executor;
grant execute on function public.qry_reader_context_recent_messages_v1(
  uuid, uuid, integer
) to myeongha_api_executor;
