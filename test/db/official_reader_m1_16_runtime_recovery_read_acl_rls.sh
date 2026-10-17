#!/usr/bin/env bash
set -euo pipefail
# M1-16: existing app session rights against the original M1-10 recovery SQL.
[[ ( "$(printenv CI 2>/dev/null || true)" == true ||
      "$(printenv GITHUB_ACTIONS 2>/dev/null || true)" == true ) &&
   "$(printenv PGHOST 2>/dev/null || true)" == localhost &&
   "$(printenv PGUSER 2>/dev/null || true)" == postgres &&
   ( "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_ci_case_* ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_test ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_official_standard_reader_interpretation_test ) ]] || {
  echo 'M1-16 DENY: disposable localhost CI postgres required' >&2
  exit 2
}
[[ "$#" == 5 ]] || { echo 'M1-16: receipt subject intent grant reading required' >&2; exit 2; }
receipt="$1"; subject="$2"; intent="$3"; grant="$4"; reading="$5"
uuid='^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
for id in "$@"; do [[ "$id" =~ $uuid ]] || exit 2; done
fail() { echo "FAIL M1-16: $*" >&2; exit 1; }
p() { command psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT

[[ "$(p -c "select count(*) from public.commerce_receipts
 where id='$receipt'::uuid and subject_id='$subject'::uuid
 and purchase_intent_id='$intent'::uuid and verification_status='verified'
 and environment='production'")" == 1 ]] || fail 'committed verified 1050 Receipt missing'
[[ "$(p -c "select count(*) from public.entitlement_grants
 where id='$grant'::uuid and source_receipt_id='$receipt'::uuid
 and subject_id='$subject'::uuid and status='active'")" == 1 ]] ||
 fail 'purchased Grant missing'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where purchase_intent_id='$intent'::uuid and entitlement_grant_id='$grant'::uuid
 and official_reading_id='$reading'::uuid")" == 1 ]] ||
 fail 'bound Reader access missing'

actor='myeongha_api_executor'
[[ "$(p -c "select (not rolsuper and not rolbypassrls)::text
 from pg_catalog.pg_roles where rolname='$actor'")" == true ]] ||
 fail 'API role has RLS BYPASS or SUPERUSER'
[[ "$(p -c "select pg_catalog.pg_has_role('$actor','postgres','MEMBER')")" == f ]] ||
 fail 'API role is a member of postgres owner'

# Audit exact SELECT privilege and RLS metadata. RLS need not be enabled if
# table-level SELECT is already DENIED; RLS alone is not column redaction.
for table in commerce_receipts entitlement_grants entitlement_events \
 standard_reading_reader_access_grants outbox_events; do
  metadata="$(p -c "select concat_ws('|',
    has_table_privilege('$actor','public.$table','SELECT')::text,
    c.relrowsecurity::text,c.relforcerowsecurity::text,
    pg_catalog.pg_has_role('$actor',c.relowner,'USAGE')::text)
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n
      on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='$table'
      and c.relkind in ('r','p')")"
  select_acl="$(cut -d'|' -f1 <<<"$metadata")"
  owner_acl="$(cut -d'|' -f4 <<<"$metadata")"
  [[ ( "$select_acl" == false || "$select_acl" == f ) &&
     ( "$owner_acl" == false || "$owner_acl" == f ) ]] ||
    fail "$table SELECT/owner rights unexpectedly available: $metadata"
  echo "PASS M1-16 ACL: $table select=f rls=$(cut -d'|' -f2 <<<"$metadata") force=$(cut -d'|' -f3 <<<"$metadata") owner_usage=f"
done
for spec in commerce_receipts:verified_payload_jsonb \
 entitlement_events:payload_jsonb \
 standard_reading_reader_access_grants:request_hash \
 outbox_events:payload_jsonb; do
  table="$(cut -d: -f1 <<<"$spec")"
  field="$(cut -d: -f2 <<<"$spec")"
  [[ "$(p -c "select has_column_privilege(
  '$actor','public.$table','$field','SELECT')")" == f ]] ||
    fail "sensitive column $spec is directly readable"
done
echo 'PASS M1-16: API role cannot directly SELECT protected source-ledger tables, payload fields or bypass RLS'

# Extract exact TypeScript SELECT, never use a hand-reduced test SELECT.
read_sql="$(node <<'NODE'
const fs=require('node:fs');
const source=fs.readFileSync(
 'apps/api/src/official-reader-unknown-commit-reconciliation-v1.ts','utf8');
const tick=String.fromCharCode(96);
const token='const UNKNOWN_COMMIT_READ_SQL = '+tick;
const pos=source.indexOf(token);
if(pos<0)process.exit(2);
const start=pos+token.length,end=source.indexOf(tick+'.trim();',start);
if(end<start)process.exit(2);
process.stdout.write(source.slice(start,end));
NODE
)"
[[ -n "$read_sql" ]] || fail 'TypeScript canonical SELECT not found'
baseline="$(p -c "select concat_ws('|',
 (select count(*) from public.commerce_receipts where id='$receipt'::uuid),
 (select count(*) from public.entitlement_grants where source_receipt_id='$receipt'::uuid),
 (select count(*) from public.entitlement_events where source_type='receipt'
  and source_receipt_id='$receipt'::uuid),
 (select count(*) from public.standard_reading_reader_access_grants
  where purchase_intent_id='$intent'::uuid),
 (select count(*) from public.outbox_events ob
  join public.entitlement_events e on e.event_dedupe_key=ob.dedupe_key
  where e.source_type='receipt' and e.source_receipt_id='$receipt'::uuid
    and ob.aggregate_type='entitlement'))")"

