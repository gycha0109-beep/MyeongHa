-- Production Records owner-read relation authority.
--
-- GET /api/life-record and GET /api/memories execute SECURITY INVOKER
-- projections after the server binds a canonical transaction-local subject and
-- SET LOCAL ROLEs to the dedicated NOBYPASSRLS myeongha_api_executor role.
-- Open only the relation columns consumed by those projections and keep all
-- access RLS-scoped to the current subject.

alter table public.life_facts enable row level security;
alter table public.memory_items enable row level security;

drop policy if exists life_facts_api_current_select_v1 on public.life_facts;
create policy life_facts_api_current_select_v1
on public.life_facts
for select
to myeongha_api_executor
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists memory_items_api_current_select_v1 on public.memory_items;
create policy memory_items_api_current_select_v1
on public.memory_items
for select
to myeongha_api_executor
using (subject_id = public.current_myeongha_subject_id());

-- Remove any accidental table-wide SELECT before opening only the SECURITY
-- INVOKER projection columns below. No INSERT/UPDATE/DELETE authority is granted.
revoke select on public.life_facts from myeongha_api_executor;
revoke select on public.memory_items from myeongha_api_executor;

grant select (
  id,
  subject_id,
  fact_type,
  schema_version,
  value_jsonb,
  valid_from,
  valid_to,
  source_kind,
  source_message_id,
  source_merge_action_id,
  supersedes_fact_id,
  confirmed_at,
  revoked_at,
  created_at
)
on public.life_facts
to myeongha_api_executor;

grant select (
  id,
  subject_id,
  memory_type,
  schema_version,
  content_jsonb,
  created_by_character_id,
  revoked_at,
  created_at
)
on public.memory_items
to myeongha_api_executor;
