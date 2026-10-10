#!/usr/bin/env bash
set -euo pipefail
# Watchtower-Track: saju-bridge — disposable DB only; not a deployment.
q() { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
tmp=""
cleanup() {
  psql -X -v ON_ERROR_STOP=1 -q <<'SQL' >/dev/null 2>&1 || true
drop schema if exists saju_custody_ci cascade;
drop role if exists myeongha_saju_custody_floor_ci;
drop role if exists myeongha_saju_challenge_issuer_ci;
drop role if exists myeongha_saju_challenge_consumer_ci;
drop role if exists myeongha_saju_challenge_revoker_ci;
SQL
  if [[ -n "$tmp" ]]; then rm -rf "$tmp"; fi
}
trap cleanup EXIT
fail() { echo "FAIL synthetic custody/challenge: $*" >&2; exit 1; }
deny() {
  local out rc
  set +e
  out="$(q "$1" 2>&1)"; rc=$?
  set -e
  [[ "$rc" -ne 0 ]] || fail "unauthorized SQL succeeded"
  [[ "$out" == *"permission denied"* || "$out" == *"violates row-level security"* ]] ||
    fail "unexpected denial reason: $out"
}
psql -X -v ON_ERROR_STOP=1 -f test/db/fixtures/saju_custody_challenge_ci.sql >/dev/null
floor=myeongha_saju_custody_floor_ci
issuer=myeongha_saju_challenge_issuer_ci
consumer=myeongha_saju_challenge_consumer_ci
revoker=myeongha_saju_challenge_revoker_ci
table=saju_custody_ci.permit_challenge
rtable=saju_custody_ci.revision_floor
pin="$(printf 'a%.0s' {1..64})"
manifest="$(printf 'c%.0s' {1..64})"
plan="$(printf 'd%.0s' {1..64})"
wrong="$(printf 'f%.0s' {1..64})"
msha="$(printf 'a%.0s' {1..40})"
ssha="$(printf 'b%.0s' {1..40})"
permit=123e4567-e89b-42d3-a456-426614174301
permit_b=123e4567-e89b-42d3-a456-426614174302
permit_c=123e4567-e89b-42d3-a456-426614174303
permit_d=123e4567-e89b-42d3-a456-426614174304
permit_e=123e4567-e89b-42d3-a456-426614174305
for r in "$floor" "$issuer" "$consumer" "$revoker"; do
 [[ "$(q "select case when not rolcanlogin and not rolsuper and not rolcreatedb
 and not rolcreaterole and not rolinherit and not rolbypassrls then 1 else 0 end
 from pg_roles where rolname='$r'")" = 1 ]] || fail "role privileges"
 [[ "$(q "select case when has_table_privilege('$r','$table','SELECT')
 or has_table_privilege('$r','$table','UPDATE')
 or has_table_privilege('$r','$rtable','UPDATE') then 1 else 0 end")" = 0 ]] ||
 fail "direct table privileges"
done
deny "begin; set local role $consumer; select * from $table;"
deny "begin; set local role $floor; update $rtable set minimum_revision=1;"
deny "begin; set local role $issuer; select * from $table;"
deny "begin; set local role $consumer; select * from saju_custody_ci.issue_challenge('myeongha-staging-ci','$permit','$manifest','$plan','$msha','$ssha',60000);"
[[ "$(q "begin;set local role $floor;select saju_custody_ci.advance_floor('myeongha-staging-ci','ci-root-id','$pin',12);commit;")" = 12 ]] || fail "floor advance"
[[ -z "$(q "begin;set local role $floor;select saju_custody_ci.advance_floor('myeongha-staging-ci','ci-root-id','$pin',11);commit;")" ]] || fail "rollback accepted"
[[ -z "$(q "begin;set local role $floor;select saju_custody_ci.advance_floor('myeongha-staging-ci','evil-root','$pin',30);commit;")" ]] || fail "wrong root id"
[[ -z "$(q "begin;set local role $floor;select saju_custody_ci.advance_floor('myeongha-staging-ci','ci-root-id','$wrong',30);commit;")" ]] || fail "wrong pin"
q "begin;set local role $floor;select saju_custody_ci.advance_floor('myeongha-staging-ci','ci-root-id','$pin',25);rollback;" >/dev/null
[[ "$(q "select minimum_revision from $rtable")" = 12 ]] || fail "transaction rollback"
# Two concurrent connections must preserve the monotonic floor.
tmp="$(mktemp -d)"
(
 psql -X -Atq -v ON_ERROR_STOP=1 >"$tmp/floor-a" <<SQL
begin;
set local role $floor;
select saju_custody_ci.advance_floor('myeongha-staging-ci','ci-root-id','$pin',20);
select pg_sleep(1);
commit;
SQL
) & p1=$!
sleep .2
(
 psql -X -Atq -v ON_ERROR_STOP=1 >"$tmp/floor-b" <<SQL
begin;
set local role $floor;
select saju_custody_ci.advance_floor('myeongha-staging-ci','ci-root-id','$pin',17);
commit;
SQL
) & p2=$!
wait "$p1" || fail "floor concurrent first"
wait "$p2" || fail "floor concurrent second"
[[ "$(q "select minimum_revision from $rtable")" = 20 ]] || fail "floor race downgrade"
[[ "$(head -1 "$tmp/floor-a")" = 20 ]] || fail "floor race first"
[[ -z "$(cat "$tmp/floor-b")" ]] || fail "floor race second should be blocked"
issue() {
 q "begin; set local role $issuer; select * from saju_custody_ci.issue_challenge(
 'myeongha-staging-ci','$1','$manifest','$plan','$msha','$ssha',$2);commit;"
}
consume() {
 local p="$1" id="$2" digest="$3" md="${4:-$manifest}" pd="${5:-$plan}"
 q "begin;set local role $consumer;select saju_custody_ci.consume_challenge(
 '$id','$digest','myeongha-staging-ci','$p','$md','$pd','$msha','$ssha');commit;"
}
v="$(issue "$permit" 60000)"
IFS='|' read -r cid cd <<<"$v"
[[ "$cid" =~ ^[a-f0-9-]{36}$ && "$cd" =~ ^[a-f0-9]{64}$ ]] || fail "issuer digest"
[[ "$(q "select length(nonce_digest) from $table where challenge_id='$cid'")" = 64 ]] ||
 fail "nonce digest"
