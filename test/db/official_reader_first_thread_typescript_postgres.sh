#!/usr/bin/env bash
set -euo pipefail

# Only on the disposable authority-core PostgreSQL clone; never Production.
if [[ "$CI" != "true" || "$PGHOST" != "localhost" ||
      "$PGDATABASE" != "myeongha_reader_first_thread_app_test" ]]; then
  echo 'FAIL: isolated CI PostgreSQL database required' >&2
  exit 1
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Preserve every verified receipt and official Reading assertion in the
# existing synthetic fixture. Use the known app Reader ID 'seyeon' solely
# inside this disposable database.
sed -e 's/test-standard-reader/seyeon/g' \
    -e "s/('test-coming-soon-reader', now());/('test-coming-soon-reader', now()) on conflict do nothing;/" \
    test/db/standard_love_relationship_reader_authority.sql | \
  sed -e 's/12103100-0000-0000-0000-000000000001/12103100-0000-4000-8000-000000000001/g' \
      -e 's/11391000-0000-0000-0000-000000000001/11391000-0000-4000-8000-000000000001/g' >"$tmp/standard.sql"
sed -e "s@\\\\i test/db/standard_love_relationship_reader_authority.sql@\\\\i $tmp/standard.sql@" \
    -e 's/test-standard-reader/seyeon/g' \
    test/db/official_standard_reading_reader_interpretation.sql | \
  sed -e 's/12103100-0000-0000-0000-000000000001/12103100-0000-4000-8000-000000000001/g' \
      -e 's/11391000-0000-0000-0000-000000000001/11391000-0000-4000-8000-000000000001/g' >"$tmp/official.sql"
psql -X -v ON_ERROR_STOP=1 -f "$tmp/official.sql" >"$tmp/fixture.stdout" 2>"$tmp/fixture.stderr" || {
  tail -65 "$tmp/fixture.stderr" >&2
  echo 'FAIL: purchase-backed Reader fixture' >&2
  exit 1
}

# Promote the same subject through the existing DB authority, no ownership
# rewrite. Restore only the initial verified purchase Grant in this test DB.
psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into auth.users(id)
values ('c1990000-0000-4000-8000-000000000009'::uuid)
on conflict do nothing;
insert into public.guest_sessions(
  id,subject_id,token_hash,expires_at,consumed_at,
  claimed_by_subject_id,created_at
) values (
  'c3990000-0000-4000-8000-000000000009'::uuid,
  '11390000-0000-0000-0000-000000000001'::uuid,
  'd05-real-ts-app-promotion-fixture',
  clock_timestamp()+interval '1 day',null,null,clock_timestamp()
);
select subject_id,subject_kind from public.cmd_promote_guest_v1(
  '11390000-0000-0000-0000-000000000001'::uuid,
  'c3990000-0000-4000-8000-000000000009'::uuid,
  'c1990000-0000-4000-8000-000000000009'::uuid
);
update public.entitlement_grants g
set status='active',revision=revision+1,
    last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
from public.standard_reading_reader_access_grants a
where g.id=a.entitlement_grant_id
  and a.purchase_intent_id='11392300-0000-0000-0000-000000000001'::uuid;

-- Reader published as available in default C, whereas the verified
-- purchase remains pinned to A. Real TypeScript must reject and roll back.
insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,
  min_client_capability,asset_manifest_hash,cue_schema_version,
  manifest_jsonb,published_at
) values (
  'b3500000-0000-4000-8000-000000000009',
  'd05-real-ts-release-c','sha256:d05-real-ts-c','test://d05-real-ts-c',
  'test-v1','test-client-v1','sha256:d05-ts-assets','test-cue-v1',
  '{}'::jsonb,clock_timestamp()-interval '1 day'
);
insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,
  release_at,retire_at,published_at
) values (
  'seyeon','b3500000-0000-4000-8000-000000000009',
  'available',true,clock_timestamp()-interval '1 day',null,
  clock_timestamp()-interval '1 day'
);
update public.content_releases set is_default=false where is_default;
insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,rollout_jsonb,
  rollout_policy_version,rollout_seed,activated_at,retired_at,created_at
) values (
  'b4400000-0000-4000-8000-000000000009',
  'd05-real-ts-active-c','b3500000-0000-4000-8000-000000000009',
  'active',true,null,'uniform-default-v1','uniform',
  clock_timestamp(),null,clock_timestamp()
);
SQL

MYEONGHA_D05_REAL_PG=1 ./node_modules/.bin/vitest run \
  test/postgres-official-reading-reader-first-thread-db.test.ts
