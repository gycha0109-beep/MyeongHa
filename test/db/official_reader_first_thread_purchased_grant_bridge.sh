#!/usr/bin/env bash
set -euo pipefail

# Isolated PostgreSQL preflight: actual verified synthetic purchase Grant read
# and existing Member Chat writer in one API-executor transaction. PUBLIC OFF.
p() { psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
fail() { echo "FAIL $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
p -f test/db/official_standard_reading_reader_interpretation.sql >"$tmp/fixture.out" 2>"$tmp/fixture.err" || {
  cat "$tmp/fixture.err" >&2
  fail "official purchase-backed Reader fixture"
}

subject=11390000-0000-0000-0000-000000000001
reading=12103100-0000-0000-0000-000000000001
reader=test-standard-reader
bundle_c=b3500000-0000-0000-0000-000000000001
bundle_a=11391000-0000-0000-0000-000000000001
bundle_b=12191000-0000-0000-0000-000000000002
thread=b5500000-0000-0000-0000-000000000001
participant=b6600000-0000-0000-0000-000000000001

run_member() {
  p <<SQL
begin;
set local role myeongha_api_executor;
set local myeongha.subject_id='$subject';
$1
commit;
SQL
}
purchase_state() {
  p -c "update public.entitlement_grants g
    set status='$2', revision=revision+1,
        last_effective_at=clock_timestamp(), updated_at=clock_timestamp()
    from public.standard_reading_reader_access_grants a
    where g.id=a.entitlement_grant_id
      and a.purchase_intent_id='$1'::uuid;" >/dev/null
}

# The verified receipt/Reader fixture starts as a Guest. D-05-C is Member
# only: perform the EXISTING DB-authorized same-subject Guest promotion in
# this disposable DB. No ownership rewrite, production user or live payment.
p <<SQL >/dev/null
insert into auth.users(id)
values ('c1990000-0000-0000-0000-000000000001'::uuid);
insert into public.guest_sessions(
  id,subject_id,token_hash,expires_at,consumed_at,
  claimed_by_subject_id,created_at
) values (
  'c3990000-0000-0000-0000-000000000001'::uuid,
  '$subject'::uuid, 'd05-fixture-promotion-token',
  clock_timestamp()+interval '1 day',null,null,clock_timestamp()
);
select subject_id,subject_kind,subject_status
from public.cmd_promote_guest_v1(
  '$subject'::uuid,
  'c3990000-0000-0000-0000-000000000001'::uuid,
  'c1990000-0000-0000-0000-000000000001'::uuid
);
SQL
[[ "$(p -c "select kind||'|'||status from public.subjects where id='$subject'::uuid;")" == 'member|active' ]] ||
  fail "canonical purchased-Reading owner not promoted to active Member"
echo 'PASS D-05-C synthetic Guest purchase retained after DB-authorized Member promotion'

# The preceding general Chat fixture may already have a default Release.
# Clear its default flag only inside the same disposable PostgreSQL database.
p -c "update public.content_releases set is_default=false where is_default;" >/dev/null
# Publish a separate disposable default C where the SAME Reader is marked
# available. The purchased official Reader grant stays pinned to A.
p <<SQL >/dev/null
insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,
  min_client_capability,asset_manifest_hash,cue_schema_version,
  manifest_jsonb,published_at
) values (
  '$bundle_c'::uuid,'d05-default-c','sha256:d05-default-c','test://d05-c',
  'test-v1','test-client-v1','sha256:d05-assets','test-cue-v1','{}'::jsonb,
  clock_timestamp()-interval '1 day'
);
insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,
  release_at,retire_at,published_at
) values (
  '$reader','$bundle_c'::uuid,'available',true,
  clock_timestamp()-interval '1 day',null,clock_timestamp()-interval '1 day'
);
insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,rollout_jsonb,
  rollout_policy_version,rollout_seed,activated_at,retired_at,created_at
) values (
  'b4400000-0000-0000-0000-000000000001',
  'd05-purchased-grant-fixture-c','$bundle_c'::uuid,'active',true,null,
  'uniform-default-v1','uniform',clock_timestamp(),null,clock_timestamp()
);
SQL

# Reader A is published/available in default C, but its verified initial
# purchase Grant points at A. The actual Chat opener can insert then roll back.
purchase_state 11392300-0000-0000-0000-000000000001 active
read_count="$(run_member "select count(*) from public.qry_character_standard_reading_access_runtime_v2('$subject'::uuid,'$reader',transaction_timestamp()) where reading_id='$reading'::uuid;")"
[[ "$read_count" == 1 ]] || fail "real Reader A purchase access must resolve exactly once"
set +e
mismatch="$(run_member "
DO \$guard\$
declare purchased uuid; opened uuid;
begin
  select reader_content_bundle_id into strict purchased
  from public.qry_character_standard_reading_access_runtime_v2(
    '$subject'::uuid,'$reader',transaction_timestamp()
  ) where reading_id='$reading'::uuid;
  select active_content_bundle_id into strict opened
  from public.cmd_open_member_single_character_thread_v1(
    '$subject'::uuid,'$reader','$thread'::uuid,'$participant'::uuid
  );
  if opened is distinct from purchased then
    raise exception 'D05_PURCHASED_BUNDLE_MISMATCH';
  end if;
end \$guard\$;" 2>&1)"
rc=$?
set -e
[[ "$rc" != 0 && "$mismatch" == *D05_PURCHASED_BUNDLE_MISMATCH* ]] ||
  { echo "$mismatch" >&2; fail "wrong purchased bundle must fail"; }
