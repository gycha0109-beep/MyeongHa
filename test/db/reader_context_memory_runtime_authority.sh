#!/usr/bin/env bash
set -euo pipefail

migration="supabase/migrations/1250_reader_context_memory_runtime_authority.sql"
projection_migration="supabase/migrations/2330_reader_context_granted_memory_projection_v1.sql"
retrieval_migration="supabase/migrations/2350_reader_context_memory_retrieval_provenance_v1.sql"

grep -Fq "alter table public.record_access_grants enable row level security;" "$migration"
grep -Fq "to myeongha_api_executor" "$migration"
grep -Fq "subject_id = public.current_myeongha_subject_id()" "$migration"
grep -Fq "grant execute on function public.qry_memory_items_v1(uuid)" "$migration"
grep -Fq "grant execute on function public.qry_memory_active_grants_v1(uuid, uuid)" "$migration"
grep -Fq "revoke all on function public.qry_memory_items_v1(uuid) from public;" "$migration"
grep -Fq "revoke all on function public.qry_memory_active_grants_v1(uuid, uuid) from public;" "$migration"

grep -Fq "qry_reader_context_granted_memory_items_v1" "$projection_migration"
grep -Fq "assert_myeongha_subject_context_v1(p_subject_id)" "$projection_migration"
grep -Fq "qry_memory_items_v1(p_subject_id)" "$projection_migration"
grep -Fq "qry_memory_active_grants_v1(" "$projection_migration"
grep -Fq "g.character_id = p_character_id" "$projection_migration"
grep -Fq "g.grant_id" "$projection_migration"
grep -Fq "grant execute on function public.qry_reader_context_granted_memory_items_v1(" "$projection_migration"
grep -Fq "revoke all on function public.qry_reader_context_granted_memory_items_v1(" "$projection_migration"
grep -Fq "qry_reader_context_granted_memory_items_v2" "$retrieval_migration"
grep -Fq "mi.source_turn_id" "$retrieval_migration"
grep -Fq "mi.source_message_id" "$retrieval_migration"
grep -Fq "security invoker" "$retrieval_migration"
grep -Fq "grant execute on function public.qry_reader_context_granted_memory_items_v2(" "$retrieval_migration"

if grep -Eiq 'create table|insert into|update public\.|delete from' "$projection_migration" "$retrieval_migration"; then
  echo "Reader Memory context projection must remain read-only and table-neutral." >&2
  exit 1
fi

echo "Reader context Memory runtime authority migration static checks passed."
