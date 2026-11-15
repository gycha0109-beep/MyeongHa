-- User-approved 2026-11-09: one My Page shared-memory space for all Characters.
-- This is a separate, manual-only, owner-authored lane in the existing database.
-- It is not a Memory Proposal, generated Life Fact, Character-private source,
-- Official Reading source, or permission to run a Production model.
create table public.subject_shared_memory_items_v1 (
  id uuid primary key,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  body_text text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint subject_shared_memory_text_check
    check (char_length(btrim(body_text)) between 1 and 500),
  constraint subject_shared_memory_time_check
    check (updated_at >= created_at)
);

create index subject_shared_memory_owner_order_v1
  on public.subject_shared_memory_items_v1(subject_id, created_at desc, id desc);

alter table public.subject_shared_memory_items_v1 enable row level security;
alter table public.subject_shared_memory_items_v1 force row level security;

create policy subject_shared_memory_owner_v1
on public.subject_shared_memory_items_v1
for all to myeongha_api_executor
using (
  subject_id = public.current_myeongha_subject_id()
  and exists (
    select 1 from public.subjects s
    where s.id = subject_id and s.kind = 'member'
      and s.status = 'active' and s.merged_into_subject_id is null
  )
)
with check (
  subject_id = public.current_myeongha_subject_id()
  and exists (
    select 1 from public.subjects s
    where s.id = subject_id and s.kind = 'member'
      and s.status = 'active' and s.merged_into_subject_id is null
  )
);

revoke all on table public.subject_shared_memory_items_v1 from public;

do $$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute pg_catalog.format(
      'revoke all on table public.subject_shared_memory_items_v1 from %I', v_role
    );
  end loop;
end
$$;

grant select (id, subject_id, body_text, created_at, updated_at)
  on public.subject_shared_memory_items_v1 to myeongha_api_executor;
grant insert (id, subject_id, body_text)
  on public.subject_shared_memory_items_v1 to myeongha_api_executor;
grant update (body_text, updated_at)
  on public.subject_shared_memory_items_v1 to myeongha_api_executor;
grant delete on public.subject_shared_memory_items_v1 to myeongha_api_executor;

do $$
begin
  if pg_catalog.has_table_privilege('anon', 'public.subject_shared_memory_items_v1', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.subject_shared_memory_items_v1', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.subject_shared_memory_items_v1', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.subject_shared_memory_items_v1', 'INSERT')
  then
    raise exception 'shared memory must not be directly accessible to Supabase API roles';
  end if;
end
$$;
