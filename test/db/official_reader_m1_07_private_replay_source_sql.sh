#!/usr/bin/env bash
set -euo pipefail

# M1-07: read-only SQL extracted from the actual TS private recovery module.
# Use only the named disposable PG fixtures, after M1-06 1050/D2 replay.
[[ "$(printenv CI 2>/dev/null || true)" == true &&
   "$(printenv PGHOST 2>/dev/null || true)" == localhost &&
   "$(printenv PGUSER 2>/dev/null || true)" == postgres &&
   ( "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_test ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_official_standard_reader_interpretation_test ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_ci_case_* ) ]] || {
  echo 'M1-07 DENY: only disposable localhost CI database is permitted' >&2
  exit 2
}
[[ "$#" == 5 ]] || { echo 'M1-07: receipt subject intent grant reading required' >&2; exit 2; }
receipt="$1"; subject="$2"; intent="$3"; grant="$4"; reading="$5"
uuid='^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$'
for id in "$@"; do
  [[ "$id" =~ $uuid ]] || { echo 'M1-07: invalid fixture identity' >&2; exit 2; }
done
fail() { echo "FAIL M1-07: $*" >&2; exit 1; }
p() { command psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }

read_sql="$(node <<'NODE'
const fs = require('node:fs');
const source = fs.readFileSync(
 'apps/api/src/official-reader-private-replay-recovery-v1.ts','utf8'
);
const tick = String.fromCharCode(96);
const startToken = 'const READ_SQL = ' + tick;
const start = source.indexOf(startToken);
if (start < 0) process.exit(2);
const after = start + startToken.length;
const end = source.indexOf(tick + '.trim();', after);
if (end < after) process.exit(2);
process.stdout.write(source.slice(after,end));
NODE
)"
[[ -n "$read_sql" ]] || fail 'failed to extract exact TypeScript READ_SQL'

result="$(p <<SQL
prepare m1_07_read(uuid) as
$read_sql;
execute m1_07_read('$receipt'::uuid);
deallocate m1_07_read;
SQL
)"
[[ "$(printf '%s\n' "$result" | wc -l)" == 1 ]] ||
  fail 'expected exactly one real joined 1050 Receipt/Grant/Event/Reading row'
IFS='|' read -r got_receipt got_subject got_intent got_item got_grant got_event \
  got_effective got_from got_until got_reason got_reading got_session got_hash got_contract got_count <<< "$result"
[[ "$got_receipt" == "$receipt" && "$got_subject" == "$subject" &&
   "$got_intent" == "$intent" && "$got_item" == 'test-reader-unit' &&
   "$got_grant" == "$grant" && -n "$got_event" &&
   -n "$got_effective" && -n "$got_from" &&
   -z "$got_until" && -z "$got_reason" &&
   "$got_reading" == "$reading" && -n "$got_session" &&
   "$got_hash" == sha256:v1:* &&
   "$got_contract" == standard-reading-access-bind-v2 &&
   "$got_count" == 1 ]] ||
  fail "canonical persisted replay row does not match the real fixture: $result"
echo 'PASS M1-07: exact TS recovery READ_SQL resolves the real 1050 Receipt, event semantics and bound D2 Reading on isolated PG15'

unissued='00000000-0000-0000-0000-000000000001'
empty="$(p <<SQL
prepare m1_07_read(uuid) as
$read_sql;
execute m1_07_read('$unissued'::uuid);
deallocate m1_07_read;
SQL
)"
[[ -z "$empty" ]] || fail 'unknown Receipt leaked recoverable authority'
echo 'PASS M1-07: unknown Receipt returns no recovery authority (no new issuance)'