[[ "$(consume "$permit_b" "$cid" "$cd")" = f ]] || fail "cross-permit"
[[ "$(consume "$permit" "$cid" "$cd" "$wrong")" = f ]] || fail "wrong manifest"
[[ "$(consume "$permit" "$cid" "$cd" "$manifest" "$wrong")" = f ]] || fail "wrong plan"
[[ "$(consume "$permit" "$cid" "$wrong")" = f ]] || fail "wrong challenge digest"
[[ "$(consume "$permit" "$cid" "$cd")" = t ]] || fail "first consumption"
[[ "$(consume "$permit" "$cid" "$cd")" = f ]] || fail "replay"
[[ "$(q "select state from $table where challenge_id='$cid'")" = CONSUMED ]] ||
 fail "not durable"
# No automatic replay/reissue when Permit consumption might have failed in another DB.
set +e; replay="$(issue "$permit" 60000 2>&1)"; replay_rc=$?; set -e
[[ "$replay_rc" -ne 0 && "$replay" == *"duplicate key"* ]] || fail "post-consume reissue"
read -r rid rd <<<"$(issue "$permit_b" 60000 | tr '|' ' ')"
[[ "$(q "begin;set local role $revoker;select saju_custody_ci.revoke_challenge('$rid');commit;")" = t ]] || fail "revoke"
[[ "$(consume "$permit_b" "$rid" "$rd")" = f ]] || fail "revoked accepted"
[[ "$(q "begin;set local role $revoker;select saju_custody_ci.revoke_challenge('$rid');commit;")" = f ]] || fail "double revoke"
read -r eid ed <<<"$(issue "$permit_c" 40 | tr '|' ' ')"
sleep .2
[[ "$(consume "$permit_c" "$eid" "$ed")" = f ]] || fail "expired accepted"
read -r race_id race_digest <<<"$(issue "$permit_d" 60000 | tr '|' ' ')"
(
 psql -X -Atq -v ON_ERROR_STOP=1 >"$tmp/challenge-a" <<SQL
begin;
set local role $consumer;
select saju_custody_ci.consume_challenge('$race_id','$race_digest','myeongha-staging-ci','$permit_d','$manifest','$plan','$msha','$ssha');
select pg_sleep(1);
commit;
SQL
) & p3=$!
sleep .2
(
 psql -X -Atq -v ON_ERROR_STOP=1 >"$tmp/challenge-b" <<SQL
begin;
set local role $consumer;
select saju_custody_ci.consume_challenge('$race_id','$race_digest','myeongha-staging-ci','$permit_d','$manifest','$plan','$msha','$ssha');
commit;
SQL
) & p4=$!
wait "$p3" || fail "challenge concurrent first"
wait "$p4" || fail "challenge concurrent second"
[[ "$(head -1 "$tmp/challenge-a")" = t ]] || fail "race first"
[[ "$(cat "$tmp/challenge-b")" = f ]] || fail "race replay"
[[ "$(q "select count(*) from $table where permit_id='$permit_d' and state='CONSUMED'")" = 1 ]] ||
 fail "race one success"
# No role membership is provisioned in deployed app or by this fixture.
[[ "$(q "select count(*) from pg_auth_members m join pg_roles r on r.oid=m.roleid
 where r.rolname in ('$floor','$issuer','$consumer','$revoker')")" = 0 ]] || fail "unexpected membership"
echo "PASS 3-04-02 synthetic root floor, permit-scoped challenge, ACL, replay, race, revoke, expiry"
