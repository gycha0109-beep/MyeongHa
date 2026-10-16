#!/usr/bin/env bash
set -euo pipefail
[[ ( "$(printenv CI 2>/dev/null || true)" == true ||
      "$(printenv GITHUB_ACTIONS 2>/dev/null || true)" == true ) &&
   "$(printenv PGHOST 2>/dev/null || true)" == localhost &&
   "$(printenv PGUSER 2>/dev/null || true)" == postgres &&
   ( "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_ci_case_* ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_test ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_official_standard_reader_interpretation_test ) ]] || {
 echo 'M1-10 DENY: only disposable localhost CI PostgreSQL' >&2
 exit 2
}
[[ "$#" == 6 ]] || { echo 'M1-10: receipt subject intent state grant reading required' >&2; exit 2; }
receipt="$1"; subject="$2"; intent="$3"; mode="$4"; grant="$5"; reading="$6"
[[ "$mode" == preissue || "$mode" == committed ]] || exit 2
uuid='^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
for id in "$receipt" "$subject" "$intent"; do [[ "$id" =~ $uuid ]] || exit 2; done
if [[ "$mode" == committed ]]; then
 for id in "$grant" "$reading"; do [[ "$id" =~ $uuid ]] || exit 2; done
fi
fail() { echo "FAIL M1-10: $*" >&2; exit 1; }
p() { command psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }
sql="$(node <<'NODE'
const fs=require('node:fs');
const src=fs.readFileSync('apps/api/src/official-reader-unknown-commit-reconciliation-v1.ts','utf8');
const tick=String.fromCharCode(96), token='const UNKNOWN_COMMIT_READ_SQL = '+tick;
const from=src.indexOf(token);
if(from<0)process.exit(2);
const start=from+token.length,end=src.indexOf(tick+'.trim();',start);
if(end<start)process.exit(2);
process.stdout.write(src.slice(start,end));
NODE
)"
[[ -n "$sql" ]] || fail 'literal TypeScript query extraction failed'
result="$(p <<SQL
begin transaction isolation level repeatable read read only;
prepare m110_read(uuid) as
$sql;
execute m110_read('$receipt'::uuid);
commit;
SQL
)"
[[ "$(printf '%s\n' "$result" | wc -l)" == 1 ]] ||
 fail "expected exactly one source snapshot row: $result"
if ! node -e '
const fs=require("node:fs");
const [receipt,subject,intent,mode,grant,reading]=process.argv.slice(1);
const fields=fs.readFileSync(0,"utf8").trimEnd().split("|");
const assert=(yes,reason)=>{if(!yes)throw new Error(reason+":"+JSON.stringify(fields));};
assert(fields.length===30,"column mismatch");
assert(fields[0]===receipt&&fields[1]===subject&&fields[2]===intent,"Receipt lineage");
assert(fields[3]==="test-reader-unit"&&fields[24]==="1","pinned single Capability");
if(mode==="preissue"){
 assert(fields[25]==="0"&&fields[26]==="0"&&fields[27]==="0"&&
   fields[28]==="0"&&fields[29]==="0","no committed effect must remain nonauthorizing");
 assert(fields[4]===""&&fields[9]===""&&fields[16]==="","missing Grant, Event and bound Reading");
}else{
 assert(fields[25]==="1"&&fields[26]==="1"&&fields[27]==="0"&&
   fields[28]==="1"&&["0","1"].includes(fields[29]),"single committed lineage");
 assert(fields[4]===grant&&fields[5]==="active"&&fields[6]==="t","active Grant");
 assert(fields[9].length===36&&fields[10].length>0&&fields[14]==="active","original Event");
 assert(fields[15]===grant&&fields[16]===reading,"same bound Grant and Reading");
 assert(fields[17]===fields[18]&&fields[19]===fields[20],"pinned Reader and Bundle");
 assert(fields[21].startsWith("sha256:v1:")&&
  fields[22]==="standard-reading-access-bind-v2"&&fields[23].length===36,"original binder");
}
' "$receipt" "$subject" "$intent" "$mode" "$grant" "$reading" <<<"$result"; then
 fail "original TS SELECT is inconsistent for $mode"
fi
if [[ "$mode" == preissue ]]; then
 echo 'PASS M1-10: original app SELECT sees verified 1050 Receipt without committed effects; automatic retry remains HOLD'
else
 echo 'PASS M1-10: original app SELECT sees one complete committed Grant/Event/Reading after lost acknowledgement; only private replay, never a new issuance'
fi
