#!/usr/bin/env bash
set -euo pipefail
# Watchtower-Track: security
# ONLY scratch PG17 with ALL repository migrations (including the exact
# production first-zero SQL). No remote URL, no real user content or Provider.
if [[ "${PGDATABASE:-}" != myeongha_first_zero_local_case_1 ]]; then
  [[ "${GITHUB_ACTIONS:-}" == true && "${CI:-}" == true &&
     "${DB_SUITE:-}" == postgres17 && "${PGHOST:-}" == localhost &&
     "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
    echo HOLD_FIRST_ZERO_NOT_DISPOSABLE_DB >&2; exit 1;
  }
fi
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || {
  echo HOLD_FIRST_ZERO_REQUIRES_POSTGRES17 >&2; exit 1;
}
psql_cmd=(psql -X -qAt -v ON_ERROR_STOP=1)
subject='a8110000-0000-4000-8000-000000000001'
thread='a8140000-0000-4000-8000-000000000001'
turn='a8160000-0000-4000-8000-000000000001'
attempt='a8170000-0000-4000-8000-000000000001'
auth='a8100000-0000-4000-8000-000000000001'
expected='DB_LOCKED_ZERO_SOURCE_SYNTHETIC_OK'
sql_source='supabase/migrations/20261018190000_seyeon_locked_first_zero_source_reveal_v1.sql'
exact_hash='3fbe7322cb3f11484a3e0a42bdc0598879b3d1d8'

# Guard the exact committed file content, not an approximation or a guessed
# function definition; use git if present or coreutils Git object framing.
if command -v git >/dev/null 2>&1; then
  actual="$(git hash-object "$sql_source")"
else
  size="$(wc -c < "$sql_source" | tr -d '[:space:]')"
  actual="$({ printf 'blob %s\0' "$size"; cat "$sql_source"; } | sha1sum | cut -d' ' -f1)"
fi
if [[ "$actual" != "$exact_hash" ]]; then
  # Windows core.autocrlf may materialize a CRLF-only copy. Accept ONLY
  # byte-for-byte equivalence to the exact committed LF Git blob.
  normalized_size="$(sed 's/\r$//' "$sql_source" | wc -c | tr -d '[:space:]')"
  actual="$({ printf 'blob %s\0' "$normalized_size"; sed 's/\r$//' "$sql_source"; } | sha1sum | cut -d' ' -f1)"
fi
[[ "$actual" == "$exact_hash" ]] || {
  echo HOLD_FIRST_ZERO_PRODUCTION_FUNCTION_BLOB_MISMATCH >&2; exit 1;
}

acl="$("${psql_cmd[@]}" -F '|' -c "
select
  pg_get_userbyid(p.proowner)='postgres',
  p.prosecdef,
  coalesce('row_security=off'=any(p.proconfig),false),
  has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE'),
  not has_function_privilege('anon',p.oid,'EXECUTE'),
  not has_function_privilege('authenticated',p.oid,'EXECUTE'),
  not has_function_privilege('service_role',p.oid,'EXECUTE')
from pg_proc p where p.oid=to_regprocedure(
'public.qry_seyeon_locked_first_zero_source_reveal_v1(uuid,uuid,uuid,uuid)'
)")"
[[ "$acl" == 't|t|t|t|t|t|t' ]] || {
  echo HOLD_FIRST_ZERO_PRODUCTION_FUNCTION_ROLE_ACL >&2; exit 1;
}
echo PASS_FIRST_ZERO_PG17_PRODUCTION_SQL_OWNER_ACL

"${psql_cmd[@]}" -f test/db/seyeon_first_zero_locked_reveal_disposable_pg17.sql >/dev/null
echo PASS_FIRST_ZERO_PG17_REAL_PIN_GENERATE_VALIDATE_COMMIT_V2_SYNTHETIC_PROVIDER

# Only the canonical Member executor can query the exact original, never
# an HTTP-supplied Subject or a previous/cached/model-supplied body.
positive="$("${psql_cmd[@]}" <<SQL | tail -n1
BEGIN;
SET LOCAL ROLE myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1('$auth');
select assistant_text from public.qry_seyeon_locked_first_zero_source_reveal_v1(
 '$subject','$thread','$turn','$attempt');
ROLLBACK;
SQL
)"
[[ "$positive" == "$expected" ]] || {
  echo HOLD_FIRST_ZERO_PG17_LOCKED_ORIGINAL_NOT_RETURNED >&2; exit 1;
}
echo PASS_FIRST_ZERO_PG17_CURRENT_MEMBER_LOCKED_ORIGINAL_ONLY