[[ "$(p -c "select count(*) from public.conversation_threads where id='$thread'::uuid;")" == 0 ]] ||
  fail "mismatched Thread survived rollback"
[[ "$(p -c "select count(*) from public.conversation_thread_characters where id='$participant'::uuid;")" == 0 ]] ||
  fail "mismatched participant survived rollback"
echo 'PASS D-05-C real purchased Reader A access -> wrong default Bundle rollback'

# Two separately purchased active bundles for Reader B are ambiguous.
# Its unlockable publication is not treated as general-Chat availability.
reader=test-unlockable-reader
purchase_state 12192300-0000-0000-0000-000000000003 active
purchase_state 12192300-0000-0000-0000-000000000002 active
distinct_bundles="$(run_member "select count(distinct reader_content_bundle_id)
  from public.qry_character_standard_reading_access_runtime_v2(
    '$subject'::uuid,'$reader',transaction_timestamp()
  ) where reading_id='$reading'::uuid;")"
[[ "$distinct_bundles" == 2 ]] || fail "expected two distinct active purchase bundles"
set +e
ambiguous="$(run_member "
DO \$guard\$
declare candidate_count integer;
begin
  select count(*) into candidate_count
  from public.qry_character_standard_reading_access_runtime_v2(
    '$subject'::uuid,'$reader',transaction_timestamp()
  ) where reading_id='$reading'::uuid;
  if candidate_count <> 1 then
    raise exception 'D05_PURCHASED_GRANT_AMBIGUOUS';
  end if;
  perform 1 from public.cmd_open_member_single_character_thread_v1(
    '$subject'::uuid,'$reader','$thread'::uuid,'$participant'::uuid
  );
end \$guard\$;" 2>&1)"
rc=$?
set -e
[[ "$rc" != 0 && "$ambiguous" == *D05_PURCHASED_GRANT_AMBIGUOUS* ]] ||
  { echo "$ambiguous" >&2; fail "cross-bundle Grant ambiguity must reject"; }
[[ "$(p -c "select count(*) from public.conversation_threads where id='$thread'::uuid;")" == 0 ]] ||
  fail "ambiguous access unexpectedly created Thread"
echo 'PASS D-05-C real independent cross-bundle purchases deny first open'

# Revoke both Reader B grants, then restore active default A for
# the independently purchased and published AVAILABLE Reader A.
purchase_state 12192300-0000-0000-0000-000000000003 revoked
purchase_state 12192300-0000-0000-0000-000000000002 revoked
reader=test-standard-reader
p <<SQL >/dev/null
update public.content_releases set is_default=false
where id='b4400000-0000-0000-0000-000000000001'::uuid;
insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,rollout_jsonb,
  rollout_policy_version,rollout_seed,activated_at,retired_at,created_at
) values (
  'b4400000-0000-0000-0000-000000000002'::uuid,
  'd05-purchased-grant-fixture-a','$bundle_a'::uuid,'active',true,null,
  'uniform-default-v1','uniform',clock_timestamp(),null,clock_timestamp()
);
SQL
first="$(run_member "
DO \$guard\$
declare active_count integer; purchased uuid;
begin
  select count(*), min(reader_content_bundle_id::text)::uuid
  into active_count, purchased
  from public.qry_character_standard_reading_access_runtime_v2(
    '$subject'::uuid,'$reader',transaction_timestamp()
  ) where reading_id='$reading'::uuid;
  if active_count <> 1 or purchased is distinct from '$bundle_a'::uuid then
    raise exception 'D05_PURCHASED_GRANT_NOT_EXACT';
  end if;
end \$guard\$;
select thread_id::text,created,active_content_bundle_id::text
from public.cmd_open_member_single_character_thread_v1(
  '$subject'::uuid,'$reader','$thread'::uuid,'$participant'::uuid
);")"
[[ "$first" == "$thread|t|$bundle_a" ]] || fail "exact matching Grant first open: $first"
reused="$(run_member "select thread_id::text,created,active_content_bundle_id::text
  from public.cmd_open_member_single_character_thread_v1(
    '$subject'::uuid,'$reader',
    'b5500000-0000-0000-0000-000000000002'::uuid,
    'b6600000-0000-0000-0000-000000000002'::uuid
  );")"
[[ "$reused" == "$thread|f|$bundle_a" ]] || fail "idempotent Reader Thread reuse: $reused"
[[ "$(run_member "select thread_id::text
  from public.qry_member_single_character_thread_locator_v1(
    '$subject'::uuid,'$reader'
  );")" == "$thread" ]] || fail "actual Member locator disagrees"
echo 'PASS D-05-C real purchased Reader A access -> first create and re-entry'

# A previously created general Chat Thread is not a paid Reading right.
purchase_state 11392300-0000-0000-0000-000000000001 revoked
[[ "$(run_member "select count(*)
  from public.qry_character_standard_reading_access_runtime_v2(
    '$subject'::uuid,'$reader',transaction_timestamp()
  ) where reading_id='$reading'::uuid;")" == 0 ]] ||
  fail "last purchase Grant revoke must remove paid Reader access"
[[ "$(p -c "select count(*) from public.conversation_threads where id='$thread'::uuid;")" == 1 ]] ||
  fail "revocation should preserve independent general Chat Thread"
echo 'PASS D-05-C revoke denies paid Reading while general Chat remains'
echo 'PASS D-05-C actual PostgreSQL purchase Grant + Chat opener bridge (PUBLIC OFF)'
