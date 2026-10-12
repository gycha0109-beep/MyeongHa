#!/usr/bin/env bash
set -euo pipefail
# D4B-10F: verify the exact TypeScript worker preflight against disposable PostgreSQL roles.
# Watchtower-Track: character-memory; OFFLINE only; never Production.
[[ "${PGDATABASE:-}" == "myeongha_seyeon_d4b10f_test" ]] || exit 2
db() { psql -X -qAt -F '|' -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
tmp="$(mktemp -d)"
cleanup() {
  db -c 'drop role if exists myeongha_seyeon_settlement_login' >/dev/null 2>&1 || true
  db -c 'drop role if exists myeongha_seyeon_d4b10f_extra_ci' >/dev/null 2>&1 || true
  db -c 'drop role if exists myeongha_seyeon_d4_login_ci' >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

bash test/db/chat_attempt_commit_concurrency.sh >"$tmp/bootstrap.log" 2>&1 || {
  cat "$tmp/bootstrap.log" >&2; exit 3;
}
db -f test/db/seyeon_governed_cost_d4a_fixture.sql >/dev/null
db <<'SQL' >/dev/null
create role myeongha_seyeon_settlement_login
  login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant myeongha_seyeon_settlement_worker to myeongha_seyeon_settlement_login;
create role myeongha_seyeon_d4b10f_extra_ci nologin;
SQL

# Extract the actual production-module SQL verbatim, not a reimplemented query.
preflight="$(node --input-type=module -e '
import { readFileSync } from "node:fs";
const text = readFileSync("apps/api/src/seyeon-detached-settlement-worker-v1.ts","utf8");
const match = text.match(/export const DETACHED_WORKER_LOGIN_PREFLIGHT_SQL_V1 = `([\s\S]*?)`\.trim\(\)/u);
if (!match) { process.stderr.write("Missing exact worker preflight query\\n"); process.exit(2); }
process.stdout.write(match[1]);
')"
[[ -n "$preflight" ]] || exit 4
query() {
  db -c "set session authorization myeongha_seyeon_settlement_login; ${preflight};"
}
role='myeongha_seyeon_settlement_login'
expected="$role|$role|t|f|f|f|f|f|t|0|f|f|f|t|f|t|t|f|f|f|f|f|f|f|f|f"
actual="$(query)"
if [[ "$actual" != "$expected" ]]; then
  echo "FAIL exact TypeScript worker preflight differs from actual PostgreSQL ACL" >&2
  echo "expected: $expected" >&2
  echo "actual:   $actual" >&2
  exit 5
fi

# The bare login cannot invoke worker functions until explicitly SET ROLE,
# and cannot switch to unrelated API or guarded inference authority.
actual_role="$(db -c "
  set session authorization myeongha_seyeon_settlement_login;
  begin;
  set local role myeongha_seyeon_settlement_worker;
  select current_user::text;
  commit;")"
[[ "$actual_role" == 'myeongha_seyeon_settlement_worker' ]] || exit 6
if db -c "set session authorization myeongha_seyeon_settlement_login;
  begin; set local role myeongha_seyeon_governed_executor; commit;" >"$tmp/cross-role.log" 2>&1; then
  echo 'FAIL detached worker can become guarded inference executor' >&2; exit 7
fi
grep -Fq '42501' "$tmp/cross-role.log" || { cat "$tmp/cross-role.log" >&2; exit 8; }

# A mistaken direct receipt-write grant must change the *same* preflight
# signal that the TypeScript validator rejects.
db -c "grant execute on function
  public.cmd_store_seyeon_provider_receipt_v1(uuid,uuid,uuid,text,jsonb)
  to myeongha_seyeon_settlement_login" >/dev/null
elevated="$(query)"
[[ "$(cut -d '|' -f 21 <<<"$elevated")" == 't' &&
    "$elevated" != "$expected" ]] || {
  echo 'FAIL unsafe direct store privilege did not surface in preflight' >&2
  exit 9
}
db -c "revoke execute on function
  public.cmd_store_seyeon_provider_receipt_v1(uuid,uuid,uuid,text,jsonb)
  from myeongha_seyeon_settlement_login" >/dev/null
[[ "$(query)" == "$expected" ]] || exit 10

# An extra role membership must be rejected even if the other role has no
# privileges yet: a future grant to that role must not silently elevate us.
db -c "grant myeongha_seyeon_d4b10f_extra_ci
  to myeongha_seyeon_settlement_login" >/dev/null
extra="$(query)"
[[ "$(cut -d '|' -f 10 <<<"$extra")" == '1' &&
    "$extra" != "$expected" ]] || {
  echo 'FAIL extra membership did not surface in preflight' >&2
  exit 11
}
db -c "revoke myeongha_seyeon_d4b10f_extra_ci
  from myeongha_seyeon_settlement_login" >/dev/null
[[ "$(query)" == "$expected" ]] || exit 12

# INHERIT allows ordinary login privilege inheritance and is never allowed.
db -c "alter role myeongha_seyeon_settlement_login inherit" >/dev/null
inherited="$(query)"
[[ "$(cut -d '|' -f 4 <<<"$inherited")" == 't' &&
    "$inherited" != "$expected" ]] || {
  echo 'FAIL INHERIT role escalation did not surface in preflight' >&2
  exit 13
}
db -c "alter role myeongha_seyeon_settlement_login noinherit" >/dev/null
[[ "$(query)" == "$expected" ]] || exit 14
echo 'D4B-10F exact worker login preflight, role overgrant and privilege isolation PASS'