negative="$("${psql_cmd[@]}" <<SQL | grep -F "$expected" || true
BEGIN;
SET LOCAL ROLE myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1('$auth');
select assistant_text from public.qry_seyeon_locked_first_zero_source_reveal_v1(
 '$subject','$thread','$turn','a8170000-0000-4000-8000-000000000099');
ROLLBACK;
SQL
)"
[[ -z "$negative" ]] || {
  echo HOLD_FIRST_ZERO_PG17_WRONG_ATTEMPT_REVEAL >&2; exit 1;
}
echo PASS_FIRST_ZERO_PG17_WRONG_ATTEMPT_ZERO_BYTES

# Race between independently authenticated PG backends.
# A holds Subject/Thread FK-parent FOR UPDATE locks during an authorized
# locked-original read, until the modeled Node send has finished.
# B attempts a write requiring the SAME Subject lock and MUST fail fast,
# with SQLSTATE 55P03. After A COMMIT, the same synthetic update can proceed.
scratch="$(mktemp -d /tmp/myeongha-first-zero-XXXXXXXX)"
reader_pid=''
cleanup() {
  if [[ -n "$reader_pid" ]]; then
    kill "$reader_pid" 2>/dev/null || true
    wait "$reader_pid" 2>/dev/null || true
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT
(
timeout 35 psql -X -qAt -v ON_ERROR_STOP=1 >"$scratch/reader.log" 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1('$auth');
\o $scratch/reader_backend
select pg_backend_pid();
\o
\o $scratch/locked_reply
select assistant_text from public.qry_seyeon_locked_first_zero_source_reveal_v1(
 '$subject','$thread','$turn','$attempt');
\o
\! touch $scratch/reader_locked
\! timeout 20 sh -c 'until test -f "$scratch/send_handoff_finished"; do sleep 0.05; done'
COMMIT;
SQL
) &
reader_pid=$!
ready=false
for _ in $(seq 1 300); do
  if [[ -f "$scratch/reader_locked" ]]; then ready=true; break; fi
  if ! kill -0 "$reader_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
[[ "$ready" == true && "$(cat "$scratch/locked_reply" 2>/dev/null)" == "$expected" ]] || {
  echo HOLD_FIRST_ZERO_PG17_READER_NO_LOCKED_ORIGINAL >&2; exit 1;
}
set +e
writer_failure="$(psql -X -qAt -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose -c "
begin;
set local lock_timeout='600ms';
update public.subjects set updated_at=now() where id='$subject';
commit;
" 2>&1)"
writer_status=$?
set -e
[[ "$writer_status" -ne 0 && "$writer_failure" == *'55P03'* ]] || {
  echo HOLD_FIRST_ZERO_PG17_ORIGINAL_LOCK_DID_NOT_BLOCK_REVOKE_CLASS >&2; exit 1;
}
echo PASS_FIRST_ZERO_PG17_TWO_BACKENDS_SEND_LOCK_BLOCKS_SUBJECT_MUTATION
touch "$scratch/send_handoff_finished"
wait "$reader_pid" || {
  echo HOLD_FIRST_ZERO_PG17_ORIGINAL_SEND_LOCK_NOT_RELEASED >&2; exit 1;
}
reader_pid=''
[[ "$(cat "$scratch/locked_reply")" == "$expected" ]] || {
  echo HOLD_FIRST_ZERO_PG17_SEND_ORIGINAL_CHANGED >&2; exit 1;
}
retry="$("${psql_cmd[@]}" -c "
update public.subjects set updated_at=now() where id='$subject'
returning id")"
[[ "$retry" == "$subject" ]] || {
  echo HOLD_FIRST_ZERO_PG17_SUBJECT_LOCK_NOT_RELEASED >&2; exit 1;
}
echo PASS_FIRST_ZERO_PG17_SUBJECT_WRITE_AFTER_MODELLED_SEND_HANDOFF
echo FIRST_ZERO_HOLD_LOCAL_PG_SQL_LOCK_IS_NOT_VERCEL_OR_CLIENT_ACK
