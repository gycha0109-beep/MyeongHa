#!/usr/bin/env bash
set -euo pipefail
# Real isolated PG15 only: initial Reader refunded before/after access binding.
# S5_MODE: bound | unbound. No production keys, receipts, grants or callbacks.
case "${S5_MODE:-}" in
 bound) db="myeongha_standard_s5_refund_bound_test"; s5_bound=1 ;;
 unbound) db="myeongha_standard_s5_refund_unbound_test"; s5_bound=0 ;;
 *) echo 'FAIL: S5_MODE must be bound or unbound' >&2; exit 1 ;;
esac
if [[ "${CI:-}" != "true" || "${PGHOST:-}" != localhost ||
      "${PGDATABASE:-}" != "$db" ]]; then
 echo 'FAIL: isolated S5 PostgreSQL expected' >&2; exit 1
fi
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
  test/db/official_standard_reading_reader_interpretation.sql >"$tmp"
if [[ "$s5_bound" == 1 ]]; then
 cat test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp"
else
 awk '/^create temp table _s4_initial_result as/{exit} {print}' \
   test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp"
fi
cat test/db/standard_reader_initial_provider_revoke_pinned_v1.sql >>"$tmp"
psql -X -v ON_ERROR_STOP=1 -v S5_BOUND="$s5_bound" -f "$tmp" >/dev/null
echo "PASS S5 initial verified refund $S5_MODE via immutable purchase scope"
