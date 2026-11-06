#!/usr/bin/env bash
set -euo pipefail

migration="supabase/migrations/1280_reader_context_non_memory_runtime_authority.sql"
retrieval_migration="supabase/migrations/2350_reader_context_memory_retrieval_provenance_v1.sql"

grep -Fq "alter table public.life_facts enable row level security;" "$migration"
grep -Fq "alter table public.relationship_events enable row level security;" "$migration"
grep -Fq "subject_id = public.current_myeongha_subject_id()" "$migration"

grep -Fq "qry_reader_context_granted_life_facts_v1" "$migration"
grep -Fq "g.grantee_character_id = p_character_id" "$migration"
grep -Fq "g.revoked_at is null" "$migration"
grep -Fq "lf.revoked_at is null" "$migration"
grep -Fq "successor.supersedes_fact_id = lf.id" "$migration"
grep -Fq "qry_reader_context_granted_life_facts_v2" "$retrieval_migration"
grep -Fq "lf.valid_from" "$retrieval_migration"
grep -Fq "lf.valid_to" "$retrieval_migration"
grep -Fq "lf.source_message_id" "$retrieval_migration"
grep -Fq "security invoker" "$retrieval_migration"
grep -Fq "grant execute on function public.qry_reader_context_granted_life_facts_v2(" "$retrieval_migration"

grep -Fq "qry_reader_context_relationship_events_v1" "$migration"
grep -Fq "e.state_revision_after <= p_before_revision" "$migration"
grep -Fq "limit p_limit" "$migration"

grep -Fq "qry_reader_context_recent_messages_v1" "$migration"
grep -Fq "m.redacted_at is null" "$migration"
grep -Fq "m.body_text is not null" "$migration"

grep -Fq "to myeongha_api_executor;" "$migration"
grep -Fq "WHERE r.rolname IN ('anon', 'authenticated', 'service_role')" "$migration"

if grep -Eq 'lowMax|mediumMax|maxEvents[[:space:]]*[:=][[:space:]]*[0-9]|maxMessages[[:space:]]*[:=][[:space:]]*[0-9]' "$migration"; then
  echo "Reader non-Memory migration must not invent Product-owned thresholds/windows." >&2
  exit 1
fi

echo "Reader context non-Memory runtime authority migration static checks passed."


relationship_projection_migration="supabase/migrations/2340_reader_context_relationship_projection_v1.sql"
grep -Fq "qry_reader_context_relationship_projection_v1" "$relationship_projection_migration"
grep -Fq "assert_myeongha_subject_context_v1(p_subject_id)" "$relationship_projection_migration"
grep -Fq "security definer" "$relationship_projection_migration"
grep -Fq "alter function public.qry_reader_context_relationship_projection_v1(" "$relationship_projection_migration"
grep -Fq "owner to myeongha_relationship_apply_owner" "$relationship_projection_migration"
grep -Fq "grant execute on function public.qry_reader_context_relationship_projection_v1(" "$relationship_projection_migration"
grep -Fq "revoke all on function public.qry_reader_context_relationship_projection_v1(" "$relationship_projection_migration"

if grep -Eiq 'insert into public\.user_character_states|update public\.user_character_states|delete from public\.user_character_states' "$relationship_projection_migration"; then
  echo "Reader relationship projection must not mutate relationship state." >&2
  exit 1
fi

echo "Reader context non-Memory runtime authority migration static checks passed."
