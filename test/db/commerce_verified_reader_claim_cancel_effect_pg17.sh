#!/usr/bin/env bash
set -euo pipefail

# Real fully migrated PostgreSQL 17 on disposable CI DB only.
db="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database()')"
version="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'show server_version_num')"
if [[ "${GITHUB_ACTIONS:-}" != true || "${DB_SUITE:-}" != postgres17 ||
      "${PGHOST:-}" != localhost || "${PGPORT:-}" != 5432 ||
      ! "$db" =~ ^myeongha_ci_case_[0-9]+$ ||
      ! "$version" =~ ^17[0-9]{4}$ ]]; then
  echo 'DENY: claim->cancel->Reader Effect requires disposable PostgreSQL 17 CI only' >&2
  exit 1
fi

# The historical migration loader intentionally skips the reviewed 2026-10-27
# notice schema. This NEW dedicated Reader-integrated case requires it, so
# install that unchanged, reviewed migration ONLY in the disposable CI DB.
# The existing staged migration policy checks its pinned Git fingerprint.
if [[ "$(psql -X -v ON_ERROR_STOP=1 -Atqc "select case when to_regclass('public.digital_reading_checkout_notice_revisions_v1') is null then 'absent' else 'present' end")" != 'absent' ]]; then
  echo 'DENY: commerce checkout notice schema already loaded unexpectedly' >&2
  exit 1
fi
if [[ "$(psql -X -v ON_ERROR_STOP=1 -Atqc "select case when to_regprocedure('public.cmd_receive_digital_reading_withdrawal_claim_v1(uuid,uuid,uuid,text,text,text)') is null then 'absent' else 'present' end")" != 'present' ]]; then
  echo 'DENY: Reader-integrated exact private Claim function is missing' >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20261027054525_digital_reading_checkout_notice_evidence_v1.sql >/dev/null
for table in digital_reading_checkout_notice_revisions_v1 \
             digital_reading_checkout_notice_presentations_v1 \
             digital_reading_checkout_notice_acknowledgments_v1; do
  if [[ "$(psql -X -v ON_ERROR_STOP=1 -Atqc "select case when to_regclass('public.$table') is null then 'absent' else 'present' end")" != 'present' ]]; then
    echo "DENY: isolated Reader checkout notice table missing: $table" >&2
    exit 1
  fi
done

# Inject B2 original server notice and ACK BEFORE its verified Receipt;
# B3 remains a separate independently verified purchased Reader bundle.
node test/db/commerce_claim_noticed_reader_fixture_pg17_generator.mjs |
  psql -X -v ON_ERROR_STOP=1 -f - >/dev/null

# Exact customer Claim RPC + original cancellation Event + actual effect writer
# run only in one synthetic ROLLBACK transaction. Nothing is deployed.
psql -X -v ON_ERROR_STOP=1 \
  -f test/db/commerce_verified_reader_claim_cancel_effect_pg17.sql
# Exercise the exact private Claim review's cancellation and S7 SQL on real
# migrated PG17. Separate ROLLBACK: the previous E2E tested the actual writer,
# while this probe checks current source-only reviewer evidence without
# manufacturing an S5/S7 delivery or a legal refund determination.
node test/db/commerce_recorded_reader_claim_review_pg17_generator.mjs |
  psql -X -v ON_ERROR_STOP=1 -f -

echo 'PASS: verified purchased Reader -> Claim -> cancellation Event -> exact Effect, isolated PG17 ROLLBACK'
echo 'PASS: exact recorded Claim cancellation review and S7 no-delivery boundary, isolated PG17 ROLLBACK'
