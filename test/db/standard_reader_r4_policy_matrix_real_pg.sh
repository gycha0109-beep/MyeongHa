#!/usr/bin/env bash
set -euo pipefail
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGDATABASE:-}" == myeongha_b2_r4_private_matrix ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/base.sql"
awk '
 /^insert into public.standard_reader_product_approved_rules_v1\(/ {skip=1;next}
 skip && /^\);/ {skip=0;next}
 /^create temp table _s4_initial_result as/{exit}
 !skip {print}
' test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/base.sql"
p -f "$tmp/base.sql" >"$tmp/base.out" 2>"$tmp/base.err" ||
 { cat "$tmp/base.err"; fail 'verified first purchase fixture'; }

deny_standard(){
 local label="$1"
 if p -f test/db/standard_reader_r4_initial_bind_call.sql >"$tmp/deny.out" 2>"$tmp/deny.err"; then
  fail "$label unexpectedly created Reader access"
 fi
 grep -Fq 'One current approved Standard Reader Product rule is required' "$tmp/deny.err" ||
  { cat "$tmp/deny.err"; fail "$label rejected for unrelated cause"; }
 [[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 0 ]] ||
  fail "$label created orphan Reader access"
 [[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 0 ]] ||
  fail "$label created Official Reading"
 echo "PASS R4 $label precise policy DENY and mutation=0"
}
deny_standard BIND-01
p -f test/db/standard_reader_r4_premium_only.sql >/dev/null
[[ "$(p -c "select count(*) from public.qry_standard_reader_approved_rule_v1(
'11392000-0000-0000-0000-000000000001'::uuid,'v1','relationship',clock_timestamp())
where policy_kind='premium_character_bound' and target_reader_id='seyeon'")" == 1 ]] ||
 fail 'Premium must bind exactly one approved Reader in Product policy'
deny_standard BIND-09-premium-no-Standard-fallback

p -f test/db/standard_reader_r4_approve_standard.sql >/dev/null
p -f test/db/standard_reader_r4_specialist_false.sql >/dev/null
[[ "$(p -c "select count(*) from public.character_capabilities
where character_id='seyeon' and can_initiate=false")" == 1 ]] ||
 fail 'false specialist capability fixture missing'
p -f test/db/standard_reader_r4_initial_bind_call.sql >"$tmp/allow.out" 2>"$tmp/allow.err" ||
 { cat "$tmp/allow.err"; fail 'BIND-02/03/14 legitimate Standard Binder'; }
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 1 ]] ||
 fail 'BIND-14 one official Reading expected'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
where purchase_intent_id='b4220000-0000-4000-8000-000000000001'::uuid
and reader_character_id='seyeon'")" == 1 ]] ||
 fail 'BIND-14 one exact Reader Access expected'
[[ "$(p -c "select count(*) from public.character_capabilities
where character_id='seyeon' and can_initiate=false")" == 1 ]] ||
 fail 'BIND-03 specialist capability was modified'
echo 'PASS R4 BIND-02/03/14 precise Standard private issue/bind with false specialist Capability'

# BIND-26: prevent stale-snapshot replay in a separate PostgreSQL session.
if p >"$tmp/stale.out" 2>&1 <<SQL
begin isolation level repeatable read;
$(cat test/db/standard_reader_r4_initial_bind_call.sql)
commit;
SQL
then fail 'BIND-26 stale snapshot replay was accepted'; fi
grep -Fq 'READ COMMITTED' "$tmp/stale.out" ||
 { cat "$tmp/stale.out"; fail 'BIND-26 rejected for unrelated reason'; }
echo 'PASS R4 BIND-26 REPEATABLE READ denied by actual initial lock'
echo 'PASS B2-R4 initial policy SQL matrix subset: 01/02/03/09-Standard-fallback/14/26'
