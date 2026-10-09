#!/usr/bin/env bash
set -euo pipefail
q() { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
fail() { echo "FAIL Permit V2: $*" >&2; exit 1; }
deny() {
 local out rc
 set +e; out="$(q "$1" 2>&1)"; rc=$?; set -e
 [[ "$rc" -ne 0 ]] || fail "unauthorized SQL succeeded"
 [[ "$out" == *"permission denied"* || "$out" == *"violates row-level security"* ]] ||
 fail "SQL failure not due to RLS/ACL"
}
t=public.saju_staging_operator_admission_permits_v2
issuer=myeongha_saju_staging_admission_issuer
runtime=myeongha_saju_staging_admission_runtime
revoker=myeongha_saju_staging_admission_revoker
[[ "$(q "select count(*) from pg_roles where rolname in ('$issuer','$runtime','$revoker')
and not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole
and not rolinherit and not rolreplication and not rolbypassrls")" = 3 ]] || fail "role flags"
[[ "$(q "select case when relrowsecurity and relforcerowsecurity then 1 else 0 end
from pg_class where oid='$t'::regclass")" = 1 ]] || fail "FORCE RLS"
[[ "$(q "select case when
has_column_privilege('$runtime','$t','status','UPDATE') and
has_column_privilege('$runtime','$t','consumed_at_ms','UPDATE') and
not has_column_privilege('$runtime','$t','connection_plan_digest','UPDATE') and
not has_table_privilege('$runtime','$t','INSERT') and
not has_table_privilege('$runtime','$t','DELETE') and
not has_table_privilege('$issuer','$t','SELECT') and
not has_table_privilege('$issuer','$t','UPDATE') and
not has_table_privilege('$revoker','$t','INSERT') and
not has_table_privilege('$revoker','$t','DELETE') and
not has_column_privilege('$revoker','$t','consumed_at_ms','UPDATE') and
not has_column_privilege('$revoker','$t','manifest_digest','SELECT')
then 1 else 0 end")" = 1 ]] || fail "ACL"
for role in anon authenticated service_role myeongha_api_executor myeongha_saju_proof_nonce_runtime; do
 if [[ "$(q "select count(*) from pg_roles where rolname='$role'")" = 1 ]]; then
 [[ "$(q "select case when has_table_privilege('$role','$t','SELECT') or
 has_table_privilege('$role','$t','INSERT') or has_table_privilege('$role','$t','UPDATE') or
 has_table_privilege('$role','$t','DELETE') then 1 else 0 end")" = 0 ]] || fail "foreign ACL"
 fi
done
echo "PASS V2 force RLS and ACL"
now="$(date +%s%3N)"; issued=$((now-10000)); expires=$((now+90000))
sha_m="$(printf 'a%.0s' {1..40})"; sha_s="$(printf 'b%.0s' {1..40})"
manifest="$(printf 'c%.0s' {1..64})"; plan="$(printf 'd%.0s' {1..64})"
wrong="$(printf 'f%.0s' {1..64})"
seed() {
 local start="$issued" expiry="$expires"
 if [[ $# -ge 2 ]]; then start="$2"; fi
 if [[ $# -ge 3 ]]; then expiry="$3"; fi
 printf "insert into %s(permit_id,manifest_digest,connection_plan_digest,environment_id,
 myeongha_commit_sha,saju_commit_sha,approved_operator_id,approval_signature_key_id,
 issued_at_ms,expires_at_ms,consumed_at_ms,status)
 values('%s','%s','%s','myeongha-staging-ci','%s','%s','ci-operator','ci-ed25519-v2',
 %s,%s,null,'ISSUED');" "$t" "$1" "$manifest" "$plan" "$sha_m" "$sha_s" "$start" "$expiry"
}
consume() {
 local md="$manifest" pd="$plan" start="$issued" expiry="$expires"
 if [[ $# -ge 2 ]]; then md="$2"; fi
 if [[ $# -ge 3 ]]; then pd="$3"; fi
 if [[ $# -ge 4 ]]; then start="$4"; fi
 if [[ $# -ge 5 ]]; then expiry="$5"; fi
 cat <<SQL
do \$permit_v2_lock\$ begin
  perform permit_id from $t
  where permit_id='$1'::uuid
  and manifest_digest='$md' and connection_plan_digest='$pd'
  for update;
end \$permit_v2_lock\$;
update $t
set status='CONSUMED',consumed_at_ms=floor(extract(epoch from clock_timestamp())*1000)::bigint
where permit_id='$1'::uuid and manifest_digest='$md' and connection_plan_digest='$pd'
and environment_id='myeongha-staging-ci'
and myeongha_commit_sha='$sha_m' and saju_commit_sha='$sha_s'
and approved_operator_id='ci-operator' and approval_signature_key_id='ci-ed25519-v2'
and issued_at_ms=$start and expires_at_ms=$expiry
and status='ISSUED' and consumed_at_ms is null
and issued_at_ms<=floor(extract(epoch from clock_timestamp())*1000)::bigint
and expires_at_ms>floor(extract(epoch from clock_timestamp())*1000)::bigint
returning permit_id::text;
SQL
}
single=123e4567-e89b-42d3-a456-426614174101
parallel=123e4567-e89b-42d3-a456-426614174102
revoked=123e4567-e89b-42d3-a456-426614174103
expired=123e4567-e89b-42d3-a456-426614174104
lock_expiry=123e4567-e89b-42d3-a456-426614174105
q "begin; set local role $issuer; $(seed "$single") commit;" >/dev/null
deny "begin; set local role $issuer; select permit_id from $t;"
deny "begin; set local role $runtime; $(seed "$parallel")"
deny "begin; set local role $runtime; update $t set connection_plan_digest='$wrong' where permit_id='$single';"
deny "begin; set local role $runtime; delete from $t;"
deny "begin; set local role $revoker; select manifest_digest from $t;"
deny "begin; set local role $revoker; update $t set consumed_at_ms=$now where permit_id='$single';"
[[ -z "$(q "begin; set local role $runtime; $(consume "$single" "$wrong") commit;")" ]] || fail "wrong manifest"
[[ -z "$(q "begin; set local role $runtime; $(consume "$single" "$manifest" "$wrong") commit;")" ]] || fail "wrong plan"
[[ "$(q "begin; set local role $runtime; $(consume "$single") commit;")" = "$single" ]] || fail "valid consume"
[[ -z "$(q "begin; set local role $runtime; $(consume "$single") commit;")" ]] || fail "replay"
[[ "$(q "select status from $t where permit_id='$single'")" = CONSUMED ]] || fail "not durable"
[[ -z "$(q "begin; set local role $runtime;
update $t set status='ISSUED',consumed_at_ms=null where permit_id='$single'; commit;")" ]] ||
fail "consumed reset"
echo "PASS V2 digest and replay"
q "begin; set local role $issuer; $(seed "$parallel") commit;" >/dev/null
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
(
 psql -X -Atq -v ON_ERROR_STOP=1 >"$tmp/first" 2>"$tmp/first.err" <<SQL
begin;
set local role $runtime;
$(consume "$parallel")
select pg_sleep(2);
commit;
SQL
) &
p1=$!
sleep 0.5
(
 psql -X -Atq -v ON_ERROR_STOP=1 >"$tmp/second" 2>"$tmp/second.err" <<SQL
begin;
set local role $runtime;
$(consume "$parallel")
commit;
SQL
) &
p2=$!
wait "$p1" || fail "race first"
wait "$p2" || fail "race second"
[[ "$(grep -Fc "$parallel" "$tmp/first" || true)" = 1 ]] || fail "race first output"
[[ "$(grep -Fc "$parallel" "$tmp/second" || true)" = 0 ]] || fail "race second output"
[[ "$(q "select count(*) from $t where permit_id='$parallel' and status='CONSUMED'")" = 1 ]] ||
fail "race count"
echo "PASS V2 two independent connections"
q "begin; set local role $issuer; $(seed "$revoked") commit;" >/dev/null
[[ "$(q "begin; set local role $revoker;
update $t set status='REVOKED' where permit_id='$revoked' and status='ISSUED'
and consumed_at_ms is null returning permit_id::text; commit;")" = "$revoked" ]] || fail "revoke"
[[ -z "$(q "begin; set local role $runtime; $(consume "$revoked") commit;")" ]] || fail "revoked consumed"
[[ -z "$(q "begin; set local role $revoker;
update $t set status='ISSUED' where permit_id='$revoked' returning permit_id; commit;")" ]] || fail "revoke reset"
old_issued=$((now-130000)); old_expires=$((now-1000))
q "$(seed "$expired")" >/dev/null
q "update $t set issued_at_ms=$old_issued,expires_at_ms=$old_expires
where permit_id='$expired'" >/dev/null
[[ -z "$(q "begin; set local role $runtime;
$(consume "$expired" "$manifest" "$plan" "$old_issued" "$old_expires") commit;")" ]] ||
fail "expired consumed"
echo "PASS V2 revoke and expiry"
short_issued=$(( $(date +%s%3N)-1000 )); short_expires=$((short_issued+3900))
q "begin; set local role $issuer; $(seed "$lock_expiry" "$short_issued" "$short_expires") commit;" >/dev/null
(
 psql -X -Atq -v ON_ERROR_STOP=1 >"$tmp/lock" 2>"$tmp/lock.err" <<SQL
begin;
select permit_id from $t where permit_id='$lock_expiry' for update;
select pg_sleep(4);
commit;
SQL
) &
p3=$!
sleep 0.5
(
 psql -X -Atq -v ON_ERROR_STOP=1 >"$tmp/wait" 2>"$tmp/wait.err" <<SQL
begin;
set local role $runtime;
$(consume "$lock_expiry" "$manifest" "$plan" "$short_issued" "$short_expires")
commit;
SQL
) &
p4=$!
wait "$p3" || fail "lock holder"
wait "$p4" || fail "lock waiter"
[[ "$(grep -Fc "$lock_expiry" "$tmp/wait" || true)" = 0 ]] || fail "post-lock expired consume"
[[ "$(q "select status from $t where permit_id='$lock_expiry'")" = ISSUED ]] || fail "post-lock mutation"
[[ "$(q "select count(*) from pg_auth_members m join pg_roles r on r.oid=m.roleid
where r.rolname in ('$issuer','$runtime','$revoker')")" = 0 ]] || fail "operational membership"
echo "PASS V2 lock-wait expired and no login memberships"
