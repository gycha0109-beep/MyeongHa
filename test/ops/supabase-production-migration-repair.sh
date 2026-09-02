#!/usr/bin/env bash
set -euo pipefail

workflow='.github/workflows/supabase-production.yml'

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

[[ -f "$workflow" ]] || fail "Supabase production workflow is missing"

grep -Fq "20260902193252" "$workflow" || fail "known duplicate 0830 version is not detected"
grep -Fq "supabase migration repair 20260902193252 --status reverted" "$workflow" || fail "known duplicate 0830 version is not reverted"
grep -Fq "supabase db push --dry-run" "$workflow" || fail "production dry-run gate is missing"
grep -Fq "supabase db push" "$workflow" || fail "production migration push is missing"

repair_line=$(grep -nF "supabase migration repair 20260902193252 --status reverted" "$workflow" | head -n1 | cut -d: -f1)
dry_run_line=$(grep -nF "supabase db push --dry-run" "$workflow" | head -n1 | cut -d: -f1)
[[ "$repair_line" -lt "$dry_run_line" ]] || fail "duplicate repair must run before production db push dry-run"

if grep -Eq '^\s*pull_request:' "$workflow"; then
  fail "Supabase production migration workflow must not deploy from pull_request"
fi

pass "known duplicate migration history is repaired before db push"
pass "production migration deployment remains main-push/workflow-dispatch only"
