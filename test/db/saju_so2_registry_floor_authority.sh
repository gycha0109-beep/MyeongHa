#!/usr/bin/env bash
set -euo pipefail
# Watchtower-Track: saju-bridge — SO-2 disposable PG only.
q() { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
tmp=""
cleanup() {
  psql -X -v ON_ERROR_STOP=1 -q <<'SQL' >/dev/null 2>&1 || true
drop schema if exists saju_so2_registry_ci cascade;
drop role if exists myeongha_so2_registry_verifier_ci;
drop role if exists myeongha_so2_registry_consumer_ci;
drop role if exists myeongha_so2_registry_revoker_ci;
SQL
  [[ -z "$tmp" ]] || rm -rf "$tmp"
}
trap cleanup EXIT
fail() { echo "FAIL SO-2 synthetic Registry floor: $*" >&2; exit 1; }
deny() {
  local out rc
  set +e
  out="$(q "$1" 2>&1)"; rc=$?
  set -e
  [[ "$rc" -ne 0 ]] || fail "unauthorized call succeeded"
  [[ "$out" == *"permission denied"* || "$out" == *"violates row-level security"* ]] ||
    fail "unexpected denial: $out"
}
psql -X -v ON_ERROR_STOP=1 -f test/db/fixtures/saju_so2_registry_floor_ci.sql >/dev/null
schema=saju_so2_registry_ci
verifier=myeongha_so2_registry_verifier_ci
consumer=myeongha_so2_registry_consumer_ci
revoker=myeongha_so2_registry_revoker_ci
env=myeongha-staging-so2
root=so2-root-id
pin="$(printf 'a%.0s' {1..64})"
dig="$(printf 'b%.0s' {1..64})"
wrong="$(printf 'f%.0s' {1..64})"
tmp="$(mktemp -d)"
for role in "$verifier" "$consumer" "$revoker"; do
 [[ "$(q "select case when not rolcanlogin and not rolsuper and not rolcreatedb
 and not rolcreaterole and not rolinherit and not rolbypassrls then 1 else 0 end
 from pg_roles where rolname='$role'")" = 1 ]] || fail "role ACL"
 [[ "$(q "select case when has_table_privilege('$role','$schema.pinned_root','SELECT')
 or has_table_privilege('$role','$schema.pinned_root','UPDATE')
 or has_table_privilege('$role','$schema.registry_receipt','INSERT')
 or has_table_privilege('$role','$schema.registry_receipt','UPDATE')
 or has_table_privilege('$role','$schema.recovery_anchor','UPDATE')
 then 1 else 0 end")" = 0 ]] || fail "raw table privileges"
done
deny "begin;set local role $consumer;select * from $schema.pinned_root;"
deny "begin;set local role $consumer;select $schema.record_claim('$env','$root','$pin','$dig',12);"
deny "begin;set local role $verifier;select $schema.consume_verified_claim(
 gen_random_uuid(),'$env','$root','$pin','$dig',12);"
deny "begin;set local role $verifier;update $schema.pinned_root set minimum_revision=1;"
register() {
 q "begin;set local role $verifier;select $schema.record_claim(
 '$env','$1','$2','$3',$4);commit;"
}
consume() {
 q "begin;set local role $consumer;select $schema.consume_verified_claim(
 '$1','$env','$root','$pin','$2',$3);commit;"
}
[[ -z "$(register attacker-root "$pin" "$dig" 12)" ]] || fail "wrong Root id"
[[ -z "$(register "$root" "$wrong" "$dig" 12)" ]] || fail "wrong Root pin"
[[ -z "$(register "$root" "$pin" "$dig" 9)" ]] || fail "rollback receipt minted"
[[ -z "$(register "$root" "$pin" "$wrong" 0)" ]] || fail "zero revision"
rid="$(register "$root" "$pin" "$dig" 12)"
[[ "$rid" =~ ^[a-f0-9-]{36}$ ]] || fail "no receipt"
[[ "$(consume "$rid" "$wrong" 12)" = f ]] || fail "wrong digest consumed"
[[ "$(consume "$rid" "$dig" 11)" = f ]] || fail "wrong revision consumed"
[[ "$(q "begin;set local role $consumer;select $schema.consume_verified_claim(
 '$rid','myeongha-staging-other','$root','$pin','$dig',12);commit;")" = f ]] ||
 fail "cross-environment"
