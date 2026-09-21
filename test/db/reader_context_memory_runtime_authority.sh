#!/usr/bin/env bash
set -euo pipefail

migration="supabase/migrations/1250_reader_context_memory_runtime_authority.sql"

grep -Fq "alter table public.record_access_grants enable row level security;" "$migration"
grep -Fq "to myeongha_api_executor" "$migration"
grep -Fq "subject_id = public.current_myeongha_subject_id()" "$migration"
grep -Fq "grant execute on function public.qry_memory_items_v1(uuid)" "$migration"
grep -Fq "grant execute on function public.qry_memory_active_grants_v1(uuid, uuid)" "$migration"
grep -Fq "revoke all on function public.qry_memory_items_v1(uuid) from public;" "$migration"
grep -Fq "revoke all on function public.qry_memory_active_grants_v1(uuid, uuid) from public;" "$migration"

echo "Reader context Memory runtime authority migration static checks passed."
