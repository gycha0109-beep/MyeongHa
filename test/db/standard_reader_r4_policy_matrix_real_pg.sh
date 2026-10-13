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
