#!/usr/bin/env bash
set -euo pipefail
mode="${1:?BIND-13 variant required}"
case "$mode" in pending|missing_grant) ;; *) exit 1;; esac
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGDATABASE:-}" == "myeongha_b2_r4_b13_$mode" ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-13/$mode $*" >&2; exit 1; }
tmp="$(mktemp -d)";trap 'rm -rf "$tmp"' EXIT
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
if [[ "$mode" == pending ]]; then
 awk '/^update public.purchase_intents$/{exit} {print}' \
  test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/setup.sql"
 expected='One DB-derived verified initial Reading Product/Birth scope is required'
else
 awk '/^-- Verified initial issuance acquires SAME/{exit} {print}' \
  test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/setup.sql"
 expected='active purchase-backed Entitlement Grant for this Standard Reading purchase is unavailable'
fi
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 40 "$tmp/setup.err" >&2; fail fixture; }
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='b4230000-0000-4000-8000-000000000001'::uuid")" == 0 ]] ||
 fail 'precondition requires zero Grant'
if p -f test/db/standard_reader_r4_initial_bind_call.sql >"$tmp/bind.out" 2>"$tmp/bind.err"; then
 fail 'initial Reader binding unexpectedly succeeded'
fi
grep -Fq "$expected" "$tmp/bind.err" ||
 { cat "$tmp/bind.err" >&2; fail 'wrong denial reason'; }
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 0 ]] || fail 'orphan Reading'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 0 ]] || fail 'orphan Reader Access'
[[ "$(p -c "select count(*) from public.entitlement_events where source_receipt_id='b4230000-0000-4000-8000-000000000001'::uuid")" == 0 ]] || fail 'Commerce ledger mutated'
echo "PASS R4/BIND-13/$mode private Binder DENY, zero Grant/Reading/Access/Entitlement event"
