#!/usr/bin/env bash
set -euo pipefail

# CI-only disposable PostgreSQL 17. Never point this at Production.
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true &&
   "${DB_SUITE:-}" == postgres17 && "${PGHOST:-}" == localhost &&
   "${PGPORT:-}" == 5432 && "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
  echo 'HOLD_SAJU_OFFICIAL_HTTP_E2E_REQUIRES_DISPOSABLE_PG17' >&2
  exit 1
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# PostgreSQL fixture IDs predate the API's strict UUID v4 input contract.
# Normalize only the official Reading/Session IDs and recalculate its actual
# canonical v2 response digest; never synthesize a successful Production issuer.
sed -e 's/12103100-0000-0000-0000-000000000001/12103100-0000-4000-8000-000000000001/g' \
    -e 's/12103000-0000-0000-0000-000000000001/12103000-0000-4000-8000-000000000001/g' \
    test/db/standard_love_relationship_reader_authority.sql > "$tmp/standard.sql"
sed -e "s@\\\\i test/db/standard_love_relationship_reader_authority.sql@\\\\i $tmp/standard.sql@" \
    -e 's/12103100-0000-0000-0000-000000000001/12103100-0000-4000-8000-000000000001/g' \
    -e 's/12103000-0000-0000-0000-000000000001/12103000-0000-4000-8000-000000000001/g' \
    -e 's/sha256:v1:a070c64d52193e398ba24eede0370be111de9352d1f652f81c487ebfc7ca3bb0/sha256:v1:d2a541178573365041ce0ba291d38670eabd93b6ad9bae216a9f736895edcbc4/g' \
    test/db/official_standard_reading_reader_interpretation.sql > "$tmp/official.sql"
psql -X -v ON_ERROR_STOP=1 -f "$tmp/official.sql" > "$tmp/fixture.stdout" 2>"$tmp/fixture.stderr" || {
  tail -95 "$tmp/fixture.stderr" >&2
  echo 'FAIL_SYNTHETIC_SAJU_ISSUANCE_FIXTURE' >&2
  exit 1
}

# Signed-in identity is modeled by an independently validated Guest fingerprint;
# no raw Subject ID is ever accepted by the Records HTTP adapter.
psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into public.guest_sessions(
  id, subject_id, token_hash, expires_at, consumed_at,
  claimed_by_subject_id, created_at
) values (
  '12345678-0000-4000-8000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  'synthetic-official-http-e2e-guest-hash',
  clock_timestamp() + interval '1 day',
  null, null, clock_timestamp()
);
SQL

npm run build
node scripts/verify-saju-official-records-http-postgres-e2e.mjs
