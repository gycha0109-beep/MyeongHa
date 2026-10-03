#!/usr/bin/env bash
set -euo pipefail

migration="supabase/migrations/1450_seyeon_production_context_runtime_v1.sql"

grep -Fq "Watchtower-Track: character-memory" "$migration"
grep -Fq "qry_seyeon_production_personal_record_context_v1" "$migration"
grep -Fq "g.grantee_character_id = 'seyeon'" "$migration"
grep -Fq "g.revoked_at is null" "$migration"
grep -Fq "lf.revoked_at is null" "$migration"
grep -Fq "successor.supersedes_fact_id = lf.id" "$migration"
grep -Fq "mi.revoked_at is null" "$migration"
grep -Fq "qry_production_relationship_history_runtime_v1" "$migration"
grep -Fq "h.state_revision_after <= p_through_revision" "$migration"
grep -Fq "public.relationship_event_json_v1(a.replacement_event_id)" "$migration"
grep -Fq "to myeongha_api_executor" "$migration"

psql -Atqc "
select
  p.proname || ':' || p.prosecdef::text || ':' || r.rolname
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join pg_catalog.pg_roles r on r.oid = p.proowner
where n.nspname = 'public'
  and p.proname in (
    'qry_seyeon_production_personal_record_context_v1',
    'qry_production_relationship_history_runtime_v1'
  )
order by p.proname
" | grep -Fq "qry_production_relationship_history_runtime_v1:true:myeongha_relationship_apply_owner"

psql -Atqc "
select has_function_privilege(
  'authenticated',
  'public.qry_production_relationship_history_runtime_v1(uuid,text,bigint)',
  'EXECUTE'
)
" | grep -qx "f"

psql -Atqc "
select has_function_privilege(
  'authenticated',
  'public.qry_seyeon_production_personal_record_context_v1(uuid,text)',
  'EXECUTE'
)
" | grep -qx "f"

echo "Se-yeon Production context V1 authority checks passed."
