#!/usr/bin/env bash
set -euo pipefail
# D3B2B-3D1 — CI-only read-only preflight contract smoke.
# Watchtower-Track: character-memory
output="$(psql -X -v ON_ERROR_STOP=1 -At -f scripts/operations/seyeon-legacy-cost-revoke-readonly-preflight.sql)"
printf '%s\n' "$output" | grep -Fxq   'HOLD_REQUIRES_OWNER_APPROVAL_RUNTIME_DRAIN_INDEPENDENT_LOGIN_AND_MIGRATION_RECONCILIATION' || {
    echo 'FAIL D3B2B-3D1 operational preflight must never auto-authorize REVOKE' >&2
    exit 1
  }
printf '%s\n' "$output" | grep -Fq 'postgres' || {
  # Keep the test independent of a particular deployed major version.
  # The first query always reports server_version, which has a numeric prefix.
  if ! printf '%s\n' "$output" | grep -Eq '^[0-9]+\.[0-9]+'; then
    echo 'FAIL D3B2B-3D1 did not read PostgreSQL version' >&2
    exit 1
  fi
}
echo 'D3B2B-3D1 read-only preflight remains HOLD: PASS'