# Real concurrent PostgreSQL connections: only one receipt can consume.
(
 psql -X -Atq -v ON_ERROR_STOP=1 >"$tmp/a" <<SQL
begin;
set local role $consumer;
select $schema.consume_verified_claim('$rid','$env','$root','$pin','$dig',12);
select pg_sleep(1);
commit;
SQL
) & p1=$!
sleep .2
(
 psql -X -Atq -v ON_ERROR_STOP=1 >"$tmp/b" <<SQL
begin;
set local role $consumer;
select $schema.consume_verified_claim('$rid','$env','$root','$pin','$dig',12);
commit;
SQL
) & p2=$!
wait "$p1" || fail "concurrent A"
wait "$p2" || fail "concurrent B"
[[ "$(head -1 "$tmp/a")" = t && "$(cat "$tmp/b")" = f ]] || fail "replay race"
[[ "$(q "select minimum_revision from $schema.pinned_root")" = 12 ]] ||
 fail "floor did not advance"
[[ "$(q "select highest_revision from $schema.recovery_anchor")" = 12 ]] ||
 fail "independent modeled high water missed"
[[ "$(consume "$rid" "$dig" 12)" = f ]] || fail "replay after commit"
[[ -z "$(register "$root" "$pin" "$dig" 11)" ]] || fail "downgrade issuance"
# A transaction ROLLBACK must restore BOTH row and receipt, not an unconfirmed commit.
rollback_id="$(register "$root" "$pin" "$dig" 15)"
q "begin;set local role $consumer;select $schema.consume_verified_claim(
 '$rollback_id','$env','$root','$pin','$dig',15);rollback;" >/dev/null
[[ "$(q "select minimum_revision from $schema.pinned_root")" = 12 ]] ||
 fail "rolled-back floor remained"
[[ "$(q "select state from $schema.registry_receipt where receipt_id='$rollback_id'")" = VERIFIED_CLAIM ]] ||
 fail "rolled-back receipt remained"
[[ "$(consume "$rollback_id" "$dig" 15)" = t ]] || fail "valid 15 receipt rejected"
[[ "$(q "select highest_revision from $schema.recovery_anchor")" = 15 ]] ||
 fail "anchor not monotonic"
# Synthetic RESTORE attack: a DB owner rewinds the floor but anchor is higher.
future_id="$(register "$root" "$pin" "$dig" 20)"
q "update $schema.pinned_root set minimum_revision=10;" >/dev/null
[[ -z "$(register "$root" "$pin" "$dig" 20)" ]] || fail "rollback mint accepted"
[[ "$(consume "$future_id" "$dig" 20)" = f ]] ||
 fail "backup restore rewind allowed"
[[ "$(q "select minimum_revision from $schema.pinned_root")" = 10 ]] ||
 fail "partial destructive write not caught"
# Recovery is an explicit CI fixture OWNER-only repair, never granted to runtime.
q "update $schema.pinned_root set minimum_revision=15;" >/dev/null
[[ "$(consume "$future_id" "$dig" 20)" = t ]] || fail "recovered floor stalled"
[[ "$(q "select highest_revision from $schema.recovery_anchor")" = 20 ]] ||
 fail "recovery highwater lost"
rev_id="$(register "$root" "$pin" "$dig" 21)"
[[ "$(q "begin;set local role $revoker;select $schema.revoke_root(
 '$env','$root','$pin');commit;")" = t ]] || fail "revoke"
[[ "$(consume "$rev_id" "$dig" 21)" = f ]] || fail "revoked Root consumed"
[[ -z "$(register "$root" "$pin" "$dig" 21)" ]] || fail "revoked Root issued"
[[ "$(q "begin;set local role $revoker;select $schema.revoke_root(
 '$env','$root','$pin');commit;")" = f ]] || fail "revoke replay"
[[ "$(q "select count(*) from pg_auth_members m join pg_roles r on r.oid=m.roleid
 where r.rolname in ('$verifier','$consumer','$revoker')")" = 0 ]] ||
 fail "role membership"
echo "PASS SO-2 synthetic Registry claim/atomic high-water, ACL, concurrency, revocation, recovery rewind"
