#!/usr/bin/env bash
set -euo pipefail
# Watchtower-Track: security
# Install R17 candidate only in the disposable authority-core clone.
# Never stage into Production Supabase migrations or remote DB credentials.
if [[ "${CI:-}" != "true" || "${PGHOST:-}" != "localhost" ||
      "${PGUSER:-}" != "postgres" ||
      "${PGDATABASE:-}" != "myeongha_seyeon_private_revoke_r17_test" ||
      -n "${SUPABASE_DB_PASSWORD:-}" ||
      -n "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:-}" ]]; then
  echo 'HOLD_R17_DISPOSABLE_DATABASE_ONLY' >&2
  exit 2
fi
psql -X -v ON_ERROR_STOP=1 -f scripts/operations/seyeon-private-memory-grant-revoke-r17-candidate.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_private_memory_grant_revoke_v1.sql
