#!/usr/bin/env bash
set -euo pipefail

migration="supabase/migrations/1280_reader_context_non_memory_runtime_authority.sql"

grep -Fq "alter table public.life_facts enable row level security;" "$migration"
grep -Fq "alter table public.relationship_events enable row level security;" "$migration"
grep -Fq "subject_id = public.current_myeongha_subject_id()" "$migration"

grep -Fq "qry_reader_context_granted_life_facts_v1" "$migration"
grep -Fq "g.grantee_character_id = p_character_id" "$migration"
grep -Fq "g.revoked_at is null" "$migration"
grep -Fq "lf.revoked_at is null" "$migration"
grep -Fq "successor.supersedes_fact_id = lf.id" "$migration"

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