# Different real session_user on both real and forged subject contexts.
for claimed in "$subject" '00000000-0000-4000-8000-000000000001'; do
  log="$temp/actor-$claimed.log"
  if p --set=VERBOSITY=verbose >"$log" 2>&1 <<SQL
set session authorization "$actor";
begin transaction isolation level read committed read only;
select 'M116_ACTOR',session_user,current_user,
 pg_catalog.current_setting('transaction_isolation'),
 pg_catalog.current_setting('transaction_read_only');
select pg_catalog.set_config('myeongha.subject_id','$claimed',true);
prepare m116_read(uuid) as
$read_sql;
execute m116_read('$receipt'::uuid);
commit;
SQL
  then fail 'app session unexpectedly queried private Receipt/Entitlement/Reader'; fi
  grep -Fxq "M116_ACTOR|$actor|$actor|read committed|on" "$log" || {
    cat "$log" >&2; fail 'probe never reached true app session_user'
  }
  grep -Fq '42501' "$log" || {
    cat "$log" >&2; fail 'probe did not fail at PostgreSQL ACL SQLSTATE 42501'
  }
  grep -Eq 'permission denied for (table|schema|relation)' "$log" || {
    cat "$log" >&2; fail 'probe failed before protected table/schema ACL check'
  }
  if grep -Eq '^[0-9a-f-]{36}\|' "$log"; then
    fail 'protected Receipt/Grant/Reading row leaked in denied query output'
  fi
done
echo 'PASS M1-16: exact M1-10 recovery SQL denied 42501 for true API session_user with original and forged subject'

after="$(p -c "select concat_ws('|',
 (select count(*) from public.commerce_receipts where id='$receipt'::uuid),
 (select count(*) from public.entitlement_grants where source_receipt_id='$receipt'::uuid),
 (select count(*) from public.entitlement_events where source_type='receipt'
  and source_receipt_id='$receipt'::uuid),
 (select count(*) from public.standard_reading_reader_access_grants
  where purchase_intent_id='$intent'::uuid),
 (select count(*) from public.outbox_events ob
  join public.entitlement_events e on e.event_dedupe_key=ob.dedupe_key
  where e.source_type='receipt' and e.source_receipt_id='$receipt'::uuid
    and ob.aggregate_type='entitlement'))")"
[[ "$baseline" == "$after" ]] ||
 fail 'denied app role calls mutated committed ledger'
echo 'PASS M1-16: denied API reads preserve original Receipt/Grant/Event/Reader/Outbox with no side effects'
echo 'HOLD M1-16: M1-15 app read adapter has no production source SELECT authority; positive read projection needs separate DB/Security approval'
