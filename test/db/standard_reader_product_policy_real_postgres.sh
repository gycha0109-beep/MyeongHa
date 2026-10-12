#!/usr/bin/env bash
set -euo pipefail

# Only a disposable local clone built by run_authority_core.sh.
if [[ "${CI:-}" != "true" || "${PGHOST:-}" != "localhost" ||
      "${PGDATABASE:-}" != "myeongha_reader_product_scope_app_test" ]]; then
  echo 'FAIL: isolated CI PostgreSQL Product test database required' >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 \
  -f test/db/standard_love_relationship_reader_authority.sql >/dev/null

# The fixture publishes a Reader catalog but has no active default release.
# Create exactly one private synthetic default release in this disposable DB.
psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into public.content_releases(
  id, release_key, content_bundle_id, status, is_default,
  rollout_jsonb, rollout_policy_version, rollout_seed,
  activated_at, retired_at, created_at
) values (
  'd1850000-0000-4000-8000-000000000001'::uuid,
  'd01-disposable-standard-catalog-default',
  '11391000-0000-0000-0000-000000000001'::uuid,
  'active', true, null, 'uniform-default-v1', 'd01-fixture',
  clock_timestamp()-interval '1 day', null, clock_timestamp()-interval '1 day'
);
SQL

MYEONGHA_D01_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/postgres-standard-reader-approved-policy-real-db.test.ts
