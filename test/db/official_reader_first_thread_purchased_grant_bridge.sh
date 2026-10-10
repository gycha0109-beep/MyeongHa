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
reader=test-unlockable-reader
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

# Publish a disposable default A in this isolated test DB only.
p <<SQL >/dev/null
insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,rollout_jsonb,
  rollout_policy_version,rollout_seed,activated_at,retired_at,created_at
) values (
  'b4400000-0000-0000-0000-000000000001',
  'd05-purchased-grant-fixture','$bundle_a'::uuid,'active',true,null,
  'uniform-default-v1','uniform',clock_timestamp(),null,clock_timestamp()
);
SQL

# B3: exact purchased Grant is pinned to B, unlike default A.
purchase_state 12192300-0000-0000-0000-000000000003 active
read_count="$(run_member "select count(*) from public.qry_character_standard_reading_access_runtime_v2('$subject'::uuid,'$reader',transaction_timestamp()) where reading_id='$reading'::uuid;")"
[[ "$read_count" == 1 ]] || fail "real B3 purchase access must resolve exactly once"
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
echo 'PASS D-05-C real purchased B3 access -> wrong default Bundle rollback'
